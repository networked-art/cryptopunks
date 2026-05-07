// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./PunksDataLoader.sol";
import "./interfaces/IPunksData.sol";

/// @title PunksData
/// @notice Sealed primitive data surface for CryptoPunks traits and indexed pixels.
contract PunksData is PunksDataLoader, IPunksData {
    constructor(address initialAdmin) PunksDataLoader(initialAdmin) {}

    function datasetHash() public view override(IPunksDataCriteria) returns (bytes32) {
        return _datasetHash;
    }

    // Criteria

    function traitCount() external pure returns (uint16) {
        return TRAIT_COUNT;
    }

    function isValidTraitId(uint16 traitId) external pure returns (bool) {
        return traitId < TRAIT_COUNT;
    }

    function traitName(uint16 traitId) external view returns (string memory) {
        (,, uint256 nameOffset, uint256 nameLength) = _traitMeta(traitId);
        bytes memory name = _readBlob(
            BlobId.TraitMeta,
            TRAIT_META_HEADER_SIZE + nameOffset,
            nameLength
        );
        return string(name);
    }

    function traitKind(uint16 traitId) external view returns (TraitKind) {
        (uint8 kind,,,) = _traitMeta(traitId);
        if (kind > uint8(TraitKind.Accessory)) revert InvalidTraitId();
        return TraitKind(kind);
    }

    function traitSupply(uint16 traitId) external view returns (uint16) {
        (, uint16 supply,,) = _traitMeta(traitId);
        return supply;
    }

    function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool) {
        _requireTraitId(traitId);
        return (_traitMaskOf(punkId) & (uint256(1) << traitId)) != 0;
    }

    function traitMaskOf(uint16 punkId) external view returns (uint256) {
        return _traitMaskOf(punkId);
    }

    function hasTraits(
        uint16 punkId,
        uint256 requiredMask,
        uint256 forbiddenMask,
        uint256 anyOfMask
    ) external view returns (bool) {
        _requireCriteriaMasks(requiredMask, forbiddenMask, anyOfMask);
        uint256 mask = _traitMaskOf(punkId);
        return (mask & requiredMask) == requiredMask && (mask & forbiddenMask) == 0
            && (anyOfMask == 0 || (mask & anyOfMask) != 0);
    }

    function traitBitmapWord(uint16 traitId, uint8 wordIndex)
        external
        view
        returns (uint256)
    {
        _requireTraitId(traitId);
        return _bitmapWord(BlobId.TraitBitmaps, traitId, wordIndex);
    }

    function headVariantOf(uint16 punkId) external view returns (HeadVariant) {
        return HeadVariant(_scalarField(punkId, HEAD_VARIANT_SHIFT, UINT8_MASK));
    }

    function punkTypeOf(uint16 punkId) external view returns (PunkType) {
        return PunkType(_scalarField(punkId, PUNK_TYPE_SHIFT, UINT8_MASK));
    }

    function attributeCountOf(uint16 punkId) external view returns (uint8) {
        return uint8(_scalarField(punkId, ATTRIBUTE_COUNT_SHIFT, UINT8_MASK));
    }

    // Visual

    function colorCount() public pure returns (uint16) {
        return MAX_COLOR_COUNT;
    }

    function colorOf(uint8 colorId) external view returns (bytes4 rgba) {
        _requireColorId(colorId);
        bytes memory data = _readBlob(
            BlobId.Palette,
            uint256(colorId) * PALETTE_RGBA_BYTES_PER_COLOR,
            PALETTE_RGBA_BYTES_PER_COLOR
        );
        assembly ("memory-safe") {
            rgba := mload(add(data, 0x20))
        }
    }

    function colorSupply(uint8 colorId) external view returns (uint32 pixels) {
        _requireColorId(colorId);
        return _colorSupplies[colorId];
    }

    function colorMaskOf(uint16 punkId) external view returns (uint256) {
        _requirePunkId(punkId);
        return _colorMasks[punkId];
    }

    function hasColor(uint16 punkId, uint8 colorId) external view returns (bool) {
        _requirePunkId(punkId);
        _requireColorId(colorId);
        if (colorId == 0) return false;
        return (_colorMasks[punkId] & (uint256(1) << colorId)) != 0;
    }

    function pixelCountOf(uint16 punkId) external view returns (uint16) {
        return uint16(_scalarField(punkId, PIXEL_COUNT_SHIFT, UINT16_MASK));
    }

    function colorCountOf(uint16 punkId) external view returns (uint8) {
        return uint8(_scalarField(punkId, COLOR_COUNT_SHIFT, UINT8_MASK));
    }

    function colorBitmapWord(uint8 colorId, uint8 wordIndex) external view returns (uint256) {
        _requireColorId(colorId);
        return _bitmapWord(BlobId.ColorBitmaps, colorId, wordIndex);
    }

    function pixelCountBitmapWord(uint16 pixelCount, uint8 wordIndex)
        external
        view
        returns (uint256)
    {
        if (pixelCount < PIXEL_COUNT_MIN || pixelCount > PIXEL_COUNT_MAX) {
            revert InvalidPixelCount();
        }
        return _bitmapWord(
            BlobId.PixelCountBitmaps,
            uint256(pixelCount) - PIXEL_COUNT_MIN,
            wordIndex
        );
    }

    function colorCountBitmapWord(uint8 count, uint8 wordIndex)
        external
        view
        returns (uint256)
    {
        if (count < COLOR_COUNT_MIN || count > COLOR_COUNT_MAX) revert InvalidColorCount();
        return _bitmapWord(
            BlobId.ColorCountBitmaps,
            uint256(count) - COLOR_COUNT_MIN,
            wordIndex
        );
    }

    // Indexed pixels

    function indexedPixelsOf(uint16 punkId) external view returns (bytes memory) {
        return _indexedPixelsOf(punkId);
    }

    function colorAt(uint16 punkId, uint8 x, uint8 y) external view returns (uint8 colorId) {
        if (x >= PUNK_WIDTH || y >= PUNK_HEIGHT) revert InvalidCoordinate();
        bytes memory pixels = _indexedPixelsOf(punkId);
        return uint8(pixels[uint256(y) * PUNK_WIDTH + x]);
    }

    function paletteRgbBytes() external view returns (bytes memory rgb) {
        bytes memory rgba = _readBlob(BlobId.Palette, 0, _blobLength(BlobId.Palette));
        uint256 count = rgba.length / PALETTE_RGBA_BYTES_PER_COLOR;
        rgb = new bytes(count * PALETTE_RGB_BYTES_PER_COLOR);
        uint256 rgbaBytesPerColor = PALETTE_RGBA_BYTES_PER_COLOR;
        uint256 rgbBytesPerColor = PALETTE_RGB_BYTES_PER_COLOR;
        assembly ("memory-safe") {
            let src := add(rgba, 0x20)
            let dst := add(rgb, 0x20)
            for { let i := 0 } lt(i, count) { i := add(i, 1) } {
                let word := mload(add(src, mul(i, rgbaBytesPerColor)))
                let dstOff := add(dst, mul(i, rgbBytesPerColor))
                mstore8(dstOff, byte(0, word))
                mstore8(add(dstOff, 1), byte(1, word))
                mstore8(add(dstOff, 2), byte(2, word))
            }
        }
    }

    function paletteAlphaBytes() external view returns (bytes memory alpha) {
        bytes memory rgba = _readBlob(BlobId.Palette, 0, _blobLength(BlobId.Palette));
        uint256 count = rgba.length / PALETTE_RGBA_BYTES_PER_COLOR;
        alpha = new bytes(count);
        uint256 rgbaBytesPerColor = PALETTE_RGBA_BYTES_PER_COLOR;
        assembly ("memory-safe") {
            let src := add(rgba, 0x20)
            let dst := add(alpha, 0x20)
            for { let i := 0 } lt(i, count) { i := add(i, 1) } {
                let word := mload(add(src, mul(i, rgbaBytesPerColor)))
                mstore8(add(dst, i), byte(3, word))
            }
        }
    }

    function paletteRgbaBytes() external view returns (bytes memory) {
        return _readBlob(BlobId.Palette, 0, _blobLength(BlobId.Palette));
    }

    // Decoding helpers

    function _traitMaskOf(uint16 punkId) private view returns (uint256) {
        _requirePunkId(punkId);
        uint256 packed = _traitMaskPairs[punkId >> 1];
        if ((punkId & 1) == 0) return uint128(packed);
        return packed >> 128;
    }

    /// @dev Compressed entry layout:
    ///      visibleColorCount | visible bitmap | local palette | packed local color indexes.
    function _indexedPixelsOf(uint16 punkId) private view returns (bytes memory pixels) {
        _requirePunkId(punkId);
        uint256 start = _readUint24(BlobId.PixelOffsets, uint256(punkId) * PIXEL_OFFSET_BYTES);
        uint256 end =
            _readUint24(BlobId.PixelOffsets, (uint256(punkId) + 1) * PIXEL_OFFSET_BYTES);
        if (end <= start) revert MalformedPixelBlob();

        bytes memory entry = _readBlob(BlobId.CompressedPixels, start, end - start);
        if (entry.length < COMPRESSED_PIXEL_HEADER_SIZE) revert MalformedPixelBlob();

        uint256 visibleColorCount = uint8(entry[0]);
        uint256 paletteCount = MAX_COLOR_COUNT;
        if (
            visibleColorCount == 0
                || entry.length < COMPRESSED_PIXEL_HEADER_SIZE + visibleColorCount
                || visibleColorCount > paletteCount - 1
        ) revert MalformedPixelBlob();

        bytes memory localPalette = new bytes(visibleColorCount);
        for (uint256 i; i < visibleColorCount;) {
            uint8 paletteId = uint8(entry[COMPRESSED_PIXEL_HEADER_SIZE + i]);
            if (paletteId == 0 || paletteId >= paletteCount) revert MalformedPixelBlob();
            localPalette[i] = bytes1(paletteId);
            unchecked {
                ++i;
            }
        }

        uint256 bitsPerIndex = _bitsForPalette(visibleColorCount);
        uint256 indexesOffset = COMPRESSED_PIXEL_HEADER_SIZE + visibleColorCount;
        uint256 visibleIndex;
        uint256 bitOffset;
        pixels = new bytes(PIXELS_PER_PUNK);

        for (uint256 byteIdx; byteIdx < VISIBLE_BITMAP_BYTES;) {
            uint8 bitmapByte = uint8(entry[1 + byteIdx]);
            if (bitmapByte != 0) {
                for (uint256 b; b < BITS_PER_BYTE;) {
                    if ((bitmapByte & (1 << (BITS_PER_BYTE - 1 - b))) != 0) {
                        uint256 localIndex;
                        if (bitsPerIndex != 0) {
                            localIndex = _readBits(entry, indexesOffset, bitOffset, bitsPerIndex);
                            bitOffset += bitsPerIndex;
                        }
                        if (localIndex >= visibleColorCount) revert MalformedPixelBlob();
                        pixels[byteIdx * BITS_PER_BYTE + b] = localPalette[localIndex];
                        unchecked {
                            ++visibleIndex;
                        }
                    }
                    unchecked {
                        ++b;
                    }
                }
            }
            unchecked {
                ++byteIdx;
            }
        }

        uint256 expectedIndexBytes = (bitOffset + BITS_PER_BYTE - 1) / BITS_PER_BYTE;
        if (entry.length != indexesOffset + expectedIndexBytes || visibleIndex == 0) {
            revert MalformedPixelBlob();
        }
    }

    function _readBits(
        bytes memory data,
        uint256 byteOffset,
        uint256 bitOffset,
        uint256 bitLength
    ) private pure returns (uint256 value) {
        if (bitLength == 0) return 0;
        uint256 endByte =
            byteOffset + ((bitOffset + bitLength + BITS_PER_BYTE - 1) / BITS_PER_BYTE);
        if (endByte > data.length) revert MalformedPixelBlob();

        for (uint256 i; i < bitLength;) {
            uint256 absoluteBit = bitOffset + i;
            uint256 byteIndex = byteOffset + (absoluteBit / BITS_PER_BYTE);
            uint8 current = uint8(data[byteIndex]);
            uint256 bit = (current >> (BITS_PER_BYTE - 1 - (absoluteBit % BITS_PER_BYTE))) & 1;
            value = (value << 1) | bit;
            unchecked {
                ++i;
            }
        }
    }

    function _bitsForPalette(uint256 visibleColorCount) private pure returns (uint256 bits) {
        uint256 maxIndex = visibleColorCount - 1;
        while (maxIndex != 0) {
            unchecked {
                ++bits;
                maxIndex >>= 1;
            }
        }
    }

    function _traitMeta(uint16 traitId)
        private
        view
        returns (uint8 kind, uint16 supply, uint256 nameOffset, uint256 nameLength)
    {
        _requireTraitId(traitId);
        bytes memory record = _readBlob(
            BlobId.TraitMeta,
            uint256(traitId) * TRAIT_META_RECORD_SIZE,
            TRAIT_META_RECORD_SIZE
        );
        kind = uint8(record[TRAIT_META_KIND_OFFSET]);
        supply = _readUint16(record, TRAIT_META_SUPPLY_OFFSET);
        nameOffset = _readUint16(record, TRAIT_META_NAME_OFFSET_FIELD);
        nameLength = uint8(record[TRAIT_META_NAME_LENGTH_OFFSET]);
    }

    function _scalarField(uint16 punkId, uint256 fieldShift, uint256 fieldMask)
        private
        view
        returns (uint256)
    {
        _requirePunkId(punkId);
        uint256 scalar = _packedScalarOf(punkId);
        return (scalar >> fieldShift) & fieldMask;
    }

    function _packedScalarOf(uint16 punkId) private view returns (uint256) {
        uint256 wordIndex = uint256(punkId) / SCALARS_PER_WORD;
        uint256 shift = (uint256(punkId) % SCALARS_PER_WORD) * SCALAR_BITS;
        return (_packedScalarWords[uint16(wordIndex)] >> shift) & SCALAR_MASK;
    }

    function _bitmapWord(BlobId blobId, uint256 row, uint8 wordIndex)
        private
        view
        returns (uint256 value)
    {
        _requireWordIndex(wordIndex);
        uint256 offset = (row * BITMAP_WORD_COUNT + wordIndex) * WORD_BYTES;
        bytes memory data = _readBlob(blobId, offset, WORD_BYTES);
        assembly ("memory-safe") {
            value := mload(add(data, 0x20))
        }
    }

    function _readUint24(BlobId blobId, uint256 offset) private view returns (uint256) {
        bytes memory data = _readBlob(blobId, offset, PIXEL_OFFSET_BYTES);
        return (uint256(uint8(data[0])) << 16) | (uint256(uint8(data[1])) << 8)
            | uint8(data[2]);
    }

    function _readUint16(bytes memory data, uint256 offset) private pure returns (uint16) {
        return (uint16(uint8(data[offset])) << 8) | uint8(data[offset + 1]);
    }

    // Validation

    function _requirePunkId(uint16 punkId) private pure {
        if (punkId >= PUNK_COUNT) revert InvalidPunkId();
    }

    function _requireTraitId(uint16 traitId) private pure {
        if (traitId >= TRAIT_COUNT) revert InvalidTraitId();
    }

    function _requireColorId(uint8 colorId) private pure {
        if (colorId >= MAX_COLOR_COUNT) revert InvalidColorId();
    }

    function _requireWordIndex(uint8 wordIndex) private pure {
        if (wordIndex >= BITMAP_WORD_COUNT) revert InvalidWordIndex();
    }

    function _requireCriteriaMasks(
        uint256 requiredMask,
        uint256 forbiddenMask,
        uint256 anyOfMask
    ) private pure {
        if (
            (requiredMask & ~CANONICAL_TRAIT_MASK) != 0
                || (forbiddenMask & ~CANONICAL_TRAIT_MASK) != 0
                || (anyOfMask & ~CANONICAL_TRAIT_MASK) != 0
                || (requiredMask & forbiddenMask) != 0
                || (forbiddenMask & anyOfMask) != 0
        ) revert InvalidMask();
    }
}
