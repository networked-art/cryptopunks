// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Replaceable trait lookup surface for Punk offer filters.
interface ICryptoPunksTraits {
    function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool);
}
