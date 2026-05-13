// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./interfaces/IPunksData.sol";
import "./interfaces/IPunksPng.sol";
import "./lib/Crc32.sol";
import "./lib/PngEncoder.sol";
import "./PunksPngDeflate.sol";

/// @title  PunksPng
///
/// @notice Dedicated PNG and canonical 10k mosaic encoder for `PunksData`.
///         Every pixel byte is derived from `PunksData.indexedPixelsOf` and
///         `PunksData.paletteRgbaBytes`; this contract does not store PNG
///         payload bytes.
contract PunksPng is IPunksPng {
    /// @notice `PunksData` contract this encoder reads from.
    IPunksData public immutable PUNKS_DATA;
    PunksPngDeflate private immutable PUNKS_DEFLATE;

    uint16 private constant PUNK_COUNT = 10_000;
    uint16 private constant PUNK_SIZE = 24;
    uint16 private constant PUNK_PIXELS = 576;
    uint16 private constant GRID_SIZE = 100;
    uint16 private constant MOSAIC_SIZE = 2_400;

    uint256 private constant INDEXED_ROW_BYTES = 57_600; // 100 * 24 * 24
    uint256 private constant RGBA_SCANLINE_BYTES = 9_600;
    uint256 private constant PNG_SCANLINE_BYTES = 9_601;
    uint256 private constant RGBA_ROW_BYTES = 230_400; // INDEXED_ROW_BYTES * 4
    uint256 private constant SCANLINE_ROW_BYTES = 230_424; // 24 * (1 + 2400 * 4)
    uint256 private constant MOSAIC_SCANLINE_BYTES = 9_601; // 1 + 2400 * 4
    uint256 private constant INFLATED_SCANLINE_BYTES = 23_042_400; // 2400 * 9601
    uint16 private constant COMPOSITE_PNG_CHUNK_COUNT = 28;
    uint32 private constant IDAT_CHUNK_PAYLOAD_BYTES = 32_768;
    uint32 private constant REFERENCE_IDAT_BYTES = 847_817;
    uint32 private constant REFERENCE_IDAT_ADLER_OFFSET = 847_813;
    uint8 private constant DEFLATE_BLOCK_COUNT = 23;
    uint16 private constant FULL_DEFLATE_BLOCK_TOKENS = 16_383;
    uint16 private constant FINAL_DEFLATE_BLOCK_TOKENS = 3_537;

    bytes32 private constant MOSAIC_PIXELS_HASH =
        0xdb0e780ac7553b5dd6a3bb02ed2bf8106c16659e15a36797294e01e8817286bf;
    bytes32 private constant REFERENCE_PNG_SHA256 =
        0xac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b;
    bytes32 private constant REFERENCE_IDAT_SHA256 =
        0x7d080b4bca3e4c8e19ed53254eb8dc1dd1c887c8b6b3560d3374436c19f9614f;
    bytes32 private constant REFERENCE_INFLATED_SCANLINES_SHA256 =
        0x62a66b4618a72410d6d99b5fceee6013fabcb3574728ed5ce437b2a161da8673;

    /// @notice Sets the `PunksData` dependency.
    constructor(address punksData) {
        if (punksData == address(0)) revert IPunksDataErrors.ZeroAddress();
        PUNKS_DATA = IPunksData(punksData);
        PUNKS_DEFLATE = new PunksPngDeflate(punksData);
    }

    /// @inheritdoc IPunksPng
    function dataContract() external view returns (address) {
        return address(PUNKS_DATA);
    }

    /// @inheritdoc IPunksPng
    function punkPng(uint16 punkId) external view returns (bytes memory) {
        bytes memory ix = PUNKS_DATA.indexedPixelsOf(punkId);
        bytes memory plte = PUNKS_DATA.paletteRgbBytes();
        bytes memory trns = PUNKS_DATA.paletteAlphaBytes();
        return _buildPngTransparent(ix, plte, trns);
    }

    /// @inheritdoc IPunksPng
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

    /// @inheritdoc IPunksPng
    function mosaicSize() external pure returns (uint16 width, uint16 height) {
        return (MOSAIC_SIZE, MOSAIC_SIZE);
    }

    /// @inheritdoc IPunksPng
    function compositePngChunkCount() external pure returns (uint16) {
        return COMPOSITE_PNG_CHUNK_COUNT;
    }

    /// @inheritdoc IPunksPng
    function compositePngChunk(uint16 chunkIndex)
        external
        view
        returns (bytes memory)
    {
        if (chunkIndex >= COMPOSITE_PNG_CHUNK_COUNT) revert InvalidCompositeChunk();
        if (chunkIndex == 0) return _compositePngHeaderChunk();
        if (chunkIndex == COMPOSITE_PNG_CHUNK_COUNT - 1) return _pngIendChunk();

        uint32 payloadOffset = uint32(chunkIndex - 1) * IDAT_CHUNK_PAYLOAD_BYTES;
        uint32 payloadLength = IDAT_CHUNK_PAYLOAD_BYTES;
        if (payloadOffset + payloadLength > REFERENCE_IDAT_BYTES) {
            payloadLength = REFERENCE_IDAT_BYTES - payloadOffset;
        }

        bytes memory payload = _referenceIdatPayloadSlice(payloadOffset, payloadLength);
        bytes memory out = new bytes(uint256(payloadLength) + 12);
        uint256[256] memory crcTable = Crc32.buildTable();
        PngEncoder.writeChunk(out, 0, crcTable, PngEncoder.TYPE_IDAT, payload);
        return out;
    }

    /// @inheritdoc IPunksPng
    function mosaicGridSize() external pure returns (uint8 columns, uint8 rows) {
        return (uint8(GRID_SIZE), uint8(GRID_SIZE));
    }

    /// @inheritdoc IPunksPng
    function mosaicCoordOf(uint16 punkId) external pure returns (uint16 x, uint16 y) {
        if (punkId >= PUNK_COUNT) revert InvalidPunkId();
        return (
            uint16((uint256(punkId) % GRID_SIZE) * PUNK_SIZE),
            uint16((uint256(punkId) / GRID_SIZE) * PUNK_SIZE)
        );
    }

    /// @inheritdoc IPunksPng
    function mosaicIndexedRow(uint8 rowIndex) external view returns (bytes memory) {
        return _mosaicIndexedRow(rowIndex);
    }

    /// @inheritdoc IPunksPng
    function mosaicRgbaRow(uint8 rowIndex) external view returns (bytes memory) {
        return _mosaicRgbaRow(rowIndex);
    }

    /// @inheritdoc IPunksPng
    function mosaicScanlineRow(uint8 rowIndex) external view returns (bytes memory out) {
        return _mosaicScanlineRow(rowIndex);
    }

    function _mosaicScanlineRow(uint8 rowIndex) private view returns (bytes memory out) {
        bytes memory rgba = _mosaicRgbaRow(rowIndex);
        out = new bytes(SCANLINE_ROW_BYTES);

        assembly ("memory-safe") {
            let src := add(rgba, 0x20)
            let dst := add(out, 0x20)
            for { let row := 0 } lt(row, 24) { row := add(row, 1) } {
                mcopy(
                    add(add(dst, mul(row, MOSAIC_SCANLINE_BYTES)), 1),
                    add(src, mul(row, 9600)),
                    9600
                )
            }
        }
    }

    /// @inheritdoc IPunksPng
    function mosaicIndexedScanline(uint16 y) external view returns (bytes memory) {
        return _mosaicIndexedScanlineChunk(y, 0, uint8(GRID_SIZE));
    }

    /// @inheritdoc IPunksPng
    function mosaicRgbaScanline(uint16 y) external view returns (bytes memory) {
        return _mosaicRgbaScanlineChunk(y, 0, uint8(GRID_SIZE));
    }

    /// @inheritdoc IPunksPng
    function mosaicPngScanline(uint16 y) external view returns (bytes memory out) {
        return _mosaicPngScanline(y);
    }

    /// @inheritdoc IPunksPng
    function mosaicPngScanlineSlice(uint32 offset, uint32 length)
        external
        view
        returns (bytes memory out)
    {
        return _mosaicPngScanlineSlice(offset, length);
    }

    function _mosaicPngScanlineSlice(uint32 offset, uint32 length)
        private
        view
        returns (bytes memory out)
    {
        if (uint256(offset) + length > INFLATED_SCANLINE_BYTES) {
            revert InvalidScanlineRange();
        }

        out = new bytes(length);
        uint256 written;
        while (written < length) {
            uint256 sourceOffset = uint256(offset) + written;
            uint8 rowIndex = uint8(sourceOffset / SCANLINE_ROW_BYTES);
            uint256 inRow = sourceOffset % SCANLINE_ROW_BYTES;
            uint256 take = SCANLINE_ROW_BYTES - inRow;
            if (take > length - written) take = length - written;

            bytes memory row = _mosaicScanlineRow(rowIndex);
            assembly ("memory-safe") {
                mcopy(
                    add(add(out, 0x20), written),
                    add(add(row, 0x20), inRow),
                    take
                )
            }
            written += take;
        }
    }

    /// @inheritdoc IPunksPng
    function referenceDeflateBlockCount() external pure returns (uint8) {
        return DEFLATE_BLOCK_COUNT;
    }

    /// @inheritdoc IPunksPng
    function referenceDeflateBlock(uint8 blockIndex)
        external
        pure
        returns (uint32 startOffset, uint32 endOffset, uint16 tokenCount)
    {
        if (blockIndex >= DEFLATE_BLOCK_COUNT) revert InvalidDeflateBlock();
        endOffset = _referenceDeflateBlockEnd(blockIndex);
        startOffset = blockIndex == 0 ? 0 : _referenceDeflateBlockEnd(blockIndex - 1);
        tokenCount = blockIndex + 1 == DEFLATE_BLOCK_COUNT
            ? FINAL_DEFLATE_BLOCK_TOKENS
            : FULL_DEFLATE_BLOCK_TOKENS;
    }

    /// @inheritdoc IPunksPng
    function referenceDeflateBlockBits(uint8 blockIndex)
        external
        pure
        returns (uint32 startBit, uint32 endBit)
    {
        if (blockIndex >= DEFLATE_BLOCK_COUNT) revert InvalidDeflateBlock();
        startBit = blockIndex == 0 ? 0 : _referenceDeflateBlockEndBit(blockIndex - 1);
        endBit = _referenceDeflateBlockEndBit(blockIndex);
    }

    /// @inheritdoc IPunksPng
    function referenceDeflateBlockPayload(uint8 blockIndex)
        external
        view
        returns (bytes memory)
    {
        return PUNKS_DEFLATE.referenceDeflateBlockPayload(blockIndex);
    }

    function referenceDeflateTokenRangeLength(uint8 blockIndex, uint16 maxTokens)
        external
        view
        returns (uint256)
    {
        return PUNKS_DEFLATE.referenceDeflateTokenRangeLength(blockIndex, maxTokens);
    }

    function referenceDeflateTokenRangePayload(uint8 blockIndex, uint16 maxTokens)
        external
        view
        returns (bytes memory)
    {
        return PUNKS_DEFLATE.referenceDeflateTokenRangePayload(blockIndex, maxTokens);
    }

    function _mosaicPngScanline(uint16 y) private view returns (bytes memory out) {
        bytes memory rgba = _mosaicRgbaScanlineChunk(y, 0, uint8(GRID_SIZE));
        out = new bytes(PNG_SCANLINE_BYTES);
        assembly ("memory-safe") {
            mcopy(add(out, 0x21), add(rgba, 0x20), RGBA_SCANLINE_BYTES)
        }
    }

    function _compositePngHeaderChunk() private pure returns (bytes memory out) {
        out = new bytes(33);
        uint256[256] memory crcTable = Crc32.buildTable();
        uint256 cursor = PngEncoder.writeSignature(out, 0);
        PngEncoder.writeChunk(
            out,
            cursor,
            crcTable,
            PngEncoder.TYPE_IHDR,
            _compositeIhdrPayload()
        );
    }

    function _pngIendChunk() private pure returns (bytes memory out) {
        out = new bytes(12);
        out[4] = 0x49; // I
        out[5] = 0x45; // E
        out[6] = 0x4e; // N
        out[7] = 0x44; // D
        out[8] = 0xae;
        out[9] = 0x42;
        out[10] = 0x60;
        out[11] = 0x82;
    }

    function _compositeIhdrPayload() private pure returns (bytes memory ihdr) {
        ihdr = new bytes(13);
        ihdr[2] = 0x09;
        ihdr[3] = 0x60;
        ihdr[6] = 0x09;
        ihdr[7] = 0x60;
        ihdr[8] = 0x08; // bit depth = 8
        ihdr[9] = 0x06; // color type = truecolor with alpha
    }

    function _referenceIdatPayloadSlice(uint32 offset, uint32 length)
        private
        view
        returns (bytes memory out)
    {
        if (uint256(offset) + length > REFERENCE_IDAT_BYTES) {
            revert InvalidCompositeChunk();
        }

        out = new bytes(length);
        uint32 written;
        while (written < length) {
            uint32 cursor = offset + written;

            if (cursor < 2) {
                out[written] = cursor == 0 ? bytes1(0x78) : bytes1(0xda);
                ++written;
            } else if (cursor >= REFERENCE_IDAT_ADLER_OFFSET) {
                out[written] = _referenceAdlerByte(cursor - REFERENCE_IDAT_ADLER_OFFSET);
                ++written;
            } else {
                uint32 take = REFERENCE_IDAT_ADLER_OFFSET - cursor;
                if (take > length - written) take = length - written;
                _copyReferenceDeflateBits(
                    out,
                    uint256(written) * 8,
                    uint256(cursor - 2) * 8,
                    uint256(take) * 8
                );
                written += take;
            }
        }
    }

    function _copyReferenceDeflateBits(
        bytes memory out,
        uint256 outBitOffset,
        uint256 deflateBitOffset,
        uint256 bitCount
    ) private view {
        while (bitCount != 0) {
            uint8 blockIndex = _referenceDeflateBlockIndex(deflateBitOffset);
            uint256 blockStart =
                blockIndex == 0 ? 0 : _referenceDeflateBlockEndBit(blockIndex - 1);
            uint256 blockEnd = _referenceDeflateBlockEndBit(blockIndex);
            uint256 take = blockEnd - deflateBitOffset;
            if (take > bitCount) take = bitCount;

            bytes memory blockPayload = PUNKS_DEFLATE.referenceDeflateBlockPayload(blockIndex);
            _copyBits(out, outBitOffset, blockPayload, deflateBitOffset - blockStart, take);

            outBitOffset += take;
            deflateBitOffset += take;
            bitCount -= take;
        }
    }

    function _copyBits(
        bytes memory dst,
        uint256 dstBitOffset,
        bytes memory src,
        uint256 srcBitOffset,
        uint256 bitCount
    ) private pure {
        for (uint256 i; i < bitCount; ++i) {
            if ((uint8(src[(srcBitOffset + i) >> 3]) & (1 << ((srcBitOffset + i) & 7))) != 0) {
                uint256 dstByte = (dstBitOffset + i) >> 3;
                dst[dstByte] =
                    bytes1(uint8(dst[dstByte]) | uint8(1 << ((dstBitOffset + i) & 7)));
            }
        }
    }

    function _referenceDeflateBlockIndex(uint256 bitOffset)
        private
        pure
        returns (uint8)
    {
        for (uint8 blockIndex; blockIndex < DEFLATE_BLOCK_COUNT; ++blockIndex) {
            if (bitOffset < _referenceDeflateBlockEndBit(blockIndex)) return blockIndex;
        }
        revert InvalidDeflateBlock();
    }

    function _referenceAdlerByte(uint32 offset) private pure returns (bytes1) {
        if (offset == 0) return 0x64;
        if (offset == 1) return 0xbe;
        if (offset == 2) return 0xea;
        if (offset == 3) return 0x60;
        revert InvalidCompositeChunk();
    }

    function _referenceDeflateBlockEnd(uint8 blockIndex)
        private
        pure
        returns (uint32)
    {
        uint32[23] memory ends = [
            uint32(1_075_553),
            uint32(2_181_796),
            uint32(3_247_978),
            uint32(4_293_495),
            uint32(5_376_040),
            uint32(6_386_042),
            uint32(7_458_564),
            uint32(8_470_335),
            uint32(9_545_347),
            uint32(10_564_580),
            uint32(11_632_119),
            uint32(12_628_996),
            uint32(13_693_158),
            uint32(14_680_234),
            uint32(15_737_120),
            uint32(16_723_822),
            uint32(17_759_827),
            uint32(18_782_505),
            uint32(19_786_532),
            uint32(20_825_577),
            uint32(21_793_818),
            uint32(22_851_278),
            uint32(23_042_400)
        ];
        return ends[blockIndex];
    }

    function _referenceDeflateBlockEndBit(uint8 blockIndex)
        private
        pure
        returns (uint32)
    {
        uint32[23] memory ends = [
            uint32(304_576),
            uint32(612_155),
            uint32(919_475),
            uint32(1_224_474),
            uint32(1_528_708),
            uint32(1_833_212),
            uint32(2_137_876),
            uint32(2_445_230),
            uint32(2_750_826),
            uint32(3_056_217),
            uint32(3_361_045),
            uint32(3_667_211),
            uint32(3_972_211),
            uint32(4_277_027),
            uint32(4_581_609),
            uint32(4_886_183),
            uint32(5_189_839),
            uint32(5_493_763),
            uint32(5_800_597),
            uint32(6_104_207),
            uint32(6_409_532),
            uint32(6_715_796),
            uint32(6_782_488)
        ];
        return ends[blockIndex];
    }

    /// @inheritdoc IPunksPng
    function mosaicIndexedScanlineChunk(uint16 y, uint8 startColumn, uint8 columnCount)
        external
        view
        returns (bytes memory)
    {
        return _mosaicIndexedScanlineChunk(y, startColumn, columnCount);
    }

    /// @inheritdoc IPunksPng
    function mosaicRgbaScanlineChunk(uint16 y, uint8 startColumn, uint8 columnCount)
        external
        view
        returns (bytes memory)
    {
        return _mosaicRgbaScanlineChunk(y, startColumn, columnCount);
    }

    /// @inheritdoc IPunksPng
    function mosaicPngScanlineChunk(uint16 y, uint8 startColumn, uint8 columnCount)
        external
        view
        returns (bytes memory out)
    {
        bytes memory rgba = _mosaicRgbaScanlineChunk(y, startColumn, columnCount);
        uint256 prefix = startColumn == 0 ? 1 : 0;
        out = new bytes(prefix + rgba.length);
        assembly ("memory-safe") {
            mcopy(add(add(out, 0x20), prefix), add(rgba, 0x20), mload(rgba))
        }
    }

    /// @inheritdoc IPunksPng
    function mosaicPixelsHash() external pure returns (bytes32) {
        return MOSAIC_PIXELS_HASH;
    }

    /// @inheritdoc IPunksPng
    function referencePngSha256() external pure returns (bytes32) {
        return REFERENCE_PNG_SHA256;
    }

    /// @inheritdoc IPunksPng
    function referenceIdatSha256() external pure returns (bytes32) {
        return REFERENCE_IDAT_SHA256;
    }

    /// @inheritdoc IPunksPng
    function referenceInflatedScanlinesSha256() external pure returns (bytes32) {
        return REFERENCE_INFLATED_SCANLINES_SHA256;
    }

    function _mosaicIndexedRow(uint8 rowIndex) private view returns (bytes memory out) {
        if (rowIndex >= GRID_SIZE) revert InvalidRowIndex();

        out = new bytes(INDEXED_ROW_BYTES);
        uint256 firstPunk = uint256(rowIndex) * GRID_SIZE;

        for (uint256 column; column < GRID_SIZE; ++column) {
            bytes memory ix = PUNKS_DATA.indexedPixelsOf(uint16(firstPunk + column));
            for (uint256 localY; localY < PUNK_SIZE; ++localY) {
                assembly ("memory-safe") {
                    let src := add(add(ix, 0x20), mul(localY, PUNK_SIZE))
                    let dst := add(
                        add(out, 0x20),
                        add(mul(localY, MOSAIC_SIZE), mul(column, PUNK_SIZE))
                    )
                    mcopy(dst, src, PUNK_SIZE)
                }
            }
        }
    }

    function _mosaicIndexedScanlineChunk(
        uint16 y,
        uint8 startColumn,
        uint8 columnCount
    ) private view returns (bytes memory out) {
        if (y >= MOSAIC_SIZE) revert InvalidRowIndex();
        if (
            columnCount == 0 || startColumn >= GRID_SIZE
                || uint256(startColumn) + columnCount > GRID_SIZE
        ) revert InvalidColumnRange();

        out = new bytes(uint256(columnCount) * PUNK_SIZE);
        uint256 gridY = uint256(y) / PUNK_SIZE;
        uint256 localY = uint256(y) % PUNK_SIZE;
        uint256 firstPunk = gridY * GRID_SIZE + startColumn;

        for (uint256 column; column < columnCount; ++column) {
            bytes memory ix = PUNKS_DATA.indexedPixelsOf(uint16(firstPunk + column));
            assembly ("memory-safe") {
                let src := add(add(ix, 0x20), mul(localY, PUNK_SIZE))
                let dst := add(add(out, 0x20), mul(column, PUNK_SIZE))
                mcopy(dst, src, PUNK_SIZE)
            }
        }
    }

    function _mosaicRgbaRow(uint8 rowIndex) private view returns (bytes memory rgba) {
        bytes memory ix = _mosaicIndexedRow(rowIndex);
        bytes memory pal = PUNKS_DATA.paletteRgbaBytes();
        rgba = new bytes(RGBA_ROW_BYTES);

        assembly ("memory-safe") {
            let ixPtr := add(ix, 0x20)
            let palPtr := add(pal, 0x20)
            let dst := add(rgba, 0x20)
            for { let i := 0 } lt(i, INDEXED_ROW_BYTES) { i := add(i, 1) } {
                let colorId := byte(0, mload(add(ixPtr, i)))
                mcopy(add(dst, mul(i, 4)), add(palPtr, mul(colorId, 4)), 4)
            }
        }
    }

    function _mosaicRgbaScanlineChunk(
        uint16 y,
        uint8 startColumn,
        uint8 columnCount
    ) private view returns (bytes memory rgba) {
        bytes memory ix = _mosaicIndexedScanlineChunk(y, startColumn, columnCount);
        bytes memory pal = PUNKS_DATA.paletteRgbaBytes();
        rgba = new bytes(ix.length * 4);

        assembly ("memory-safe") {
            let ixPtr := add(ix, 0x20)
            let palPtr := add(pal, 0x20)
            let dst := add(rgba, 0x20)
            for { let i := 0 } lt(i, mload(ix)) { i := add(i, 1) } {
                let colorId := byte(0, mload(add(ixPtr, i)))
                mcopy(add(dst, mul(i, 4)), add(palPtr, mul(colorId, 4)), 4)
            }
        }
    }

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
        bytes memory plte = new bytes(15 * 3);
        bytes memory remapped = new bytes(PUNK_PIXELS);
        bytes memory localOf = new bytes(256);
        uint256 localCount = 1;

        plte[0] = bytes1(uint8(uint32(bg) >> 24));
        plte[1] = bytes1(uint8(uint32(bg) >> 16));
        plte[2] = bytes1(uint8(uint32(bg) >> 8));

        for (uint256 i; i < PUNK_PIXELS; ++i) {
            uint8 c = uint8(ix[i]);
            if (c == 0) continue;
            uint256 li = uint8(localOf[c]);
            if (li == 0) {
                li = localCount;
                localOf[c] = bytes1(uint8(li));
                uint256 src = uint256(c) * 4;
                uint256 dst = li * 3;
                plte[dst] = pal[src];
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
}
