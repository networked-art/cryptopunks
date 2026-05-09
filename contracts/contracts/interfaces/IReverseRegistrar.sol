// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  IReverseRegistrar
/// @notice Minimal ENS Reverse Registrar surface used to set a contract's
///         primary name from its constructor.
interface IReverseRegistrar {
    function setName(string memory name) external returns (bytes32);
}
