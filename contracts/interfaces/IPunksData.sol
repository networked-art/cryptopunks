// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

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
    function colorCount() external view returns (uint16);
    function colorOf(uint8 colorId) external view returns (bytes4 rgba);
    function colorSupply(uint8 colorId) external view returns (uint32 pixels);

    function colorMaskOf(uint16 punkId) external view returns (uint256);
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
