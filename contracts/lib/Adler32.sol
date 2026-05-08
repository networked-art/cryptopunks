// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  Adler32
/// @notice Adler-32 checksum (RFC 1950) for zlib streams.
/// @dev    Internal-only. NMAX-aware so the inner additions can run unchecked
///         for up to 5552 bytes between modulo reductions. Per-Punk inputs are
///         600 bytes and never trip the NMAX boundary, but the algorithm is
///         written to support future mosaic encoding (`PunksPNG.sol`).
library Adler32 {
    uint256 private constant BASE = 65521;
    uint256 private constant NMAX = 5552;

    function adler32(bytes memory data) internal pure returns (uint32) {
        return adler32Slice(data, 0, data.length);
    }

    function adler32Slice(bytes memory data, uint256 offset, uint256 length)
        internal
        pure
        returns (uint32)
    {
        uint256 a = 1;
        uint256 b = 0;
        uint256 i = offset;
        uint256 end = offset + length;
        while (i < end) {
            uint256 limit = i + NMAX;
            if (limit > end) limit = end;
            unchecked {
                while (i < limit) {
                    a += uint8(data[i]);
                    b += a;
                    ++i;
                }
            }
            a %= BASE;
            b %= BASE;
        }
        return uint32((b << 16) | a);
    }
}
