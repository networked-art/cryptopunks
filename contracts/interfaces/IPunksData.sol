// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title IPunksDataTypes
/// @notice Shared loader/read types for the Punk data contract family.
interface IPunksDataTypes {
    /// @notice Identifiers for the variable-length blob storage.
    /// @dev The four bitmap blobs (TraitBitmaps, ColorBitmaps, PixelCountBitmaps,
    ///      ColorCountBitmaps) share a row-major layout: each row spans
    ///      `BITMAP_WORD_COUNT * 32` bytes, and `(row, wordIndex)` maps to byte
    ///      offset `(row * BITMAP_WORD_COUNT + wordIndex) * 32`. Rows are indexed
    ///      by traitId / colorId / pixelCount-offset / colorCount-offset
    ///      respectively. Each bit position within the row corresponds to a punkId.
    enum BlobId {
        TraitBitmaps,
        TraitMeta,
        Palette,
        PixelOffsets,
        CompressedPixels,
        ColorBitmaps,
        PixelCountBitmaps,
        ColorCountBitmaps
    }
}

/// @title IPunksDataErrors
/// @notice Shared custom errors for loader and read surfaces.
interface IPunksDataErrors is IPunksDataTypes {
    error ZeroAddress();
    error NotAdmin();
    error AlreadySealed();
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
    error MalformedPixelBlob();
}

/// @title IPunksDataLoader
/// @notice Loader types, events, errors, and write API for staging and sealing Punk data.
interface IPunksDataLoader is IPunksDataErrors {
    struct DatasetCommitment {
        bytes32 traitCatalogHash;
        bytes32 punkMaskHash;
        bytes32 paletteHash;
        bytes32 indexedPixelsHash;
        bytes32 compressedPixelsHash;
    }

    event DatasetCommitted(
        bytes32 traitCatalogHash,
        bytes32 punkMaskHash,
        bytes32 paletteHash,
        bytes32 indexedPixelsHash,
        bytes32 compressedPixelsHash,
        bytes32 datasetHash
    );

    function admin() external view returns (address);

    /// @notice True after `seal` has been called; the loader is permanently locked.
    function isSealed() external view returns (bool);

    function loadTraitMaskPairs(uint16 startPairIndex, uint256[] calldata packedPairs) external;

    function loadColorMasks(uint16 startPunkId, uint256[] calldata masks) external;

    function loadPackedScalars(uint16 startWordIndex, uint256[] calldata words) external;

    function loadColorSupplies(uint8 startColorId, uint32[] calldata supplies) external;

    function loadBlobChunk(BlobId blobId, uint16 chunkIndex, bytes calldata data) external;

    function seal(DatasetCommitment calldata commitment) external;
}

interface IPunksDataCriteria {
    enum PunkType {
        Alien,
        Ape,
        Female,
        Male,
        Zombie
    }

    enum HeadVariant {
        Alien,
        Ape,
        Female1,
        Female2,
        Female3,
        Female4,
        Male1,
        Male2,
        Male3,
        Male4,
        Zombie
    }

    enum TraitKind {
        HeadVariant,
        NormalizedType,
        AttributeCount,
        Accessory
    }

    function datasetHash() external view returns (bytes32);
    function traitCount() external pure returns (uint16);

    function traitName(uint16 traitId) external view returns (string memory);
    function traitKind(uint16 traitId) external view returns (TraitKind);
    function traitSupply(uint16 traitId) external view returns (uint16);
    function isValidTraitId(uint16 traitId) external pure returns (bool);

    function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool);
    function traitMaskOf(uint16 punkId) external view returns (uint256);
    function hasTraits(
        uint16 punkId,
        uint256 requiredMask,
        uint256 forbiddenMask,
        uint256 anyOfMask
    ) external view returns (bool);

    function traitBitmapWord(uint16 traitId, uint8 wordIndex)
        external
        view
        returns (uint256);

    function headVariantOf(uint16 punkId) external view returns (HeadVariant);
    function punkTypeOf(uint16 punkId) external view returns (PunkType);
    function attributeCountOf(uint16 punkId) external view returns (uint8);
}

interface IPunksDataVisual {
    /// @notice Size of the palette index space. Index 0 is reserved for transparency.
    function paletteSize() external view returns (uint16);
    function colorOf(uint8 colorId) external view returns (bytes4 rgba);
    function colorSupply(uint8 colorId) external view returns (uint32 pixels);

    function colorMaskOf(uint16 punkId) external view returns (uint256);
    /// @notice Returns false for `colorId == 0`; transparency is never recorded in the mask.
    function hasColor(uint16 punkId, uint8 colorId) external view returns (bool);
    function pixelCountOf(uint16 punkId) external view returns (uint16);
    function colorCountOf(uint16 punkId) external view returns (uint8);

    function colorBitmapWord(uint8 colorId, uint8 wordIndex)
        external
        view
        returns (uint256);
    function pixelCountBitmapWord(uint16 pixelCount, uint8 wordIndex)
        external
        view
        returns (uint256);
    function colorCountBitmapWord(uint8 colorCount, uint8 wordIndex)
        external
        view
        returns (uint256);
}

interface IPunksDataIndexed {
    function indexedPixelsOf(uint16 punkId) external view returns (bytes memory);
    function colorAt(uint16 punkId, uint8 x, uint8 y) external view returns (uint8 colorId);

    function paletteRgbBytes() external view returns (bytes memory);
    function paletteAlphaBytes() external view returns (bytes memory);
    function paletteRgbaBytes() external view returns (bytes memory);
}

/// @title IPunksData
/// @notice Full public ABI for loading, sealing, and reading Punk data.
interface IPunksData is
    IPunksDataLoader,
    IPunksDataCriteria,
    IPunksDataVisual,
    IPunksDataIndexed
{}
