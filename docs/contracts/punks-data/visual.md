# PunksData Visual API

These functions answer visual questions without rendering an image. Use them
for palette colors, visible-pixel counts, visible-color counts, and color
filters.

The visual surface uses three storage layouts. Color masks answer single-Punk
color questions, bitmap rows answer "which Punks match this visual fact?", and
packed scalars answer small per-Punk summaries. Consumers that only need this
subset should depend on `IPunksDataVisual`.

Use the visual surface for color and image-derived predicates without
rendering SVG or PNG.

## `paletteSize()`

```solidity
function paletteSize() public pure returns (uint16);
```

Returns `222`, the number of valid palette ids. Valid color ids are
`0..paletteSize() - 1`.

Live read: [`paletteSize()`](https://evm.now/address/punksdata.eth/read#paletteSize).

Use it as an enumeration bound for palette functions or metadata color loops.

## `colorOf(uint8 colorId)`

```solidity
function colorOf(uint8 colorId) external view returns (bytes4 rgba);
```

Returns one palette entry as red, green, blue, alpha bytes. Clients typically
display the result as `0xrrggbbaa`.

Storage detail: this reads four bytes from the `Palette` blob at
`colorId * 4`.

Live read: [`colorOf(1)`](https://evm.now/address/punksdata.eth/read#colorOf:1).

Use it when you need a single color:

```solidity
bytes4 rgba = data.colorOf(colorId);
```

For renderers that need many colors, prefer `paletteRgbaBytes()` once instead
of calling `colorOf` repeatedly.

Reverts with `InvalidColorId` when `colorId >= 222`.

## `colorSupply(uint8 colorId)`

```solidity
function colorSupply(uint8 colorId) external view returns (uint32 pixels);
```

Returns the global number of pixels using a palette color across all 10,000
Punk images. For `colorId == 0`, this is the transparent pixel count. For
nonzero colors, it is the visible pixel count for that palette color.

Storage detail: this reads one direct `_colorSupplies[colorId]` value. It is a
pixel total, not a count of Punks.

Live read: [`colorSupply(0)`](https://evm.now/address/punksdata.eth/read#colorSupply:0).

Use it for palette rarity displays and color analytics.

Reverts with `InvalidColorId` when `colorId >= 222`.

## `colorMaskOf(uint16 punkId)`

```solidity
function colorMaskOf(uint16 punkId) external view returns (uint256);
```

Returns the complete visible-color mask for a Punk. Bit `colorId` is set when
that non-transparent palette color appears at least once in the image. Bit `0`
is never set.

Storage detail: this reads one direct `_colorMasks[punkId]` word. It is the
color equivalent of `traitMaskOf`, except transparency is intentionally
omitted.

Live read: [`colorMaskOf(6980)`](https://evm.now/address/punksdata.eth/read#colorMaskOf:6980).

Use it when checking several color predicates locally:

```solidity
uint256 colors = data.colorMaskOf(punkId);
bool usesColor = (colors & (uint256(1) << colorId)) != 0;
```

Reverts with `InvalidPunkId` when `punkId >= 10000`.

## `hasColor(uint16 punkId, uint8 colorId)`

```solidity
function hasColor(uint16 punkId, uint8 colorId) external view returns (bool);
```

Returns whether a Punk uses a non-transparent palette color. For
`colorId == 0`, it always returns false because transparency is not recorded
in per-Punk color masks.

Storage detail: this checks one bit inside `_colorMasks[punkId]`. It still
range-checks `colorId`, so `colorId == 0` is valid but always returns false.

Live read: [`hasColor(6980, 1)`](https://evm.now/address/punksdata.eth/read#hasColor:6980:1).

Use it for simple one-color checks. For multiple checks, call `colorMaskOf`
once and test bits locally.

Reverts with `InvalidPunkId` when `punkId >= 10000` and `InvalidColorId` when
`colorId >= 222`.

## `pixelCountOf(uint16 punkId)`

```solidity
function pixelCountOf(uint16 punkId) external view returns (uint16);
```

Returns the number of visible, non-transparent pixels in the Punk image.

Storage detail: this unpacks the 16-bit `pixelCount` field from the Punk's
48-bit scalar record inside `_packedScalarWords`.

Live read: [`pixelCountOf(6980)`](https://evm.now/address/punksdata.eth/read#pixelCountOf:6980).

Use it for visual-density filters, rarity summaries, or metadata. The sealed
dataset bounds are `148..332`.

Reverts with `InvalidPunkId` when `punkId >= 10000`.

## `colorCountOf(uint16 punkId)`

```solidity
function colorCountOf(uint16 punkId) external view returns (uint8);
```

Returns the number of distinct visible, non-transparent palette colors used by
the Punk image.

Storage detail: this unpacks the 8-bit `colorCount` field from the Punk's
48-bit scalar record inside `_packedScalarWords`.

Live read: [`colorCountOf(6980)`](https://evm.now/address/punksdata.eth/read#colorCountOf:6980).

Use it for palette-complexity filters, rarity summaries, or metadata. The
sealed dataset bounds are `2..14`.

Reverts with `InvalidPunkId` when `punkId >= 10000`.

## `colorBitmapWord(uint8 colorId, uint8 wordIndex)`

```solidity
function colorBitmapWord(
    uint8 colorId,
    uint8 wordIndex
) external view returns (uint256);
```

Returns one 256-Punk bitmap word for a palette color. A bit is set when the
corresponding Punk uses that non-transparent color. The row for `colorId == 0`
is valid but empty because transparent pixels are excluded from color masks.

Storage detail: this reads the `ColorBitmaps` blob at
`(colorId * 40 + wordIndex) * 32`.

Live read: [`colorBitmapWord(1, 27)`](https://evm.now/address/punksdata.eth/read#colorBitmapWord:1:27).

Use it to find all Punks that use a color without calling `hasColor` 10,000
times. Fetch 40 words and decode set bits.

Reverts with `InvalidColorId` when `colorId >= 222` and `InvalidWordIndex`
when `wordIndex >= 40`.

## `pixelCountBitmapWord(uint16 pixelCount, uint8 wordIndex)`

```solidity
function pixelCountBitmapWord(
    uint16 pixelCount,
    uint8 wordIndex
) external view returns (uint256);
```

Returns one 256-Punk bitmap word for an exact visible pixel count. A bit is
set when `pixelCountOf(punkId) == pixelCount`.

Storage detail: this reads the `PixelCountBitmaps` blob row
`pixelCount - 148`.

Live read: [`pixelCountBitmapWord(209, 27)`](https://evm.now/address/punksdata.eth/read#pixelCountBitmapWord:209:27).

Use it to build exact or range filters. For a range, fetch and OR the rows for
each count in the range.

Reverts with `InvalidPixelCount` when the count is outside `148..332` and
`InvalidWordIndex` when `wordIndex >= 40`.

## `colorCountBitmapWord(uint8 colorCount, uint8 wordIndex)`

```solidity
function colorCountBitmapWord(
    uint8 colorCount,
    uint8 wordIndex
) external view returns (uint256);
```

Returns one 256-Punk bitmap word for an exact visible color count. A bit is
set when `colorCountOf(punkId) == colorCount`.

Storage detail: this reads the `ColorCountBitmaps` blob row `colorCount - 2`.

Live read: [`colorCountBitmapWord(5, 27)`](https://evm.now/address/punksdata.eth/read#colorCountBitmapWord:5:27).

Use it to build exact or range filters by visible palette complexity. For a
range, fetch and OR the rows for each count in the range.

Reverts with `InvalidColorCount` when the count is outside `2..14` and
`InvalidWordIndex` when `wordIndex >= 40`.
