// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {PunksData} from "../../contracts/PunksData.sol";

/// @notice Minimal subset of the forge-style `Vm` cheat-code interface, used
/// by Hardhat 3's native Solidity test runner. Self-contained.
interface Vm {
    function expectRevert(bytes4 revertData) external;
    function assume(bool condition) external pure;
}

contract PunksDataFuzzTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    PunksData internal data;

    uint256 internal constant CANONICAL_TRAIT_MASK = (uint256(1) << 111) - 1;
    uint256 internal constant SCALAR_BITS = 48;
    uint256 internal constant SCALAR_MASK = (uint256(1) << SCALAR_BITS) - 1;
    uint256 internal constant SCALARS_PER_WORD = 5;

    function setUp() public {
        data = new PunksData(address(this));
    }

    /// @dev `hasTraits` semantics: returns true iff
    /// `(m & required) == required && (m & forbidden) == 0
    ///  && (anyOf == 0 || (m & anyOf) != 0)`.
    function testFuzz_hasTraitsSemantics(
        uint128 maskSeed,
        uint128 reqSeed,
        uint128 fbdSeed,
        uint128 anySeed
    ) public {
        uint256 mask = uint256(maskSeed) & CANONICAL_TRAIT_MASK;
        uint256 required = uint256(reqSeed) & CANONICAL_TRAIT_MASK;
        // Strip overlap to keep the inputs valid for hasTraits.
        uint256 forbidden = (uint256(fbdSeed) & CANONICAL_TRAIT_MASK) & ~required;
        uint256 anyOfMask = (uint256(anySeed) & CANONICAL_TRAIT_MASK) & ~forbidden;

        uint256[] memory pairs = new uint256[](1);
        pairs[0] = mask; // Punk 0 lives in the low 128 bits of pair index 0.
        data.loadTraitMaskPairs(0, pairs);

        bool expected = (mask & required) == required
            && (mask & forbidden) == 0
            && (anyOfMask == 0 || (mask & anyOfMask) != 0);

        bool actual = data.hasTraits(0, required, forbidden, anyOfMask);
        require(actual == expected, "hasTraits semantics mismatch");
    }

    function testFuzz_invalidMaskOutOfRange(uint8 bitSeed) public {
        uint256 bit = 111 + (uint256(bitSeed) % 145); // 111..255
        uint256 outOfRange = uint256(1) << bit;
        vm.expectRevert(PunksData.InvalidMask.selector);
        data.hasTraits(0, outOfRange, 0, 0);
    }

    function testFuzz_invalidMaskRequiredOverlapsForbidden(uint128 seed) public {
        uint256 m = uint256(seed) & CANONICAL_TRAIT_MASK;
        vm.assume(m != 0);
        vm.expectRevert(PunksData.InvalidMask.selector);
        data.hasTraits(0, m, m, 0);
    }

    function testFuzz_invalidMaskForbiddenOverlapsAnyOf(uint128 seed) public {
        uint256 m = uint256(seed) & CANONICAL_TRAIT_MASK;
        vm.assume(m != 0);
        vm.expectRevert(PunksData.InvalidMask.selector);
        data.hasTraits(0, 0, m, m);
    }

    /// @dev Random scalar words: load is rejected iff any field is out of range.
    function testFuzz_validateScalarWord(uint256 word) public {
        uint256[] memory words = new uint256[](1);
        words[0] = word;
        if (!_isValidScalarWord(word)) {
            vm.expectRevert(PunksData.InvalidScalar.selector);
        }
        data.loadPackedScalars(0, words);
    }

    function _isValidScalarWord(uint256 word) internal pure returns (bool) {
        if (word >> (SCALARS_PER_WORD * SCALAR_BITS) != 0) return false;
        for (uint256 i; i < SCALARS_PER_WORD; ++i) {
            uint256 scalar = (word >> (i * SCALAR_BITS)) & SCALAR_MASK;
            uint256 pixelCount = scalar & 0xffff;
            uint256 colorCount = (scalar >> 16) & 0xff;
            uint256 attributeCount = (scalar >> 24) & 0xff;
            uint256 punkType = (scalar >> 32) & 0xff;
            uint256 headVariant = (scalar >> 40) & 0xff;
            if (
                pixelCount < 148 || pixelCount > 332
                    || colorCount < 2 || colorCount > 14
                    || attributeCount > 7 || punkType > 4
                    || headVariant > 10
            ) return false;
        }
        return true;
    }
}
