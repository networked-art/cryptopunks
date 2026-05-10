// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {PunksData} from "../../contracts/PunksData.sol";
import {IPunksDataCriteria, IPunksDataVisual, IPunksData} from "../../contracts/interfaces/IPunksData.sol";
import {Punks} from "../../contracts/lib/Punks.sol";

/// @notice Minimal subset of the forge-style `Vm` cheat-code interface, used
/// by Hardhat 3's native Solidity test runner.
interface Vm {
    function expectRevert(bytes4 revertData) external;
    function assume(bool condition) external pure;
}

/// @dev External wrappers around the library so `vm.expectRevert` can
/// intercept library-side reverts (which would otherwise inline into the
/// caller and bypass the cheatcode).
contract PunksHarness {
    function traitMask(uint16[] memory ids) external pure returns (uint256) {
        return Punks.traitMask(ids);
    }

    function colorMask(uint8[] memory ids) external pure returns (uint256) {
        return Punks.colorMask(ids);
    }

    function validateTraitMasks(uint256 r, uint256 f, uint256 a) external pure {
        Punks.validateTraitMasks(r, f, a);
    }

    function validateColorMasks(uint256 r, uint256 f, uint256 a) external pure {
        Punks.validateColorMasks(r, f, a);
    }

    function validatePixelCountRange(uint16 min, uint16 max) external pure {
        Punks.validatePixelCountRange(min, max);
    }

    function validateColorCountRange(uint8 min, uint8 max) external pure {
        Punks.validateColorCountRange(min, max);
    }

    function matchesTraits(
        IPunksDataCriteria d,
        uint16 punkId,
        uint256 r,
        uint256 f,
        uint256 a
    ) external view returns (bool) {
        return Punks.matchesTraits(d, punkId, r, f, a);
    }

    function matches(Punks.Filter memory f, IPunksData d, uint16 punkId)
        external
        view
        returns (bool)
    {
        return Punks.matches(f, d, punkId);
    }
}

