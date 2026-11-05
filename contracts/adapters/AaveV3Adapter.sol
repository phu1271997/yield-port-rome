// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ILendingAdapter} from "../interfaces/ILendingAdapter.sol";

interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface IAToken is IERC20 {
    // Standard ERC20 representing interest-bearing deposit
}

interface IAaveProtocolDataProvider {
    function getReserveData(address asset) external view returns (
        uint256 unbacked,
        uint256 accruedToTreasuryScaled,
        uint256 totalAToken,
        uint256 totalStableDebt,
        uint256 totalVariableDebt,
        uint256 liquidityRate,
        uint256 variableBorrowRate,
        uint256 stableBorrowRate,
        uint256 averageStableBorrowRate,
        uint256 liquidityIndex,
        uint256 variableBorrowIndex,
        uint40 lastUpdateTimestamp
    );
}

/// @title AaveV3Adapter
/// @notice Adapts Aave v3 pool deployed on Rome EVM (Hadrian) for YieldVault.
///         Supplies USDC and holds aTokens, auto-compounding yield.
contract AaveV3Adapter is ILendingAdapter, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable override asset;
    address public immutable aToken;
    IAavePool public immutable pool;
    IAaveProtocolDataProvider public immutable dataProvider;
    address public vault;

    modifier onlyVault() {
        require(msg.sender == vault, "AaveV3Adapter: caller not vault");
        _;
    }

    constructor(
        address _asset,
        address _aToken,
        address _pool,
        address _dataProvider,
        address _initialOwner
    ) Ownable(_initialOwner) {
        require(_asset != address(0), "Invalid asset");
        require(_pool != address(0), "Invalid pool");
        asset = _asset;
        aToken = _aToken;
        pool = IAavePool(_pool);
        dataProvider = IAaveProtocolDataProvider(_dataProvider);
    }

    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid vault address");
        vault = _vault;
    }

    /// @inheritdoc ILendingAdapter
    function totalDeposited() public view override returns (uint256) {
        if (aToken == address(0)) {
            return IERC20(asset).balanceOf(address(this));
        }
        return IAToken(aToken).balanceOf(address(this));
    }

    /// @inheritdoc ILendingAdapter
    function supply(uint256 amount) external override onlyVault nonReentrant returns (uint256) {
        if (amount == 0) return 0;
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(asset).forceApprove(address(pool), amount);
        pool.supply(asset, amount, address(this), 0);
        return amount;
    }

    /// @inheritdoc ILendingAdapter
    function withdraw(uint256 amount, address to) external override onlyVault nonReentrant returns (uint256) {
        if (amount == 0) return 0;
        return pool.withdraw(asset, amount, to);
    }

    /// @inheritdoc ILendingAdapter
    function getEstimatedApyBps() external view override returns (uint256) {
        if (address(dataProvider) == address(0)) {
            return 500; // 5.00% default fallback
        }
        try dataProvider.getReserveData(asset) returns (
            uint256, uint256, uint256, uint256, uint256,
            uint256 liquidityRate,
            uint256, uint256, uint256, uint256, uint256, uint40
        ) {
            // liquidityRate is in ray (1e27). APY bps = (liquidityRate * 10000) / 1e27
            return (liquidityRate * 10000) / 1e27;
        } catch {
            return 500;
        }
    }
}
