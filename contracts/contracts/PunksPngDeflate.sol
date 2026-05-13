// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./interfaces/IPunksData.sol";
import "./interfaces/IPunksPng.sol";
import "./lib/ZlibDynamicBlock.sol";
import "./lib/ZlibSlow.sol";

/// @title  PunksPngDeflate
/// @notice Canonical `punks.png` dynamic-DEFLATE block encoder over `PunksData`.
contract PunksPngDeflate {
    IPunksData public immutable PUNKS_DATA;

    uint16 private constant PUNK_SIZE = 24;
    uint16 private constant GRID_SIZE = 100;
    uint16 private constant MOSAIC_SIZE = 2_400;

    uint256 private constant INDEXED_ROW_BYTES = 57_600;
    uint256 private constant MOSAIC_SCANLINE_BYTES = 9_601;
    uint256 private constant INFLATED_SCANLINE_BYTES = 23_042_400;
    uint8 private constant DEFLATE_BLOCK_COUNT = 23;
    uint16 private constant FULL_DEFLATE_BLOCK_TOKENS = 16_383;
    uint16 private constant FINAL_DEFLATE_BLOCK_TOKENS = 3_537;
    uint32 private constant DEFLATE_BLOCK_WARMUP_BYTES = 65_536;
    uint32 private constant DEFLATE_LOOKAHEAD_BYTES = 262;
    uint32 private constant RAW_PADDING_BYTES = 258;

    error TokenRangeIncomplete();

    constructor(address punksData) {
        if (punksData == address(0)) revert IPunksDataErrors.ZeroAddress();
        PUNKS_DATA = IPunksData(punksData);
    }

    function referenceDeflateBlockPayload(uint8 blockIndex)
        external
        view
        returns (bytes memory)
    {
        (
            bytes memory input,
            uint32 inputLength,
            uint32 baseOffset,
            uint32 startOffset,
            uint16 tokenCount,
            bool finalBlock
        ) = _blockInput(blockIndex, _referenceDeflateBlockEnd(blockIndex));
        return _encode(input, inputLength, baseOffset, startOffset, tokenCount, finalBlock);
    }

    function referenceDeflateTokenRangeLength(uint8 blockIndex, uint16 maxTokens)
        external
        view
        returns (uint256)
    {
        (bytes memory input, uint32 inputLength, uint32 baseOffset, uint32 startOffset,,) =
            _blockInput(blockIndex, _referenceDeflateBlockEnd(blockIndex));
        bytes memory tokens = ZlibSlow.generateTokenRangePackedFromPosition(
            input, inputLength, baseOffset, startOffset, maxTokens
        );
        return tokens.length / 5;
    }

    function referenceDeflateTokenRangePayload(uint8 blockIndex, uint16 maxTokens)
        external
        view
        returns (bytes memory)
    {
        (bytes memory input, uint32 inputLength, uint32 baseOffset, uint32 startOffset,, bool finalBlock) =
            _blockInput(blockIndex, _referenceDeflateBlockEnd(blockIndex));
        return _encode(input, inputLength, baseOffset, startOffset, maxTokens, finalBlock);
    }

    function _blockInput(uint8 blockIndex, uint32 endOffset)
        private
        view
        returns (
            bytes memory input,
            uint32 inputLength,
            uint32 baseOffset,
            uint32 startOffset,
            uint16 tokenCount,
            bool finalBlock
        )
    {
        if (blockIndex >= DEFLATE_BLOCK_COUNT) revert IPunksPng.InvalidDeflateBlock();

        startOffset = blockIndex == 0 ? 0 : _referenceDeflateBlockEnd(blockIndex - 1);
        baseOffset = startOffset > DEFLATE_BLOCK_WARMUP_BYTES
            ? startOffset - DEFLATE_BLOCK_WARMUP_BYTES
            : 0;

        uint32 readEnd = endOffset;
        finalBlock = blockIndex + 1 == DEFLATE_BLOCK_COUNT;
        if (!finalBlock) {
            readEnd += DEFLATE_LOOKAHEAD_BYTES;
            if (readEnd > INFLATED_SCANLINE_BYTES) {
                readEnd = uint32(INFLATED_SCANLINE_BYTES);
            }
        }

        inputLength = readEnd - baseOffset;
        input = _mosaicPngScanlineSlice(baseOffset, inputLength);
        tokenCount = finalBlock ? FINAL_DEFLATE_BLOCK_TOKENS : FULL_DEFLATE_BLOCK_TOKENS;
    }

    function _encode(
        bytes memory input,
        uint32 inputLength,
        uint32 baseOffset,
        uint32 startOffset,
        uint16 tokenCount,
        bool finalBlock
    ) private pure returns (bytes memory) {
        bytes memory tokens = ZlibSlow.generateTokenRangePackedFromPosition(
            input, inputLength, baseOffset, startOffset, tokenCount
        );
        if (tokens.length != uint256(tokenCount) * 5) revert TokenRangeIncomplete();
        return ZlibDynamicBlock.encodeDynamicBlockPacked(tokens, finalBlock);
    }

    function _mosaicPngScanlineSlice(uint32 offset, uint32 length)
        private
        view
        returns (bytes memory out)
    {
        if (uint256(offset) + length > INFLATED_SCANLINE_BYTES) {
            revert IPunksPng.InvalidScanlineRange();
        }

        out = new bytes(uint256(length) + RAW_PADDING_BYTES);
        bytes memory pal = PUNKS_DATA.paletteRgbaBytes();
        uint256 written;

        while (written < length) {
            uint256 sourceOffset = uint256(offset) + written;
            uint8 rowIndex = uint8(sourceOffset / (PUNK_SIZE * MOSAIC_SCANLINE_BYTES));
            uint256 inRow = sourceOffset % (PUNK_SIZE * MOSAIC_SCANLINE_BYTES);
            bytes memory ix = _mosaicIndexedRow(rowIndex);
            while (inRow < PUNK_SIZE * MOSAIC_SCANLINE_BYTES && written < length) {
                uint256 localY = inRow / MOSAIC_SCANLINE_BYTES;
                uint256 inScanline = inRow % MOSAIC_SCANLINE_BYTES;
                uint256 take = MOSAIC_SCANLINE_BYTES - inScanline;
                if (take > length - written) take = length - written;
                _writeScanlineSlice(out, written, ix, pal, localY, inScanline, take);
                written += take;
                inRow += take;
            }
        }

        assembly ("memory-safe") {
            mstore(out, length)
        }
    }

    function _writeScanlineSlice(
        bytes memory out,
        uint256 dstOffset,
        bytes memory ix,
        bytes memory pal,
        uint256 localY,
        uint256 inScanline,
        uint256 length
    ) private pure {
        if (inScanline == 0) {
            // PNG filter byte 0. The freshly allocated output is already zeroed.
            ++dstOffset;
            ++inScanline;
            --length;
            if (length == 0) return;
        }

        uint256 rgbaOffset = inScanline - 1;
        uint256 rowOffset = localY * MOSAIC_SIZE;
        while (length != 0) {
            uint256 x = rgbaOffset / 4;
            uint256 component = rgbaOffset % 4;
            uint256 take = 4 - component;
            if (take > length) take = length;
            assembly ("memory-safe") {
                let colorId := byte(0, mload(add(add(ix, 0x20), add(rowOffset, x))))
                mcopy(
                    add(add(out, 0x20), dstOffset),
                    add(add(add(pal, 0x20), mul(colorId, 4)), component),
                    take
                )
            }
            dstOffset += take;
            rgbaOffset += take;
            length -= take;
        }
    }

    function _mosaicIndexedRow(uint8 rowIndex) private view returns (bytes memory out) {
        if (rowIndex >= GRID_SIZE) revert IPunksPng.InvalidRowIndex();

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
}
