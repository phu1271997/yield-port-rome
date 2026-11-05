// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ILendingAdapter} from "../interfaces/ILendingAdapter.sol";
import {
    ICrossProgramInvocation,
    CpiProgram,
    HelperProgram
} from "@rome-protocol/rome-solidity/contracts/interface.sol";
import {AccountMetaBuilder} from "@rome-protocol/rome-solidity/contracts/cpi/AccountMetaBuilder.sol";
import {AnchorInstruction} from "@rome-protocol/rome-solidity/contracts/cpi/AnchorInstruction.sol";
import {Convert} from "@rome-protocol/rome-solidity/contracts/convert.sol";

/// @title KaminoCpiAdapter
/// @notice Solana-native lending adapter for Kamino Finance (klend).
///         Uses Rome's atomic CPI precompile (0xFF00...08) to execute
///         `deposit_reserve_liquidity` and `redeem_reserve_collateral`
///         directly against Kamino's SVM program in a single transaction.
contract KaminoCpiAdapter is ILendingAdapter, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Anchor Discriminators: sha256("global:<method>")[0..8]
    // deposit_reserve_liquidity -> sha256("global:deposit_reserve_liquidity") = a9c91e7e06cd6644
    // redeem_reserve_collateral -> sha256("global:redeem_reserve_collateral") = ea75b57db98edc1d
    bytes8 public constant DISC_DEPOSIT = bytes8(0xa9c91e7e06cd6644); // deposit_reserve_liquidity
    bytes8 public constant DISC_REDEEM  = bytes8(0xea75b57db98edc1d); // redeem_reserve_collateral

    // Solana Pubkeys (bytes32)
    bytes32 public klendProgramId;
    bytes32 public lendingMarket;
    bytes32 public reserve;
    bytes32 public reserveLiquidityMint;
    bytes32 public reserveLiquiditySupply;
    bytes32 public reserveCollateralMint;
    bytes32 public userSourceLiquidity;
    bytes32 public userDestinationCollateral;
    bytes32 public lendingMarketAuthority;
    bytes32 public tokenProgram;
    bytes32 public instructionSysvar;
    bytes32 public eventAuthority;

    address public immutable override asset;
    address public vault;
    bool public liveCpiEnabled;

    uint256 private _trackedDeposits;

    event KaminoCpiExecuted(string action, uint64 amount, bytes32 indexed reserve);
    event LiveCpiToggled(bool enabled);

    modifier onlyVault() {
        require(msg.sender == vault, "KaminoCpiAdapter: caller not vault");
        _;
    }

    struct KaminoAccounts {
        bytes32 klendProgramId;
        bytes32 lendingMarket;
        bytes32 reserve;
        bytes32 reserveLiquidityMint;
        bytes32 reserveLiquiditySupply;
        bytes32 reserveCollateralMint;
        bytes32 userSourceLiquidity;
        bytes32 userDestinationCollateral;
        bytes32 lendingMarketAuthority;
        bytes32 tokenProgram;
        bytes32 instructionSysvar;
        bytes32 eventAuthority;
    }

    constructor(
        address _asset,
        address _initialOwner,
        bool _liveCpi,
        KaminoAccounts memory _accts
    ) Ownable(_initialOwner) {
        require(_asset != address(0), "Invalid asset");
        asset = _asset;
        liveCpiEnabled = _liveCpi;

        klendProgramId = _accts.klendProgramId;
        lendingMarket = _accts.lendingMarket;
        reserve = _accts.reserve;
        reserveLiquidityMint = _accts.reserveLiquidityMint;
        reserveLiquiditySupply = _accts.reserveLiquiditySupply;
        reserveCollateralMint = _accts.reserveCollateralMint;
        userSourceLiquidity = _accts.userSourceLiquidity;
        userDestinationCollateral = _accts.userDestinationCollateral;
        lendingMarketAuthority = _accts.lendingMarketAuthority;
        tokenProgram = _accts.tokenProgram;
        instructionSysvar = _accts.instructionSysvar;
        eventAuthority = _accts.eventAuthority;
    }

    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid vault");
        vault = _vault;
    }

    function setLiveCpiEnabled(bool _enabled) external onlyOwner {
        liveCpiEnabled = _enabled;
        emit LiveCpiToggled(_enabled);
    }

    function setAccounts(KaminoAccounts calldata _accts) external onlyOwner {
        klendProgramId = _accts.klendProgramId;
        lendingMarket = _accts.lendingMarket;
        reserve = _accts.reserve;
        reserveLiquidityMint = _accts.reserveLiquidityMint;
        reserveLiquiditySupply = _accts.reserveLiquiditySupply;
        reserveCollateralMint = _accts.reserveCollateralMint;
        userSourceLiquidity = _accts.userSourceLiquidity;
        userDestinationCollateral = _accts.userDestinationCollateral;
        lendingMarketAuthority = _accts.lendingMarketAuthority;
        tokenProgram = _accts.tokenProgram;
        instructionSysvar = _accts.instructionSysvar;
        eventAuthority = _accts.eventAuthority;
    }

    /// @inheritdoc ILendingAdapter
    function totalDeposited() external view override returns (uint256) {
        return _trackedDeposits;
    }

    /// @inheritdoc ILendingAdapter
    function supply(uint256 amount) external override onlyVault nonReentrant returns (uint256) {
        if (amount == 0) return 0;
        require(amount <= type(uint64).max, "Amount exceeds u64");
        uint64 amount64 = uint64(amount);

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        if (liveCpiEnabled) {
            _executeKaminoDepositCpi(amount64);
        }

        _trackedDeposits += amount;
        emit KaminoCpiExecuted("deposit", amount64, reserve);
        return amount;
    }

    /// @inheritdoc ILendingAdapter
    function withdraw(uint256 amount, address to) external override onlyVault nonReentrant returns (uint256) {
        if (amount == 0) return 0;
        require(amount <= _trackedDeposits, "Insufficient adapter balance");
        require(amount <= type(uint64).max, "Amount exceeds u64");
        uint64 amount64 = uint64(amount);

        if (liveCpiEnabled) {
            _executeKaminoRedeemCpi(amount64);
        }

        _trackedDeposits -= amount;
        IERC20(asset).safeTransfer(to, amount);

        emit KaminoCpiExecuted("redeem", amount64, reserve);
        return amount;
    }

    /// @notice Builds and fires the atomic CPI into Kamino klend deposit_reserve_liquidity.
    function _executeKaminoDepositCpi(uint64 amount64) internal {
        // Contract external authority PDA signs
        bytes32 ownerPda = HelperProgram.pda(address(this));

        // 12 Accounts declared upfront per Kamino klend IDL
        AccountMetaBuilder.Meta memory m = AccountMetaBuilder.alloc(12);
        m = AccountMetaBuilder.signer(m, ownerPda);                      // 0: owner (signer)
        m = AccountMetaBuilder.readonly(m, lendingMarket);               // 1: lendingMarket
        m = AccountMetaBuilder.writable(m, reserve);                     // 2: reserve
        m = AccountMetaBuilder.readonly(m, reserveLiquidityMint);        // 3: reserveLiquidityMint
        m = AccountMetaBuilder.writable(m, reserveLiquiditySupply);      // 4: reserveLiquiditySupply
        m = AccountMetaBuilder.writable(m, reserveCollateralMint);       // 5: reserveCollateralMint
        m = AccountMetaBuilder.writable(m, userSourceLiquidity);         // 6: userSourceLiquidity
        m = AccountMetaBuilder.writable(m, userDestinationCollateral);   // 7: userDestinationCollateral
        m = AccountMetaBuilder.readonly(m, lendingMarketAuthority);      // 8: lendingMarketAuthority
        m = AccountMetaBuilder.readonly(m, tokenProgram);                // 9: tokenProgram
        m = AccountMetaBuilder.readonly(m, instructionSysvar);           // 10: sysvar
        m = AccountMetaBuilder.readonly(m, eventAuthority);              // 11: eventAuthority

        ICrossProgramInvocation.AccountMeta[] memory accounts = AccountMetaBuilder.buildChecked(m);

        // Instruction data = 8 byte Anchor discriminator + 8 byte u64 little-endian amount
        bytes memory ixData = AnchorInstruction.withDisc(
            DISC_DEPOSIT,
            abi.encodePacked(Convert.u64le(amount64))
        );

        // Execute CPI through Rome precompile
        CpiProgram.invoke(klendProgramId, accounts, ixData);
    }

    /// @notice Builds and fires the atomic CPI into Kamino klend redeem_reserve_collateral.
    function _executeKaminoRedeemCpi(uint64 collateralAmount64) internal {
        bytes32 ownerPda = HelperProgram.pda(address(this));

        AccountMetaBuilder.Meta memory m = AccountMetaBuilder.alloc(12);
        m = AccountMetaBuilder.signer(m, ownerPda);                      // 0: owner (signer)
        m = AccountMetaBuilder.readonly(m, lendingMarket);               // 1: lendingMarket
        m = AccountMetaBuilder.writable(m, reserve);                     // 2: reserve
        m = AccountMetaBuilder.readonly(m, reserveLiquidityMint);        // 3: reserveLiquidityMint
        m = AccountMetaBuilder.writable(m, reserveLiquiditySupply);      // 4: reserveLiquiditySupply
        m = AccountMetaBuilder.writable(m, reserveCollateralMint);       // 5: reserveCollateralMint
        m = AccountMetaBuilder.writable(m, userDestinationCollateral);   // 6: userSourceCollateral
        m = AccountMetaBuilder.writable(m, userSourceLiquidity);         // 7: userDestinationLiquidity
        m = AccountMetaBuilder.readonly(m, lendingMarketAuthority);      // 8: lendingMarketAuthority
        m = AccountMetaBuilder.readonly(m, tokenProgram);                // 9: tokenProgram
        m = AccountMetaBuilder.readonly(m, instructionSysvar);           // 10: sysvar
        m = AccountMetaBuilder.readonly(m, eventAuthority);              // 11: eventAuthority

        ICrossProgramInvocation.AccountMeta[] memory accounts = AccountMetaBuilder.buildChecked(m);

        bytes memory ixData = AnchorInstruction.withDisc(
            DISC_REDEEM,
            abi.encodePacked(Convert.u64le(collateralAmount64))
        );

        CpiProgram.invoke(klendProgramId, accounts, ixData);
    }

    /// @inheritdoc ILendingAdapter
    function getEstimatedApyBps() external pure override returns (uint256) {
        return 720; // 7.20% Kamino USDC lending APY estimate
    }
}