contract PunksFuzzTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    PunksData internal data;
    PunksHarness internal harness;

    uint256 internal constant CANONICAL_TRAIT_MASK = (uint256(1) << 111) - 1;
    uint256 internal constant CANONICAL_COLOR_MASK = (uint256(1) << 222) - 1;

    function setUp() public {
        data = new PunksData(address(this));
        harness = new PunksHarness();
    }

    // ------------------ traitMask / colorMask builders ------------------

    function testFuzz_traitMaskBuildsBitset(uint8 a, uint8 b, uint8 c) public pure {
        uint16 ida = uint16(a) % 111;
        uint16 idb = uint16(b) % 111;
        uint16 idc = uint16(c) % 111;
        uint16[] memory ids = new uint16[](3);
        ids[0] = ida;
        ids[1] = idb;
        ids[2] = idc;
        uint256 mask = Punks.traitMask(ids);
        uint256 expected = (uint256(1) << ida) | (uint256(1) << idb) | (uint256(1) << idc);
        require(mask == expected, "trait mask mismatch");
    }

    function testFuzz_traitMaskRejectsOutOfRange(uint16 idSeed) public {
        uint16 id = 111 + (idSeed % 1000); // anything >= 111
        uint16[] memory ids = new uint16[](1);
        ids[0] = id;
        vm.expectRevert(Punks.InvalidTraitId.selector);
        harness.traitMask(ids);
    }

    function testFuzz_colorMaskBuildsBitset(uint8 a, uint8 b) public pure {
        uint8 ida = uint8(1 + (uint256(a) % 221));
        uint8 idb = uint8(1 + (uint256(b) % 221));
        uint8[] memory ids = new uint8[](2);
        ids[0] = ida;
        ids[1] = idb;
        uint256 mask = Punks.colorMask(ids);
        uint256 expected = (uint256(1) << ida) | (uint256(1) << idb);
        require(mask == expected, "color mask mismatch");
    }

    function testFuzz_colorMaskRejectsTransparent() public {
        uint8[] memory ids = new uint8[](1);
        ids[0] = 0;
        vm.expectRevert(Punks.InvalidColorId.selector);
        harness.colorMask(ids);
    }

    // ------------------ validateTraitMasks ------------------

    function testFuzz_validateTraitMasksAcceptsCanonical(
        uint128 reqSeed,
        uint128 fbdSeed,
        uint128 anySeed
    ) public pure {
        uint256 req = uint256(reqSeed) & CANONICAL_TRAIT_MASK;
        uint256 forbid = (uint256(fbdSeed) & CANONICAL_TRAIT_MASK) & ~req;
        uint256 anyOf = (uint256(anySeed) & CANONICAL_TRAIT_MASK) & ~forbid;
        Punks.validateTraitMasks(req, forbid, anyOf);
    }

    function testFuzz_validateTraitMasksRejectsOutOfRange(uint8 bitSeed) public {
        uint256 bit = 111 + (uint256(bitSeed) % 145);
        vm.expectRevert(Punks.InvalidTraitMask.selector);
        harness.validateTraitMasks(uint256(1) << bit, 0, 0);
    }

    function testFuzz_validateTraitMasksRejectsRequiredForbiddenOverlap(uint128 seed) public {
        uint256 m = uint256(seed) & CANONICAL_TRAIT_MASK;
        vm.assume(m != 0);
        vm.expectRevert(Punks.InvalidTraitMask.selector);
        harness.validateTraitMasks(m, m, 0);
    }

    function testFuzz_validateTraitMasksRejectsForbiddenAnyOfOverlap(uint128 seed) public {
        uint256 m = uint256(seed) & CANONICAL_TRAIT_MASK;
        vm.assume(m != 0);
        vm.expectRevert(Punks.InvalidTraitMask.selector);
        harness.validateTraitMasks(0, m, m);
    }

    // ------------------ validateColorMasks ------------------

    function testFuzz_validateColorMasksAcceptsCanonical(
        uint128 reqSeed,
        uint128 fbdSeed,
        uint128 anySeed
    ) public pure {
        // Strip bit 0 (transparency) and confine to canonical bits.
        uint256 req = (uint256(reqSeed) & CANONICAL_COLOR_MASK) & ~uint256(1);
        uint256 forbid = ((uint256(fbdSeed) & CANONICAL_COLOR_MASK) & ~uint256(1)) & ~req;
        uint256 anyOf = ((uint256(anySeed) & CANONICAL_COLOR_MASK) & ~uint256(1)) & ~forbid;
        Punks.validateColorMasks(req, forbid, anyOf);
    }

    function testFuzz_validateColorMasksRejectsTransparentInRequired() public {
        vm.expectRevert(Punks.InvalidColorMask.selector);
        harness.validateColorMasks(1, 0, 0);
    }

    function testFuzz_validateColorMasksRejectsTransparentInForbidden() public {
        vm.expectRevert(Punks.InvalidColorMask.selector);
        harness.validateColorMasks(0, 1, 0);
    }

    function testFuzz_validateColorMasksRejectsTransparentInAnyOf() public {
        vm.expectRevert(Punks.InvalidColorMask.selector);
        harness.validateColorMasks(0, 0, 1);
    }

    function testFuzz_validateColorMasksRejectsOutOfRange(uint8 bitSeed) public {
        uint256 bit = 222 + (uint256(bitSeed) % 34); // 222..255
        vm.expectRevert(Punks.InvalidColorMask.selector);
        harness.validateColorMasks(uint256(1) << bit, 0, 0);
    }

    // ------------------ validate range ------------------

    function testFuzz_validatePixelCountRangeAccepts(uint16 minSeed, uint16 maxSeed) public pure {
        uint16 min = 148 + (minSeed % (332 - 148 + 1));
        uint16 max = min + (maxSeed % (332 - min + 1));
        Punks.validatePixelCountRange(min, max);
    }

    function testFuzz_validatePixelCountRangeAcceptsDisabled() public pure {
        Punks.validatePixelCountRange(0, 0);
    }

    function testFuzz_validatePixelCountRangeRejectsBelowMin() public {
        vm.expectRevert(Punks.InvalidPixelCountRange.selector);
        harness.validatePixelCountRange(100, 200);
    }

    function testFuzz_validatePixelCountRangeRejectsAboveMax() public {
        vm.expectRevert(Punks.InvalidPixelCountRange.selector);
        harness.validatePixelCountRange(150, 400);
    }

    function testFuzz_validatePixelCountRangeRejectsInverted() public {
        vm.expectRevert(Punks.InvalidPixelCountRange.selector);
        harness.validatePixelCountRange(300, 200);
    }

    function testFuzz_validatePixelCountRangeRejectsMinOnly() public {
        vm.expectRevert(Punks.InvalidPixelCountRange.selector);
        harness.validatePixelCountRange(150, 0);
    }

    function testFuzz_validateColorCountRangeAccepts(uint8 minSeed, uint8 maxSeed) public pure {
        uint8 min = 2 + uint8(uint256(minSeed) % 13);
        uint8 max = min + uint8(uint256(maxSeed) % uint256(14 - min + 1));
        Punks.validateColorCountRange(min, max);
    }

    function testFuzz_validateColorCountRangeRejectsAboveMax() public {
        vm.expectRevert(Punks.InvalidColorCountRange.selector);
        harness.validateColorCountRange(2, 15);
    }

    function testFuzz_validateColorCountRangeRejectsInverted() public {
        vm.expectRevert(Punks.InvalidColorCountRange.selector);
        harness.validateColorCountRange(8, 4);
    }

    // ------------------ matchesTraits drift guard ------------------

    /// @dev Library `matchesTraits` must equal `PunksData.hasTraits` for every
    /// canonical input. Empty trio short-circuits to true on the library side.
    function testFuzz_matchesTraitsAgreesWithHasTraits(
        uint128 maskSeed,
        uint128 reqSeed,
        uint128 fbdSeed,
        uint128 anySeed
    ) public {
        uint256 mask = uint256(maskSeed) & CANONICAL_TRAIT_MASK;
        uint256 req = uint256(reqSeed) & CANONICAL_TRAIT_MASK;
        uint256 forbid = (uint256(fbdSeed) & CANONICAL_TRAIT_MASK) & ~req;
        uint256 anyOf = (uint256(anySeed) & CANONICAL_TRAIT_MASK) & ~forbid;

        uint256[] memory pairs = new uint256[](1);
        pairs[0] = mask;
        data.loadTraitMaskPairs(0, pairs);

        bool libResult = Punks.matchesTraits(data, 0, req, forbid, anyOf);
        if ((req | forbid | anyOf) == 0) {
            require(libResult, "empty trio must short-circuit true");
        } else {
            bool dataResult = data.hasTraits(0, req, forbid, anyOf);
            require(libResult == dataResult, "matchesTraits drift");
        }
    }

    // ------------------ matches end-to-end ------------------

    /// @dev Confirms `matches(Filter)` agrees with the AND of the four component
    /// predicates against a real PunksData instance.
    function testFuzz_matchesIsAndOfComponents(
        uint128 traitMaskSeed,
        uint128 reqSeed,
        uint128 fbdSeed
    ) public {
        uint256 mask = uint256(traitMaskSeed) & CANONICAL_TRAIT_MASK;
        uint256 req = uint256(reqSeed) & CANONICAL_TRAIT_MASK;
        uint256 forbid = (uint256(fbdSeed) & CANONICAL_TRAIT_MASK) & ~req;

        uint256[] memory pairs = new uint256[](1);
        pairs[0] = mask;
        data.loadTraitMaskPairs(0, pairs);

        Punks.Filter memory f;
        f.requiredTraitMask = req;
        f.forbiddenTraitMask = forbid;
        // Color/visual dimensions are disabled (max==0), so they short-circuit
        // to true and won't call into colorMaskOf/pixelCountOf/colorCountOf
        // (which would require loaded color/scalar data we don't set up here).

        bool composite = Punks.matches(f, data, 0);
        bool componentTrait =
            Punks.matchesTraits(data, 0, f.requiredTraitMask, f.forbiddenTraitMask, f.anyOfTraitMask);
        require(composite == componentTrait, "matches must equal traits component when others off");
    }
}
