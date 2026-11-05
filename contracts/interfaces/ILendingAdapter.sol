// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ILendingAdapter
/// @notice Common interface for yield generation adapters used by YieldVault.
///         Can be backed by Rome EVM contracts (Aave v3) or Solana programs via CPI (Kamino / Save).
interface ILendingAdapter {
    /// @notice Underlying asset address (e.g. USDC).
    function asset() external view returns (address);

    /// @notice Total amount of underlying asset currently deposited and generating yield.
    function totalDeposited() external view returns (uint256);

    /// @notice Supply underlying asset to the lending protocol.
    /// @dev Caller must have transferred or approved `amount` of `asset` to this adapter.
    /// @param amount Amount of asset to supply.
    /// @return actualSupplied Amount successfully deposited.
    function supply(uint256 amount) external returns (uint256 actualSupplied);

    /// @notice Withdraw underlying asset from the lending protocol.
    /// @param amount Amount of asset to withdraw.
    /// @param to Recipient address of withdrawn assets.
    /// @return actualWithdrawn Amount successfully withdrawn and sent to `to`.
    function withdraw(uint256 amount, address to) external returns (uint256 actualWithdrawn);

    /// @notice Current estimated APY in basis points (100 = 1%).
    function getEstimatedApyBps() external view returns (uint256);
}
