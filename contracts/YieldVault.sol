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

/// @title YieldVault
/// @notice ERC-4626 compliant tokenized yield vault on Rome Protocol.
///         Accepts USDC deposits from EVM wallets and routes them into
///         lending markets (Aave v3 on Rome EVM or Solana lending markets like Kamino via atomic CPI).
///         Users hold vault shares that appreciate as lending yield accrues.
contract YieldVault is ERC20, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    /// @notice The underlying asset (USDC).
    IERC20 private immutable _asset;
    uint8 private immutable _assetDecimals;

    /// @notice Pluggable lending adapter (AaveV3Adapter, KaminoCpiAdapter, etc.).
    ILendingAdapter public adapter;

    /// @notice Minimum deposit to prevent dust griefing.
    uint256 public minDeposit = 1e4; // 0.01 USDC (assuming 6 decimals)

    /// @notice Virtual offset for inflation attack protection (OpenZeppelin 4626 standard).
    uint8 private constant _DECIMALS_OFFSET = 3;

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

    constructor(
        address assetAddress,
        string memory name,
        string memory symbol,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        require(assetAddress != address(0), "YieldVault: zero asset address");
        _asset = IERC20(assetAddress);
        _assetDecimals = IERC20Metadata(assetAddress).decimals();
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

    /// @notice Total assets managed by vault (idle in vault + active in lending adapter).
    function totalAssets() public view returns (uint256) {
        uint256 idle = _asset.balanceOf(address(this));
        uint256 invested = address(adapter) != address(0) ? adapter.totalDeposited() : 0;
        return idle + invested;
    }

    /// @notice Current price of one full vault share in underlying asset units.
    function pricePerShare() external view returns (uint256) {
        return convertToAssets(10 ** decimals());
    }

    /// @notice Current estimated APY reported by the active adapter (in basis points).
    function getEstimatedApyBps() external view returns (uint256) {
        if (address(adapter) == address(0)) return 0;
        return adapter.getEstimatedApyBps();
    }

    // ──────────────────────────────────────────────────────────────────
    // Conversion & Preview Logic (Inflation-Attack Safe)
    // ──────────────────────────────────────────────────────────────────

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
    /// @dev If an adapter is active, funds are atomically pushed into the lending protocol.
    ///      If the adapter call fails, the entire transaction reverts.
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

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /// @notice Withdraw exact `assets` to `receiver`, burning `shares` from `owner`.
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external nonReentrant returns (uint256 shares) {
        require(assets > 0, "YieldVault: cannot withdraw zero assets");
        require(receiver != address(0), "YieldVault: zero receiver");

        shares = previewWithdraw(assets);
        require(shares > 0, "YieldVault: cannot burn zero shares");

        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }

        _burn(owner, shares);

        // Ensure sufficient idle assets in vault; pull from adapter if necessary
        _ensureLiquidAssets(assets);

        _asset.safeTransfer(receiver, assets);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /// @notice Redeem exact `shares` for `assets` sent to `receiver`.
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external nonReentrant returns (uint256 assets) {
        require(shares > 0, "YieldVault: cannot redeem zero shares");
        require(receiver != address(0), "YieldVault: zero receiver");

        assets = previewRedeem(shares);
        require(assets > 0, "YieldVault: cannot withdraw zero assets");

        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }

        _burn(owner, shares);

        _ensureLiquidAssets(assets);

        _asset.safeTransfer(receiver, assets);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /// @dev Internal helper to pull assets from adapter when idle vault balance is not enough.
    function _ensureLiquidAssets(uint256 requiredAmount) internal {
        uint256 currentBalance = _asset.balanceOf(address(this));
        if (currentBalance < requiredAmount) {
            uint256 deficit = requiredAmount - currentBalance;
            require(address(adapter) != address(0), "YieldVault: no adapter to liquidate");
            adapter.withdraw(deficit, address(this));
            require(_asset.balanceOf(address(this)) >= requiredAmount, "YieldVault: liquidation insufficient");
        }
    }

    /// @notice Emergency rescue for accidental tokens sent to vault (excluding primary asset).
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(_asset), "YieldVault: cannot rescue vault asset");
        IERC20(token).safeTransfer(to, amount);
        emit EmergencyFundsRescued(token, to, amount);
    }
}
