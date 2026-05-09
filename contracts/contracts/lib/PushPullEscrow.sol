// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title  PushPullEscrow
/// @notice Pushes ETH with capped gas and falls back to pull-credit accounting.
abstract contract PushPullEscrow is ReentrancyGuard {
    uint256 internal constant PUSH_GAS = 95_000;

    /// @notice Returns ETH that can be withdrawn by an account.
    mapping(address => uint256) public balances;

    event Withdrawal(address indexed account, uint256 amount);
    event Credited(address indexed account, uint256 amount);

    error NoBalanceToWithdraw();
    error FailedWithdrawal();

    /// @notice Withdraws ETH that could not be sent to you directly.
    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        if (amount == 0) revert NoBalanceToWithdraw();
        balances[msg.sender] = 0;

        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert FailedWithdrawal();

        emit Withdrawal(msg.sender, amount);
    }

    /// @dev Sends ETH with capped gas and credits the recipient if the send fails.
    function _pushOrCredit(address to, uint256 amount) internal {
        if (amount == 0 || to == address(0)) return;
        (bool ok,) = payable(to).call{value: amount, gas: PUSH_GAS}("");
        if (!ok) _credit(to, amount);
    }

    /// @dev Adds ETH to pull-credit accounting for a recipient.
    function _credit(address to, uint256 amount) internal {
        if (amount == 0 || to == address(0)) return;
        balances[to] += amount;
        emit Credited(to, amount);
    }
}
