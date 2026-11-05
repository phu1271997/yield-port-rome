// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILendingAdapter} from "../interfaces/ILendingAdapter.sol";

contract MockLendingAdapter is ILendingAdapter {
    using SafeERC20 for IERC20;

    address public immutable override asset;
    uint256 public totalSupplied;
    uint256 public mockApyBps = 650; // 6.50%

    constructor(address _asset) {
        asset = _asset;
    }

    function totalDeposited() external view override returns (uint256) {
        return totalSupplied;
    }

    function supply(uint256 amount) external override returns (uint256) {
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        totalSupplied += amount;
        return amount;
    }

    function withdraw(uint256 amount, address to) external override returns (uint256) {
        require(amount <= totalSupplied, "MockAdapter: insufficient balance");
        totalSupplied -= amount;
        IERC20(asset).safeTransfer(to, amount);
        return amount;
    }

    function getEstimatedApyBps() external view override returns (uint256) {
        return mockApyBps;
    }

    function simulateYieldAccrual(uint256 yieldAmount) external {
        totalSupplied += yieldAmount;
    }
}
