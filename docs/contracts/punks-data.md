# PunksData

`PunksData` is the sealed data surface for CryptoPunks traits, visual
metrics, palette colors, and 24x24 indexed pixel art. It replaces the old
display-oriented `CryptoPunksData` shape with a machine-readable primitive
that other contracts can use for filtering, rendering, metadata, and
indexing.

The contract lives at `contracts/contracts/PunksData.sol` and implements the
split interfaces in `contracts/contracts/interfaces/IPunksData.sol`. This page
documents how to use the sealed mainnet deployment at
[`punksdata.eth`](https://evm.now/address/punksdata.eth).

## Purpose

`PunksData` is designed as a canonical public-good data contract:

- 10,000 Punks.
- 111 canonical trait bits.
- 222 RGBA palette entries, with palette id `0` reserved for transparency.
- 576 indexed pixels per Punk, exposed in row-major order.
- Per-Punk trait masks, color masks, pixel counts, color counts, normalized
  Punk types, and exact head variants.
- Per-trait, per-color, per-pixel-count, and per-color-count bitmap rows for
  indexers and batch search.

The mainnet dataset is sealed and immutable. Consumers use `PunksData` through
read calls.

## Trust Model

Use the canonical mainnet deployment,
[`punksdata.eth`](https://evm.now/address/punksdata.eth)
(`0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C`), for public reads. If a
consumer accepts a configurable data address, pin it with these checks:

```solidity
require(data.isSealed(), "PunksData: unsealed");
require(data.datasetHash() == EXPECTED_DATASET_HASH, "PunksData: wrong data");
```

On the live deployment,
[`isSealed()`](https://evm.now/address/punksdata.eth/read#isSealed) returns
true and
[`datasetHash()`](https://evm.now/address/punksdata.eth/read#datasetHash)
returns the sealed dataset hash below.

## Dataset Reference

The current generated dataset is derived from the immutable Larva Labs
CryptoPunksData contract on Ethereum mainnet:

| Field | Value |
| --- | --- |
| Source contract | [`0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2`](https://evm.now/address/0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2) |
| Source network | Ethereum mainnet |
| Sealed dataset hash | `0x92117ce6cb6bb70f9ffb9bf51ebbca6a84eae10e70639295d9c4a07958cd1f68` |

The mainnet `PunksData` address recorded in the repo is
[`0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C`](https://evm.now/address/punksdata.eth).

## Core Concepts

### Punk, Trait, And Color Ids

Important bounds:

| Value | Bound |
| --- | --- |
| Punk ids | `0..9999` |
| Trait ids | `0..110` |
| Palette/color ids | `0..221` |
| Bitmap word indexes | `0..39` |
| Visible pixel count | `148..332` |
| Visible color count | `2..14` |

Functions that take a Punk id, trait id, color id, word index, pixel count, or
color count generally revert when the input is out of range. The one exception
is `isValidTraitId`, which returns a boolean so tooling can probe trait ids
without catching a revert.

### Trait Model

Traits are represented as a `uint256` mask. Bit `traitId` is set when the Punk
has that trait. The canonical catalog uses bits `0..110`; higher bits are
invalid in this base contract.

| Bits | Kind | Meaning |
| --- | --- | --- |
| `0..4` | `NormalizedType` | `Alien`, `Ape`, `Female`, `Male`, `Zombie` |
| `5..15` | `HeadVariant` | Exact head variant from the source CSV |
| `16..23` | `AttributeCount` | `0 Attributes` through `7 Attributes` |
| `24..110` | `Accessory` | 87 accessories, sorted alphabetically |

Every Punk has exactly one normalized type bit, one head-variant bit, one
attribute-count bit, and zero to seven accessory bits. Historical source
spellings are preserved. For example, `Tassle Hat`, `Pink With Hat`, and
`Do-rag` are exact canonical names.

`Alien`, `Ape`, and `Zombie` have both a normalized-type bit and an exact
head-variant bit. They currently match the same Punks, but they mean different
things: type is the broad market category, while head variant is the exact
source-image head class.

### Bitmap Rows

Bitmap functions return one `uint256` word at a time. With 10,000 Punks, each
row has 40 words:

```text
ceil(10000 / 256) = 40
```

To test whether `punkId` is present in a returned bitmap row:

```solidity
uint8 wordIndex = uint8(uint256(punkId) / 256);
uint256 bitIndex = uint256(punkId) % 256;
uint256 word = data.traitBitmapWord(traitId, wordIndex);
bool included = ((word >> bitIndex) & uint256(1)) == 1;
```

The last word contains unused high bits because `40 * 256 = 10240`. Ignore
bits for ids `10000..10239`.

### Pixels And Palette

Each Punk image is a 24x24 grid, so decoded indexed pixels are always 576
bytes. Byte `y * 24 + x` is the palette id at coordinate `(x, y)`. Palette id
`0` is transparent. Nonzero ids are visible colors.

Palette byte functions use the same color-id order:

- `paletteRgbBytes()` returns RGB triples: `rr gg bb`.
- `paletteAlphaBytes()` returns one alpha byte per color.
- `paletteRgbaBytes()` returns RGBA quads: `rr gg bb aa`.
- `colorOf(colorId)` returns a single RGBA quad as `bytes4`, displayed by most
  clients as `0xrrggbbaa`.

## Criteria Function Reference

Use the criteria surface when matching Punks by type, head variant, attribute
count, or accessory traits. Offer settlement code should usually depend on the
narrow `IPunksDataCriteria` interface instead of the broader contract ABI.

### `datasetHash()`

```solidity
function datasetHash() public view returns (bytes32);
```

Returns the hash of the committed dataset. On `punksdata.eth`, this is
`0x92117ce6cb6bb70f9ffb9bf51ebbca6a84eae10e70639295d9c4a07958cd1f68`.

Live read: [`datasetHash()`](https://evm.now/address/punksdata.eth/read#datasetHash).

Use this to pin a consumer contract or frontend to one known dataset:

```solidity
if (!data.isSealed() || data.datasetHash() != EXPECTED_DATASET_HASH) {
    revert WrongPunksData();
}
```

### `traitCount()`

```solidity
function traitCount() external pure returns (uint16);
```

Returns the number of canonical trait ids, currently `111`.

Live read: [`traitCount()`](https://evm.now/address/punksdata.eth/read#traitCount).

Use this as the upper bound when enumerating the catalog offchain:

```solidity
for (uint16 traitId; traitId < data.traitCount(); ++traitId) {
    string memory name = data.traitName(traitId);
}
```

### `isValidTraitId(uint16 traitId)`

```solidity
function isValidTraitId(uint16 traitId) external pure returns (bool);
```

Returns `true` when `traitId < traitCount()`.

Live read: [`isValidTraitId(3)`](https://evm.now/address/punksdata.eth/read#isValidTraitId:3).

Use this in UI, indexer, or validation code that wants to check a trait id
without relying on a revert. Functions such as `traitName`, `hasTrait`, and
`traitBitmapWord` still revert for invalid trait ids.

### `traitName(uint16 traitId)`

```solidity
function traitName(uint16 traitId) external view returns (string memory);
```

Returns the exact display name for a trait id. The name comes from the sealed
trait catalog and preserves the source spelling.

Live read: [`traitName(3)`](https://evm.now/address/punksdata.eth/read#traitName:3).

Use it to build user-facing labels or an offchain lookup map:

```text
(traitKind, traitName) -> traitId
```

The pair is important because some names can be meaningful only within a kind.
For example, type traits, head variants, attribute counts, and accessories are
separate catalog categories.

Reverts with `InvalidTraitId` when `traitId >= 111`.

### `traitKind(uint16 traitId)`

```solidity
function traitKind(uint16 traitId) external view returns (TraitKind);
```

Returns the category of a trait id:

Live read: [`traitKind(3)`](https://evm.now/address/punksdata.eth/read#traitKind:3).

| Enum | Meaning |
| --- | --- |
| `TraitKind.HeadVariant` | Exact source head variant |
| `TraitKind.NormalizedType` | Normalized market type |
| `TraitKind.AttributeCount` | Number of accessories |
| `TraitKind.Accessory` | Accessory trait |

Use it when presenting filters or reconstructing a kind-aware trait catalog.
Reverts with `InvalidTraitId` when the trait id is out of range.

### `traitSupply(uint16 traitId)`

```solidity
function traitSupply(uint16 traitId) external view returns (uint16);
```

Returns how many of the 10,000 Punks have the given trait. For accessory
traits this is the familiar rarity count. For type, head-variant, and
attribute-count traits it is the count of Punks in that category.

Live read: [`traitSupply(3)`](https://evm.now/address/punksdata.eth/read#traitSupply:3).

Use it for rarity displays, filter counts, or sanity checks against bitmap
popcounts.

Reverts with `InvalidTraitId` when the trait id is out of range.

### `hasTrait(uint16 punkId, uint16 traitId)`

```solidity
function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool);
```

Returns whether bit `traitId` is set in `traitMaskOf(punkId)`.

Live read: [`hasTrait(6980, 3)`](https://evm.now/address/punksdata.eth/read#hasTrait:6980:3).

Use it for simple one-off checks:

```solidity
bool wearsHoodie = data.hasTrait(punkId, hoodieTraitId);
```

For settlement or matching with multiple traits, prefer `hasTraits` so all
criteria are evaluated with one external call.

Reverts with `InvalidPunkId` when `punkId >= 10000` and `InvalidTraitId` when
`traitId >= 111`.

### `traitMaskOf(uint16 punkId)`

```solidity
function traitMaskOf(uint16 punkId) external view returns (uint256);
```

Returns the complete canonical trait mask for one Punk.

Live read: [`traitMaskOf(6980)`](https://evm.now/address/punksdata.eth/read#traitMaskOf:6980).

Use it when a consumer wants to do multiple checks locally:

```solidity
uint256 mask = data.traitMaskOf(punkId);
bool isMale = (mask & (uint256(1) << 3)) != 0;
bool hasTraitX = (mask & (uint256(1) << traitId)) != 0;
```

Reverts with `InvalidPunkId` when `punkId >= 10000`.

### `hasTraits(uint16 punkId, uint256 requiredMask, uint256 forbiddenMask, uint256 anyOfMask)`

```solidity
function hasTraits(
    uint16 punkId,
    uint256 requiredMask,
    uint256 forbiddenMask,
    uint256 anyOfMask
) external view returns (bool);
```

Evaluates a compact group of trait rules against one Punk:

Live read: [`hasTraits(6980, 8, 0, 0)`](https://evm.now/address/punksdata.eth/read#hasTraits:6980:8:0:0).

```solidity
(mask & requiredMask) == requiredMask
    && (mask & forbiddenMask) == 0
    && (anyOfMask == 0 || (mask & anyOfMask) != 0)
```

Use `requiredMask` for traits the Punk must have, `forbiddenMask` for traits
the Punk must not have, and `anyOfMask` for an optional OR group where at
least one bit must match. Set `anyOfMask` to zero when no OR group is needed.

Example:

```solidity
function matchesOffer(
    IPunksDataCriteria data,
    uint16 punkId,
    uint16 hoodieTraitId,
    uint16 cigaretteTraitId
) view returns (bool) {
    uint256 male = uint256(1) << 3;
    uint256 hoodie = uint256(1) << hoodieTraitId;
    uint256 cigarette = uint256(1) << cigaretteTraitId;

    return data.hasTraits({
        punkId: punkId,
        requiredMask: male,
        forbiddenMask: cigarette,
        anyOfMask: hoodie
    });
}
```

Mask validation is strict. The call reverts with `InvalidMask` if any mask
contains unknown bits, if `requiredMask` overlaps `forbiddenMask`, or if
`forbiddenMask` overlaps `anyOfMask`. Overlap between `requiredMask` and
`anyOfMask` is allowed but redundant.

Reverts with `InvalidPunkId` when `punkId >= 10000`.

### `traitBitmapWord(uint16 traitId, uint8 wordIndex)`

```solidity
function traitBitmapWord(
    uint16 traitId,
    uint8 wordIndex
) external view returns (uint256);
```

Returns one 256-Punk bitmap word for a trait. `wordIndex` selects the Punk id
range:

Live read: [`traitBitmapWord(3, 27)`](https://evm.now/address/punksdata.eth/read#traitBitmapWord:3:27).

```text
wordIndex 0  -> Punk ids 0..255
wordIndex 1  -> Punk ids 256..511
...
wordIndex 39 -> Punk ids 9984..9999 plus unused high bits
```

Use it for indexers and frontends that need to reconstruct matching Punk sets
efficiently. For example, fetch all 40 words for `Hoodie`, all 40 words for
`Male`, intersect the words locally, and decode set bits into Punk ids.

Reverts with `InvalidTraitId` when `traitId >= 111` and `InvalidWordIndex`
when `wordIndex >= 40`.

### `headVariantOf(uint16 punkId)`

```solidity
function headVariantOf(uint16 punkId) external view returns (HeadVariant);
```

Returns the exact head variant enum for a Punk:

Live read: [`headVariantOf(6980)`](https://evm.now/address/punksdata.eth/read#headVariantOf:6980).

```solidity
enum HeadVariant {
    Alien,
    Ape,
    Female1,
    Female2,
    Female3,
    Female4,
    Male1,
    Male2,
    Male3,
    Male4,
    Zombie
}
```

Use this when rendering metadata or when a consumer cares about the exact
source-image head class rather than the normalized market type.

Reverts with `InvalidPunkId` when `punkId >= 10000`.

### `punkTypeOf(uint16 punkId)`

```solidity
function punkTypeOf(uint16 punkId) external view returns (PunkType);
```

Returns the normalized type enum for a Punk:

Live read: [`punkTypeOf(6980)`](https://evm.now/address/punksdata.eth/read#punkTypeOf:6980).

```solidity
enum PunkType {
    Alien,
    Ape,
    Female,
    Male,
    Zombie
}
```

Use this for broad type filters, market categories, and metadata fields. For
the equivalent trait bit, use bit `uint8(punkTypeOf(punkId))` in the trait
mask.

Reverts with `InvalidPunkId` when `punkId >= 10000`.

### `attributeCountOf(uint16 punkId)`

```solidity
function attributeCountOf(uint16 punkId) external view returns (uint8);
```

Returns the number of accessory attributes on a Punk, from `0` through `7`.
This count does not include normalized type, head variant, or the
attribute-count trait itself.

Live read: [`attributeCountOf(6980)`](https://evm.now/address/punksdata.eth/read#attributeCountOf:6980).

Use it for metadata, rarity summaries, or filters that care about how many
accessories a Punk has. The equivalent trait bit is `16 + attributeCount`.

Reverts with `InvalidPunkId` when `punkId >= 10000`.

## Visual Function Reference

Use the visual surface for color and image-derived predicates without
rendering SVG or PNG. Consumers that only need this subset should depend on
`IPunksDataVisual`.

### `paletteSize()`

```solidity
function paletteSize() public pure returns (uint16);
```

Returns `222`, the number of valid palette ids. Valid color ids are
`0..paletteSize() - 1`.

Live read: [`paletteSize()`](https://evm.now/address/punksdata.eth/read#paletteSize).

Use it as an enumeration bound for palette functions or metadata color loops.

### `colorOf(uint8 colorId)`

```solidity
function colorOf(uint8 colorId) external view returns (bytes4 rgba);
```

Returns one palette entry as red, green, blue, alpha bytes. Clients typically
display the result as `0xrrggbbaa`.

Live read: [`colorOf(1)`](https://evm.now/address/punksdata.eth/read#colorOf:1).

Use it when you need a single color:

```solidity
bytes4 rgba = data.colorOf(colorId);
```

For renderers that need many colors, prefer `paletteRgbaBytes()` once instead
of calling `colorOf` repeatedly.

Reverts with `InvalidColorId` when `colorId >= 222`.

### `colorSupply(uint8 colorId)`

```solidity
function colorSupply(uint8 colorId) external view returns (uint32 pixels);
```

Returns the global number of pixels using a palette color across all 10,000
Punk images. For `colorId == 0`, this is the transparent pixel count. For
nonzero colors, it is the visible pixel count for that palette color.

Live read: [`colorSupply(0)`](https://evm.now/address/punksdata.eth/read#colorSupply:0).

Use it for palette rarity displays and color analytics.

Reverts with `InvalidColorId` when `colorId >= 222`.

### `colorMaskOf(uint16 punkId)`

```solidity
function colorMaskOf(uint16 punkId) external view returns (uint256);
```

Returns the complete visible-color mask for a Punk. Bit `colorId` is set when
that non-transparent palette color appears at least once in the image. Bit `0`
is never set.

Live read: [`colorMaskOf(6980)`](https://evm.now/address/punksdata.eth/read#colorMaskOf:6980).

Use it when checking several color predicates locally:

```solidity
uint256 colors = data.colorMaskOf(punkId);
bool usesColor = (colors & (uint256(1) << colorId)) != 0;
```

Reverts with `InvalidPunkId` when `punkId >= 10000`.

### `hasColor(uint16 punkId, uint8 colorId)`

```solidity
function hasColor(uint16 punkId, uint8 colorId) external view returns (bool);
```

Returns whether a Punk uses a non-transparent palette color. For
`colorId == 0`, it always returns false because transparency is not recorded
in per-Punk color masks.

Live read: [`hasColor(6980, 1)`](https://evm.now/address/punksdata.eth/read#hasColor:6980:1).

Use it for simple one-color checks. For multiple checks, call `colorMaskOf`
once and test bits locally.

Reverts with `InvalidPunkId` when `punkId >= 10000` and `InvalidColorId` when
`colorId >= 222`.

### `pixelCountOf(uint16 punkId)`

```solidity
function pixelCountOf(uint16 punkId) external view returns (uint16);
```

Returns the number of visible, non-transparent pixels in the Punk image.

Live read: [`pixelCountOf(6980)`](https://evm.now/address/punksdata.eth/read#pixelCountOf:6980).

Use it for visual-density filters, rarity summaries, or metadata. The sealed
dataset bounds are `148..332`.

Reverts with `InvalidPunkId` when `punkId >= 10000`.

### `colorCountOf(uint16 punkId)`

```solidity
function colorCountOf(uint16 punkId) external view returns (uint8);
```

Returns the number of distinct visible, non-transparent palette colors used by
the Punk image.

Live read: [`colorCountOf(6980)`](https://evm.now/address/punksdata.eth/read#colorCountOf:6980).

Use it for palette-complexity filters, rarity summaries, or metadata. The
sealed dataset bounds are `2..14`.

Reverts with `InvalidPunkId` when `punkId >= 10000`.

### `colorBitmapWord(uint8 colorId, uint8 wordIndex)`

```solidity
function colorBitmapWord(
    uint8 colorId,
    uint8 wordIndex
) external view returns (uint256);
```

Returns one 256-Punk bitmap word for a palette color. A bit is set when the
corresponding Punk uses that non-transparent color. The row for `colorId == 0`
is valid but empty because transparent pixels are excluded from color masks.

Live read: [`colorBitmapWord(1, 27)`](https://evm.now/address/punksdata.eth/read#colorBitmapWord:1:27).

Use it to find all Punks that use a color without calling `hasColor` 10,000
times. Fetch 40 words and decode set bits.

Reverts with `InvalidColorId` when `colorId >= 222` and `InvalidWordIndex`
when `wordIndex >= 40`.

### `pixelCountBitmapWord(uint16 pixelCount, uint8 wordIndex)`

```solidity
function pixelCountBitmapWord(
    uint16 pixelCount,
    uint8 wordIndex
) external view returns (uint256);
```

Returns one 256-Punk bitmap word for an exact visible pixel count. A bit is
set when `pixelCountOf(punkId) == pixelCount`.

Live read: [`pixelCountBitmapWord(209, 27)`](https://evm.now/address/punksdata.eth/read#pixelCountBitmapWord:209:27).

Use it to build exact or range filters. For a range, fetch and OR the rows for
each count in the range.

Reverts with `InvalidPixelCount` when the count is outside `148..332` and
`InvalidWordIndex` when `wordIndex >= 40`.

### `colorCountBitmapWord(uint8 colorCount, uint8 wordIndex)`

```solidity
function colorCountBitmapWord(
    uint8 colorCount,
    uint8 wordIndex
) external view returns (uint256);
```

Returns one 256-Punk bitmap word for an exact visible color count. A bit is
set when `colorCountOf(punkId) == colorCount`.

Live read: [`colorCountBitmapWord(5, 27)`](https://evm.now/address/punksdata.eth/read#colorCountBitmapWord:5:27).

Use it to build exact or range filters by visible palette complexity. For a
range, fetch and OR the rows for each count in the range.

Reverts with `InvalidColorCount` when the count is outside `2..14` and
`InvalidWordIndex` when `wordIndex >= 40`.

## Indexed Pixel Function Reference

Use the indexed-pixel surface for renderers and image tooling. Consumers that
only need decoded pixels and palette bytes should depend on
`IPunksDataIndexed`.

### `indexedPixelsOf(uint16 punkId)`

```solidity
function indexedPixelsOf(uint16 punkId) external view returns (bytes memory);
```

Returns exactly 576 bytes: one global palette id for each pixel in row-major
order. Offset `y * 24 + x` is the color id at coordinate `(x, y)`.

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

### `colorAt(uint16 punkId, uint8 x, uint8 y)`

```solidity
function colorAt(
    uint16 punkId,
    uint8 x,
    uint8 y
) external view returns (uint8 colorId);
```

Returns the palette id at one coordinate. `x` and `y` are zero-based and must
both be less than `24`.

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

### `paletteRgbBytes()`

```solidity
function paletteRgbBytes() external view returns (bytes memory);
```

Returns the full palette as RGB triples. The length is:

Live read: [`paletteRgbBytes()`](https://evm.now/address/punksdata.eth/read#paletteRgbBytes).

```text
222 colors * 3 bytes = 666 bytes
```

Use it for PNG `PLTE` chunks or any renderer that needs RGB without alpha.
Color id `i` starts at byte offset `i * 3`.

### `paletteAlphaBytes()`

```solidity
function paletteAlphaBytes() external view returns (bytes memory);
```

Returns one alpha byte per palette color. The length is:

Live read: [`paletteAlphaBytes()`](https://evm.now/address/punksdata.eth/read#paletteAlphaBytes).

```text
222 colors * 1 byte = 222 bytes
```

Use it for PNG `tRNS` chunks or transparency inspection. Color id `i` is at
byte offset `i`.

### `paletteRgbaBytes()`

```solidity
function paletteRgbaBytes() external view returns (bytes memory);
```

Returns the full palette as RGBA quads. The length is:

Live read: [`paletteRgbaBytes()`](https://evm.now/address/punksdata.eth/read#paletteRgbaBytes).

```text
222 colors * 4 bytes = 888 bytes
```

Use it for RGBA expansion, SVG color generation, or metadata color lists.
Color id `i` starts at byte offset `i * 4`.

## Common Usage Patterns

### Resolve Trait Ids By Name

The contract intentionally does not store a name-to-id mapping. Build one
offchain by enumerating the sealed catalog:

```ts
const traitCount = await data.read.traitCount()
const byKindAndName = new Map<string, number>()

for (let id = 0; id < traitCount; id++) {
  const [kind, name] = await Promise.all([
    data.read.traitKind([id]),
    data.read.traitName([id]),
  ])
  byKindAndName.set(`${kind}:${name}`, id)
}
```

Then convert selected filters into masks:

```ts
const hoodie = byKindAndName.get(`${TraitKind.Accessory}:Hoodie`)
if (hoodie === undefined) throw new Error('Missing Hoodie trait')
const requiredMask = 1n << BigInt(hoodie)
```

### Match An Offer Or Filter

For contracts, store compact masks and call `hasTraits` during settlement:

```solidity
struct Criteria {
    uint256 requiredMask;
    uint256 forbiddenMask;
    uint256 anyOfMask;
}

function accepts(uint16 punkId, Criteria memory c) external view returns (bool) {
    return PUNKS_DATA.hasTraits(
        punkId,
        c.requiredMask,
        c.forbiddenMask,
        c.anyOfMask
    );
}
```

This avoids dynamic arrays of trait filters and keeps settlement gas bounded.

### Scan Bitmaps Offchain

For frontends and indexers, bitmap rows are more efficient than calling a
predicate for every Punk:

```ts
const ids: number[] = []

for (let wordIndex = 0; wordIndex < 40; wordIndex++) {
  const word = await data.read.traitBitmapWord([hoodieTraitId, wordIndex])
  for (let bit = 0; bit < 256; bit++) {
    const punkId = wordIndex * 256 + bit
    if (punkId >= 10_000) break
    if (((word >> BigInt(bit)) & 1n) === 1n) ids.push(punkId)
  }
}
```

The same pattern works for `colorBitmapWord`, `pixelCountBitmapWord`, and
`colorCountBitmapWord`.

### Render From Indexed Pixels

Renderers should read the indexed pixels and palette bytes once, then expand
locally:

```solidity
bytes memory pixels = data.indexedPixelsOf(punkId);
bytes memory palette = data.paletteRgbaBytes();

uint8 colorId = uint8(pixels[i]);
uint256 paletteOffset = uint256(colorId) * 4;
bytes1 r = palette[paletteOffset];
bytes1 g = palette[paletteOffset + 1];
bytes1 b = palette[paletteOffset + 2];
bytes1 a = palette[paletteOffset + 3];
```

`PunksRenderer` uses this exact primitive to derive RGBA, SVG, PNG-8, and
metadata outputs without storing duplicated art bytes.

## Reverts

The ABI uses custom errors instead of revert strings:

| Error | Typical cause |
| --- | --- |
| `InvalidPunkId` | Punk id is greater than `9999` |
| `InvalidTraitId` | Trait id is greater than `110` |
| `InvalidColorId` | Palette id is greater than `221` |
| `InvalidWordIndex` | Bitmap word index is greater than `39` |
| `InvalidCoordinate` | Pixel coordinate is outside `0..23` |
| `InvalidPixelCount` | Pixel-count bitmap query is outside `148..332` |
| `InvalidColorCount` | Color-count bitmap query is outside `2..14` |
| `InvalidMask` | Trait or color mask contains invalid or conflicting bits |
| `MalformedPixelBlob` | Sealed compressed pixel bytes are internally inconsistent |

## Integration Notes

Use the split interfaces when a consumer only needs part of the ABI:

- `IPunksDataCriteria` for trait predicates and catalog data.
- `IPunksDataVisual` for color and visual metric predicates.
- `IPunksDataIndexed` for decoded pixels and palette bytes.

`PunksRenderer` is the first deployed consumer of this data contract. It reads
`indexedPixelsOf`, palette bytes, trait names, scalar metrics, and masks to
produce RGBA, SVG, PNG, and metadata outputs.

The research notes behind this design are in
`contracts/docs/cryptopunks-data-research/`, especially the decisions sheet.
