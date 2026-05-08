// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./interfaces/IPunksData.sol";
import "./lib/BlobStorage.sol";

/// @title  PunksDataLoader
/// @notice Write-side mixin for loading and sealing the punks data blobs.
/// @dev    One-shot lifecycle: an `admin` loads chunks until `seal` flips
///         `isSealed`, after which all loader entrypoints revert with
///         `AlreadySealed`. The original admin address is preserved as an
///         audit trail and remains queryable via `admin()`.
abstract contract PunksDataLoader is IPunksDataLoader {
    using BlobStorage for BlobStorage.Chunk[];

    // -----------------------------------------------------------------
    // Dataset shape
    // -----------------------------------------------------------------
    uint16 internal constant PUNK_COUNT = 10_000;
    uint16 internal constant TRAIT_COUNT = 111;
    uint16 internal constant PALETTE_SIZE = 222;
    uint8 internal constant PUNK_WIDTH = 24;
    uint8 internal constant PUNK_HEIGHT = 24;
    uint16 internal constant PIXELS_PER_PUNK = 576;

    // -----------------------------------------------------------------
    // Trait meta record (per-trait, packed binary):
    //   kind:uint8 | supply:uint16 BE | nameOffset:uint16 BE | nameLength:uint8
    // The `TRAIT_META_HEADER_SIZE`-byte record array is followed by a
    // name pool addressable via (nameOffset, nameLength).
    // -----------------------------------------------------------------
    uint256 internal constant TRAIT_META_RECORD_SIZE = 6;
    uint256 internal constant TRAIT_META_KIND_OFFSET = 0;
    uint256 internal constant TRAIT_META_SUPPLY_OFFSET = 1;
    uint256 internal constant TRAIT_META_NAME_OFFSET_FIELD = 3;
    uint256 internal constant TRAIT_META_NAME_LENGTH_OFFSET = 5;
    uint256 internal constant TRAIT_META_HEADER_SIZE =
        uint256(TRAIT_COUNT) * TRAIT_META_RECORD_SIZE;

    // -----------------------------------------------------------------
    // Packed scalar layout: 5 scalars of 48 bits each, packed in a uint256.
    //   bits  0-15  pixelCount
    //   bits 16-23  colorCount
    //   bits 24-31  attributeCount
    //   bits 32-39  punkType
    //   bits 40-47  headVariant
    // -----------------------------------------------------------------
    uint256 internal constant SCALAR_BITS = 48;
    uint256 internal constant SCALARS_PER_WORD = 5;
    uint256 internal constant SCALAR_MASK = (uint256(1) << SCALAR_BITS) - 1;
    uint256 internal constant PIXEL_COUNT_SHIFT = 0;
    uint256 internal constant COLOR_COUNT_SHIFT = 16;
    uint256 internal constant ATTRIBUTE_COUNT_SHIFT = 24;
    uint256 internal constant PUNK_TYPE_SHIFT = 32;
    uint256 internal constant HEAD_VARIANT_SHIFT = 40;

    // -----------------------------------------------------------------
    // Packed scalar field bounds
    // -----------------------------------------------------------------
    uint16 internal constant PIXEL_COUNT_MIN = 148;
    uint16 internal constant PIXEL_COUNT_MAX = 332;
    uint8 internal constant COLOR_COUNT_MIN = 2;
    uint8 internal constant COLOR_COUNT_MAX = 14;
    uint256 internal constant MAX_ATTRIBUTE_COUNT = 7;

    // -----------------------------------------------------------------
    // Bitmap row layout: shared by TraitBitmaps, ColorBitmaps,
    // PixelCountBitmaps, ColorCountBitmaps. `(row, wordIndex)` indexes
    // byte offset `(row * BITMAP_WORD_COUNT + wordIndex) * WORD_BYTES`.
    // -----------------------------------------------------------------
    uint16 internal constant BITMAP_WORD_COUNT = 40;
    uint256 internal constant WORD_BYTES = 32;

    // -----------------------------------------------------------------
    // Palette layout (RGBA bytes per color)
    // -----------------------------------------------------------------
    uint256 internal constant PALETTE_RGBA_BYTES_PER_COLOR = 4;
    uint256 internal constant PALETTE_RGB_BYTES_PER_COLOR = 3;

    // -----------------------------------------------------------------
    // Pixel offsets: uint24 BE per punk + 1 sentinel, indexing into
    // CompressedPixels.
    // -----------------------------------------------------------------
    uint256 internal constant PIXEL_OFFSET_BYTES = 3;

    // -----------------------------------------------------------------
    // Compressed pixel entry (per punk, variable-length):
    //   visibleColorCount:uint8
    //   visibleBitmap[VISIBLE_BITMAP_BYTES]
    //   localPalette[visibleColorCount]   palette ids in [1, PALETTE_SIZE)
    //   packedLocalIndexes                ceil(visiblePixels * bitsPerIndex / 8) bytes
    // -----------------------------------------------------------------
    uint256 internal constant BITS_PER_BYTE = 8;
    uint256 internal constant VISIBLE_BITMAP_BYTES = uint256(PIXELS_PER_PUNK) / BITS_PER_BYTE;
    uint256 internal constant COMPRESSED_PIXEL_HEADER_SIZE = 1 + VISIBLE_BITMAP_BYTES;

    // -----------------------------------------------------------------
    // Bit masks
    // -----------------------------------------------------------------
    uint256 internal constant UINT8_MASK = 0xff;
    uint256 internal constant UINT16_MASK = 0xffff;
    uint256 internal constant CANONICAL_TRAIT_MASK = (uint256(1) << TRAIT_COUNT) - 1;
    uint256 internal constant CANONICAL_COLOR_MASK = (uint256(1) << PALETTE_SIZE) - 1;

    // -----------------------------------------------------------------
    // Canonical blob lengths verified at seal time
    // -----------------------------------------------------------------
    uint256 internal constant TRAIT_BITMAPS_BYTES =
        uint256(TRAIT_COUNT) * BITMAP_WORD_COUNT * WORD_BYTES;
    uint256 internal constant PALETTE_BYTES =
        uint256(PALETTE_SIZE) * PALETTE_RGBA_BYTES_PER_COLOR;
    uint256 internal constant PIXEL_OFFSETS_BYTES =
        (uint256(PUNK_COUNT) + 1) * PIXEL_OFFSET_BYTES;
    uint256 internal constant COLOR_BITMAPS_BYTES =
        uint256(PALETTE_SIZE) * BITMAP_WORD_COUNT * WORD_BYTES;
    uint256 internal constant PIXEL_COUNT_BITMAPS_BYTES =
        (uint256(PIXEL_COUNT_MAX) - PIXEL_COUNT_MIN + 1) * BITMAP_WORD_COUNT * WORD_BYTES;
    uint256 internal constant COLOR_COUNT_BITMAPS_BYTES =
        (uint256(COLOR_COUNT_MAX) - COLOR_COUNT_MIN + 1) * BITMAP_WORD_COUNT * WORD_BYTES;

    // -----------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------
    /// @notice Returns the account that can load and seal the data.
    address public admin;
    /// @notice Returns true after the data has been sealed.
    bool public isSealed;
    bytes32 internal _datasetHash;

    mapping(uint16 pairIndex => uint256 packedMasks) internal _traitMaskPairs;
    mapping(uint16 punkId => uint256 mask) internal _colorMasks;
    mapping(uint256 wordIndex => uint256 packedScalars) internal _packedScalarWords;
    mapping(uint8 colorId => uint32 pixels) internal _colorSupplies;
    mapping(BlobId blobId => BlobStorage.Chunk[] chunks) internal _blobs;

    modifier whenUnsealed() {
        if (isSealed) revert AlreadySealed();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    /// @notice Sets the first data loader admin.
    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert ZeroAddress();
        admin = initialAdmin;
    }

    /// @notice Loads packed trait masks for a range of Punks.
    function loadTraitMaskPairs(uint16 startPairIndex, uint256[] calldata packedPairs)
        external
        whenUnsealed
        onlyAdmin
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

    /// @notice Loads color masks for a range of Punks.
    function loadColorMasks(uint16 startPunkId, uint256[] calldata masks)
        external
        whenUnsealed
        onlyAdmin
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

    /// @notice Loads packed image summary data for a range of Punks.
    function loadPackedScalars(uint16 startWordIndex, uint256[] calldata words)
        external
        whenUnsealed
        onlyAdmin
    {
        uint256 len = words.length;
        if (uint256(startWordIndex) + len > _scalarWordCount()) revert InvalidLength();

        for (uint256 i; i < len;) {
            uint256 word = words[i];
            _validateScalarWord(word);
            _packedScalarWords[uint256(startWordIndex) + i] = word;
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Loads total pixel counts for a range of palette colors.
    function loadColorSupplies(uint8 startColorId, uint32[] calldata supplies)
        external
        whenUnsealed
        onlyAdmin
    {
        uint256 len = supplies.length;
        if (uint256(startColorId) + len > PALETTE_SIZE) revert InvalidLength();

        for (uint256 i; i < len;) {
            _colorSupplies[uint8(uint256(startColorId) + i)] = supplies[i];
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Loads one chunk of a data blob.
    function loadBlobChunk(BlobId blobId, uint16 chunkIndex, bytes calldata data)
        external
        whenUnsealed
        onlyAdmin
    {
        _blobs[blobId].append(chunkIndex, data);
    }

    /// @notice Seals the data set so it can no longer be changed.
    function seal(DatasetCommitment calldata commitment) external whenUnsealed onlyAdmin {
        _requireNonZeroCommitment(commitment);
        _requireDatasetShape();

        bytes32 committedDatasetHash = _commitmentHash(commitment);
        _datasetHash = committedDatasetHash;
        isSealed = true;

        emit DatasetCommitted(
            commitment.traitCatalogHash,
            commitment.punkMaskHash,
            commitment.paletteHash,
            commitment.indexedPixelsHash,
            commitment.compressedPixelsHash,
            committedDatasetHash
        );
    }

    function _requireNonZeroCommitment(DatasetCommitment calldata commitment) private pure {
        if (
            commitment.traitCatalogHash == bytes32(0) || commitment.punkMaskHash == bytes32(0)
                || commitment.paletteHash == bytes32(0)
                || commitment.indexedPixelsHash == bytes32(0)
                || commitment.compressedPixelsHash == bytes32(0)
        ) revert InvalidHash();
    }

    function _requireDatasetShape() private view {
        _requireBlobLength(BlobId.TraitBitmaps, TRAIT_BITMAPS_BYTES);
        if (_blobs[BlobId.TraitMeta].totalLength() < TRAIT_META_HEADER_SIZE) revert InvalidLength();
        _requireBlobLength(BlobId.Palette, PALETTE_BYTES);
        _requireBlobLength(BlobId.PixelOffsets, PIXEL_OFFSETS_BYTES);
        if (_blobs[BlobId.CompressedPixels].totalLength() == 0) revert InvalidLength();
        _requireBlobLength(BlobId.ColorBitmaps, COLOR_BITMAPS_BYTES);
        _requireBlobLength(BlobId.PixelCountBitmaps, PIXEL_COUNT_BITMAPS_BYTES);
        _requireBlobLength(BlobId.ColorCountBitmaps, COLOR_COUNT_BITMAPS_BYTES);
    }

    function _requireBlobLength(BlobId blobId, uint256 expected) private view {
        if (_blobs[blobId].totalLength() != expected) revert InvalidLength();
    }

    function _commitmentHash(DatasetCommitment calldata commitment)
        private
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                commitment.traitCatalogHash,
                commitment.punkMaskHash,
                commitment.paletteHash,
                commitment.indexedPixelsHash,
                commitment.compressedPixelsHash
            )
        );
    }

    function _validateScalarWord(uint256 word) private pure {
        if (word >> (SCALARS_PER_WORD * SCALAR_BITS) != 0) revert InvalidScalar();
        for (uint256 i; i < SCALARS_PER_WORD;) {
            uint256 scalar = (word >> (i * SCALAR_BITS)) & SCALAR_MASK;
            _requireValidScalar(scalar);
            unchecked {
                ++i;
            }
        }
    }

    function _requireValidScalar(uint256 scalar) private pure {
        uint256 pixelCount = (scalar >> PIXEL_COUNT_SHIFT) & UINT16_MASK;
        uint256 colorCountValue = (scalar >> COLOR_COUNT_SHIFT) & UINT8_MASK;
        uint256 attributeCount = (scalar >> ATTRIBUTE_COUNT_SHIFT) & UINT8_MASK;
        uint256 punkType = (scalar >> PUNK_TYPE_SHIFT) & UINT8_MASK;
        uint256 headVariant = (scalar >> HEAD_VARIANT_SHIFT) & UINT8_MASK;
        if (
            pixelCount < PIXEL_COUNT_MIN || pixelCount > PIXEL_COUNT_MAX
                || colorCountValue < COLOR_COUNT_MIN || colorCountValue > COLOR_COUNT_MAX
                || attributeCount > MAX_ATTRIBUTE_COUNT
                || punkType > uint8(IPunksDataCriteria.PunkType.Zombie)
                || headVariant > uint8(IPunksDataCriteria.HeadVariant.Zombie)
        ) revert InvalidScalar();
    }

    function _scalarWordCount() private pure returns (uint256) {
        return (uint256(PUNK_COUNT) + SCALARS_PER_WORD - 1) / SCALARS_PER_WORD;
    }
}
