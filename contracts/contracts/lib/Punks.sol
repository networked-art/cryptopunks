// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/IPunksData.sol";

/// @title  Punks
///
/// @notice Build, validate, and evaluate trait/color/visual filters against
///         the sealed `PunksData` contract from another Solidity contract.
///
/// @dev    Validation mirrors `PunksData._requireCriteriaMasks` exactly so a
///         consumer can pre-flight a `Filter` without depending on PunksData
///         re-rejecting it at the predicate call. `matchesTraits` delegates
///         to `hasTraits` (PunksData does the validation server-side once);
///         `matchesColors` reads `colorMaskOf` and applies the boolean logic
///         locally because PunksData has no `hasColors` predicate.
///
/// @author 1001
library Punks {
    /// @notice Number of canonical traits in the sealed dataset.
    uint16 internal constant TRAIT_COUNT = 111;
    /// @notice Palette size including reserved index 0 (transparency).
    uint16 internal constant PALETTE_SIZE = 222;
    /// @notice Smallest visible-pixel count any Punk has.
    uint16 internal constant PIXEL_COUNT_MIN = 148;
    /// @notice Largest visible-pixel count any Punk has.
    uint16 internal constant PIXEL_COUNT_MAX = 332;
    /// @notice Smallest unique-color count any Punk has.
    uint8 internal constant COLOR_COUNT_MIN = 2;
    /// @notice Largest unique-color count any Punk has.
    uint8 internal constant COLOR_COUNT_MAX = 14;

    /// @notice Bit set covering every valid trait id.
    uint256 internal constant CANONICAL_TRAIT_MASK = (uint256(1) << TRAIT_COUNT) - 1;
    /// @notice Bit set covering every valid color id.
    uint256 internal constant CANONICAL_COLOR_MASK = (uint256(1) << PALETTE_SIZE) - 1;
    /// @notice Reserved transparent color bit; never set on a Punk's color mask.
    uint256 internal constant RESERVED_COLOR_BIT = 1;

    /// @notice Composite filter for matching one Punk across trait, color,
    ///         and visual-metric dimensions.
    /// @dev    For pixel and color count ranges, `max == 0` disables the
    ///         filter; setting `max == 0` requires `min == 0`.
    struct Filter {
        uint256 requiredTraitMask;
        uint256 forbiddenTraitMask;
        uint256 anyOfTraitMask;
        uint256 requiredColorMask;
        uint256 forbiddenColorMask;
        uint256 anyOfColorMask;
        uint16 minPixelCount;
        uint16 maxPixelCount;
        uint8 minColorCount;
        uint8 maxColorCount;
    }

    error InvalidTraitId();
    error InvalidColorId();
    error InvalidTraitMask();
    error InvalidColorMask();
    error InvalidPixelCountRange();
    error InvalidColorCountRange();

    // ------------------ Mask builders ------------------

    /// @notice Builds a trait mask from a list of trait ids.
    function traitMask(uint16[] memory ids) internal pure returns (uint256 mask) {
        uint256 len = ids.length;
        for (uint256 i; i < len;) {
            uint16 id = ids[i];
            if (id >= TRAIT_COUNT) revert InvalidTraitId();
            mask |= uint256(1) << id;
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Checks whether a trait mask contains a trait id.
    function containsTrait(uint256 mask, uint16 id) internal pure returns (bool) {
        if (id >= TRAIT_COUNT) revert InvalidTraitId();
        return (mask & (uint256(1) << id)) != 0;
    }

    /// @notice Builds a color mask from a list of color ids.
    /// @dev    Color id 0 is reserved for transparency and is rejected.
    function colorMask(uint8[] memory ids) internal pure returns (uint256 mask) {
        uint256 len = ids.length;
        for (uint256 i; i < len;) {
            uint8 id = ids[i];
            if (id == 0 || id >= PALETTE_SIZE) revert InvalidColorId();
            mask |= uint256(1) << id;
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Checks whether a color mask contains a color id.
    /// @dev    Color id 0 is reserved for transparency and is rejected.
    function containsColor(uint256 mask, uint8 id) internal pure returns (bool) {
        if (id == 0 || id >= PALETTE_SIZE) revert InvalidColorId();
        return (mask & (uint256(1) << id)) != 0;
    }

    // ------------------ Validators ------------------

    /// @notice Validates a trio of trait masks against the canonical bit space.
    /// @dev    Mirrors `PunksData._requireCriteriaMasks`. Allows
    ///         `required & anyOf` overlap (PunksData does too).
    function validateTraitMasks(
        uint256 requiredMask,
        uint256 forbiddenMask,
        uint256 anyOfMask
    ) internal pure {
        if (
            (requiredMask & ~CANONICAL_TRAIT_MASK) != 0
                || (forbiddenMask & ~CANONICAL_TRAIT_MASK) != 0
                || (anyOfMask & ~CANONICAL_TRAIT_MASK) != 0
                || (requiredMask & forbiddenMask) != 0
                || (forbiddenMask & anyOfMask) != 0
        ) revert InvalidTraitMask();
    }

    /// @notice Validates a trio of color masks against the canonical bit space.
    /// @dev    Bit 0 (transparency) is rejected in any of the three masks,
    ///         since it is never set on a Punk's color mask.
    function validateColorMasks(
        uint256 requiredMask,
        uint256 forbiddenMask,
        uint256 anyOfMask
    ) internal pure {
        if (
            (requiredMask & ~CANONICAL_COLOR_MASK) != 0
                || (forbiddenMask & ~CANONICAL_COLOR_MASK) != 0
                || (anyOfMask & ~CANONICAL_COLOR_MASK) != 0
                || (requiredMask & RESERVED_COLOR_BIT) != 0
                || (forbiddenMask & RESERVED_COLOR_BIT) != 0
                || (anyOfMask & RESERVED_COLOR_BIT) != 0
                || (requiredMask & forbiddenMask) != 0
                || (forbiddenMask & anyOfMask) != 0
        ) revert InvalidColorMask();
    }

    /// @notice Validates a pixel-count range.
    /// @dev    `max == 0` disables the filter (requires `min == 0`); else
    ///         `min <= max` and `[min, max] ⊆ [PIXEL_COUNT_MIN, PIXEL_COUNT_MAX]`.
    function validatePixelCountRange(uint16 min, uint16 max) internal pure {
        if (max == 0) {
            if (min != 0) revert InvalidPixelCountRange();
            return;
        }
        if (min > max || min < PIXEL_COUNT_MIN || max > PIXEL_COUNT_MAX) {
            revert InvalidPixelCountRange();
        }
    }

    /// @notice Validates a color-count range.
    /// @dev    `max == 0` disables the filter (requires `min == 0`); else
    ///         `min <= max` and `[min, max] ⊆ [COLOR_COUNT_MIN, COLOR_COUNT_MAX]`.
    function validateColorCountRange(uint8 min, uint8 max) internal pure {
        if (max == 0) {
            if (min != 0) revert InvalidColorCountRange();
            return;
        }
        if (min > max || min < COLOR_COUNT_MIN || max > COLOR_COUNT_MAX) {
            revert InvalidColorCountRange();
        }
    }

    /// @notice Validates every dimension of a filter.
    function validate(Filter memory f) internal pure {
        validateTraitMasks(f.requiredTraitMask, f.forbiddenTraitMask, f.anyOfTraitMask);
        validateColorMasks(f.requiredColorMask, f.forbiddenColorMask, f.anyOfColorMask);
        validatePixelCountRange(f.minPixelCount, f.maxPixelCount);
        validateColorCountRange(f.minColorCount, f.maxColorCount);
    }

    /// @notice Returns true when the filter matches every valid Punk.
    function isEmpty(Filter memory f) internal pure returns (bool) {
        return f.requiredTraitMask == 0 && f.forbiddenTraitMask == 0
            && f.anyOfTraitMask == 0 && f.requiredColorMask == 0
            && f.forbiddenColorMask == 0 && f.anyOfColorMask == 0
            && f.minPixelCount == 0 && f.maxPixelCount == 0
            && f.minColorCount == 0 && f.maxColorCount == 0;
    }

    // ------------------ Per-punk predicates ------------------

    /// @notice Checks whether a Punk's trait mask satisfies the trio.
    /// @dev    Delegates to `hasTraits`, so PunksData re-validates the masks.
    function matchesTraits(
        IPunksDataCriteria data,
        uint16 punkId,
        uint256 requiredMask,
        uint256 forbiddenMask,
        uint256 anyOfMask
    ) internal view returns (bool) {
        if ((requiredMask | forbiddenMask | anyOfMask) == 0) return true;
        return data.hasTraits(punkId, requiredMask, forbiddenMask, anyOfMask);
    }

    /// @notice Checks whether a Punk's color mask satisfies the trio.
    /// @dev    Reads `colorMaskOf` once and applies the boolean logic locally.
    ///         Caller is responsible for `validateColorMasks` if the inputs
    ///         are not already trusted (the library does no server-side
    ///         re-check — PunksData has no `hasColors` predicate).
    function matchesColors(
        IPunksDataVisual data,
        uint16 punkId,
        uint256 requiredMask,
        uint256 forbiddenMask,
        uint256 anyOfMask
    ) internal view returns (bool) {
        if ((requiredMask | forbiddenMask | anyOfMask) == 0) return true;
        uint256 mask = data.colorMaskOf(punkId);
        return (mask & requiredMask) == requiredMask && (mask & forbiddenMask) == 0
            && (anyOfMask == 0 || (mask & anyOfMask) != 0);
    }

    /// @notice Checks whether a Punk's pixel count is within range.
    /// @dev    `max == 0` short-circuits to true.
    function matchesPixelCountRange(
        IPunksDataVisual data,
        uint16 punkId,
        uint16 min,
        uint16 max
    ) internal view returns (bool) {
        if (max == 0) return true;
        uint16 pc = data.pixelCountOf(punkId);
        return pc >= min && pc <= max;
    }

    /// @notice Checks whether a Punk's color count is within range.
    /// @dev    `max == 0` short-circuits to true.
    function matchesColorCountRange(
        IPunksDataVisual data,
        uint16 punkId,
        uint8 min,
        uint8 max
    ) internal view returns (bool) {
        if (max == 0) return true;
        uint8 cc = data.colorCountOf(punkId);
        return cc >= min && cc <= max;
    }

    /// @notice Checks every filter dimension against a Punk.
    /// @dev    Short-circuits in cost order: traits, colors, pixel range,
    ///         color count range. Per-punk gas is therefore non-deterministic.
    ///         Filter is the first parameter so consumers can write
    ///         `f.matches(criteria, visual, punkId)` via `using Punks for Filter`.
    function matches(
        Filter memory f,
        IPunksDataCriteria criteria,
        IPunksDataVisual visual,
        uint16 punkId
    ) internal view returns (bool) {
        return matchesTraits(
            criteria, punkId, f.requiredTraitMask, f.forbiddenTraitMask, f.anyOfTraitMask
        )
            && matchesColors(
                visual, punkId, f.requiredColorMask, f.forbiddenColorMask, f.anyOfColorMask
            ) && matchesPixelCountRange(visual, punkId, f.minPixelCount, f.maxPixelCount)
            && matchesColorCountRange(visual, punkId, f.minColorCount, f.maxColorCount);
    }

    /// @notice Convenience overload for consumers that hold one combined reference.
    function matches(Filter memory f, IPunksData data, uint16 punkId)
        internal
        view
        returns (bool)
    {
        return matches(
            f, IPunksDataCriteria(address(data)), IPunksDataVisual(address(data)), punkId
        );
    }
}
