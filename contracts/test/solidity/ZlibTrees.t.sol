// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ZlibTrees} from "../../contracts/lib/ZlibTrees.sol";

contract ZlibTreesTest {
    function test_buildBitLengths_standardSixSymbolVector() public pure {
        uint32[] memory freqs = new uint32[](6);
        freqs[0] = 5;
        freqs[1] = 7;
        freqs[2] = 10;
        freqs[3] = 15;
        freqs[4] = 20;
        freqs[5] = 45;

        (uint8[] memory lengths, uint16 maxCode) = ZlibTrees.buildBitLengths(freqs, 6, 15);

        require(maxCode == 5, "max code");
        require(lengths.length == 6, "length count");
        require(lengths[0] == 4, "len 0");
        require(lengths[1] == 4, "len 1");
        require(lengths[2] == 3, "len 2");
        require(lengths[3] == 3, "len 3");
        require(lengths[4] == 3, "len 4");
        require(lengths[5] == 1, "len 5");

        uint16[] memory canonicalCodes = ZlibTrees.buildCanonicalCodes(lengths, maxCode);
        require(canonicalCodes.length == 6, "code count");
        require(canonicalCodes[0] == 0x7, "code 0");
        require(canonicalCodes[1] == 0xf, "code 1");
        require(canonicalCodes[2] == 0x1, "code 2");
        require(canonicalCodes[3] == 0x5, "code 3");
        require(canonicalCodes[4] == 0x3, "code 4");
        require(canonicalCodes[5] == 0x0, "code 5");
    }

    function test_buildBitLengths_forcesTwoCodesWhenOnlyOneFrequencyExists()
        public
        pure
    {
        uint32[] memory freqs = new uint32[](4);
        freqs[0] = 10;

        (uint8[] memory lengths, uint16 maxCode) = ZlibTrees.buildBitLengths(freqs, 4, 15);

        require(maxCode == 1, "max code");
        require(lengths.length == 2, "length count");
        require(lengths[0] == 1, "forced len 0");
        require(lengths[1] == 1, "forced len 1");

        uint16[] memory canonicalCodes = ZlibTrees.buildCanonicalCodes(lengths, maxCode);
        require(canonicalCodes[0] == 0, "code 0");
        require(canonicalCodes[1] == 1, "code 1");
    }

    function test_buildBitLengths_forcesTwoCodesWhenAllFrequenciesAreZero()
        public
        pure
    {
        uint32[] memory freqs = new uint32[](3);

        (uint8[] memory lengths, uint16 maxCode) = ZlibTrees.buildBitLengths(freqs, 3, 15);

        require(maxCode == 1, "max code");
        require(lengths.length == 2, "length count");
        require(lengths[0] == 1, "forced len 0");
        require(lengths[1] == 1, "forced len 1");
    }

    function test_buildBitLengths_rejectsInvalidInputs() public view {
        uint32[] memory freqs = new uint32[](1);

        try this.build(freqs, 0, 15) {
            revert("accepted zero element count");
        } catch (bytes memory) {}

        try this.build(freqs, 2, 15) {
            revert("accepted short frequency array");
        } catch (bytes memory) {}

        try this.build(freqs, 1, 0) {
            revert("accepted zero max length");
        } catch (bytes memory) {}

        uint8[] memory lengths = new uint8[](1);
        lengths[0] = 16;
        try this.buildCodes(lengths, 0) {
            revert("accepted overlong code length");
        } catch (bytes memory) {}
    }

    function test_scanTree_countsLiteralLengthsAndRepeats() public pure {
        uint8[] memory lengths = new uint8[](6);
        lengths[0] = 4;
        lengths[1] = 4;
        lengths[2] = 3;
        lengths[3] = 3;
        lengths[4] = 3;
        lengths[5] = 1;
        uint32[] memory freqs = new uint32[](19);

        ZlibTrees.scanTree(freqs, lengths, 5);

        require(freqs[1] == 1, "freq 1");
        require(freqs[3] == 3, "freq 3");
        require(freqs[4] == 2, "freq 4");
        require(freqs[16] == 0, "freq 16");
        require(freqs[17] == 0, "freq 17");
        require(freqs[18] == 0, "freq 18");
    }

    function test_scanTree_usesRepeatPreviousCode() public pure {
        uint8[] memory lengths = new uint8[](6);
        for (uint256 i; i < 6; ++i) lengths[i] = 1;
        uint32[] memory freqs = new uint32[](19);

        ZlibTrees.scanTree(freqs, lengths, 5);

        require(freqs[1] == 1, "freq 1");
        require(freqs[16] == 1, "freq 16");
    }

    function test_scanTree_usesZeroRepeatCodes() public pure {
        uint8[] memory lengths = new uint8[](12);
        uint32[] memory freqs = new uint32[](19);

        ZlibTrees.scanTree(freqs, lengths, 11);

        require(freqs[17] == 0, "freq 17");
        require(freqs[18] == 1, "freq 18");
    }

    function test_scanTree_usesShortZeroRepeatCode() public pure {
        uint8[] memory lengths = new uint8[](12);
        lengths[0] = 2;
        lengths[1] = 2;
        lengths[2] = 2;
        lengths[11] = 5;
        uint32[] memory freqs = new uint32[](19);

        ZlibTrees.scanTree(freqs, lengths, 11);

        require(freqs[2] == 3, "freq 2");
        require(freqs[5] == 1, "freq 5");
        require(freqs[17] == 1, "freq 17");
        require(freqs[18] == 0, "freq 18");
    }

    function test_encodeTree_emitsLiteralLengthsAndRepeats() public pure {
        uint8[] memory lengths = new uint8[](6);
        lengths[0] = 4;
        lengths[1] = 4;
        lengths[2] = 3;
        lengths[3] = 3;
        lengths[4] = 3;
        lengths[5] = 1;

        (uint8[] memory symbols, uint8[] memory extraBits, uint8[] memory extraValues) =
            ZlibTrees.encodeTree(lengths, 5);

        require(symbols.length == 6, "symbol count");
        require(symbols[0] == 4, "sym 0");
        require(symbols[1] == 4, "sym 1");
        require(symbols[2] == 3, "sym 2");
        require(symbols[3] == 3, "sym 3");
        require(symbols[4] == 3, "sym 4");
        require(symbols[5] == 1, "sym 5");
        for (uint256 i; i < symbols.length; ++i) {
            require(extraBits[i] == 0, "extra bits");
            require(extraValues[i] == 0, "extra values");
        }
    }

    function test_encodeTree_emitsRepeatPreviousCode() public pure {
        uint8[] memory lengths = new uint8[](6);
        for (uint256 i; i < 6; ++i) lengths[i] = 1;

        (uint8[] memory symbols, uint8[] memory extraBits, uint8[] memory extraValues) =
            ZlibTrees.encodeTree(lengths, 5);

        require(symbols.length == 2, "symbol count");
        require(symbols[0] == 1, "sym 0");
        require(symbols[1] == 16, "sym 1");
        require(extraBits[0] == 0, "extra bits 0");
        require(extraValues[0] == 0, "extra value 0");
        require(extraBits[1] == 2, "extra bits 1");
        require(extraValues[1] == 2, "extra value 1");
    }

    function test_encodeTree_emitsZeroRepeatCodes() public pure {
        uint8[] memory lengths = new uint8[](12);

        (uint8[] memory symbols, uint8[] memory extraBits, uint8[] memory extraValues) =
            ZlibTrees.encodeTree(lengths, 11);

        require(symbols.length == 1, "symbol count");
        require(symbols[0] == 18, "sym 0");
        require(extraBits[0] == 7, "extra bits 0");
        require(extraValues[0] == 1, "extra value 0");
    }

    function test_encodeTree_emitsShortZeroRepeatCode() public pure {
        uint8[] memory lengths = new uint8[](12);
        lengths[0] = 2;
        lengths[1] = 2;
        lengths[2] = 2;
        lengths[11] = 5;

        (uint8[] memory symbols, uint8[] memory extraBits, uint8[] memory extraValues) =
            ZlibTrees.encodeTree(lengths, 11);

        require(symbols.length == 5, "symbol count");
        require(symbols[0] == 2, "sym 0");
        require(symbols[1] == 2, "sym 1");
        require(symbols[2] == 2, "sym 2");
        require(symbols[3] == 17, "sym 3");
        require(symbols[4] == 5, "sym 4");
        require(extraBits[3] == 3, "extra bits 3");
        require(extraValues[3] == 5, "extra value 3");
        require(extraBits[4] == 0, "extra bits 4");
        require(extraValues[4] == 0, "extra value 4");
    }

    function test_encodeTree_rejectsInvalidInputs() public view {
        uint8[] memory lengths = new uint8[](1);
        try this.encode(lengths, 1) {
            revert("accepted short length array");
        } catch (bytes memory) {}
    }

    function build(uint32[] memory freqs, uint16 elementCount, uint8 maxLength)
        external
        pure
        returns (uint8[] memory lengths, uint16 maxCode)
    {
        return ZlibTrees.buildBitLengths(freqs, elementCount, maxLength);
    }

    function buildCodes(uint8[] memory lengths, uint16 maxCode)
        external
        pure
        returns (uint16[] memory)
    {
        return ZlibTrees.buildCanonicalCodes(lengths, maxCode);
    }

    function encode(uint8[] memory lengths, uint16 maxCode)
        external
        pure
        returns (
            uint8[] memory symbols,
            uint8[] memory extraBits,
            uint8[] memory extraValues
        )
    {
        return ZlibTrees.encodeTree(lengths, maxCode);
    }
}
