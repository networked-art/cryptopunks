// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Adler32} from "./Adler32.sol";
import {ZlibBitWriter} from "./ZlibBitWriter.sol";
import {ZlibDynamicBlock} from "./ZlibDynamicBlock.sol";
import {ZlibSlow} from "./ZlibSlow.sol";

/// @title  ZlibLevel9
/// @notice zlib wrapper around the level-9/default-strategy dynamic block path.
library ZlibLevel9 {
    uint256 private constant BLOCK_TOKEN_LIMIT = 16_383;

    function encode(bytes memory input) internal pure returns (bytes memory out) {
        (, uint8[] memory kinds, uint16[] memory values, uint16[] memory distances) =
            ZlibSlow.generateTokens(input);

        uint256 blockCount = kinds.length == 0
            ? 1
            : (kinds.length + BLOCK_TOKEN_LIMIT - 1) / BLOCK_TOKEN_LIMIT;
        out = new bytes(6 + blockCount * 8192 + kinds.length * 8);
        out[0] = 0x78;
        out[1] = 0xda;

        uint256 bitOffset = 16;

        for (uint256 blockIndex; blockIndex < blockCount; ++blockIndex) {
            uint256 start = blockIndex * BLOCK_TOKEN_LIMIT;
            uint256 end = start + BLOCK_TOKEN_LIMIT;
            if (end > kinds.length) end = kinds.length;

            (uint8[] memory blockKinds, uint16[] memory blockValues, uint16[] memory blockDistances) =
                _sliceTokens(kinds, values, distances, start, end);
            bitOffset = ZlibDynamicBlock.writeDynamicBlock(
                out,
                bitOffset,
                blockKinds,
                blockValues,
                blockDistances,
                blockIndex + 1 == blockCount
            );
        }

        uint256 cursor = ZlibBitWriter.byteLength(bitOffset);
        uint32 adler = Adler32.adler32(input);
        out[cursor] = bytes1(uint8(adler >> 24));
        out[cursor + 1] = bytes1(uint8(adler >> 16));
        out[cursor + 2] = bytes1(uint8(adler >> 8));
        out[cursor + 3] = bytes1(uint8(adler));

        assembly ("memory-safe") {
            mstore(out, add(cursor, 4))
        }
    }

    function _sliceTokens(
        uint8[] memory kinds,
        uint16[] memory values,
        uint16[] memory distances,
        uint256 start,
        uint256 end
    )
        private
        pure
        returns (
            uint8[] memory blockKinds,
            uint16[] memory blockValues,
            uint16[] memory blockDistances
        )
    {
        uint256 length = end - start;
        blockKinds = new uint8[](length);
        blockValues = new uint16[](length);
        blockDistances = new uint16[](length);

        for (uint256 i; i < length; ++i) {
            blockKinds[i] = kinds[start + i];
            blockValues[i] = values[start + i];
            blockDistances[i] = distances[start + i];
        }
    }
}
