// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

contract MockCryptoPunksTraits {
    /// @notice Checks whether a Punk has a mocked trait.
    mapping(uint16 => mapping(uint16 => bool)) public hasTrait;

    /// @notice Sets whether a Punk has a mocked trait.
    function setTrait(uint16 punkId, uint16 traitId, bool value) external {
        hasTrait[punkId][traitId] = value;
    }
}
