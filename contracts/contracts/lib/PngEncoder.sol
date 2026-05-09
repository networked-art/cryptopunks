// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./Crc32.sol";
import "./Adler32.sol";

/// @title  PngEncoder
/// @notice PNG chunk framing + zlib stored-block IDAT for 24x24 PNG-8 images.
/// @dev    Internal-only. Writes into a caller-allocated bytes buffer at a
///         cursor and returns the new cursor. The mosaic encoder
///         (`PunksPNG.sol`, deferred) will reuse `writeChunk` and extend the
///         IDAT path with a non-stored DEFLATE encoder.
library PngEncoder {
    uint32 internal constant TYPE_IHDR = 0x49484452;
    uint32 internal constant TYPE_PLTE = 0x504C5445;
    uint32 internal constant TYPE_TRNS = 0x74524E53;
    uint32 internal constant TYPE_IDAT = 0x49444154;
    uint32 internal constant TYPE_IEND = 0x49454E44;

    /// @dev IDAT zlib container around a single 24x24 indexed image.
    /// 7-byte zlib + DEFLATE-stored header, 600 bytes raw (24 filtered
    /// scanlines), 4-byte Adler-32 = 611 bytes.
    uint256 internal constant IDAT_PAYLOAD_LEN = 611;
    uint256 private constant RAW_LEN = 600;
    uint256 private constant SCAN_STRIDE = 25; // 1 filter byte + 24 indexed bytes

    /// @dev Writes the 8-byte PNG signature `89 50 4E 47 0D 0A 1A 0A`.
    function writeSignature(bytes memory out, uint256 cursor)
        internal
        pure
        returns (uint256)
    {
        bytes memory sig = hex"89504E470D0A1A0A";
        assembly ("memory-safe") {
            mcopy(add(add(out, 0x20), cursor), add(sig, 0x20), 8)
        }
        return cursor + 8;
    }

    /// @dev Writes a complete chunk (length, type, payload, CRC32) at `cursor`.
    function writeChunk(
        bytes memory out,
        uint256 cursor,
        uint256[256] memory crcTable,
        uint32 chunkType,
        bytes memory payload
    ) internal pure returns (uint256) {
        uint256 payloadLen = payload.length;

        out[cursor] = bytes1(uint8(payloadLen >> 24));
        out[cursor + 1] = bytes1(uint8(payloadLen >> 16));
        out[cursor + 2] = bytes1(uint8(payloadLen >> 8));
        out[cursor + 3] = bytes1(uint8(payloadLen));

        out[cursor + 4] = bytes1(uint8(chunkType >> 24));
        out[cursor + 5] = bytes1(uint8(chunkType >> 16));
        out[cursor + 6] = bytes1(uint8(chunkType >> 8));
        out[cursor + 7] = bytes1(uint8(chunkType));

        if (payloadLen > 0) {
            assembly ("memory-safe") {
                let dst := add(add(out, 0x20), add(cursor, 8))
                let src := add(payload, 0x20)
                mcopy(dst, src, payloadLen)
            }
        }

        uint32 crc = Crc32.crc32Slice(crcTable, out, cursor + 4, 4 + payloadLen);

        uint256 crcOff = cursor + 8 + payloadLen;
        out[crcOff] = bytes1(uint8(crc >> 24));
        out[crcOff + 1] = bytes1(uint8(crc >> 16));
        out[crcOff + 2] = bytes1(uint8(crc >> 8));
        out[crcOff + 3] = bytes1(uint8(crc));

        return crcOff + 4;
    }

    /// @dev Builds the 611-byte IDAT payload for a 24x24 PNG-8 image.
    /// `indexedPixels` is the 576-byte raster-order palette index stream.
    function buildIdatPayload(bytes memory indexedPixels)
        internal
        pure
        returns (bytes memory payload)
    {
        // Caller (PunksRenderer) guarantees a 576-byte indexed stream from
        // PunksData. No defensive check.
        payload = new bytes(IDAT_PAYLOAD_LEN);

        // zlib header (CMF=0x78 deflate-32k window, FLG=0x01 fastest no dict)
        // (CMF*256 + FLG) % 31 == 0
        payload[0] = 0x78;
        payload[1] = 0x01;

        // DEFLATE block header byte: BFINAL=1 (LSB), BTYPE=00.
        payload[2] = 0x01;

        // LEN = 600 LE, NLEN = ~600 & 0xFFFF LE.
        payload[3] = bytes1(uint8(RAW_LEN));
        payload[4] = bytes1(uint8(RAW_LEN >> 8));
        uint256 nlen = (~RAW_LEN) & 0xFFFF;
        payload[5] = bytes1(uint8(nlen));
        payload[6] = bytes1(uint8(nlen >> 8));

        // 24 filtered scanlines: filter byte 0 (default) + 24 indexed bytes.
        // Filter bytes are already 0; only copy pixel bytes.
        for (uint256 row = 0; row < 24; ++row) {
            assembly ("memory-safe") {
                let src := add(add(indexedPixels, 0x20), mul(row, 24))
                let dst := add(
                    add(payload, 0x20),
                    add(7, add(mul(row, SCAN_STRIDE), 1))
                )
                mcopy(dst, src, 24)
            }
        }

        // Adler-32 over the 600-byte raw stream embedded at payload[7..607].
        uint32 adler = Adler32.adler32Slice(payload, 7, RAW_LEN);
        uint256 adlerOff = 7 + RAW_LEN;
        payload[adlerOff] = bytes1(uint8(adler >> 24));
        payload[adlerOff + 1] = bytes1(uint8(adler >> 16));
        payload[adlerOff + 2] = bytes1(uint8(adler >> 8));
        payload[adlerOff + 3] = bytes1(uint8(adler));
    }

    /// @dev Returns the 13-byte IHDR payload for a 24x24 PNG-8 indexed image.
    function ihdrPayload() internal pure returns (bytes memory ihdr) {
        ihdr = new bytes(13);
        // width = 24
        ihdr[3] = 0x18;
        // height = 24
        ihdr[7] = 0x18;
        ihdr[8] = 0x08; // bit depth = 8
        ihdr[9] = 0x03; // color type = 3 (palette)
        // ihdr[10..12] left at 0: compression=0, filter=0, interlace=0.
    }
}
