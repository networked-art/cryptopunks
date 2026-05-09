// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Crc32} from "../../contracts/lib/Crc32.sol";
import {Adler32} from "../../contracts/lib/Adler32.sol";
import {PngEncoder} from "../../contracts/lib/PngEncoder.sol";

/// @notice Renderer-stack library checks. Crc32 and Adler32 must match their
/// reference vectors so the offchain reference encoder isn't simply agreeing
/// with a buggy onchain implementation.
contract PunksRendererLibTest {
    function test_crc32_emptyVector() public pure {
        require(Crc32.crc32("") == 0, "crc32(empty)");
    }

    function test_crc32_standardVector() public pure {
        // Canonical CRC32 test vector from RFC 3720 / zlib.
        require(Crc32.crc32(bytes("123456789")) == 0xCBF43926, "crc32(123456789)");
    }

    function test_crc32_pngIhdrVector() public pure {
        // 13-byte IHDR payload prepended with the chunk type "IHDR" produces a
        // CRC32 reference that any conforming encoder must match for a 24x24
        // PNG-8 indexed image.
        bytes memory ihdr = PngEncoder.ihdrPayload();
        bytes memory typed = new bytes(4 + ihdr.length);
        typed[0] = 0x49; typed[1] = 0x48; typed[2] = 0x44; typed[3] = 0x52; // "IHDR"
        for (uint256 i = 0; i < ihdr.length; ++i) typed[4 + i] = ihdr[i];
        // Computed offchain via Node `crc32`: 0xD7A9CDCA for our IHDR.
        require(Crc32.crc32(typed) == 0xD7A9CDCA, "crc32(IHDR)");
    }

    function test_adler32_empty() public pure {
        require(Adler32.adler32("") == 1, "adler32(empty)");
    }

    function test_adler32_singleByte() public pure {
        require(Adler32.adler32(bytes("a")) == 0x00620062, "adler32(a)");
    }

    function test_adler32_threeBytes() public pure {
        // a=1+97+98+99=295=0x127, b=98+196+295=589=0x24D
        require(Adler32.adler32(bytes("abc")) == 0x024D0127, "adler32(abc)");
    }

    function test_adler32_nmaxBoundary() public pure {
        // Spans the NMAX=5552 inner-loop break; result must still be canonical.
        bytes memory buf = new bytes(6000);
        for (uint256 i = 0; i < buf.length; ++i) buf[i] = bytes1(uint8(i & 0xff));
        // Reference value computed offchain via a standard adler32.
        require(Adler32.adler32(buf) == 0x5AF38D6E, "adler32(6000-byte ramp)");
    }

    function test_pngEncoder_idatPayloadShape() public pure {
        bytes memory pixels = new bytes(576);
        bytes memory payload = PngEncoder.buildIdatPayload(pixels);
        require(payload.length == 611, "idat length");
        require(uint8(payload[0]) == 0x78 && uint8(payload[1]) == 0x01, "zlib header");
        require(uint8(payload[2]) == 0x01, "stored block header");
        require(uint8(payload[3]) == 0x58 && uint8(payload[4]) == 0x02, "LEN");
        require(uint8(payload[5]) == 0xA7 && uint8(payload[6]) == 0xFD, "NLEN");
        // Adler over the 600-byte raw stream (24 zero filter bytes + 576
        // zero pixels): a stays 1, b accumulates 1 × 600 = 600 = 0x258.
        // Result = (0x258 << 16) | 1 = 0x02580001.
        require(uint8(payload[607]) == 0x02, "adler hi");
        require(uint8(payload[608]) == 0x58, "adler mid-hi");
        require(uint8(payload[609]) == 0x00, "adler mid-lo");
        require(uint8(payload[610]) == 0x01, "adler lo");
    }
}
