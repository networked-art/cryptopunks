// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  IPunkVaultFactory
/// @notice Deterministic per-user `PunkVault` deployer. Salt is the user's
///         address, so a vault's address is predictable offchain.
///         Counterfactual deposits to `predictVault(user)` are safe
///         regardless of when the vault is deployed or by whom.
/// @author 1001
interface IPunkVaultFactory {
    error ZeroAddress();

    /// @dev Emitted the first time a user's vault is deployed.
    event VaultDeployed(address indexed owner, address indexed vault);

    /// @notice The `PunkVault` implementation cloned for each user.
    function IMPLEMENTATION() external view returns (address);

    /// @notice Deterministic vault address for `user`, deployed or not.
    function predictVault(address user) external view returns (address);

    /// @notice Deploys `user`'s vault if not yet deployed. Idempotent and
    ///         open — a third-party deploy can only produce an initialized,
    ///         user-owned vault with no operators. The user sets approvals
    ///         afterwards.
    function ensureVault(address user) external returns (address vault);

    /// @notice Deploys (or returns) `msg.sender`'s vault and pre-approves
    ///         `operators` only if the vault is created in the same tx.
    ///         `msg.sender`-gated so only the owner can opt into
    ///         pre-approvals at deploy time.
    /// @dev    Initialization is one-shot per vault: subsequent calls with
    ///         operators revert with `AlreadyInitialized`. After deployment,
    ///         use `setOperator` on the vault directly.
    function ensureMyVault(address[] calldata operators)
        external returns (address vault);
}
