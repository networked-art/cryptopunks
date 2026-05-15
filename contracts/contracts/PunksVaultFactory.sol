// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {LibClone} from "solady/src/utils/LibClone.sol";

import "./interfaces/IPunksVault.sol";
import "./interfaces/IPunksVaultFactory.sol";
import "./interfaces/IReverseRegistrar.sol";
import "./PunksVault.sol";

/// @title  PunksVaultFactory
/// @notice Deploys deterministic per-user `PunksVault` clones. The vault
///         address is keyed by `user` and predictable offchain, so
///         counterfactual deposits to `predictVault(user)` are safe
///         before deployment.
/// @author 1001
contract PunksVaultFactory is IPunksVaultFactory {
    /// @inheritdoc IPunksVaultFactory
    address public immutable IMPLEMENTATION;

    constructor() {
        IMPLEMENTATION = address(new PunksVault(address(this)));

        IReverseRegistrar(0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb)
            .setName("punksvaultfactory.eth");
    }

    /// @inheritdoc IPunksVaultFactory
    function predictVault(address user) public view returns (address) {
        return LibClone.predictDeterministicAddress(
            IMPLEMENTATION,
            _salt(user),
            address(this)
        );
    }

    /// @inheritdoc IPunksVaultFactory
    function ensureVault(address user) external returns (address vault) {
        if (user == address(0)) revert ZeroAddress();
        (vault,) = _deployIfMissing(user, new address[](0));
    }

    /// @inheritdoc IPunksVaultFactory
    function ensureMyVault(address[] calldata operators)
        external
        returns (address vault)
    {
        vault = predictVault(msg.sender);
        if (vault.code.length == 0) {
            vault = LibClone.cloneDeterministic(IMPLEMENTATION, _salt(msg.sender));
            emit VaultDeployed(msg.sender, vault);
            IPunksVault(vault).factoryInitialize(msg.sender, operators);
        } else if (operators.length != 0) {
            IPunksVault(vault).factoryApproveOperators(msg.sender, operators);
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
        IPunksVault(vault).factoryInitialize(user, operators);
        return (vault, true);
    }

    /// @dev Salts the clone with the user address so vault addresses are
    ///      predictable offchain for counterfactual deposits.
    function _salt(address user) private pure returns (bytes32) {
        return keccak256(abi.encode(user));
    }
}
