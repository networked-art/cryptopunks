// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Minimal slice of Yuga Labs' StashFactory used by `PunksVault.stash`
///         to look up and (if needed) deploy the EOA owner's canonical Stash.
interface IStashFactory {
    /// @notice CREATE2-derived address of the Stash for `owner`. Returns the
    ///         deterministic address whether or not the Stash has been
    ///         deployed yet.
    function stashAddressFor(address owner) external view returns (address);

    /// @notice Permissionlessly deploys the Stash for `owner` if it has not
    ///         been deployed yet. Returns the Stash address either way.
    function deployStash(address owner) external returns (address);
}
