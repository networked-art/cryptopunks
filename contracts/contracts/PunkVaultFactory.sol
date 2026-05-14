// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "@openzeppelin/contracts/proxy/Clones.sol";

import "./interfaces/IPunkVault.sol";
import "./interfaces/IPunkVaultFactory.sol";
import "./PunkVault.sol";

/// @title  PunkVaultFactory
/// @notice Deploys deterministic per-user `PunkVault` clones. Salt is the
///         user's address, so the vault address is predictable offchain —
///         counterfactual deposits to `predictVault(user)` are safe before
///         deployment.
/// @author 1001
contract PunkVaultFactory is IPunkVaultFactory {
    /// @inheritdoc IPunkVaultFactory
    address public immutable IMPLEMENTATION;

    constructor() {
        IMPLEMENTATION = address(new PunkVault(address(this)));
    }

    /// @inheritdoc IPunkVaultFactory
    function predictVault(address user) public view returns (address) {
        return Clones.predictDeterministicAddress(
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

    /// @dev Returns the deterministic vault for `user`, deploying it via
    ///      `cloneDeterministic` and initializing owner/operators if it
    ///      doesn't yet exist.
    function _deployIfMissing(address user, address[] memory operators)
        private
        returns (address vault, bool deployed)
    {
        vault = predictVault(user);
        if (vault.code.length != 0) return (vault, false);
        vault = Clones.cloneDeterministic(IMPLEMENTATION, _salt(user));
        emit VaultDeployed(user, vault);
        IPunkVault(vault).factoryInitialize(user, operators);
        return (vault, true);
    }

    /// @dev Salt the deterministic clone with `(user, block.chainid)` so a
    ///      future redeploy of this factory on another chain derives a
    ///      different vault address for the same user, blocking cross-chain
    ///      ERC-1271 replay against a sibling vault at the same address.
    function _salt(address user) private view returns (bytes32) {
        return keccak256(abi.encode(user, block.chainid));
    }
}
