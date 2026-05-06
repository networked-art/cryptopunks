// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

contract MockCryptoPunksTraits {
    mapping(uint16 => mapping(uint16 => bool)) public hasTrait;

    function setTrait(uint16 punkId, uint16 traitId, bool value) external {
        hasTrait[punkId][traitId] = value;
    }
}
