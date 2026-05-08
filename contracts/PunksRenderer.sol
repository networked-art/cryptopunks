// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./interfaces/IPunksRenderer.sol";
import "./interfaces/IPunksData.sol";
import "./interfaces/IPunksMarket.sol";
import "./interfaces/IReverseRegistrar.sol";
import "./lib/Crc32.sol";
import "./lib/Adler32.sol";
import "./lib/PngEncoder.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ ■ □ □ □ □ □ □ □ ■ □ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ ■ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ ■ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■
/// ■ ■ ■ ■ ■ ■ ■ □ □ □ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ □ □ ■
///
/// @title  PunksRenderer
///
/// @notice Renders CryptoPunks from the `PunksData` contract. Callers can get
///         a Punk as raw RGBA bytes, SVG, transparent PNG, or PNG flattened onto
///         an opaque background. The `punkMarketplace*` functions use the
///         original CryptoPunks market to choose a background for the Punk's
///         current status.
///
/// @author 1001
contract PunksRenderer is IPunksRenderer {
    /// @notice `PunksData` contract this renderer reads from.
    IPunksData public immutable PUNKS_DATA;

    /// @notice Original CryptoPunks market contract. If unset, marketplace
    ///         backgrounds are disabled and `backgroundOf` returns the Larva
    ///         default.
    IPunksMarket public immutable PUNKS_MARKET;

    /// @notice "Wrapped CryptoPunks" contract. Punks owned by this address get
    ///         a green background (`#66a670ff`).
    address public immutable WRAPPER;

    /// @notice "C721" wrapper contract. Punks owned by this address get a
    ///         green background (`#75a475ff`).
    address public immutable C721_WRAPPER;

    uint256 private constant PIXELS = 576;
    uint256 private constant RGBA_LEN = 2304;
    uint256 private constant ROW_PIXELS = 24;
    uint256 private constant PUNK_COUNT = 10_000;

    uint16 private constant TRAIT_COUNT = 111;
    uint16 private constant HEAD_VARIANT_TRAIT_OFFSET = 5;
    uint16 private constant ACCESSORY_TRAIT_OFFSET = 24;

    // SVG buffer: header (134) + footer (6) + worst-case rect count.
    // Worst-case rect count per Punk is bounded by alternation: 24 rows × 12
    // alternating runs = 288 rects. With max 77 bytes per semi-transparent
    // rect, the worst-case body is ~22 KB. Allocate 24 KB so under-allocation
    // can't corrupt neighboring memory under viaIR.
    uint256 private constant MAX_SVG_BYTES = 24576;

    // Marketplace backgrounds. All opaque; bytes4 packed as RGBA, MSB-first.
    bytes4 private constant BG_DEFAULT      = hex"638596ff";
    bytes4 private constant BG_FOR_SALE     = hex"8c5851ff";
    bytes4 private constant BG_BID          = hex"8970b1ff";
    bytes4 private constant BG_WRAPPED      = hex"66a670ff";
    bytes4 private constant BG_WRAPPED_C721 = hex"75a475ff";

    /// @notice Sets the contracts this renderer reads from. Use `address(0)`
    ///         for `punksMarket`, `wrapper`, or `c721Wrapper` to skip that
    ///         marketplace check. Use `address(0)` or an empty name to skip ENS
    ///         reverse-name setup.
    constructor(
        address punksData,
        address punksMarket,
        address wrapper,
        address c721Wrapper,
        address reverseRegistrar,
        string memory reverseName
    ) {
        PUNKS_DATA = IPunksData(punksData);
        PUNKS_MARKET = IPunksMarket(punksMarket);
        WRAPPER = wrapper;
        C721_WRAPPER = c721Wrapper;

        if (reverseRegistrar != address(0) && bytes(reverseName).length != 0) {
            IReverseRegistrar(reverseRegistrar).setName(reverseName);
        }
    }

    /// @inheritdoc IPunksRenderer
    function dataContract() external view returns (address) {
        return address(PUNKS_DATA);
    }

    /// @inheritdoc IPunksRenderer
    function punkAttributes(uint16 punkId) public view returns (string memory csv) {
        csv = PUNKS_DATA.traitName(
            HEAD_VARIANT_TRAIT_OFFSET + uint16(uint8(PUNKS_DATA.headVariantOf(punkId)))
        );

        uint256 mask = PUNKS_DATA.traitMaskOf(punkId);
        for (uint16 traitId = ACCESSORY_TRAIT_OFFSET; traitId < TRAIT_COUNT; ++traitId) {
            if ((mask & (uint256(1) << traitId)) == 0) continue;
            csv = string.concat(csv, ", ", PUNKS_DATA.traitName(traitId));
        }
    }

    /// @inheritdoc IPunksRenderer
    function metadataJson(uint16 punkId) public view returns (string memory) {
        return _metadataJson(punkId, punkSvg(punkId));
    }

    /// @inheritdoc IPunksRenderer
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        uint16 punkId = _checkedPunkId(tokenId);
        return string.concat(
            "data:application/json;base64,",
            Base64.encode(bytes(metadataJson(punkId)))
        );
    }

    /// @inheritdoc IPunksRenderer
    function backgroundOf(uint16 punkId) public view returns (bytes4) {
        if (address(PUNKS_MARKET) == address(0)) return BG_DEFAULT;

        (bool isForSale,,,,) = PUNKS_MARKET.punksOfferedForSale(punkId);
        if (isForSale) return BG_FOR_SALE;

        (bool hasBid,,,) = PUNKS_MARKET.punkBids(punkId);
        if (hasBid) return BG_BID;

        address owner = PUNKS_MARKET.punkIndexToAddress(punkId);
        if (owner == C721_WRAPPER) return BG_WRAPPED_C721;
        if (owner == WRAPPER) return BG_WRAPPED;

        return BG_DEFAULT;
    }

    /// @inheritdoc IPunksRenderer
    function punkImage(uint16 punkId) external view returns (bytes memory rgba) {
        bytes memory ix = PUNKS_DATA.indexedPixelsOf(punkId);
        bytes memory pal = PUNKS_DATA.paletteRgbaBytes();
        rgba = new bytes(RGBA_LEN);
        assembly ("memory-safe") {
            let ixPtr := add(ix, 0x20)
            let palPtr := add(pal, 0x20)
            let dst := add(rgba, 0x20)
            for { let i := 0 } lt(i, PIXELS) { i := add(i, 1) } {
                let colorId := byte(0, mload(add(ixPtr, i)))
                mcopy(add(dst, mul(i, 4)), add(palPtr, mul(colorId, 4)), 4)
            }
        }
    }

    /// @inheritdoc IPunksRenderer
    function punkPng(uint16 punkId) external view returns (bytes memory) {
        bytes memory ix = PUNKS_DATA.indexedPixelsOf(punkId);
        bytes memory plte = PUNKS_DATA.paletteRgbBytes();
        bytes memory trns = PUNKS_DATA.paletteAlphaBytes();
        return _buildPngTransparent(ix, plte, trns);
    }

    /// @inheritdoc IPunksRenderer
    function punkPng(uint16 punkId, bytes4 backgroundRgba)
        external
        view
        returns (bytes memory)
    {
        if (uint8(uint32(backgroundRgba)) != 0xff) revert InvalidBackground();
        bytes memory ix = PUNKS_DATA.indexedPixelsOf(punkId);
        bytes memory pal = PUNKS_DATA.paletteRgbaBytes();
        return _buildPngFlattened(ix, pal, backgroundRgba);
    }

    /// @inheritdoc IPunksRenderer
    function punkMarketplacePng(uint16 punkId) external view returns (bytes memory) {
        bytes memory ix = PUNKS_DATA.indexedPixelsOf(punkId);
        bytes memory pal = PUNKS_DATA.paletteRgbaBytes();
        return _buildPngFlattened(ix, pal, backgroundOf(punkId));
    }

    /// @inheritdoc IPunksRenderer
    function punkSvg(uint16 punkId) public view returns (string memory) {
        bytes memory ix = PUNKS_DATA.indexedPixelsOf(punkId);
        bytes memory pal = PUNKS_DATA.paletteRgbaBytes();
        return _buildSvg(ix, pal, BG_DEFAULT);
    }

    /// @inheritdoc IPunksRenderer
    function punkMarketplaceSvg(uint16 punkId) public view returns (string memory) {
        bytes memory ix = PUNKS_DATA.indexedPixelsOf(punkId);
        bytes memory pal = PUNKS_DATA.paletteRgbaBytes();
        return _buildSvg(ix, pal, backgroundOf(punkId));
    }

    // ------------------ Internal: PNG ------------------

    function _buildPngTransparent(
        bytes memory ix,
        bytes memory plte,
        bytes memory trns
    ) private pure returns (bytes memory png) {
        bytes memory idat = PngEncoder.buildIdatPayload(ix);

        uint256 maxSize = 8 + 25 + (12 + plte.length) + (12 + trns.length)
            + (12 + idat.length) + 12;
        png = new bytes(maxSize);

        uint256[256] memory crcTable = Crc32.buildTable();
        uint256 cursor = PngEncoder.writeSignature(png, 0);
        cursor = PngEncoder.writeChunk(
            png, cursor, crcTable, PngEncoder.TYPE_IHDR, PngEncoder.ihdrPayload()
        );
        cursor = PngEncoder.writeChunk(png, cursor, crcTable, PngEncoder.TYPE_PLTE, plte);
        cursor = PngEncoder.writeChunk(png, cursor, crcTable, PngEncoder.TYPE_TRNS, trns);
        cursor = PngEncoder.writeChunk(png, cursor, crcTable, PngEncoder.TYPE_IDAT, idat);
        cursor = PngEncoder.writeChunk(png, cursor, crcTable, PngEncoder.TYPE_IEND, "");

        assembly ("memory-safe") { mstore(png, cursor) }
    }

    function _buildPngFlattened(
        bytes memory ix,
        bytes memory pal,
        bytes4 bg
    ) private pure returns (bytes memory png) {
        // Compact local palette: index 0 = bg, indices 1..N = visible colors
        // in raster first-occurrence order. ColorCountOf is at most 14, so the
        // local palette holds at most 15 entries (45 bytes).
        bytes memory plte = new bytes(15 * 3);
        bytes memory remapped = new bytes(PIXELS);
        bytes memory localOf = new bytes(256);
        uint256 localCount = 1;

        plte[0] = bytes1(uint8(uint32(bg) >> 24));
        plte[1] = bytes1(uint8(uint32(bg) >> 16));
        plte[2] = bytes1(uint8(uint32(bg) >> 8));

        for (uint256 i = 0; i < PIXELS; ++i) {
            uint8 c = uint8(ix[i]);
            if (c == 0) continue; // remapped[i] already 0 → bg
            uint256 li = uint8(localOf[c]);
            if (li == 0) {
                li = localCount;
                localOf[c] = bytes1(uint8(li));
                uint256 src = uint256(c) * 4;
                uint256 dst = li * 3;
                plte[dst]     = pal[src];
                plte[dst + 1] = pal[src + 1];
                plte[dst + 2] = pal[src + 2];
                ++localCount;
            }
            remapped[i] = bytes1(uint8(li));
        }

        uint256 plteLen = localCount * 3;
        assembly ("memory-safe") { mstore(plte, plteLen) }

        bytes memory idat = PngEncoder.buildIdatPayload(remapped);

        uint256 maxSize = 8 + 25 + (12 + plteLen) + (12 + idat.length) + 12;
        png = new bytes(maxSize);

        uint256[256] memory crcTable = Crc32.buildTable();
        uint256 cursor = PngEncoder.writeSignature(png, 0);
        cursor = PngEncoder.writeChunk(
            png, cursor, crcTable, PngEncoder.TYPE_IHDR, PngEncoder.ihdrPayload()
        );
        cursor = PngEncoder.writeChunk(png, cursor, crcTable, PngEncoder.TYPE_PLTE, plte);
        cursor = PngEncoder.writeChunk(png, cursor, crcTable, PngEncoder.TYPE_IDAT, idat);
        cursor = PngEncoder.writeChunk(png, cursor, crcTable, PngEncoder.TYPE_IEND, "");

        assembly ("memory-safe") { mstore(png, cursor) }
    }

    // ------------------ Internal: metadata ------------------

    function _metadataJson(uint16 punkId, string memory imageSvg)
        private
        view
        returns (string memory)
    {
        string memory id = _toString(punkId);
        return string.concat(
            '{"name":"CryptoPunk #',
            id,
            '","description":"CryptoPunk #',
            id,
            ' rendered fully onchain from sealed CryptoPunks pixel and trait data.",',
            '"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(imageSvg)),
            '","attributes":',
            _metadataAttributesJson(punkId),
            "}"
        );
    }

    function _metadataAttributesJson(uint16 punkId) private view returns (string memory json) {
        uint8 punkType = uint8(PUNKS_DATA.punkTypeOf(punkId));
        uint8 headVariant = uint8(PUNKS_DATA.headVariantOf(punkId));
        uint8 attributeCount = PUNKS_DATA.attributeCountOf(punkId);
        uint256 mask = PUNKS_DATA.traitMaskOf(punkId);

        json = string.concat(
            '[{"trait_type":"Type","value":"',
            PUNKS_DATA.traitName(uint16(punkType)),
            '"},{"trait_type":"Head Variant","value":"',
            PUNKS_DATA.traitName(HEAD_VARIANT_TRAIT_OFFSET + uint16(headVariant)),
            '"},{"display_type":"number","trait_type":"Attribute Count","value":',
            _toString(attributeCount),
            "}"
        );

        for (uint16 traitId = ACCESSORY_TRAIT_OFFSET; traitId < TRAIT_COUNT; ++traitId) {
            if ((mask & (uint256(1) << traitId)) == 0) continue;
            json = string.concat(
                json,
                ',{"trait_type":"Accessory","value":"',
                PUNKS_DATA.traitName(traitId),
                '"}'
            );
        }

        json = string.concat(json, "]");
    }

    function _checkedPunkId(uint256 tokenId) private pure returns (uint16) {
        if (tokenId >= PUNK_COUNT) revert InvalidTokenId();
        return uint16(tokenId);
    }

    // ------------------ Internal: SVG ------------------

    function _buildSvg(bytes memory ix, bytes memory pal, bytes4 bg)
        private
        pure
        returns (string memory)
    {
        bytes memory out = new bytes(MAX_SVG_BYTES);
        bytes memory hexLut = bytes("0123456789abcdef");
        uint256 cursor = 0;

        cursor = _writeBytes(
            out,
            cursor,
            bytes(
                "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' shape-rendering='crispEdges'>\n<rect width='24' height='24' fill='#"
            )
        );
        // Background is always opaque (`backgroundOf` and `BG_DEFAULT` both
        // guarantee alpha = 0xff); drop the alpha byte from the hex literal.
        cursor = _writeHex2(out, cursor, hexLut, uint8(uint32(bg) >> 24));
        cursor = _writeHex2(out, cursor, hexLut, uint8(uint32(bg) >> 16));
        cursor = _writeHex2(out, cursor, hexLut, uint8(uint32(bg) >> 8));
        cursor = _writeBytes(out, cursor, bytes("'/>\n"));

        for (uint256 y = 0; y < ROW_PIXELS; ++y) {
            uint256 base = y * ROW_PIXELS;
            uint256 x = 0;
            while (x < ROW_PIXELS) {
                uint8 c = uint8(ix[base + x]);
                if (c == 0) {
                    unchecked { ++x; }
                    continue;
                }
                uint256 startX = x;
                unchecked {
                    while (x < ROW_PIXELS && uint8(ix[base + x]) == c) ++x;
                }
                uint256 runLen = x - startX;

                cursor = _writeBytes(out, cursor, bytes("<rect x='"));
                cursor = _writeDec(out, cursor, startX);
                cursor = _writeBytes(out, cursor, bytes("' y='"));
                cursor = _writeDec(out, cursor, y);
                cursor = _writeBytes(out, cursor, bytes("' width='"));
                cursor = _writeDec(out, cursor, runLen);
                cursor = _writeBytes(out, cursor, bytes("' height='1' fill='#"));

                uint256 palOff = uint256(c) * 4;
                cursor = _writeHex2(out, cursor, hexLut, uint8(pal[palOff]));
                cursor = _writeHex2(out, cursor, hexLut, uint8(pal[palOff + 1]));
                cursor = _writeHex2(out, cursor, hexLut, uint8(pal[palOff + 2]));

                if (uint8(pal[palOff + 3]) == 0xff) {
                    cursor = _writeBytes(out, cursor, bytes("'/>\n"));
                } else {
                    // Per palette invariant: the only non-0xff/0x00 alpha is
                    // 0x80. Transparent (0x00) is broken on by run logic.
                    cursor = _writeBytes(out, cursor, bytes("' fill-opacity='.5'/>\n"));
                }
            }
        }

        cursor = _writeBytes(out, cursor, bytes("</svg>"));

        assembly ("memory-safe") { mstore(out, cursor) }
        return string(out);
    }

    function _writeBytes(bytes memory out, uint256 cursor, bytes memory data)
        private
        pure
        returns (uint256)
    {
        uint256 len = data.length;
        assembly ("memory-safe") {
            mcopy(add(add(out, 0x20), cursor), add(data, 0x20), len)
        }
        return cursor + len;
    }

    function _writeDec(bytes memory out, uint256 cursor, uint256 v)
        private
        pure
        returns (uint256)
    {
        if (v < 10) {
            out[cursor] = bytes1(uint8(0x30 + v));
            return cursor + 1;
        }
        out[cursor] = bytes1(uint8(0x30 + (v / 10)));
        out[cursor + 1] = bytes1(uint8(0x30 + (v % 10)));
        return cursor + 2;
    }

    function _writeHex2(
        bytes memory out,
        uint256 cursor,
        bytes memory hexLut,
        uint8 b
    ) private pure returns (uint256) {
        out[cursor] = hexLut[b >> 4];
        out[cursor + 1] = hexLut[b & 0xf];
        return cursor + 2;
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";

        uint256 digits;
        uint256 tmp = value;
        while (tmp != 0) {
            ++digits;
            tmp /= 10;
        }

        bytes memory out = new bytes(digits);
        while (value != 0) {
            --digits;
            out[digits] = bytes1(uint8(0x30 + (value % 10)));
            value /= 10;
        }
        return string(out);
    }
}

/// - jalil.eth
