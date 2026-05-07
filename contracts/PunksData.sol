// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import "./interfaces/IPunksData.sol";
import "./lib/BytecodeBlob.sol";

/// @title PunksData
/// @notice Sealed primitive data surface for CryptoPunks traits and indexed pixels.
contract PunksData is
    ERC165,
    IPunksDataCriteria,
    IPunksDataVisual,
    IPunksDataIndexed,
    IPunksDataDeployment
{
    using BytecodeBlob for address;

    uint16 public constant PUNK_COUNT = 10_000;
    uint16 public constant TRAIT_COUNT = 111;
    uint16 public constant BITMAP_WORD_COUNT = 40;
    uint16 public constant MAX_COLOR_COUNT = 222;
    uint16 public constant PIXEL_COUNT_MIN = 148;
    uint16 public constant PIXEL_COUNT_MAX = 332;
    uint8 public constant COLOR_COUNT_MIN = 2;
    uint8 public constant COLOR_COUNT_MAX = 14;
    uint8 public constant PUNK_WIDTH = 24;
    uint8 public constant PUNK_HEIGHT = 24;
    uint16 public constant PIXELS_PER_PUNK = 576;

    uint256 public constant SOURCE_CHAIN_ID = 1;
    uint256 public constant SOURCE_BLOCK_NUMBER = 25_044_552;
    bytes32 public constant SOURCE_BLOCK_HASH =
        0x2185f56dcb307a56cb8b90c1e61d4fd7898be906eb28d79e14c01d15f5cabb9f;
    bytes32 public constant SOURCE_EXTCODEHASH =
        0x52ab51c14a3f26a80eca178374e21027492fd276c7365f9ab234b737d34c6b60;

    uint256 internal constant CANONICAL_TRAIT_MASK = (uint256(1) << TRAIT_COUNT) - 1;
    uint256 internal constant CANONICAL_COLOR_MASK = (uint256(1) << MAX_COLOR_COUNT) - 1;
    uint256 internal constant TRAIT_META_RECORD_SIZE = 6;
    uint256 internal constant TRAIT_META_HEADER_SIZE = uint256(TRAIT_COUNT) * TRAIT_META_RECORD_SIZE;
    uint256 internal constant WORD_BYTES = 32;
    uint256 internal constant PIXEL_OFFSET_BYTES = 3;
    uint256 internal constant BITS_PER_BYTE = 8;
    uint256 internal constant UINT8_MASK = 0xff;
    uint256 internal constant UINT16_MASK = 0xffff;
    uint256 internal constant SCALAR_BITS = 48;
    uint256 internal constant SCALARS_PER_WORD = 5;
    uint256 internal constant SCALAR_MASK = (uint256(1) << SCALAR_BITS) - 1;
    uint256 internal constant PIXEL_COUNT_SHIFT = 0;
    uint256 internal constant COLOR_COUNT_SHIFT = 16;
    uint256 internal constant ATTRIBUTE_COUNT_SHIFT = 24;
    uint256 internal constant PUNK_TYPE_SHIFT = 32;
    uint256 internal constant HEAD_VARIANT_SHIFT = 40;
    uint256 internal constant MAX_ATTRIBUTE_COUNT = 7;
    uint256 internal constant PALETTE_RGBA_BYTES_PER_COLOR = 4;
    uint256 internal constant PALETTE_RGB_BYTES_PER_COLOR = 3;
    uint256 internal constant VISIBLE_BITMAP_BYTES = uint256(PIXELS_PER_PUNK) / BITS_PER_BYTE;
    uint256 internal constant COMPRESSED_PIXEL_HEADER_SIZE = 1 + VISIBLE_BITMAP_BYTES;

    address public immutable sourceDataContract;
    address public admin;
    bool public isSealed;

    bytes32 private _datasetHash;
    bytes32 public traitCatalogHash;
    bytes32 public punkMaskHash;
    bytes32 public paletteHash;
    bytes32 public indexedPixelsHash;
    bytes32 public compressedPixelsHash;

    struct Chunk {
        address pointer;
        uint32 endOffset;
    }

    mapping(uint16 pairIndex => uint256 packedMasks) private _traitMaskPairs;
    mapping(uint16 punkId => uint256 mask) private _colorMasks;
    mapping(uint16 wordIndex => uint256 packedScalars) private _packedScalarWords;
    mapping(uint8 colorId => uint32 pixels) private _colorSupplies;
    mapping(bytes32 nameHash => mapping(uint8 kind => uint16 traitIdPlusOne))
        private _traitIdsByNameHash;
    mapping(BlobId blobId => Chunk[] chunks) private _blobChunks;

    event BlobChunkLoaded(
        BlobId indexed blobId,
        uint16 indexed chunkIndex,
        address pointer,
        uint256 size,
        bytes32 dataHash
    );
    event DatasetCommitted(
        address indexed sourceData,
        bytes32 traitCatalogHash,
        bytes32 punkMaskHash,
        bytes32 paletteHash,
        bytes32 indexedPixelsHash,
        bytes32 compressedPixelsHash,
        bytes32 datasetHash
    );

    error ZeroAddress();
    error InvalidSource();
    error NotAdmin();
    error AlreadySealed();
    error InvalidBlobId();
    error InvalidChunkIndex();
    error InvalidLength();
    error InvalidHash();
    error InvalidPunkId();
    error InvalidTraitId();
    error InvalidColorId();
    error InvalidWordIndex();
    error InvalidCoordinate();
    error InvalidPixelCount();
    error InvalidColorCount();
    error InvalidScalar();
    error InvalidMask();
    error BlobReadOutOfBounds(BlobId blobId, uint256 offset, uint256 length);
    error MalformedPixelBlob();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyUnsealed() {
        if (isSealed) revert AlreadySealed();
        _;
    }

    constructor(address sourceData, address initialAdmin) {
        if (sourceData == address(0) || initialAdmin == address(0)) revert ZeroAddress();
        if (block.chainid == SOURCE_CHAIN_ID && sourceData.codehash != SOURCE_EXTCODEHASH) {
            revert InvalidSource();
        }
        sourceDataContract = sourceData;
        admin = initialAdmin;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC165)
        returns (bool)
    {
        return interfaceId == type(IPunksDataCriteria).interfaceId
            || interfaceId == type(IPunksDataVisual).interfaceId
            || interfaceId == type(IPunksDataIndexed).interfaceId
            || interfaceId == type(IPunksDataDeployment).interfaceId
            || super.supportsInterface(interfaceId);
    }

    function datasetHash() external view returns (bytes32) {
        return _datasetHash;
    }

    function recomputeTraitCatalogHash() external view returns (bytes32) {
        bytes memory blob = _readBlob(BlobId.TraitMeta, 0, _blobLength(BlobId.TraitMeta));

        uint256 totalLen = TRAIT_COUNT;
        for (uint256 i; i < TRAIT_COUNT;) {
            totalLen += uint8(blob[i * TRAIT_META_RECORD_SIZE + 5]);
            unchecked {
                ++i;
            }
        }

        bytes memory data = new bytes(totalLen);
        uint256 cursor;
        for (uint256 i; i < TRAIT_COUNT;) {
            uint256 recordOffset = i * TRAIT_META_RECORD_SIZE;
            uint256 nameOffset = (uint256(uint8(blob[recordOffset + 3])) << 8)
                | uint8(blob[recordOffset + 4]);
            uint256 nameLen = uint8(blob[recordOffset + 5]);
            for (uint256 j; j < nameLen;) {
                data[cursor + j] = blob[TRAIT_META_HEADER_SIZE + nameOffset + j];
                unchecked {
                    ++j;
                }
            }
            cursor += nameLen;
            data[cursor] = blob[recordOffset];
            unchecked {
                ++cursor;
                ++i;
            }
        }

        return keccak256(data);
    }

    function recomputePunkMaskHash() external view returns (bytes32) {
        bytes memory data = new bytes(uint256(PUNK_COUNT) * WORD_BYTES);
        uint256 dataPtr;
        assembly ("memory-safe") {
            dataPtr := add(data, 0x20)
        }

        for (uint256 punkId; punkId < PUNK_COUNT;) {
            uint256 mask = _traitMaskOf(uint16(punkId));
            assembly ("memory-safe") {
                mstore(add(dataPtr, mul(punkId, 0x20)), mask)
            }
            unchecked {
                ++punkId;
            }
        }
        return keccak256(data);
    }

    function recomputePaletteHash() external view returns (bytes32) {
        return keccak256(_readBlob(BlobId.Palette, 0, _blobLength(BlobId.Palette)));
    }

    function recomputeCompressedPixelsHash() external view returns (bytes32) {
        uint256 offsetsLen = _blobLength(BlobId.PixelOffsets);
        uint256 pixelsLen = _blobLength(BlobId.CompressedPixels);

        bytes memory data = new bytes(offsetsLen + pixelsLen);
        _copyBlobInto(BlobId.PixelOffsets, data, 0, offsetsLen);
        _copyBlobInto(BlobId.CompressedPixels, data, offsetsLen, pixelsLen);

        return keccak256(data);
    }

    function traitCount() external pure returns (uint16) {
        return TRAIT_COUNT;
    }

    function isValidTraitId(uint16 traitId) external pure returns (bool) {
        return traitId < TRAIT_COUNT;
    }

    function blobChunkCount(BlobId blobId) external view returns (uint256) {
        _requireBlobId(blobId);
        return _blobChunks[blobId].length;
    }

    function blobLength(BlobId blobId) external view returns (uint256) {
        _requireBlobId(blobId);
        return _blobLength(blobId);
    }

    function loadTraitMaskPairs(uint16 startPairIndex, uint256[] calldata packedPairs)
        external
        onlyAdmin
        onlyUnsealed
    {
        uint256 len = packedPairs.length;
        if (uint256(startPairIndex) + len > PUNK_COUNT / 2) revert InvalidLength();

        for (uint256 i; i < len;) {
            uint256 packed = packedPairs[i];
            uint256 low = uint128(packed);
            uint256 high = packed >> 128;
            if ((low & ~CANONICAL_TRAIT_MASK) != 0 || (high & ~CANONICAL_TRAIT_MASK) != 0) {
                revert InvalidMask();
            }
            _traitMaskPairs[uint16(uint256(startPairIndex) + i)] = packed;
            unchecked {
                ++i;
            }
        }
    }

    function loadColorMasks(uint16 startPunkId, uint256[] calldata masks)
        external
        onlyAdmin
        onlyUnsealed
    {
        uint256 len = masks.length;
        if (uint256(startPunkId) + len > PUNK_COUNT) revert InvalidLength();

        for (uint256 i; i < len;) {
            uint256 mask = masks[i];
            if ((mask & ~CANONICAL_COLOR_MASK) != 0 || (mask & 1) != 0) revert InvalidMask();
            _colorMasks[uint16(uint256(startPunkId) + i)] = mask;
            unchecked {
                ++i;
            }
        }
    }

    function loadPackedScalars(uint16 startWordIndex, uint256[] calldata words)
        external
        onlyAdmin
        onlyUnsealed
    {
        uint256 len = words.length;
        uint256 wordCount = _scalarWordCount();
        if (uint256(startWordIndex) + len > wordCount) revert InvalidLength();

        for (uint256 i; i < len;) {
            uint256 word = words[i];
            _validateScalarWord(word);
            _packedScalarWords[uint16(uint256(startWordIndex) + i)] = word;
            unchecked {
                ++i;
            }
        }
    }

    function loadColorSupplies(uint8 startColorId, uint32[] calldata supplies)
        external
        onlyAdmin
        onlyUnsealed
    {
        uint256 len = supplies.length;
        if (uint256(startColorId) + len > MAX_COLOR_COUNT) revert InvalidLength();

        for (uint256 i; i < len;) {
            _colorSupplies[uint8(uint256(startColorId) + i)] = supplies[i];
            unchecked {
                ++i;
            }
        }
    }

    function loadTraitNameHashes(TraitNameHash[] calldata entries)
        external
        onlyAdmin
        onlyUnsealed
    {
        uint256 len = entries.length;

        for (uint256 i; i < len;) {
            TraitNameHash calldata entry = entries[i];
            uint16 traitId = entry.traitId;
            _requireTraitId(traitId);
            _traitIdsByNameHash[entry.nameHash][uint8(entry.kind)] = traitId + 1;
            unchecked {
                ++i;
            }
        }
    }

    function loadBlobChunk(BlobId blobId, uint16 chunkIndex, bytes calldata data)
        external
        onlyAdmin
        onlyUnsealed
    {
        _requireBlobId(blobId);
        Chunk[] storage chunks = _blobChunks[blobId];
        if (chunkIndex != chunks.length) revert InvalidChunkIndex();

        address pointer = BytecodeBlob.write(data);
        uint256 prevEnd = chunkIndex == 0 ? 0 : chunks[chunkIndex - 1].endOffset;
        uint256 newEnd = prevEnd + data.length;
        if (newEnd > type(uint32).max) revert InvalidLength();
        chunks.push(Chunk({pointer: pointer, endOffset: uint32(newEnd)}));

        emit BlobChunkLoaded(blobId, chunkIndex, pointer, data.length, keccak256(data));
    }

    function seal(DatasetCommitment calldata commitment) external onlyAdmin onlyUnsealed {
        if (
            commitment.traitCatalogHash == bytes32(0) || commitment.punkMaskHash == bytes32(0)
                || commitment.paletteHash == bytes32(0) || commitment.indexedPixelsHash == bytes32(0)
                || commitment.compressedPixelsHash == bytes32(0)
        ) revert InvalidHash();

        _requireBlobLength(
            BlobId.TraitBitmaps,
            uint256(TRAIT_COUNT) * BITMAP_WORD_COUNT * WORD_BYTES
        );
        if (_blobLength(BlobId.TraitMeta) < TRAIT_META_HEADER_SIZE) revert InvalidLength();
        _requireBlobLength(
            BlobId.Palette,
            uint256(MAX_COLOR_COUNT) * PALETTE_RGBA_BYTES_PER_COLOR
        );
        _requireBlobLength(
            BlobId.PixelOffsets,
            (uint256(PUNK_COUNT) + 1) * PIXEL_OFFSET_BYTES
        );
        if (_blobLength(BlobId.CompressedPixels) == 0) revert InvalidLength();
        _requireBlobLength(
            BlobId.ColorBitmaps,
            uint256(MAX_COLOR_COUNT) * BITMAP_WORD_COUNT * WORD_BYTES
        );
        _requireBlobLength(
            BlobId.PixelCountBitmaps,
            (uint256(PIXEL_COUNT_MAX) - PIXEL_COUNT_MIN + 1) * BITMAP_WORD_COUNT * WORD_BYTES
        );
        _requireBlobLength(
            BlobId.ColorCountBitmaps,
            (uint256(COLOR_COUNT_MAX) - COLOR_COUNT_MIN + 1) * BITMAP_WORD_COUNT * WORD_BYTES
        );

        traitCatalogHash = commitment.traitCatalogHash;
        punkMaskHash = commitment.punkMaskHash;
        paletteHash = commitment.paletteHash;
        indexedPixelsHash = commitment.indexedPixelsHash;
        compressedPixelsHash = commitment.compressedPixelsHash;
        _datasetHash = keccak256(
            abi.encode(
                commitment.traitCatalogHash,
                commitment.punkMaskHash,
                commitment.paletteHash,
                commitment.indexedPixelsHash,
                commitment.compressedPixelsHash
            )
        );

        isSealed = true;
        admin = address(0);

        emit DatasetCommitted(
            sourceDataContract,
            commitment.traitCatalogHash,
            commitment.punkMaskHash,
            commitment.paletteHash,
            commitment.indexedPixelsHash,
            commitment.compressedPixelsHash,
            _datasetHash
        );
    }

    function traitName(uint16 traitId) external view returns (string memory) {
        _requireTraitId(traitId);
        bytes memory record = _traitMetaRecord(traitId);
        uint256 nameOffset = _readUint16(record, 3);
        uint256 nameLength = uint8(record[5]);
        return string(_readBlob(BlobId.TraitMeta, TRAIT_META_HEADER_SIZE + nameOffset, nameLength));
    }

    function traitIdByNameHash(bytes32 nameHash, TraitKind kind)
        external
        view
        returns (uint16 traitId, bool exists)
    {
        uint16 traitIdPlusOne = _traitIdsByNameHash[nameHash][uint8(kind)];
        if (traitIdPlusOne == 0) return (0, false);
        unchecked {
            return (traitIdPlusOne - 1, true);
        }
    }

    function traitKind(uint16 traitId) external view returns (TraitKind) {
        _requireTraitId(traitId);
        uint8 kind = uint8(_traitMetaRecord(traitId)[0]);
        if (kind > uint8(TraitKind.Accessory)) revert InvalidTraitId();
        return TraitKind(kind);
    }

    function traitSupply(uint16 traitId) external view returns (uint16) {
        _requireTraitId(traitId);
        return _readUint16(_traitMetaRecord(traitId), 1);
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
        _requireWordIndex(wordIndex);
        return _readBitmapWord(
            BlobId.TraitBitmaps,
            (uint256(traitId) * BITMAP_WORD_COUNT + wordIndex) * WORD_BYTES
        );
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
        _requireWordIndex(wordIndex);
        return _readBitmapWord(
            BlobId.ColorBitmaps,
            (uint256(colorId) * BITMAP_WORD_COUNT + wordIndex) * WORD_BYTES
        );
    }

    function pixelCountBitmapWord(uint16 pixelCount, uint8 wordIndex)
        external
        view
        returns (uint256)
    {
        if (pixelCount < PIXEL_COUNT_MIN || pixelCount > PIXEL_COUNT_MAX) {
            revert InvalidPixelCount();
        }
        _requireWordIndex(wordIndex);
        return _readBitmapWord(
            BlobId.PixelCountBitmaps,
            (uint256(pixelCount) - PIXEL_COUNT_MIN) * BITMAP_WORD_COUNT * WORD_BYTES
                + uint256(wordIndex) * WORD_BYTES
        );
    }

    function colorCountBitmapWord(uint8 count, uint8 wordIndex)
        external
        view
        returns (uint256)
    {
        if (count < COLOR_COUNT_MIN || count > COLOR_COUNT_MAX) revert InvalidColorCount();
        _requireWordIndex(wordIndex);
        return _readBitmapWord(
            BlobId.ColorCountBitmaps,
            (uint256(count) - COLOR_COUNT_MIN) * BITMAP_WORD_COUNT * WORD_BYTES
                + uint256(wordIndex) * WORD_BYTES
        );
    }

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

    function _traitMaskOf(uint16 punkId) private view returns (uint256) {
        _requirePunkId(punkId);
        uint256 packed = _traitMaskPairs[punkId >> 1];
        if ((punkId & 1) == 0) return uint128(packed);
        return packed >> 128;
    }

    function _indexedPixelsOf(uint16 punkId) private view returns (bytes memory pixels) {
        _requirePunkId(punkId);
        uint256 start = _readUint24(BlobId.PixelOffsets, uint256(punkId) * PIXEL_OFFSET_BYTES);
        uint256 end =
            _readUint24(BlobId.PixelOffsets, (uint256(punkId) + 1) * PIXEL_OFFSET_BYTES);
        if (end <= start) revert MalformedPixelBlob();

        bytes memory entry = _readBlob(BlobId.CompressedPixels, start, end - start);
        if (entry.length < COMPRESSED_PIXEL_HEADER_SIZE) revert MalformedPixelBlob();

        uint256 visibleColorCount = uint8(entry[0]);
        uint256 paletteCount = colorCount();
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

    function _traitMetaRecord(uint16 traitId) private view returns (bytes memory) {
        return _readBlob(
            BlobId.TraitMeta,
            uint256(traitId) * TRAIT_META_RECORD_SIZE,
            TRAIT_META_RECORD_SIZE
        );
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

    function _validateScalarWord(uint256 word) private pure {
        if (word >> (SCALARS_PER_WORD * SCALAR_BITS) != 0) revert InvalidScalar();
        for (uint256 i; i < SCALARS_PER_WORD;) {
            uint256 scalar = (word >> (i * SCALAR_BITS)) & SCALAR_MASK;
            uint256 pixelCount = (scalar >> PIXEL_COUNT_SHIFT) & UINT16_MASK;
            uint256 colorCountValue = (scalar >> COLOR_COUNT_SHIFT) & UINT8_MASK;
            uint256 attributeCount = (scalar >> ATTRIBUTE_COUNT_SHIFT) & UINT8_MASK;
            uint256 punkType = (scalar >> PUNK_TYPE_SHIFT) & UINT8_MASK;
            uint256 headVariant = (scalar >> HEAD_VARIANT_SHIFT) & UINT8_MASK;
            if (
                pixelCount < PIXEL_COUNT_MIN || pixelCount > PIXEL_COUNT_MAX
                    || colorCountValue < COLOR_COUNT_MIN || colorCountValue > COLOR_COUNT_MAX
                    || attributeCount > MAX_ATTRIBUTE_COUNT || punkType > uint8(PunkType.Zombie)
                    || headVariant > uint8(HeadVariant.Zombie)
            ) revert InvalidScalar();
            unchecked {
                ++i;
            }
        }
    }

    function _scalarWordCount() private pure returns (uint256) {
        return (uint256(PUNK_COUNT) + SCALARS_PER_WORD - 1) / SCALARS_PER_WORD;
    }

    function _readBitmapWord(BlobId blobId, uint256 offset) private view returns (uint256 value) {
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

    function _readBlob(BlobId blobId, uint256 offset, uint256 length)
        private
        view
        returns (bytes memory out)
    {
        if (length == 0) return new bytes(0);

        Chunk[] storage chunks = _blobChunks[blobId];
        uint256 chunkCount = chunks.length;
        if (chunkCount == 0) revert BlobReadOutOfBounds(blobId, offset, length);

        uint256 totalLength = chunks[chunkCount - 1].endOffset;
        if (offset >= totalLength || length > totalLength - offset) {
            revert BlobReadOutOfBounds(blobId, offset, length);
        }

        out = new bytes(length);

        uint256 lo;
        uint256 hi = chunkCount;
        while (lo < hi) {
            uint256 mid = (lo + hi) >> 1;
            if (chunks[mid].endOffset <= offset) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }

        uint256 copied;
        uint256 chunkStart = lo == 0 ? 0 : chunks[lo - 1].endOffset;
        while (copied < length) {
            Chunk storage chunk = chunks[lo];
            uint256 chunkEnd = chunk.endOffset;
            uint256 readStart = offset + copied - chunkStart;
            uint256 readLength = chunkEnd - chunkStart - readStart;
            uint256 remaining = length - copied;
            if (readLength > remaining) readLength = remaining;

            bytes memory part = chunk.pointer.read(readStart, readLength);
            _copyBytes(part, out, copied, readLength);
            copied += readLength;

            chunkStart = chunkEnd;
            unchecked {
                ++lo;
            }
        }
    }

    function _copyBytes(bytes memory src, bytes memory dst, uint256 dstOffset, uint256 length)
        private
        pure
    {
        for (uint256 i; i < length;) {
            dst[dstOffset + i] = src[i];
            unchecked {
                ++i;
            }
        }
    }

    function _blobLength(BlobId blobId) private view returns (uint256) {
        Chunk[] storage chunks = _blobChunks[blobId];
        uint256 len = chunks.length;
        if (len == 0) return 0;
        return chunks[len - 1].endOffset;
    }

    function _copyBlobInto(BlobId blobId, bytes memory dst, uint256 dstOffset, uint256 length)
        private
        view
    {
        if (length == 0) return;

        Chunk[] storage chunks = _blobChunks[blobId];
        uint256 chunkCount = chunks.length;
        if (chunkCount == 0) revert BlobReadOutOfBounds(blobId, 0, length);

        uint256 totalLength = chunks[chunkCount - 1].endOffset;
        if (length > totalLength) revert BlobReadOutOfBounds(blobId, 0, length);

        uint256 copied;
        uint256 chunkStart;
        uint256 lo;
        while (copied < length) {
            Chunk storage chunk = chunks[lo];
            uint256 chunkEnd = chunk.endOffset;
            uint256 chunkSize = chunkEnd - chunkStart;
            uint256 remaining = length - copied;
            uint256 readLength = chunkSize > remaining ? remaining : chunkSize;

            address pointer = chunk.pointer;
            assembly ("memory-safe") {
                extcodecopy(
                    pointer,
                    add(add(dst, 0x20), add(dstOffset, copied)),
                    1,
                    readLength
                )
            }
            copied += readLength;

            chunkStart = chunkEnd;
            unchecked {
                ++lo;
            }
        }
    }

    function _requireBlobLength(BlobId blobId, uint256 expected) private view {
        if (_blobLength(blobId) != expected) revert InvalidLength();
    }

    function _requireBlobId(BlobId blobId) private pure {
        if (blobId == BlobId.Invalid) revert InvalidBlobId();
    }

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
