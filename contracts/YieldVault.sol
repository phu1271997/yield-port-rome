// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ILendingAdapter} from "./interfaces/ILendingAdapter.sol";
import {
    ICrossProgramInvocation,
    CpiProgram,
    HelperProgram
} from "@rome-protocol/rome-solidity/contracts/interface.sol";

/// @title YieldVault
/// @notice ERC-4626 compliant tokenized yield vault on Rome Protocol.
///         Accepts USDC deposits from EVM wallets and supplies them into
///         Rome EVM lending strategies (Aave v3) while executing an atomic
///         Solana Cross-Program Invocation (CPI) settlement receipt in the exact
///         same block. Users hold vault shares that appreciate as lending yield accrues.
contract YieldVault is ERC20, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    /// @notice The underlying asset (USDC).
    IERC20 private immutable _asset;
    uint8 private immutable _assetDecimals;

    /// @notice Pluggable lending adapter (AaveV3Adapter, etc.).
    ILendingAdapter public adapter;

    /// @notice Minimum deposit to prevent dust griefing.
    uint256 public minDeposit = 1e4; // 0.01 USDC (assuming 6 decimals)

    /// @notice Virtual offset for inflation attack protection (OpenZeppelin 4626 standard).
    uint8 private constant _DECIMALS_OFFSET = 3;

    /// @notice Target Solana program ID for atomic Cross-Program Invocation (e.g. Memo Program).
    bytes32 public solanaTargetProgram;

    /// @notice Switch for atomic Solana CPI execution on deposit.
    bool public atomicCpiEnabled;

    // Events
    event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(
        address indexed sender,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );
    event AdapterUpdated(address indexed previousAdapter, address indexed newAdapter);
    event MinDepositUpdated(uint256 previousMin, uint256 newMin);
    event EmergencyFundsRescued(address indexed token, address indexed to, uint256 amount);
    event SolanaCpiSettlement(
        address indexed sender,
        address indexed receiver,
        uint256 assets,
        uint256 shares,
        bytes32 indexed solanaProgram
    );
    event SolanaTargetProgramUpdated(bytes32 indexed newProgram, bool enabled);

    constructor(
        address assetAddress,
        string memory name,
        string memory symbol,
        address initialOwner,
        bytes32 defaultSolanaProgram
    ) ERC20(name, symbol) Ownable(initialOwner) {
        require(assetAddress != address(0), "YieldVault: zero asset address");
        _asset = IERC20(assetAddress);
        _assetDecimals = IERC20Metadata(assetAddress).decimals();
        solanaTargetProgram = defaultSolanaProgram;
        atomicCpiEnabled = (defaultSolanaProgram != bytes32(0));
    }

    // ──────────────────────────────────────────────────────────────────
    // Admin Controls
    // ──────────────────────────────────────────────────────────────────

    /// @notice Set the active lending strategy adapter.
    /// @param newAdapter Address of the new adapter contract.
    function setAdapter(ILendingAdapter newAdapter) external onlyOwner {
        require(address(newAdapter) != address(0), "YieldVault: zero adapter address");
        require(newAdapter.asset() == address(_asset), "YieldVault: asset mismatch");

        address prev = address(adapter);
        adapter = newAdapter;

        emit AdapterUpdated(prev, address(newAdapter));
    }

    /// @notice Set or update the target Solana program ID for atomic CPI settlement.
    function setSolanaTargetProgram(bytes32 newProgram, bool enabled) external onlyOwner {
        solanaTargetProgram = newProgram;
        atomicCpiEnabled = enabled;
        emit SolanaTargetProgramUpdated(newProgram, enabled);
    }

    function setMinDeposit(uint256 newMin) external onlyOwner {
        uint256 prev = minDeposit;
        minDeposit = newMin;
        emit MinDepositUpdated(prev, newMin);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ──────────────────────────────────────────────────────────────────
    // ERC-4626 Metadata & Accounting
    // ──────────────────────────────────────────────────────────────────

    function asset() public view returns (address) {
        return address(_asset);
    }

    function decimals() public view virtual override returns (uint8) {
        return _assetDecimals + _DECIMALS_OFFSET;
    }

    /// @notice Total amount of underlying assets managed by the vault (liquid + deployed).
    function totalAssets() public view returns (uint256) {
        uint256 liquid = _asset.balanceOf(address(this));
        uint256 deployed = address(adapter) != address(0) ? adapter.totalDeposited() : 0;
        return liquid + deployed;
    }

    /// @notice Estimated annual percentage yield (in basis points) reported by active strategy.
    function getEstimatedApyBps() external view returns (uint256) {
        if (address(adapter) == address(0)) return 0;
        return adapter.getEstimatedApyBps();
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        return _convertToShares(assets, Math.Rounding.Floor);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return _convertToAssets(shares, Math.Rounding.Floor);
    }

    function previewDeposit(uint256 assets) public view returns (uint256) {
        return _convertToShares(assets, Math.Rounding.Floor);
    }

    function previewMint(uint256 shares) public view returns (uint256) {
        return _convertToAssets(shares, Math.Rounding.Ceil);
    }

    /// @notice Returns the price per 1 full share in asset units (e.g. 6 decimals for USDC).
    function pricePerShare() external view returns (uint256) {
        return convertToAssets(10 ** decimals());
    }

    function previewWithdraw(uint256 assets) public view returns (uint256) {
        return _convertToShares(assets, Math.Rounding.Ceil);
    }

    function previewRedeem(uint256 shares) public view returns (uint256) {
        return _convertToAssets(shares, Math.Rounding.Floor);
    }

    function maxDeposit(address) public view returns (uint256) {
        return paused() ? 0 : type(uint256).max;
    }

    function maxMint(address) public view returns (uint256) {
        return paused() ? 0 : type(uint256).max;
    }

    function maxWithdraw(address owner) public view returns (uint256) {
        return _convertToAssets(balanceOf(owner), Math.Rounding.Floor);
    }

    function maxRedeem(address owner) public view returns (uint256) {
        return balanceOf(owner);
    }

    function _convertToShares(uint256 assets, Math.Rounding rounding) internal view returns (uint256) {
        return assets.mulDiv(
            totalSupply() + 10 ** _DECIMALS_OFFSET,
            totalAssets() + 1,
            rounding
        );
    }

    function _convertToAssets(uint256 shares, Math.Rounding rounding) internal view returns (uint256) {
        return shares.mulDiv(
            totalAssets() + 1,
            totalSupply() + 10 ** _DECIMALS_OFFSET,
            rounding
        );
    }

    // ──────────────────────────────────────────────────────────────────
    // User Actions: Deposit & Withdraw
    // ──────────────────────────────────────────────────────────────────

    /// @notice Deposit `assets` of USDC and mint vault `shares` to `receiver`.
    /// @dev Atomically supplies into lending adapter AND executes a Solana CPI settlement receipt.
    function deposit(uint256 assets, address receiver)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        require(assets >= minDeposit, "YieldVault: deposit below minimum");
        require(receiver != address(0), "YieldVault: zero receiver");

        shares = previewDeposit(assets);
        require(shares > 0, "YieldVault: cannot mint zero shares");

        // 1. Pull assets from user
        _asset.safeTransferFrom(msg.sender, address(this), assets);

        // 2. Supply into adapter if available
        if (address(adapter) != address(0)) {
            _asset.forceApprove(address(adapter), assets);
            adapter.supply(assets);
        }

        // 3. Mint shares to receiver
        _mint(receiver, shares);

        // 4. Execute atomic Solana CPI settlement receipt
        _executeSolanaAtomicCpi(msg.sender, receiver, assets, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /// @notice Mint exact `shares` by depositing necessary `assets`.
    function mint(uint256 shares, address receiver)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        require(shares > 0, "YieldVault: cannot mint zero shares");
        require(receiver != address(0), "YieldVault: zero receiver");

        assets = previewMint(shares);
        require(assets >= minDeposit, "YieldVault: deposit below minimum");

        _asset.safeTransferFrom(msg.sender, address(this), assets);

        if (address(adapter) != address(0)) {
            _asset.forceApprove(address(adapter), assets);
            adapter.supply(assets);
        }

        _mint(receiver, shares);

        _executeSolanaAtomicCpi(msg.sender, receiver, assets, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /// @notice Withdraw `assets` of USDC to `receiver` by burning owner's shares.
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external nonReentrant returns (uint256 shares) {
        require(assets > 0, "YieldVault: zero assets");
        require(receiver != address(0), "YieldVault: zero receiver");

        shares = previewWithdraw(assets);

        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }

        _burn(owner, shares);

        uint256 liquid = _asset.balanceOf(address(this));
        if (liquid < assets && address(adapter) != address(0)) {
            uint256 needed = assets - liquid;
            adapter.withdraw(needed, address(this));
        }

        _asset.safeTransfer(receiver, assets);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /// @notice Redeem exact `shares` for underlying USDC sent to `receiver`.
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external nonReentrant returns (uint256 assets) {
        require(shares > 0, "YieldVault: zero shares");
        require(receiver != address(0), "YieldVault: zero receiver");

        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }

        assets = previewRedeem(shares);
        require(assets > 0, "YieldVault: zero asset redemption");

        _burn(owner, shares);

        uint256 liquid = _asset.balanceOf(address(this));
        if (liquid < assets && address(adapter) != address(0)) {
            uint256 needed = assets - liquid;
            adapter.withdraw(needed, address(this));
        }

        _asset.safeTransfer(receiver, assets);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    // ──────────────────────────────────────────────────────────────────
    // Solana Atomic CPI Internals
    // ──────────────────────────────────────────────────────────────────

    /// @notice Executes atomic CPI into the configured Solana program in the same transaction.
    function _executeSolanaAtomicCpi(
        address sender,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal {
        if (!atomicCpiEnabled || solanaTargetProgram == bytes32(0)) {
            return;
        }
        // Local Hardhat node has chainId 31337 and lacks Rome non-EVM precompiles
        if (block.chainid == 31337) {
            emit SolanaCpiSettlement(sender, receiver, assets, shares, solanaTargetProgram);
            return;
        }

        bytes32 callerPda = HelperProgram.pda(address(this));
        ICrossProgramInvocation.AccountMeta[] memory accounts =
            new ICrossProgramInvocation.AccountMeta[](1);
        accounts[0] = ICrossProgramInvocation.AccountMeta({
            pubkey: callerPda,
            is_signer: true,
            is_writable: false
        });

        bytes memory ixData = abi.encodePacked(
            "YieldPort:deposit:snd=",
            _toHexString(sender),
            ":rec=",
            _toHexString(receiver),
            ":ast=",
            _toString(assets),
            ":shs=",
            _toString(shares)
        );

        CpiProgram.invoke(solanaTargetProgram, accounts, ixData);
        emit SolanaCpiSettlement(sender, receiver, assets, shares, solanaTargetProgram);
    }

    /// @notice Explicitly executes an atomic CPI into the configured Solana program.
    ///         Useful for verification via `rome tx hadrian <hash>`.
    function executeAtomicCpiReceipt(string calldata customTag) external nonReentrant returns (bool) {
        require(solanaTargetProgram != bytes32(0), "YieldVault: solana program not configured");
        if (block.chainid == 31337) {
            emit SolanaCpiSettlement(msg.sender, msg.sender, 0, 0, solanaTargetProgram);
            return true;
        }

        bytes32 callerPda = HelperProgram.pda(address(this));
        ICrossProgramInvocation.AccountMeta[] memory accounts =
            new ICrossProgramInvocation.AccountMeta[](1);
        accounts[0] = ICrossProgramInvocation.AccountMeta({
            pubkey: callerPda,
            is_signer: true,
            is_writable: false
        });

        bytes memory ixData = abi.encodePacked(
            "YieldPort:receipt:sender=",
            _toHexString(msg.sender),
            ":tag=",
            customTag
        );

        CpiProgram.invoke(solanaTargetProgram, accounts, ixData);
        emit SolanaCpiSettlement(msg.sender, msg.sender, 0, 0, solanaTargetProgram);
        return true;
    }

    // ──────────────────────────────────────────────────────────────────
    // Internal Encoding Helpers
    // ──────────────────────────────────────────────────────────────────

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory s = new bytes(42);
        s[0] = "0";
        s[1] = "x";
        bytes20 data = bytes20(addr);
        bytes memory alphabet = "0123456789abcdef";
        for (uint256 i = 0; i < 20; i++) {
            s[2 + i * 2] = alphabet[uint8(data[i] >> 4)];
            s[3 + i * 2] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(s);
    }

    // ──────────────────────────────────────────────────────────────────
    // Emergency Controls
    // ──────────────────────────────────────────────────────────────────

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        rescueERC20(token, to, amount);
    }

    function rescueERC20(address token, address to, uint256 amount) public onlyOwner {
        require(token != address(_asset), "YieldVault: cannot rescue vault asset");
        require(to != address(0), "YieldVault: zero rescue destination");
        IERC20(token).safeTransfer(to, amount);
        emit EmergencyFundsRescued(token, to, amount);
    }
}
