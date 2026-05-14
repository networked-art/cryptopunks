// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Minimal mock for `PunksGrid` testing. Stores the four
///         per-dimension bitmap rows that `PunksGrid` reads via
///         `traitBitmapWord`, `colorBitmapWord`, `pixelCountBitmapWord`, and
///         `colorCountBitmapWord`. Tests seed bitmap words directly or use
///         the per-punk helpers to flip a single bit at a time.
contract MockPunksGridData {
    uint8 internal constant WORD_COUNT = 40;
    uint16 internal constant PIXEL_COUNT_MIN = 148;
    uint8 internal constant COLOR_COUNT_MIN = 2;

    mapping(uint16 => mapping(uint8 => uint256)) private _traitBitmaps;
    mapping(uint8 => mapping(uint8 => uint256)) private _colorBitmaps;
    mapping(uint16 => mapping(uint8 => uint256)) private _pixelCountBitmaps;
    mapping(uint8 => mapping(uint8 => uint256)) private _colorCountBitmaps;

    // ------------------ Bitmap getters ------------------

    function traitBitmapWord(uint16 traitId, uint8 wordIndex) external view returns (uint256) {
        return _traitBitmaps[traitId][wordIndex];
    }

    function colorBitmapWord(uint8 colorId, uint8 wordIndex) external view returns (uint256) {
        return _colorBitmaps[colorId][wordIndex];
    }

    function pixelCountBitmapWord(uint16 pixelCount, uint8 wordIndex)
        external
        view
        returns (uint256)
    {
        return _pixelCountBitmaps[pixelCount][wordIndex];
    }

    function colorCountBitmapWord(uint8 colorCount, uint8 wordIndex)
        external
        view
        returns (uint256)
    {
        return _colorCountBitmaps[colorCount][wordIndex];
    }

    // ------------------ Direct word setters ------------------

    function setTraitBitmapWord(uint16 traitId, uint8 wordIndex, uint256 value) external {
        _traitBitmaps[traitId][wordIndex] = value;
    }

    function setColorBitmapWord(uint8 colorId, uint8 wordIndex, uint256 value) external {
        _colorBitmaps[colorId][wordIndex] = value;
    }

    function setPixelCountBitmapWord(uint16 pixelCount, uint8 wordIndex, uint256 value)
        external
    {
        _pixelCountBitmaps[pixelCount][wordIndex] = value;
    }

    function setColorCountBitmapWord(uint8 colorCount, uint8 wordIndex, uint256 value)
        external
    {
        _colorCountBitmaps[colorCount][wordIndex] = value;
    }

    // ------------------ Per-punk convenience helpers ------------------

    function addPunkTrait(uint16 punkId, uint16 traitId) external {
        (uint8 w, uint256 b) = _wordAndBit(punkId);
        _traitBitmaps[traitId][w] |= b;
    }

    function addPunkColor(uint16 punkId, uint8 colorId) external {
        (uint8 w, uint256 b) = _wordAndBit(punkId);
        _colorBitmaps[colorId][w] |= b;
    }

    function addPunkPixelCount(uint16 punkId, uint16 pixelCount) external {
        (uint8 w, uint256 b) = _wordAndBit(punkId);
        _pixelCountBitmaps[pixelCount][w] |= b;
    }

    function addPunkColorCount(uint16 punkId, uint8 colorCount) external {
        (uint8 w, uint256 b) = _wordAndBit(punkId);
        _colorCountBitmaps[colorCount][w] |= b;
    }

    function _wordAndBit(uint16 punkId) private pure returns (uint8 wordIndex, uint256 bit) {
        wordIndex = uint8(uint256(punkId) >> 8);
        bit = uint256(1) << (uint256(punkId) & 255);
    }
}
