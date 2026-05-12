// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

interface ICryptoPunks721 {
    function wrapPunk(uint256 punkIndex) external;

    function unwrapPunk(uint256 punkIndex) external;

    function wrapPunkBatch(uint256[] calldata punkIndexes) external;

    function unwrapPunkBatch(uint256[] calldata punkIndexes) external;

    function migrateLegacyWrappedPunks(uint256[] calldata punkIndexes) external;

    function transferFrom(address from, address to, uint256 tokenId) external;

    function approve(address to, uint256 punkId) external;

    function ownerOf(uint256 punkId) external view returns (address);
}
