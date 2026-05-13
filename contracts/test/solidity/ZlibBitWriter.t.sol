// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ZlibBitWriter} from "../../contracts/lib/ZlibBitWriter.sol";

contract ZlibBitWriterTest {
    function test_writeBits_packsLeastSignificantBitFirst() public pure {
        bytes memory out = new bytes(1);
        uint256 bitOffset;

        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, 5, 3);
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, 2, 2);

        require(bitOffset == 5, "bit offset");
        require(uint8(out[0]) == 0x15, "packed byte");
    }

    function test_writeBits_crossesByteBoundary() public pure {
        bytes memory out = new bytes(3);
        uint256 bitOffset;

        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, 0xff, 8);
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, 0xabc, 12);

        require(bitOffset == 20, "bit offset");
        require(uint8(out[0]) == 0xff, "byte 0");
        require(uint8(out[1]) == 0xbc, "byte 1");
        require(uint8(out[2]) == 0x0a, "byte 2");
    }

    function test_writeBits_matchesDynamicBlockHeaderPrefix() public pure {
        bytes memory out = new bytes(3);
        uint256 bitOffset;

        // BFINAL=0, BTYPE=10 dynamic, HLIT=286, HDIST=30, HCLEN=17.
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, 4, 3);
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, 29, 5);
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, 29, 5);
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, 13, 4);

        require(bitOffset == 17, "bit offset");
        require(uint8(out[0]) == 0xec, "byte 0");
        require(uint8(out[1]) == 0xbd, "byte 1");
        require(uint8(out[2]) == 0x01, "byte 2");
    }

    function test_trim_setsByteLengthForPartialFinalByte() public pure {
        bytes memory out = new bytes(4);
        uint256 bitOffset = ZlibBitWriter.writeBits(out, 0, 0xffff, 16);
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, 1, 1);

        bytes memory trimmed = ZlibBitWriter.trim(out, bitOffset);

        require(trimmed.length == 3, "trimmed length");
        require(uint8(trimmed[0]) == 0xff, "byte 0");
        require(uint8(trimmed[1]) == 0xff, "byte 1");
        require(uint8(trimmed[2]) == 0x01, "byte 2");
    }

    function test_writeBits_rejectsInvalidInputs() public view {
        bytes memory out = new bytes(1);

        try this.write(out, 0, 0, 33) {
            revert("accepted large bit count");
        } catch (bytes memory) {}

        try this.write(out, 7, 3, 2) {
            revert("accepted short output");
        } catch (bytes memory) {}
    }

    function write(bytes memory out, uint256 bitOffset, uint256 value, uint8 bitCount)
        external
        pure
        returns (uint256)
    {
        return ZlibBitWriter.writeBits(out, bitOffset, value, bitCount);
    }
}
