// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  IPunksDataTypes
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
    error NotOwner();
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

    /// @notice Returns the account that can load, name, and seal the data before seal.
    function owner() external view returns (address);

    /// @notice True after `seal` has been called; the loader is permanently locked.
    function isSealed() external view returns (bool);

    /// @notice Loads packed trait masks for a range of Punks.
    function loadTraitMaskPairs(uint16 startPairIndex, uint256[] calldata packedPairs) external;

    /// @notice Loads color masks for a range of Punks.
    function loadColorMasks(uint16 startPunkId, uint256[] calldata masks) external;

    /// @notice Loads packed image summary data for a range of Punks.
    function loadPackedScalars(uint16 startWordIndex, uint256[] calldata words) external;

    /// @notice Loads total pixel counts for a range of palette colors.
    function loadColorSupplies(uint8 startColorId, uint32[] calldata supplies) external;

    /// @notice Loads one chunk of a data blob.
    function loadBlobChunk(BlobId blobId, uint16 chunkIndex, bytes calldata data) external;

    /// @notice Seals the data set so it can no longer be changed.
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

    /// @notice Returns the hash of the sealed Punk data set.
    function datasetHash() external view returns (bytes32);
    /// @notice Returns the number of supported traits.
    function traitCount() external pure returns (uint16);

    /// @notice Returns the display name for a trait.
    function traitName(uint16 traitId) external view returns (string memory);
    /// @notice Returns the kind of trait.
    function traitKind(uint16 traitId) external view returns (TraitKind);
    /// @notice Returns how many Punks have a trait.
    function traitSupply(uint16 traitId) external view returns (uint16);
    /// @notice Checks whether a trait id is in range.
    function isValidTraitId(uint16 traitId) external pure returns (bool);

    /// @notice Checks whether a Punk has a trait.
    function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool);
    /// @notice Returns the full trait mask for a Punk.
    function traitMaskOf(uint16 punkId) external view returns (uint256);
    /// @notice Checks whether a Punk matches a group of trait rules.
    function hasTraits(
        uint16 punkId,
        uint256 requiredMask,
        uint256 forbiddenMask,
        uint256 anyOfMask
    ) external view returns (bool);

    /// @notice Returns one bitmap word for a trait.
    function traitBitmapWord(uint16 traitId, uint8 wordIndex)
        external
        view
        returns (uint256);

    /// @notice Returns the head variant for a Punk.
    function headVariantOf(uint16 punkId) external view returns (HeadVariant);
    /// @notice Returns the type for a Punk.
    function punkTypeOf(uint16 punkId) external view returns (PunkType);
    /// @notice Returns the number of attributes on a Punk.
    function attributeCountOf(uint16 punkId) external view returns (uint8);
}

interface IPunksDataVisual {
    /// @notice Size of the palette index space. Index 0 is reserved for transparency.
    function paletteSize() external view returns (uint16);
    /// @notice Returns a palette color as red, green, blue, and alpha bytes.
    function colorOf(uint8 colorId) external view returns (bytes4 rgba);
    /// @notice Returns how many visible pixels use a palette color.
    function colorSupply(uint8 colorId) external view returns (uint32 pixels);

    /// @notice Returns the full color mask for a Punk.
    function colorMaskOf(uint16 punkId) external view returns (uint256);
    /// @notice Returns false for `colorId == 0`; transparency is never recorded in the mask.
    function hasColor(uint16 punkId, uint8 colorId) external view returns (bool);
    /// @notice Returns the number of visible pixels in a Punk image.
    function pixelCountOf(uint16 punkId) external view returns (uint16);
    /// @notice Returns the number of palette colors used by a Punk.
    function colorCountOf(uint16 punkId) external view returns (uint8);

    /// @notice Returns one bitmap word for a palette color.
    function colorBitmapWord(uint8 colorId, uint8 wordIndex)
        external
        view
        returns (uint256);
    /// @notice Returns one bitmap word for a pixel count.
    function pixelCountBitmapWord(uint16 pixelCount, uint8 wordIndex)
        external
        view
        returns (uint256);
    /// @notice Returns one bitmap word for a color count.
    function colorCountBitmapWord(uint8 colorCount, uint8 wordIndex)
        external
        view
        returns (uint256);
}

interface IPunksDataIndexed {
    /// @notice Returns all palette indexes for one Punk image.
    function indexedPixelsOf(uint16 punkId) external view returns (bytes memory);
    /// @notice Returns the palette color id at one pixel.
    function colorAt(uint16 punkId, uint8 x, uint8 y) external view returns (uint8 colorId);

    /// @notice Returns the whole palette as red, green, and blue bytes.
    function paletteRgbBytes() external view returns (bytes memory);
    /// @notice Returns the alpha byte for every palette color.
    function paletteAlphaBytes() external view returns (bytes memory);
    /// @notice Returns the whole palette as red, green, blue, and alpha bytes.
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
