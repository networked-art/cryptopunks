// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/IPunksData.sol";

/// @notice Minimal deterministic `PunksData` stand-in for `PunksPng` tests.
contract MockPunksPngData is IPunksDataErrors {
    uint16 private constant PUNK_COUNT = 10_000;
    uint16 private constant PALETTE_SIZE = 222;
    uint16 private constant PIXELS_PER_PUNK = 576;

    function indexedPixelsOf(uint16 punkId) external pure returns (bytes memory pixels) {
        if (punkId >= PUNK_COUNT) revert InvalidPunkId();

        pixels = new bytes(PIXELS_PER_PUNK);
        uint256 word = uint256(uint8(1 + (punkId % 14)));
        word *= 0x0101010101010101010101010101010101010101010101010101010101010101;
        assembly ("memory-safe") {
            let dst := add(pixels, 0x20)
            for { let i := 0 } lt(i, 18) { i := add(i, 1) } {
                mstore(add(dst, mul(i, 0x20)), word)
            }
        }
    }

    function paletteRgbaBytes() public pure returns (bytes memory palette) {
        palette = new bytes(uint256(PALETTE_SIZE) * 4);
        for (uint256 i; i < PALETTE_SIZE; ++i) {
            uint256 offset = i * 4;
            palette[offset] = bytes1(uint8(i));
            palette[offset + 1] = bytes1(uint8(255 - i));
            palette[offset + 2] = bytes1(uint8((i * 17) & 0xff));
            palette[offset + 3] = i == 0 ? bytes1(0) : bytes1(0xff);
        }
    }

    function paletteRgbBytes() external pure returns (bytes memory rgb) {
        bytes memory rgba = paletteRgbaBytes();
        rgb = new bytes(uint256(PALETTE_SIZE) * 3);
        for (uint256 i; i < PALETTE_SIZE; ++i) {
            rgb[i * 3] = rgba[i * 4];
            rgb[i * 3 + 1] = rgba[i * 4 + 1];
            rgb[i * 3 + 2] = rgba[i * 4 + 2];
        }
    }

    function paletteAlphaBytes() external pure returns (bytes memory alpha) {
        bytes memory rgba = paletteRgbaBytes();
        alpha = new bytes(PALETTE_SIZE);
        for (uint256 i; i < PALETTE_SIZE; ++i) {
            alpha[i] = rgba[i * 4 + 3];
        }
    }
}
