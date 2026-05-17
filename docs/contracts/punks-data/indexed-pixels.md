# PunksData Indexed Pixels API

These functions are for drawing a Punk. They give you either the whole 24x24
palette-id image, one pixel's palette id, or the palette bytes needed to turn
ids into colors.

Indexed-pixel reads reconstruct a 576-byte image from two blob-backed tables:
`PixelOffsets` locates the compressed entry, and `CompressedPixels` stores the
sparse visible-pixel encoding. Palette reads come from the separate RGBA
palette blob. Consumers that only need decoded pixels and palette bytes should
depend on `IPunksDataIndexed`.

Use the indexed-pixel surface for renderers and image tooling.

## `indexedPixelsOf(uint16 punkId)`

```solidity
function indexedPixelsOf(uint16 punkId) external view returns (bytes memory);
```

Returns exactly 576 bytes: one global palette id for each pixel in row-major
order. Offset `y * 24 + x` is the color id at coordinate `(x, y)`.

Storage detail: this reads two `uint24` offsets from `PixelOffsets`, slices
one compressed entry out of `CompressedPixels`, then decodes visible pixels
into a fresh 576-byte array. Transparent pixels remain zero.

Live read: [`indexedPixelsOf(6980)`](https://evm.now/address/punksdata.eth/read#indexedPixelsOf:6980).

Use it as the canonical image primitive:

```solidity
bytes memory pixels = data.indexedPixelsOf(punkId);
uint8 colorId = uint8(pixels[uint256(y) * 24 + x]);
```

The function decodes the compressed per-Punk storage entry and validates the
entry shape while reading. It reverts with `InvalidPunkId` when
`punkId >= 10000` and `MalformedPixelBlob` if the sealed compressed data is
internally inconsistent.

## `colorAt(uint16 punkId, uint8 x, uint8 y)`

```solidity
function colorAt(
    uint16 punkId,
    uint8 x,
    uint8 y
) external view returns (uint8 colorId);
```

Returns the palette id at one coordinate. `x` and `y` are zero-based and must
both be less than `24`.

Storage detail: this decodes the same 576-byte image as `indexedPixelsOf`,
then returns byte `y * 24 + x`.

Live read: [`colorAt(6980, 0, 0)`](https://evm.now/address/punksdata.eth/read#colorAt:6980:0:0).

Use it for spot checks, tests, or simple clients:

```solidity
uint8 topLeft = data.colorAt(punkId, 0, 0);
```

Internally this decodes the same 576-byte image as `indexedPixelsOf`, so do
not call it in an onchain loop when you need many pixels. Decode once with
`indexedPixelsOf` instead.

Reverts with `InvalidCoordinate` when `x >= 24` or `y >= 24`, and
`InvalidPunkId` when `punkId >= 10000`.

## `paletteRgbBytes()`

```solidity
function paletteRgbBytes() external view returns (bytes memory);
```

Returns the full palette as RGB triples. The length is:

Storage detail: this reads the whole RGBA `Palette` blob and copies out bytes
`r`, `g`, and `b` for each color.

Live read: [`paletteRgbBytes()`](https://evm.now/address/punksdata.eth/read#paletteRgbBytes).

```text
222 colors * 3 bytes = 666 bytes
```

Use it for PNG `PLTE` chunks or any renderer that needs RGB without alpha.
Color id `i` starts at byte offset `i * 3`.

## `paletteAlphaBytes()`

```solidity
function paletteAlphaBytes() external view returns (bytes memory);
```

Returns one alpha byte per palette color. The length is:

Storage detail: this reads the whole RGBA `Palette` blob and copies out byte
`a` for each color.

Live read: [`paletteAlphaBytes()`](https://evm.now/address/punksdata.eth/read#paletteAlphaBytes).

```text
222 colors * 1 byte = 222 bytes
```

Use it for PNG `tRNS` chunks or transparency inspection. Color id `i` is at
byte offset `i`.

## `paletteRgbaBytes()`

```solidity
function paletteRgbaBytes() external view returns (bytes memory);
```

Returns the full palette as RGBA quads. The length is:

Storage detail: this returns the `Palette` blob as stored.

Live read: [`paletteRgbaBytes()`](https://evm.now/address/punksdata.eth/read#paletteRgbaBytes).

```text
222 colors * 4 bytes = 888 bytes
```

Use it for RGBA expansion, SVG color generation, or metadata color lists.
Color id `i` starts at byte offset `i * 4`.
