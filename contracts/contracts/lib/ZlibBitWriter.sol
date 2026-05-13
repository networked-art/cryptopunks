// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  ZlibBitWriter
/// @notice DEFLATE bit-packing helpers.
/// @dev    DEFLATE writes bits least-significant bit first inside each byte.
library ZlibBitWriter {
    error OutputTooSmall();
    error InvalidBitCount();

    function writeBits(
        bytes memory out,
        uint256 bitOffset,
        uint256 value,
        uint8 bitCount
    ) internal pure returns (uint256 nextBitOffset) {
        if (bitCount > 32) revert InvalidBitCount();
        if (bitOffset + bitCount > out.length * 8) revert OutputTooSmall();

        for (uint8 i; i < bitCount; ++i) {
            if (((value >> i) & 1) != 0) {
                uint256 byteIndex = bitOffset >> 3;
                uint8 mask = uint8(1 << (bitOffset & 7));
                out[byteIndex] = bytes1(uint8(out[byteIndex]) | mask);
            }
            ++bitOffset;
        }

        return bitOffset;
    }

    function byteLength(uint256 bitLength) internal pure returns (uint256) {
        return (bitLength + 7) >> 3;
    }

    function trim(bytes memory out, uint256 bitLength)
        internal
        pure
        returns (bytes memory)
    {
        uint256 length = byteLength(bitLength);
        if (length > out.length) revert OutputTooSmall();
        assembly ("memory-safe") {
            mstore(out, length)
        }
        return out;
    }
}
