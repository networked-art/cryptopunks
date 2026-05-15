// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {LibClone} from "solady/src/utils/LibClone.sol";

import "./interfaces/IPunkVault.sol";
import "./interfaces/IPunkVaultFactory.sol";
import "./PunkVault.sol";

/// @title  PunkVaultFactory
/// @notice Deploys deterministic per-user `PunkVault` clones. The vault
///         address is keyed by `user` and predictable offchain, so
///         counterfactual deposits to `predictVault(user)` are safe
///         before deployment.
/// @author 1001
contract PunkVaultFactory is IPunkVaultFactory {
    /// @inheritdoc IPunkVaultFactory
    address public immutable IMPLEMENTATION;

    constructor() {
        IMPLEMENTATION = address(new PunkVault(address(this)));
    }

    /// @inheritdoc IPunkVaultFactory
    function predictVault(address user) public view returns (address) {
        return LibClone.predictDeterministicAddress(
            IMPLEMENTATION,
            _salt(user),
            address(this)
        );
    }

    /// @inheritdoc IPunkVaultFactory
    function ensureVault(address user) external returns (address vault) {
        if (user == address(0)) revert ZeroAddress();
        (vault,) = _deployIfMissing(user, new address[](0));
    }

    /// @inheritdoc IPunkVaultFactory
    function ensureMyVault(address[] calldata operators)
        external
        returns (address vault)
    {
        bool deployed;
        (vault, deployed) = _deployIfMissing(msg.sender, operators);
        if (!deployed && operators.length > 0) {
            IPunkVault(vault).factoryInitialize(msg.sender, operators);
        }
    }

    /// @dev Returns the deterministic vault for `user`. If it does not
    ///      yet exist, deploys via `cloneDeterministic` and initializes
    ///      owner and operators.
    function _deployIfMissing(address user, address[] memory operators)
        private
        returns (address vault, bool deployed)
    {
        vault = predictVault(user);
        if (vault.code.length != 0) return (vault, false);
        vault = LibClone.cloneDeterministic(IMPLEMENTATION, _salt(user));
        emit VaultDeployed(user, vault);
        IPunkVault(vault).factoryInitialize(user, operators);
        return (vault, true);
    }

    /// @dev Salts the clone with `keccak256(user, block.chainid)` so each
    ///      deployment yields its own vault address for a given user.
    function _salt(address user) private view returns (bytes32) {
        return keccak256(abi.encode(user, block.chainid));
    }
}
