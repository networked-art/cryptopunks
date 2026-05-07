// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./BytecodeBlob.sol";

/// @title BlobStorage
/// @notice Append-only chunked storage for variable-size byte blobs, backed by SSTORE2-style bytecode pointers.
/// @dev Each chunk records its bytecode pointer and the cumulative end offset.
///      `read` performs a binary search on cumulative offsets and copies bytes
///      directly from bytecode into the output via `extcodecopy` (no intermediate allocation).
library BlobStorage {
    struct Chunk {
        address pointer;
        uint32 endOffset;
    }

    error InvalidChunkIndex();
    error LengthOverflow();
    error ReadOutOfBounds(uint256 offset, uint256 length);

    uint256 private constant WORD_BYTES = 32;
    uint256 private constant UINT24_BYTES = 3;

    /// @dev Appends `data` as a new bytecode-deployed chunk at sequential index `chunkIndex`.
    /// @return newLength Cumulative blob length after the append.
    function append(Chunk[] storage chunks, uint16 chunkIndex, bytes calldata data)
        internal
        returns (uint256 newLength)
    {
        if (chunkIndex != chunks.length) revert InvalidChunkIndex();

        address pointer = BytecodeBlob.write(data);
        uint256 prevEnd = chunkIndex == 0 ? 0 : chunks[chunkIndex - 1].endOffset;
        newLength = prevEnd + data.length;
        if (newLength > type(uint32).max) revert LengthOverflow();
        chunks.push(Chunk({pointer: pointer, endOffset: uint32(newLength)}));
    }

    /// @dev Returns the cumulative length of all stored bytes across chunks.
    function totalLength(Chunk[] storage chunks) internal view returns (uint256) {
        uint256 chunkCount = chunks.length;
        return chunkCount == 0 ? 0 : chunks[chunkCount - 1].endOffset;
    }

    /// @dev Reads `segmentLength` bytes from logical `offset`, walking chunks as needed.
    function read(Chunk[] storage chunks, uint256 offset, uint256 segmentLength)
        internal
        view
        returns (bytes memory out)
    {
        if (segmentLength == 0) return new bytes(0);

        uint256 chunkCount = chunks.length;
        if (chunkCount == 0) revert ReadOutOfBounds(offset, segmentLength);

        uint256 cumulativeLength = chunks[chunkCount - 1].endOffset;
        if (offset >= cumulativeLength || segmentLength > cumulativeLength - offset) {
            revert ReadOutOfBounds(offset, segmentLength);
        }

        out = new bytes(segmentLength);
        (uint256 chunkIndex, uint256 chunkStart) = _locate(chunks, offset);

        uint256 written;
        while (written < segmentLength) {
            Chunk storage chunk = chunks[chunkIndex];
            uint256 chunkEnd = chunk.endOffset;
            uint256 readStart = offset + written - chunkStart;
            uint256 chunkRemaining = chunkEnd - chunkStart - readStart;
            uint256 segmentRemaining = segmentLength - written;
            uint256 toCopy = chunkRemaining < segmentRemaining ? chunkRemaining : segmentRemaining;

            address pointer = chunk.pointer;
            assembly ("memory-safe") {
                // BytecodeBlob runtime is `STOP || data`; the +1 skips the leading STOP byte.
                extcodecopy(pointer, add(add(out, 0x20), written), add(readStart, 1), toCopy)
            }

            written += toCopy;
            chunkStart = chunkEnd;
            unchecked { ++chunkIndex; }
        }
    }

    /// @dev Reads a big-endian uint256 word from logical `offset`.
    function readWordAt(Chunk[] storage chunks, uint256 offset)
        internal
        view
        returns (uint256 word)
    {
        bytes memory data = read(chunks, offset, WORD_BYTES);
        assembly ("memory-safe") {
            word := mload(add(data, 0x20))
        }
    }

    /// @dev Reads a big-endian uint24 from logical `offset`.
    function readUint24At(Chunk[] storage chunks, uint256 offset)
        internal
        view
        returns (uint256 value)
    {
        bytes memory data = read(chunks, offset, UINT24_BYTES);
        return (uint256(uint8(data[0])) << 16)
            | (uint256(uint8(data[1])) << 8)
            | uint8(data[2]);
    }

    /// @dev Binary-searches the leftmost chunk whose `endOffset > offset`.
    function _locate(Chunk[] storage chunks, uint256 offset)
        private
        view
        returns (uint256 chunkIndex, uint256 chunkStart)
    {
        uint256 lo;
        uint256 hi = chunks.length;
        while (lo < hi) {
            uint256 mid = (lo + hi) >> 1;
            if (chunks[mid].endOffset <= offset) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        chunkIndex = lo;
        chunkStart = lo == 0 ? 0 : chunks[lo - 1].endOffset;
    }
}
