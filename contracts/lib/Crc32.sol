// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  Crc32
/// @notice IEEE 802.3 CRC32 (poly 0xEDB88320), used by PNG chunks.
/// @dev    Table-based, internal-only. Build the 256-entry table once with
///         `buildTable()` and reuse it across many calls inside one
///         transaction. The convenience `crc32(bytes)` rebuilds the table on
///         every call.
library Crc32 {
    uint256 private constant POLY = 0xEDB88320;

    /// @dev Convenience for one-shot CRC over an entire byte array.
    function crc32(bytes memory data) internal pure returns (uint32) {
        return crc32Slice(buildTable(), data, 0, data.length);
    }

    /// @dev CRC over a memory slice using a precomputed table.
    function crc32Slice(
        uint256[256] memory table,
        bytes memory data,
        uint256 offset,
        uint256 length
    ) internal pure returns (uint32) {
        uint256 crc = 0xFFFFFFFF;
        unchecked {
            uint256 end = offset + length;
            for (uint256 i = offset; i < end; ++i) {
                uint256 b = uint8(data[i]);
                crc = (crc >> 8) ^ table[(crc ^ b) & 0xFF];
            }
        }
        return uint32(crc ^ 0xFFFFFFFF);
    }

    /// @dev Builds the 256-entry CRC32 lookup table.
    function buildTable() internal pure returns (uint256[256] memory table) {
        unchecked {
            for (uint256 i = 0; i < 256; ++i) {
                uint256 c = i;
                for (uint256 k = 0; k < 8; ++k) {
                    if (c & 1 == 1) c = POLY ^ (c >> 1);
                    else c >>= 1;
                }
                table[i] = c;
            }
        }
    }
}
