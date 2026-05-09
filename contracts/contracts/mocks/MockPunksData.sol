// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/IPunksData.sol";

/// @notice Mock of the PunksData slice consumed by the offer matcher.
/// @dev Implements just the criteria + visual surface used by `Offers`.
///      All other interface methods revert `Unimplemented`.
contract MockPunksData is IPunksDataErrors, IPunksDataCriteria, IPunksDataVisual {
    /// @notice Hardcoded trait bit count, mirrors the production dataset.
    uint16 internal constant TRAIT_COUNT = 111;
    uint256 internal constant CANONICAL_TRAIT_MASK = (uint256(1) << TRAIT_COUNT) - 1;

    /// @notice Returns the trait mask set for a Punk.
    mapping(uint16 => uint256) public override traitMaskOf;
    /// @notice Returns the color count set for a Punk.
    mapping(uint16 => uint8) public override colorCountOf;

    error Unimplemented();

    /// @notice Sets the full trait mask for a Punk.
    function setTraitMask(uint16 punkId, uint256 mask) external {
        traitMaskOf[punkId] = mask;
    }

    /// @notice Sets the color count for a Punk.
    function setColorCount(uint16 punkId, uint8 cc) external {
        colorCountOf[punkId] = cc;
    }

    /// @notice Returns the number of supported traits.
    function traitCount() external pure override returns (uint16) {
        return TRAIT_COUNT;
    }

    /// @notice Checks whether a trait id is in range.
    function isValidTraitId(uint16 traitId) external pure override returns (bool) {
        return traitId < TRAIT_COUNT;
    }

    /// @notice Checks whether a Punk has a trait.
    function hasTrait(uint16 punkId, uint16 traitId) external view override returns (bool) {
        if (traitId >= TRAIT_COUNT) revert InvalidTraitId();
        return (traitMaskOf[punkId] & (uint256(1) << traitId)) != 0;
    }

    /// @notice Checks whether a Punk matches a group of trait rules.
    function hasTraits(
        uint16 punkId,
        uint256 requiredMask,
        uint256 forbiddenMask,
        uint256 anyOfMask
    ) external view override returns (bool) {
        if (
            (requiredMask & ~CANONICAL_TRAIT_MASK) != 0
                || (forbiddenMask & ~CANONICAL_TRAIT_MASK) != 0
                || (anyOfMask & ~CANONICAL_TRAIT_MASK) != 0
                || (requiredMask & forbiddenMask) != 0
                || (forbiddenMask & anyOfMask) != 0
        ) revert InvalidMask();
        uint256 mask = traitMaskOf[punkId];
        return (mask & requiredMask) == requiredMask
            && (mask & forbiddenMask) == 0
            && (anyOfMask == 0 || (mask & anyOfMask) != 0);
    }

    // Unimplemented criteria methods.

    function datasetHash() external pure override returns (bytes32) {
        revert Unimplemented();
    }

    function traitName(uint16) external pure override returns (string memory) {
        revert Unimplemented();
    }

    function traitKind(uint16) external pure override returns (TraitKind) {
        revert Unimplemented();
    }

    function traitSupply(uint16) external pure override returns (uint16) {
        revert Unimplemented();
    }

    function traitBitmapWord(uint16, uint8) external pure override returns (uint256) {
        revert Unimplemented();
    }

    function headVariantOf(uint16) external pure override returns (HeadVariant) {
        revert Unimplemented();
    }

    function punkTypeOf(uint16) external pure override returns (PunkType) {
        revert Unimplemented();
    }

    function attributeCountOf(uint16) external pure override returns (uint8) {
        revert Unimplemented();
    }

    // Unimplemented visual methods.

    function paletteSize() external pure override returns (uint16) {
        revert Unimplemented();
    }

    function colorOf(uint8) external pure override returns (bytes4) {
        revert Unimplemented();
    }

    function colorSupply(uint8) external pure override returns (uint32) {
        revert Unimplemented();
    }

    function colorMaskOf(uint16) external pure override returns (uint256) {
        revert Unimplemented();
    }

    function hasColor(uint16, uint8) external pure override returns (bool) {
        revert Unimplemented();
    }

    function pixelCountOf(uint16) external pure override returns (uint16) {
        revert Unimplemented();
    }

    function colorBitmapWord(uint8, uint8) external pure override returns (uint256) {
        revert Unimplemented();
    }

    function pixelCountBitmapWord(uint16, uint8) external pure override returns (uint256) {
        revert Unimplemented();
    }

    function colorCountBitmapWord(uint8, uint8) external pure override returns (uint256) {
        revert Unimplemented();
    }
}
