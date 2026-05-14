// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./interfaces/IPunksData.sol";
import "./lib/Punks.sol";
import "./lib/Adler32.sol";
import "./lib/Crc32.sol";
import "./lib/PngEncoder.sol";

/// @title  PunksGrid
///
/// @notice Renders a 100x100 one-bit PNG over `PunksData`, where each pixel
///         is a Punk and the bit is set iff the Punk matches a `Punks.Filter`.
///         Pixel (x, y) corresponds to punkId `y * 100 + x`. Bits set in the
///         image are opaque black; unset bits are fully transparent.
///
/// @dev    The filter is evaluated word-by-word against PunksData's per-trait,
///         per-color, per-pixel-count, and per-color-count bitmaps. The
///         dataset's punk-mask (10240 bits, 40 words of 256) is intersected
///         with each filter dimension, then projected to the 100x100 grid.
///         For typical filters the renderer makes only a few hundred external
///         calls into PunksData — orders of magnitude cheaper than a per-punk
///         predicate loop.
///
/// @author 1001
contract PunksGrid {
    /// @notice Total Punks in the dataset.
    uint16 internal constant PUNK_COUNT = 10_000;
    /// @notice Width and height of the rendered grid, in pixels and Punks.
    uint16 internal constant GRID_SIZE = 100;
    /// @notice Number of 256-bit bitmap words spanning the punkId space.
    uint8 internal constant BITMAP_WORD_COUNT = 40;
    /// @notice Index of the last bitmap word (only the low 16 bits are valid).
    uint8 internal constant LAST_WORD_INDEX = 39;
    /// @notice Number of valid bits in the last bitmap word: 10000 - 39 * 256.
    uint256 internal constant LAST_WORD_BITS = 16;

    /// @notice Packed bitmap width in bytes (ceil(100 / 8)). The trailing
    ///         four bits in each row are unused and must remain zero per the
    ///         PNG spec.
    uint256 internal constant BITMAP_ROW_BYTES = 13;
    /// @notice Length of the raw bitmap buffer returned by `gridBitmap`.
    uint256 internal constant BITMAP_BYTES = 1_300;
    /// @notice Filter byte plus one packed scanline.
    uint256 internal constant SCANLINE_STRIDE = 14;
    /// @notice DEFLATE stored-block payload size: 100 scanlines * 14 bytes.
    uint256 internal constant RAW_DEFLATE_BYTES = 1_400;
    /// @notice IDAT payload size: 2-byte zlib header + 5-byte stored block
    ///         header + 1400 raw bytes + 4-byte Adler-32.
    uint256 internal constant IDAT_PAYLOAD_LEN = 1_411;

    /// @dev Filter dimension selectors for the shared `_bitmapWord` lookup.
    uint8 private constant KIND_TRAIT = 0;
    uint8 private constant KIND_COLOR = 1;
    uint8 private constant KIND_PIXEL_COUNT = 2;
    uint8 private constant KIND_COLOR_COUNT = 3;

    /// @notice `PunksData` contract this renderer reads from.
    IPunksData public immutable PUNKS_DATA;

    error ZeroAddress();

    /// @notice Sets the `PunksData` dependency.
    constructor(address punksData) {
        if (punksData == address(0)) revert ZeroAddress();
        PUNKS_DATA = IPunksData(punksData);
    }

    /// @notice Returns the address of the underlying `PunksData` contract.
    function dataContract() external view returns (address) {
        return address(PUNKS_DATA);
    }

    /// @notice Returns the rendered grid's dimensions in pixels.
    function gridSize() external pure returns (uint16 width, uint16 height) {
        return (GRID_SIZE, GRID_SIZE);
    }

    /// @notice Maps a punkId to its (x, y) pixel coordinate in the grid.
    function gridCoordOf(uint16 punkId) external pure returns (uint8 x, uint8 y) {
        if (punkId >= PUNK_COUNT) revert IPunksDataErrors.InvalidPunkId();
        return (uint8(punkId % GRID_SIZE), uint8(punkId / GRID_SIZE));
    }

    /// @notice Returns the 10240-bit punk-mask of Punks matching the filter,
    ///         as 40 little-endian 256-bit words. Bit `b` in `mask[w]` is set
    ///         iff Punk `w * 256 + b` matches.
    function gridMask(Punks.Filter memory filter)
        external
        view
        returns (uint256[BITMAP_WORD_COUNT] memory mask)
    {
        Punks.validate(filter);
        return _computeMask(filter);
    }

    /// @notice Returns the packed 100x100 bit grid (1300 bytes, MSB-first per
    ///         PNG bit-depth-1 convention). A bit is `1` iff the corresponding
    ///         Punk matches the filter. Trailing four bits of each row are
    ///         always zero.
    function gridBitmap(Punks.Filter memory filter)
        public
        view
        returns (bytes memory bits)
    {
        Punks.validate(filter);
        return _maskToRaster(_computeMask(filter));
    }

    /// @notice Renders the filter as a 100x100 one-bit PNG (~1.5 kB).
    ///         Matching Punks are opaque black pixels; non-matches are fully
    ///         transparent.
    function gridPng(Punks.Filter memory filter)
        external
        view
        returns (bytes memory png)
    {
        return _buildPng(gridBitmap(filter));
    }

    // ------------------ Internal: filter → punk-mask ------------------

    function _computeMask(Punks.Filter memory filter)
        private
        view
        returns (uint256[BITMAP_WORD_COUNT] memory mask)
    {
        // Seed every valid punkId bit. Word 39 only owns the low 16 bits
        // (10000 - 39 * 256), so cap it to keep the projection step from
        // reading past the dataset.
        for (uint256 w; w < LAST_WORD_INDEX;) {
            mask[w] = type(uint256).max;
            unchecked {
                ++w;
            }
        }
        mask[LAST_WORD_INDEX] = (uint256(1) << LAST_WORD_BITS) - 1;

        for (uint8 w; w < BITMAP_WORD_COUNT;) {
            uint256 word = mask[w];
            word = _intersectAll(word, filter.requiredTraitMask, KIND_TRAIT, w);
            word = _excludeAll(word, filter.forbiddenTraitMask, KIND_TRAIT, w);
            word = _intersectAnyOf(word, filter.anyOfTraitMask, KIND_TRAIT, w);
            word = _intersectAll(word, filter.requiredColorMask, KIND_COLOR, w);
            word = _excludeAll(word, filter.forbiddenColorMask, KIND_COLOR, w);
            word = _intersectAnyOf(word, filter.anyOfColorMask, KIND_COLOR, w);
            word = _intersectRange(
                word,
                filter.minPixelCount,
                filter.maxPixelCount,
                Punks.PIXEL_COUNT_MIN,
                KIND_PIXEL_COUNT,
                w
            );
            word = _intersectRange(
                word,
                filter.minColorCount,
                filter.maxColorCount,
                Punks.COLOR_COUNT_MIN,
                KIND_COLOR_COUNT,
                w
            );
            mask[w] = word;
            unchecked {
                ++w;
            }
        }
    }

    function _intersectAll(uint256 word, uint256 terms, uint8 kind, uint8 wordIndex)
        private
        view
        returns (uint256)
    {
        while (terms != 0) {
            uint256 idx = _lowestSetBit(terms);
            word &= _bitmapWord(kind, uint16(idx), wordIndex);
            terms &= terms - 1;
        }
        return word;
    }

    function _excludeAll(uint256 word, uint256 terms, uint8 kind, uint8 wordIndex)
        private
        view
        returns (uint256)
    {
        while (terms != 0) {
            uint256 idx = _lowestSetBit(terms);
            word &= ~_bitmapWord(kind, uint16(idx), wordIndex);
            terms &= terms - 1;
        }
        return word;
    }

    function _intersectAnyOf(uint256 word, uint256 terms, uint8 kind, uint8 wordIndex)
        private
        view
        returns (uint256)
    {
        if (terms == 0) return word;
        uint256 acc;
        while (terms != 0) {
            uint256 idx = _lowestSetBit(terms);
            acc |= _bitmapWord(kind, uint16(idx), wordIndex);
            terms &= terms - 1;
        }
        return word & acc;
    }

    /// @dev `Punks.validate*` guarantees `max == 0 ⇒ min == 0` and otherwise
    ///      `min ∈ [rangeMin, max]`. We treat `max == 0` as "filter disabled".
    function _intersectRange(
        uint256 word,
        uint256 min,
        uint256 max,
        uint256 rangeMin,
        uint8 kind,
        uint8 wordIndex
    ) private view returns (uint256) {
        if (max == 0) return word;
        uint256 acc;
        for (uint256 v = min; v <= max;) {
            uint256 row = v - rangeMin;
            acc |= _bitmapWord(kind, uint16(row), wordIndex);
            unchecked {
                ++v;
            }
        }
        return word & acc;
    }

    function _bitmapWord(uint8 kind, uint16 id, uint8 wordIndex)
        private
        view
        returns (uint256)
    {
        if (kind == KIND_TRAIT) return PUNKS_DATA.traitBitmapWord(id, wordIndex);
        if (kind == KIND_COLOR) {
            return PUNKS_DATA.colorBitmapWord(uint8(id), wordIndex);
        }
        if (kind == KIND_PIXEL_COUNT) {
            return PUNKS_DATA.pixelCountBitmapWord(
                uint16(id) + uint16(Punks.PIXEL_COUNT_MIN), wordIndex
            );
        }
        return PUNKS_DATA.colorCountBitmapWord(
            uint8(id) + uint8(Punks.COLOR_COUNT_MIN), wordIndex
        );
    }

    function _lowestSetBit(uint256 m) private pure returns (uint256 index) {
        // De Bruijn-like trick: isolate the lowest bit and count its position.
        uint256 isolated = m & (~m + 1);
        // Iterative log2 (max 8 iterations). For our largest mask widths (256
        // traits, 222 colors) the inputs stay well under the full uint256.
        if ((isolated & 0xffffffffffffffffffffffffffffffff00000000000000000000000000000000) != 0) {
            index += 128;
            isolated >>= 128;
        }
        if ((isolated & 0xffffffffffffffff0000000000000000) != 0) {
            index += 64;
            isolated >>= 64;
        }
        if ((isolated & 0xffffffff00000000) != 0) {
            index += 32;
            isolated >>= 32;
        }
        if ((isolated & 0xffff0000) != 0) {
            index += 16;
            isolated >>= 16;
        }
        if ((isolated & 0xff00) != 0) {
            index += 8;
            isolated >>= 8;
        }
        if ((isolated & 0xf0) != 0) {
            index += 4;
            isolated >>= 4;
        }
        if ((isolated & 0xc) != 0) {
            index += 2;
            isolated >>= 2;
        }
        if ((isolated & 0x2) != 0) {
            index += 1;
        }
    }

    // ------------------ Internal: punk-mask → grid raster ------------------

    function _maskToRaster(uint256[BITMAP_WORD_COUNT] memory mask)
        private
        pure
        returns (bytes memory bits)
    {
        bits = new bytes(BITMAP_BYTES);
        for (uint256 w; w < BITMAP_WORD_COUNT;) {
            uint256 word = mask[w];
            if (word != 0) {
                uint256 punkBase = w << 8;
                while (word != 0) {
                    uint256 bit = _lowestSetBit(word);
                    uint256 punkId = punkBase + bit;
                    if (punkId < PUNK_COUNT) {
                        uint256 x = punkId % GRID_SIZE;
                        uint256 y = punkId / GRID_SIZE;
                        uint256 byteIdx = y * BITMAP_ROW_BYTES + (x >> 3);
                        bits[byteIdx] = bytes1(
                            uint8(bits[byteIdx]) | uint8(1 << (7 - (x & 7)))
                        );
                    }
                    word &= word - 1;
                }
            }
            unchecked {
                ++w;
            }
        }
    }

    // ------------------ Internal: PNG framing ------------------

    function _buildPng(bytes memory bits) private pure returns (bytes memory png) {
        bytes memory idat = _buildIdat(bits);

        uint256 maxSize = 8 + 25 + 18 + 14 + (12 + IDAT_PAYLOAD_LEN) + 12;
        png = new bytes(maxSize);

        uint256[256] memory crcTable = Crc32.buildTable();
        uint256 cursor = PngEncoder.writeSignature(png, 0);
        cursor =
            PngEncoder.writeChunk(png, cursor, crcTable, PngEncoder.TYPE_IHDR, _ihdr());
        // Two palette entries are required even though both render black; the
        // pixel value is what selects opacity via tRNS below.
        cursor = PngEncoder.writeChunk(
            png, cursor, crcTable, PngEncoder.TYPE_PLTE, hex"000000000000"
        );
        // tRNS: index 0 fully transparent, index 1 fully opaque. A 1-bit
        // entry of 0 maps to index 0 (transparent); a 1-bit entry of 1 maps
        // to index 1 (opaque black).
        cursor = PngEncoder.writeChunk(
            png, cursor, crcTable, PngEncoder.TYPE_TRNS, hex"00ff"
        );
        cursor = PngEncoder.writeChunk(png, cursor, crcTable, PngEncoder.TYPE_IDAT, idat);
        cursor = PngEncoder.writeChunk(png, cursor, crcTable, PngEncoder.TYPE_IEND, "");

        assembly ("memory-safe") {
            mstore(png, cursor)
        }
    }

    function _ihdr() private pure returns (bytes memory ihdr) {
        ihdr = new bytes(13);
        // width = 100 (0x00000064)
        ihdr[3] = 0x64;
        // height = 100
        ihdr[7] = 0x64;
        ihdr[8] = 0x01; // bit depth = 1
        ihdr[9] = 0x03; // color type = 3 (indexed)
        // ihdr[10..12] left at 0: compression=0, filter=0, interlace=0.
    }

    function _buildIdat(bytes memory bits) private pure returns (bytes memory payload) {
        payload = new bytes(IDAT_PAYLOAD_LEN);

        // zlib header: CMF=0x78 (deflate, 32 KiB window), FLG=0x01 (fastest,
        // no dict). (0x78 * 256 + 0x01) % 31 == 0 satisfies the FCHECK rule.
        payload[0] = 0x78;
        payload[1] = 0x01;

        // Single stored block: BFINAL=1 (LSB), BTYPE=00.
        payload[2] = 0x01;
        payload[3] = bytes1(uint8(RAW_DEFLATE_BYTES));
        payload[4] = bytes1(uint8(RAW_DEFLATE_BYTES >> 8));
        uint256 nlen = (~RAW_DEFLATE_BYTES) & 0xFFFF;
        payload[5] = bytes1(uint8(nlen));
        payload[6] = bytes1(uint8(nlen >> 8));

        // 100 scanlines: filter byte 0 (left at zero) + 13 packed bytes.
        for (uint256 row; row < GRID_SIZE;) {
            assembly ("memory-safe") {
                let src := add(add(bits, 0x20), mul(row, BITMAP_ROW_BYTES))
                let dst :=
                    add(add(payload, 0x20), add(7, add(mul(row, SCANLINE_STRIDE), 1)))
                mcopy(dst, src, BITMAP_ROW_BYTES)
            }
            unchecked {
                ++row;
            }
        }

        uint32 adler = Adler32.adler32Slice(payload, 7, RAW_DEFLATE_BYTES);
        uint256 off = 7 + RAW_DEFLATE_BYTES;
        payload[off] = bytes1(uint8(adler >> 24));
        payload[off + 1] = bytes1(uint8(adler >> 16));
        payload[off + 2] = bytes1(uint8(adler >> 8));
        payload[off + 3] = bytes1(uint8(adler));
    }
}
