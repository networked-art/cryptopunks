// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import "./interfaces/IPunksData.sol";
import "./lib/BytecodeBlob.sol";

/// @title PunksData
/// @notice Sealed primitive data surface for CryptoPunks traits and indexed pixels.
contract PunksData is ERC165, IPunksDataCriteria, IPunksDataVisual, IPunksDataIndexed {
    using BytecodeBlob for address;

    uint16 public constant PUNK_COUNT = 10_000;
    uint16 public constant TRAIT_COUNT = 111;
    uint16 public constant TRAIT_WORD_COUNT = 40;
    uint16 public constant MAX_COLOR_COUNT = 222;
    uint16 public constant PIXEL_COUNT_MIN = 148;
    uint16 public constant PIXEL_COUNT_MAX = 332;
    uint8 public constant COLOR_COUNT_MIN = 2;
    uint8 public constant COLOR_COUNT_MAX = 14;

    uint8 public constant KIND_HEAD_VARIANT = 0;
    uint8 public constant KIND_NORMALIZED_TYPE = 1;
    uint8 public constant KIND_ATTRIBUTE_COUNT = 2;
    uint8 public constant KIND_ACCESSORY = 3;

    uint8 public constant BLOB_TRAIT_BITMAPS = 1;
    uint8 public constant BLOB_TRAIT_META = 2;
    uint8 public constant BLOB_PALETTE = 3;
    uint8 public constant BLOB_PIXEL_OFFSETS = 4;
    uint8 public constant BLOB_COMPRESSED_PIXELS = 5;
    uint8 public constant BLOB_COLOR_BITMAPS = 6;
    uint8 public constant BLOB_PIXEL_COUNT_BITMAPS = 7;
    uint8 public constant BLOB_COLOR_COUNT_BITMAPS = 8;

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
    uint256 internal constant SCALAR_BITS = 48;
    uint256 internal constant SCALARS_PER_WORD = 5;
    uint256 internal constant SCALAR_MASK = (uint256(1) << SCALAR_BITS) - 1;

    address public immutable sourceDataContract;
    address public admin;
    bool public isSealed;

    bytes32 private _datasetHash;
    bytes32 public traitCatalogHash;
    bytes32 public punkMaskHash;
    bytes32 public paletteHash;
    bytes32 public indexedPixelsHash;
    bytes32 public compressedPixelsHash;

    mapping(uint16 pairIndex => uint256 packedMasks) private _traitMaskPairs;
    mapping(uint16 punkId => uint256 mask) private _colorMasks;
    mapping(uint16 wordIndex => uint256 packedScalars) private _packedScalarWords;
    mapping(uint8 colorId => uint32 pixels) private _colorSupplies;
    mapping(bytes32 nameHash => mapping(uint8 kind => uint16 traitIdPlusOne))
        private _traitIdsByNameHash;
    mapping(uint8 blobId => address[] chunks) private _blobChunks;

    event BlobChunkLoaded(
        uint8 indexed blobId,
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
    error BlobReadOutOfBounds(uint8 blobId, uint256 offset, uint256 length);
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
            || super.supportsInterface(interfaceId);
    }

    function datasetHash() external view returns (bytes32) {
        return _datasetHash;
    }

    function traitCount() external pure returns (uint16) {
        return TRAIT_COUNT;
    }

    function isValidTraitId(uint16 traitId) external pure returns (bool) {
        return traitId < TRAIT_COUNT;
    }

    function blobChunkCount(uint8 blobId) external view returns (uint256) {
        _requireBlobId(blobId);
        return _blobChunks[blobId].length;
    }

    function blobLength(uint8 blobId) external view returns (uint256) {
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

    function loadTraitNameHashes(
        bytes32[] calldata nameHashes,
        uint8[] calldata kinds,
        uint16[] calldata traitIds
    ) external onlyAdmin onlyUnsealed {
        uint256 len = nameHashes.length;
        if (kinds.length != len || traitIds.length != len) revert InvalidLength();

        for (uint256 i; i < len;) {
            uint8 kind = kinds[i];
            uint16 traitId = traitIds[i];
            if (kind > KIND_ACCESSORY) revert InvalidTraitId();
            _requireTraitId(traitId);
            _traitIdsByNameHash[nameHashes[i]][kind] = traitId + 1;
            unchecked {
                ++i;
            }
        }
    }

    function loadBlobChunk(uint8 blobId, uint16 chunkIndex, bytes calldata data)
        external
        onlyAdmin
        onlyUnsealed
    {
        _requireBlobId(blobId);
        address[] storage chunks = _blobChunks[blobId];
        if (chunkIndex != chunks.length) revert InvalidChunkIndex();

        address pointer = BytecodeBlob.write(data);
        chunks.push(pointer);
        emit BlobChunkLoaded(blobId, chunkIndex, pointer, data.length, keccak256(data));
    }

    function seal(
        bytes32 newTraitCatalogHash,
        bytes32 newPunkMaskHash,
        bytes32 newPaletteHash,
        bytes32 newIndexedPixelsHash,
        bytes32 newCompressedPixelsHash
    ) external onlyAdmin onlyUnsealed {
        if (
            newTraitCatalogHash == bytes32(0) || newPunkMaskHash == bytes32(0)
                || newPaletteHash == bytes32(0) || newIndexedPixelsHash == bytes32(0)
                || newCompressedPixelsHash == bytes32(0)
        ) revert InvalidHash();

        _requireBlobLength(BLOB_TRAIT_BITMAPS, uint256(TRAIT_COUNT) * TRAIT_WORD_COUNT * 32);
        if (_blobLength(BLOB_TRAIT_META) < TRAIT_META_HEADER_SIZE) revert InvalidLength();
        _requireBlobLength(BLOB_PALETTE, uint256(MAX_COLOR_COUNT) * 4);
        _requireBlobLength(BLOB_PIXEL_OFFSETS, (uint256(PUNK_COUNT) + 1) * 3);
        if (_blobLength(BLOB_COMPRESSED_PIXELS) == 0) revert InvalidLength();
        _requireBlobLength(BLOB_COLOR_BITMAPS, uint256(MAX_COLOR_COUNT) * TRAIT_WORD_COUNT * 32);
        _requireBlobLength(
            BLOB_PIXEL_COUNT_BITMAPS,
            (uint256(PIXEL_COUNT_MAX) - PIXEL_COUNT_MIN + 1) * TRAIT_WORD_COUNT * 32
        );
        _requireBlobLength(
            BLOB_COLOR_COUNT_BITMAPS,
            (uint256(COLOR_COUNT_MAX) - COLOR_COUNT_MIN + 1) * TRAIT_WORD_COUNT * 32
        );

        traitCatalogHash = newTraitCatalogHash;
        punkMaskHash = newPunkMaskHash;
        paletteHash = newPaletteHash;
        indexedPixelsHash = newIndexedPixelsHash;
        compressedPixelsHash = newCompressedPixelsHash;
        _datasetHash = keccak256(
            abi.encode(
                newTraitCatalogHash,
                newPunkMaskHash,
                newPaletteHash,
                newIndexedPixelsHash,
                newCompressedPixelsHash
            )
        );

        isSealed = true;
        admin = address(0);

        emit DatasetCommitted(
            sourceDataContract,
            newTraitCatalogHash,
            newPunkMaskHash,
            newPaletteHash,
            newIndexedPixelsHash,
            newCompressedPixelsHash,
            _datasetHash
        );
    }

    function traitName(uint16 traitId) external view returns (string memory) {
        _requireTraitId(traitId);
        bytes memory record = _traitMetaRecord(traitId);
        uint256 nameOffset = _readUint16(record, 3);
        uint256 nameLength = uint8(record[5]);
        return string(_readBlob(BLOB_TRAIT_META, TRAIT_META_HEADER_SIZE + nameOffset, nameLength));
    }

    function traitIdByNameHash(bytes32 nameHash, uint8 kind)
        external
        view
        returns (uint16 traitId, bool exists)
    {
        if (kind > KIND_ACCESSORY) revert InvalidTraitId();
        uint16 traitIdPlusOne = _traitIdsByNameHash[nameHash][kind];
        if (traitIdPlusOne == 0) return (0, false);
        unchecked {
            return (traitIdPlusOne - 1, true);
        }
    }

    function traitKind(uint16 traitId) external view returns (uint8) {
        _requireTraitId(traitId);
        return uint8(_traitMetaRecord(traitId)[0]);
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
            BLOB_TRAIT_BITMAPS,
            (uint256(traitId) * TRAIT_WORD_COUNT + wordIndex) * 32
        );
    }

    function headVariantOf(uint16 punkId) external view returns (HeadVariant) {
        return HeadVariant(_scalarField(punkId, 40, 0xff));
    }

    function punkTypeOf(uint16 punkId) external view returns (PunkType) {
        return PunkType(_scalarField(punkId, 32, 0xff));
    }

    function attributeCountOf(uint16 punkId) external view returns (uint8) {
        return uint8(_scalarField(punkId, 24, 0xff));
    }

    function colorCount() public view returns (uint16) {
        return uint16(_blobLength(BLOB_PALETTE) / 4);
    }

    function colorOf(uint8 colorId) external view returns (bytes4 rgba) {
        _requireColorId(colorId);
        bytes memory data = _readBlob(BLOB_PALETTE, uint256(colorId) * 4, 4);
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
        return uint16(_scalarField(punkId, 0, 0xffff));
    }

    function colorCountOf(uint16 punkId) external view returns (uint8) {
        return uint8(_scalarField(punkId, 16, 0xff));
    }

    function colorBitmapWord(uint8 colorId, uint8 wordIndex) external view returns (uint256) {
        _requireColorId(colorId);
        _requireWordIndex(wordIndex);
        return _readBitmapWord(
            BLOB_COLOR_BITMAPS,
            (uint256(colorId) * TRAIT_WORD_COUNT + wordIndex) * 32
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
            BLOB_PIXEL_COUNT_BITMAPS,
            (uint256(pixelCount) - PIXEL_COUNT_MIN) * TRAIT_WORD_COUNT * 32
                + uint256(wordIndex) * 32
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
            BLOB_COLOR_COUNT_BITMAPS,
            (uint256(count) - COLOR_COUNT_MIN) * TRAIT_WORD_COUNT * 32
                + uint256(wordIndex) * 32
        );
    }

    function indexedPixelsOf(uint16 punkId) external view returns (bytes memory) {
        return _indexedPixelsOf(punkId);
    }

    function colorAt(uint16 punkId, uint8 x, uint8 y) external view returns (uint8 colorId) {
        if (x >= 24 || y >= 24) revert InvalidCoordinate();
        bytes memory pixels = _indexedPixelsOf(punkId);
        return uint8(pixels[uint256(y) * 24 + x]);
    }

    function paletteRgbBytes() external view returns (bytes memory rgb) {
        bytes memory rgba = _readBlob(BLOB_PALETTE, 0, _blobLength(BLOB_PALETTE));
        uint256 count = rgba.length / 4;
        rgb = new bytes(count * 3);
        for (uint256 i; i < count;) {
            uint256 src = i * 4;
            uint256 dst = i * 3;
            rgb[dst] = rgba[src];
            rgb[dst + 1] = rgba[src + 1];
            rgb[dst + 2] = rgba[src + 2];
            unchecked {
                ++i;
            }
        }
    }

    function paletteAlphaBytes() external view returns (bytes memory alpha) {
        bytes memory rgba = _readBlob(BLOB_PALETTE, 0, _blobLength(BLOB_PALETTE));
        uint256 count = rgba.length / 4;
        alpha = new bytes(count);
        for (uint256 i; i < count;) {
            alpha[i] = rgba[i * 4 + 3];
            unchecked {
                ++i;
            }
        }
    }

    function paletteRgbaBytes() external view returns (bytes memory) {
        return _readBlob(BLOB_PALETTE, 0, _blobLength(BLOB_PALETTE));
    }

    function _traitMaskOf(uint16 punkId) private view returns (uint256) {
        _requirePunkId(punkId);
        uint256 packed = _traitMaskPairs[punkId >> 1];
        if (punkId & 1 == 0) return uint128(packed);
        return packed >> 128;
    }

    function _indexedPixelsOf(uint16 punkId) private view returns (bytes memory pixels) {
        _requirePunkId(punkId);
        uint256 start = _readUint24(BLOB_PIXEL_OFFSETS, uint256(punkId) * 3);
        uint256 end = _readUint24(BLOB_PIXEL_OFFSETS, (uint256(punkId) + 1) * 3);
        if (end <= start) revert MalformedPixelBlob();

        bytes memory entry = _readBlob(BLOB_COMPRESSED_PIXELS, start, end - start);
        if (entry.length < 73) revert MalformedPixelBlob();

        uint256 visibleColorCount = uint8(entry[0]);
        if (visibleColorCount == 0 || entry.length < 73 + visibleColorCount) {
            revert MalformedPixelBlob();
        }
        uint256 paletteCount = colorCount();
        if (paletteCount == 0 || visibleColorCount > paletteCount - 1) {
            revert MalformedPixelBlob();
        }

        uint256 bitsPerIndex = _bitsForPalette(visibleColorCount);
        uint256 indexesOffset = 73 + visibleColorCount;
        uint256 visibleIndex;
        uint256 bitOffset;
        pixels = new bytes(576);

        for (uint256 pixelIndex; pixelIndex < 576;) {
            if (_visibleBitmapAt(entry, pixelIndex)) {
                uint256 localIndex;
                if (bitsPerIndex != 0) {
                    localIndex = _readBits(entry, indexesOffset, bitOffset, bitsPerIndex);
                    bitOffset += bitsPerIndex;
                }
                if (localIndex >= visibleColorCount) revert MalformedPixelBlob();
                uint8 paletteId = uint8(entry[73 + localIndex]);
                if (paletteId == 0 || paletteId >= paletteCount) revert MalformedPixelBlob();
                pixels[pixelIndex] = bytes1(paletteId);
                unchecked {
                    ++visibleIndex;
                }
            }
            unchecked {
                ++pixelIndex;
            }
        }

        uint256 expectedIndexBytes = (bitOffset + 7) >> 3;
        if (entry.length != indexesOffset + expectedIndexBytes || visibleIndex == 0) {
            revert MalformedPixelBlob();
        }
    }

    function _visibleBitmapAt(bytes memory entry, uint256 pixelIndex)
        private
        pure
        returns (bool)
    {
        uint8 bitmapByte = uint8(entry[1 + (pixelIndex >> 3)]);
        uint8 bit = uint8(1 << (7 - (pixelIndex & 7)));
        return bitmapByte & bit != 0;
    }

    function _readBits(
        bytes memory data,
        uint256 byteOffset,
        uint256 bitOffset,
        uint256 bitLength
    ) private pure returns (uint256 value) {
        for (uint256 i; i < bitLength;) {
            uint256 absoluteBit = bitOffset + i;
            uint256 byteIndex = byteOffset + (absoluteBit >> 3);
            if (byteIndex >= data.length) revert MalformedPixelBlob();
            uint8 current = uint8(data[byteIndex]);
            uint256 bit = (current >> (7 - (absoluteBit & 7))) & 1;
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
        return _readBlob(BLOB_TRAIT_META, uint256(traitId) * TRAIT_META_RECORD_SIZE, 6);
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
            uint256 pixelCount = scalar & 0xffff;
            uint256 colorCountValue = (scalar >> 16) & 0xff;
            uint256 attributeCount = (scalar >> 24) & 0xff;
            uint256 punkType = (scalar >> 32) & 0xff;
            uint256 headVariant = (scalar >> 40) & 0xff;
            if (
                pixelCount < PIXEL_COUNT_MIN || pixelCount > PIXEL_COUNT_MAX
                    || colorCountValue < COLOR_COUNT_MIN || colorCountValue > COLOR_COUNT_MAX
                    || attributeCount > 7 || punkType > uint8(PunkType.Zombie)
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

    function _readBitmapWord(uint8 blobId, uint256 offset) private view returns (uint256 value) {
        bytes memory data = _readBlob(blobId, offset, 32);
        assembly ("memory-safe") {
            value := mload(add(data, 0x20))
        }
    }

    function _readUint24(uint8 blobId, uint256 offset) private view returns (uint256) {
        bytes memory data = _readBlob(blobId, offset, 3);
        return (uint256(uint8(data[0])) << 16) | (uint256(uint8(data[1])) << 8)
            | uint8(data[2]);
    }

    function _readUint16(bytes memory data, uint256 offset) private pure returns (uint16) {
        return (uint16(uint8(data[offset])) << 8) | uint8(data[offset + 1]);
    }

    function _readBlob(uint8 blobId, uint256 offset, uint256 length)
        private
        view
        returns (bytes memory out)
    {
        address[] storage chunks = _blobChunks[blobId];
        out = new bytes(length);

        uint256 remainingOffset = offset;
        uint256 copied;
        for (uint256 i; i < chunks.length;) {
            uint256 chunkLength = chunks[i].dataSize();
            if (remainingOffset >= chunkLength) {
                remainingOffset -= chunkLength;
            } else {
                uint256 copyLength = chunkLength - remainingOffset;
                uint256 remainingLength = length - copied;
                if (copyLength > remainingLength) copyLength = remainingLength;

                bytes memory part = chunks[i].read(remainingOffset, copyLength);
                _copyBytes(part, out, copied, copyLength);
                copied += copyLength;
                if (copied == length) return out;
                remainingOffset = 0;
            }
            unchecked {
                ++i;
            }
        }
        revert BlobReadOutOfBounds(blobId, offset, length);
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

    function _blobLength(uint8 blobId) private view returns (uint256 length) {
        address[] storage chunks = _blobChunks[blobId];
        for (uint256 i; i < chunks.length;) {
            length += chunks[i].dataSize();
            unchecked {
                ++i;
            }
        }
    }

    function _requireBlobLength(uint8 blobId, uint256 expected) private view {
        if (_blobLength(blobId) != expected) revert InvalidLength();
    }

    function _requireBlobId(uint8 blobId) private pure {
        if (blobId < BLOB_TRAIT_BITMAPS || blobId > BLOB_COLOR_COUNT_BITMAPS) {
            revert InvalidBlobId();
        }
    }

    function _requirePunkId(uint16 punkId) private pure {
        if (punkId >= PUNK_COUNT) revert InvalidPunkId();
    }

    function _requireTraitId(uint16 traitId) private pure {
        if (traitId >= TRAIT_COUNT) revert InvalidTraitId();
    }

    function _requireColorId(uint8 colorId) private view {
        if (colorId >= colorCount()) revert InvalidColorId();
    }

    function _requireWordIndex(uint8 wordIndex) private pure {
        if (wordIndex >= TRAIT_WORD_COUNT) revert InvalidWordIndex();
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
