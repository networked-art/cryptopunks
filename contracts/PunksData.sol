// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./PunksDataLoader.sol";
import "./interfaces/IPunksData.sol";
import "./lib/BlobStorage.sol";

/// @title PunksData
/// @notice Sealed primitive data surface for CryptoPunks traits and indexed pixels.
contract PunksData is PunksDataLoader, IPunksData {
    using BlobStorage for BlobStorage.Chunk[];

    /// @dev Decoded view of a `TRAIT_META_RECORD_SIZE`-byte trait meta record.
    struct TraitMetaRecord {
        uint8 kind;
        uint16 supply;
        uint16 nameOffset;
        uint8 nameLength;
    }

    /// @dev Decoded view of one packed scalar (one per punk; 5 packed per uint256 word).
    struct PackedScalar {
        uint16 pixelCount;
        uint8 colorCount;
        uint8 attributeCount;
        PunkType punkType;
        HeadVariant headVariant;
    }

    /// @dev Mutable working state threaded through the indexed-pixel decoder.
    struct DecodeState {
        bytes entry;
        bytes localPalette;
        bytes pixels;
        uint256 indexesOffset;
        uint256 bitsPerIndex;
        uint256 bitOffset;
    }

    constructor(address initialAdmin) PunksDataLoader(initialAdmin) {}

    function datasetHash() public view returns (bytes32) {
        return _datasetHash;
    }

    // ---------------- Criteria ----------------

    function traitCount() external pure returns (uint16) {
        return TRAIT_COUNT;
    }

    function isValidTraitId(uint16 traitId) external pure returns (bool) {
        return traitId < TRAIT_COUNT;
    }

    function traitName(uint16 traitId) external view returns (string memory) {
        TraitMetaRecord memory meta = _readTraitMeta(traitId);
        return string(
            _blobs[BlobId.TraitMeta].read(TRAIT_META_HEADER_SIZE + meta.nameOffset, meta.nameLength)
        );
    }

    function traitKind(uint16 traitId) external view returns (TraitKind) {
        TraitMetaRecord memory meta = _readTraitMeta(traitId);
        if (meta.kind > uint8(TraitKind.Accessory)) revert InvalidTraitId();
        return TraitKind(meta.kind);
    }

    function traitSupply(uint16 traitId) external view returns (uint16) {
        return _readTraitMeta(traitId).supply;
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
        return _readPackedScalar(punkId).headVariant;
    }

    function punkTypeOf(uint16 punkId) external view returns (PunkType) {
        return _readPackedScalar(punkId).punkType;
    }

    function attributeCountOf(uint16 punkId) external view returns (uint8) {
        return _readPackedScalar(punkId).attributeCount;
    }

    // ---------------- Visual ----------------

    function paletteSize() public pure returns (uint16) {
        return PALETTE_SIZE;
    }

    function colorOf(uint8 colorId) external view returns (bytes4 rgba) {
        _requireColorId(colorId);
        bytes memory data = _blobs[BlobId.Palette].read(
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

    /// @dev Color id 0 represents transparency and is never recorded in a punk's color mask.
    function hasColor(uint16 punkId, uint8 colorId) external view returns (bool) {
        _requirePunkId(punkId);
        _requireColorId(colorId);
        if (colorId == 0) return false;
        return (_colorMasks[punkId] & (uint256(1) << colorId)) != 0;
    }

    function pixelCountOf(uint16 punkId) external view returns (uint16) {
        return _readPackedScalar(punkId).pixelCount;
    }

    function colorCountOf(uint16 punkId) external view returns (uint8) {
        return _readPackedScalar(punkId).colorCount;
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

    function colorCountBitmapWord(uint8 colorCount, uint8 wordIndex)
        external
        view
        returns (uint256)
    {
        if (colorCount < COLOR_COUNT_MIN || colorCount > COLOR_COUNT_MAX) {
            revert InvalidColorCount();
        }
        return _bitmapWord(
            BlobId.ColorCountBitmaps,
            uint256(colorCount) - COLOR_COUNT_MIN,
            wordIndex
        );
    }

    // ---------------- Indexed pixels ----------------

    function indexedPixelsOf(uint16 punkId) external view returns (bytes memory) {
        return _indexedPixelsOf(punkId);
    }

    function colorAt(uint16 punkId, uint8 x, uint8 y) external view returns (uint8 colorId) {
        if (x >= PUNK_WIDTH || y >= PUNK_HEIGHT) revert InvalidCoordinate();
        bytes memory pixels = _indexedPixelsOf(punkId);
        return uint8(pixels[uint256(y) * PUNK_WIDTH + x]);
    }

    function paletteRgbBytes() external view returns (bytes memory rgb) {
        bytes memory rgba = _paletteBytes();
        uint256 count = rgba.length / PALETTE_RGBA_BYTES_PER_COLOR;
        rgb = new bytes(count * PALETTE_RGB_BYTES_PER_COLOR);
        uint256 rgbaStride = PALETTE_RGBA_BYTES_PER_COLOR;
        uint256 rgbStride = PALETTE_RGB_BYTES_PER_COLOR;
        assembly ("memory-safe") {
            let src := add(rgba, 0x20)
            let dst := add(rgb, 0x20)
            for { let i := 0 } lt(i, count) { i := add(i, 1) } {
                let word := mload(add(src, mul(i, rgbaStride)))
                let dstOff := add(dst, mul(i, rgbStride))
                mstore8(dstOff, byte(0, word))
                mstore8(add(dstOff, 1), byte(1, word))
                mstore8(add(dstOff, 2), byte(2, word))
            }
        }
    }

    function paletteAlphaBytes() external view returns (bytes memory alpha) {
        bytes memory rgba = _paletteBytes();
        uint256 count = rgba.length / PALETTE_RGBA_BYTES_PER_COLOR;
        alpha = new bytes(count);
        uint256 rgbaStride = PALETTE_RGBA_BYTES_PER_COLOR;
        assembly ("memory-safe") {
            let src := add(rgba, 0x20)
            let dst := add(alpha, 0x20)
            for { let i := 0 } lt(i, count) { i := add(i, 1) } {
                let word := mload(add(src, mul(i, rgbaStride)))
                mstore8(add(dst, i), byte(3, word))
            }
        }
    }

    function paletteRgbaBytes() external view returns (bytes memory) {
        return _paletteBytes();
    }

    // ---------------- Internal: typed readers ----------------

    function _traitMaskOf(uint16 punkId) private view returns (uint256) {
        _requirePunkId(punkId);
        uint256 packed = _traitMaskPairs[punkId >> 1];
        if ((punkId & 1) == 0) return uint128(packed);
        return packed >> 128;
    }

    function _readTraitMeta(uint16 traitId) private view returns (TraitMetaRecord memory) {
        _requireTraitId(traitId);
        bytes memory raw = _blobs[BlobId.TraitMeta].read(
            uint256(traitId) * TRAIT_META_RECORD_SIZE,
            TRAIT_META_RECORD_SIZE
        );
        return TraitMetaRecord({
            kind: uint8(raw[TRAIT_META_KIND_OFFSET]),
            supply: _readUint16(raw, TRAIT_META_SUPPLY_OFFSET),
            nameOffset: _readUint16(raw, TRAIT_META_NAME_OFFSET_FIELD),
            nameLength: uint8(raw[TRAIT_META_NAME_LENGTH_OFFSET])
        });
    }

    function _readPackedScalar(uint16 punkId) private view returns (PackedScalar memory) {
        _requirePunkId(punkId);
        uint256 wordIndex = uint256(punkId) / SCALARS_PER_WORD;
        uint256 shift = (uint256(punkId) % SCALARS_PER_WORD) * SCALAR_BITS;
        uint256 raw = (_packedScalarWords[wordIndex] >> shift) & SCALAR_MASK;
        return PackedScalar({
            pixelCount: uint16((raw >> PIXEL_COUNT_SHIFT) & UINT16_MASK),
            colorCount: uint8((raw >> COLOR_COUNT_SHIFT) & UINT8_MASK),
            attributeCount: uint8((raw >> ATTRIBUTE_COUNT_SHIFT) & UINT8_MASK),
            punkType: PunkType((raw >> PUNK_TYPE_SHIFT) & UINT8_MASK),
            headVariant: HeadVariant((raw >> HEAD_VARIANT_SHIFT) & UINT8_MASK)
        });
    }

    function _bitmapWord(BlobId blobId, uint256 row, uint8 wordIndex)
        private
        view
        returns (uint256)
    {
        _requireWordIndex(wordIndex);
        return _blobs[blobId].readWordAt((row * BITMAP_WORD_COUNT + wordIndex) * WORD_BYTES);
    }

    function _paletteBytes() private view returns (bytes memory) {
        return _blobs[BlobId.Palette].read(0, _blobs[BlobId.Palette].totalLength());
    }

    // ---------------- Internal: indexed pixel decoder ----------------

    /// @dev Compressed entry layout:
    ///      visibleColorCount (u8) | visible bitmap | local palette | packed local color indexes.
    function _indexedPixelsOf(uint16 punkId) private view returns (bytes memory) {
        _requirePunkId(punkId);

        uint256 start =
            _blobs[BlobId.PixelOffsets].readUint24At(uint256(punkId) * PIXEL_OFFSET_BYTES);
        uint256 end =
            _blobs[BlobId.PixelOffsets].readUint24At((uint256(punkId) + 1) * PIXEL_OFFSET_BYTES);
        if (end <= start) revert MalformedPixelBlob();

        DecodeState memory state;
        state.entry = _blobs[BlobId.CompressedPixels].read(start, end - start);
        if (state.entry.length < COMPRESSED_PIXEL_HEADER_SIZE) revert MalformedPixelBlob();

        uint256 visibleColorCount = uint8(state.entry[0]);
        state.localPalette = _readLocalPalette(state.entry, visibleColorCount);
        state.indexesOffset = COMPRESSED_PIXEL_HEADER_SIZE + visibleColorCount;
        state.bitsPerIndex = _bitsForPalette(visibleColorCount);
        state.pixels = new bytes(PIXELS_PER_PUNK);

        uint256 visiblePixels = _decodeVisiblePixels(state);

        uint256 expectedIndexBytes = (state.bitOffset + BITS_PER_BYTE - 1) / BITS_PER_BYTE;
        if (
            state.entry.length != state.indexesOffset + expectedIndexBytes
                || visiblePixels == 0
        ) revert MalformedPixelBlob();

        return state.pixels;
    }

    function _readLocalPalette(bytes memory entry, uint256 visibleColorCount)
        private
        pure
        returns (bytes memory localPalette)
    {
        if (
            visibleColorCount == 0
                || visibleColorCount >= PALETTE_SIZE
                || entry.length < COMPRESSED_PIXEL_HEADER_SIZE + visibleColorCount
        ) revert MalformedPixelBlob();

        localPalette = new bytes(visibleColorCount);
        for (uint256 i; i < visibleColorCount;) {
            uint8 paletteId = uint8(entry[COMPRESSED_PIXEL_HEADER_SIZE + i]);
            if (paletteId == 0 || paletteId >= PALETTE_SIZE) revert MalformedPixelBlob();
            localPalette[i] = bytes1(paletteId);
            unchecked {
                ++i;
            }
        }
    }

    function _decodeVisiblePixels(DecodeState memory state)
        private
        pure
        returns (uint256 totalDecoded)
    {
        for (uint256 byteIdx; byteIdx < VISIBLE_BITMAP_BYTES;) {
            uint256 bitmapByte = uint8(state.entry[1 + byteIdx]);
            if (bitmapByte != 0) {
                uint256 pixelBase = byteIdx * BITS_PER_BYTE;
                for (uint256 bitIdx; bitIdx < BITS_PER_BYTE;) {
                    uint256 pixelBit = uint256(1) << (BITS_PER_BYTE - 1 - bitIdx);
                    if ((bitmapByte & pixelBit) != 0) {
                        uint256 localIndex;
                        if (state.bitsPerIndex != 0) {
                            localIndex = _readBits(
                                state.entry,
                                state.indexesOffset,
                                state.bitOffset,
                                state.bitsPerIndex
                            );
                            state.bitOffset += state.bitsPerIndex;
                        }
                        if (localIndex >= state.localPalette.length) {
                            revert MalformedPixelBlob();
                        }
                        state.pixels[pixelBase + bitIdx] = state.localPalette[localIndex];
                        unchecked {
                            ++totalDecoded;
                        }
                    }
                    unchecked {
                        ++bitIdx;
                    }
                }
            }
            unchecked {
                ++byteIdx;
            }
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

    function _readUint16(bytes memory data, uint256 offset) private pure returns (uint16) {
        return (uint16(uint8(data[offset])) << 8) | uint8(data[offset + 1]);
    }

    // ---------------- Internal: validators ----------------

    function _requirePunkId(uint16 punkId) private pure {
        if (punkId >= PUNK_COUNT) revert InvalidPunkId();
    }

    function _requireTraitId(uint16 traitId) private pure {
        if (traitId >= TRAIT_COUNT) revert InvalidTraitId();
    }

    function _requireColorId(uint8 colorId) private pure {
        if (colorId >= PALETTE_SIZE) revert InvalidColorId();
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
