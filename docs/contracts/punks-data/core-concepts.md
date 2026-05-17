# PunksData Core Concepts

This page explains the storage shapes behind `PunksData`: trait masks, color
masks, packed scalar words, bitmap rows, blob storage, compressed pixels, and
palette ids.

## Read Surfaces In One Minute

`PunksData` stores the same Punk facts in a few different layouts. One layout
is good for asking "what does this Punk have?", another is good for asking
"which Punks match this thing?", and another stores the large image bytes.

The contract deliberately duplicates some derived facts because each layout
serves a different read pattern. Per-Punk masks and packed scalar words answer
single-Punk questions with one storage read. Bitmap rows act like inverted
indexes for frontends and indexers that want all matching Punk ids.
Blob-backed byte arrays hold data that is too large or too variable-length for
plain mappings, such as trait names, palette bytes, bitmap tables, and
compressed pixels.

| Question                                 | Storage shape                           | Main functions                                                                    |
| ---------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| What traits does Punk `x` have?          | Per-Punk trait mask                     | `traitMaskOf`, `hasTrait`, `hasTraits`                                            |
| Which Punks have trait `t`?              | Trait bitmap rows                       | `traitBitmapWord`                                                                 |
| What colors does Punk `x` use?           | Per-Punk color mask                     | `colorMaskOf`, `hasColor`                                                         |
| Which Punks use color `c`?               | Color bitmap rows                       | `colorBitmapWord`                                                                 |
| What are Punk `x`'s small visual facts?  | Packed scalar words                     | `pixelCountOf`, `colorCountOf`, `punkTypeOf`, `headVariantOf`, `attributeCountOf` |
| What does Punk `x` look like?            | Offset table plus compressed pixel blob | `indexedPixelsOf`, `colorAt`                                                      |
| What are trait names and palette colors? | Metadata and palette blobs              | `traitName`, `traitKind`, `traitSupply`, `colorOf`, palette byte functions        |

## Punks, Traits, And Colors

Punks, traits, and colors all have small number labels. Functions take those
labels instead of strings because numbers are cheaper and unambiguous onchain.

All public readers use fixed canonical ranges. Most readers revert when an id
or count is outside its range, so calling code can treat a successful read as
range-checked. `isValidTraitId` is the only probing helper that returns
`false` instead of reverting.

Important bounds:

| Value               | Bound      |
| ------------------- | ---------- |
| Punk ids            | `0..9999`  |
| Trait ids           | `0..110`   |
| Palette/color ids   | `0..221`   |
| Bitmap word indexes | `0..39`    |
| Visible pixel count | `148..332` |
| Visible color count | `2..14`    |

## Trait Masks

A trait mask is a compact yes/no list packed into one number. If bit `3` is
set, the Punk has trait id `3`. If bit `70` is clear, the Punk does not have
trait id `70`.

A mask is a `uint256`, but only bits `0..110` are canonical in this contract.
Bit `traitId` is set when the Punk has that trait. This gives callers cheap
set operations: AND with a required mask, AND with a forbidden mask, or AND
with an "any of these" mask. It also means a mask is not an ordered list; the
trait order comes from the catalog, not from the integer itself.

The canonical trait-bit layout is:

| Bits      | Kind             | Meaning                                    |
| --------- | ---------------- | ------------------------------------------ |
| `0..4`    | `NormalizedType` | `Alien`, `Ape`, `Female`, `Male`, `Zombie` |
| `5..15`   | `HeadVariant`    | Exact head variant from the source CSV     |
| `16..23`  | `AttributeCount` | `0 Attributes` through `7 Attributes`      |
| `24..110` | `Accessory`      | 87 accessories, sorted alphabetically      |

Every Punk has exactly one normalized type bit, one head-variant bit, one
attribute-count bit, and zero to seven accessory bits. Historical source
spellings are preserved. For example, `Tassle Hat`, `Pink With Hat`, and
`Do-rag` are exact canonical names.

`Alien`, `Ape`, and `Zombie` have both a normalized-type bit and an exact
head-variant bit. They currently match the same Punks, but they mean different
things: type is the broad market category, while head variant is the exact
source-image head class.

Storage details:

- Trait masks are stored in `_traitMaskPairs`.
- Each storage word holds two Punk masks because 111 bits fit inside 128 bits.
- Even Punk ids use the low 128 bits. Odd Punk ids use the high 128 bits.
- `traitMaskOf(punkId)` unpacks the mask.
- `hasTrait(punkId, traitId)` checks one bit in that mask.
- `hasTraits(punkId, requiredMask, forbiddenMask, anyOfMask)` checks several
  mask rules in one external call and rejects masks with non-canonical bits.

For example:

```solidity
uint256 mask = data.traitMaskOf(punkId);
bool hasTrait = (mask & (uint256(1) << traitId)) != 0;
```

## Color Masks And Packed Scalars

A color mask uses the same bitset pattern as a trait mask, but the bits are
palette colors instead of traits. Packed scalars are a tiny summary record for
each Punk: how many visible pixels, how many colors, how many accessories,
what type, and which exact head.

A color mask is also a `uint256`. Bit `colorId` is set when a Punk uses that
visible palette color at least once. Palette id `0` is transparent and is
never set in a per-Punk color mask, even though transparency is a valid
palette entry and `colorSupply(0)` counts transparent pixels globally.

The direct visual storage uses three shapes:

| Storage              | Shape                                         | Reader functions                                                                  |
| -------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| `_colorMasks`        | One `uint256` per Punk, bits `1..221` only    | `colorMaskOf`, `hasColor`                                                         |
| `_packedScalarWords` | Five 48-bit Punk records per `uint256`        | `pixelCountOf`, `colorCountOf`, `attributeCountOf`, `punkTypeOf`, `headVariantOf` |
| `_colorSupplies`     | One `uint32` total pixel count per palette id | `colorSupply`                                                                     |

Each 48-bit scalar is packed as:

| Bits     | Field                     |
| -------- | ------------------------- |
| `0..15`  | Visible pixel count       |
| `16..23` | Visible color count       |
| `24..31` | Accessory attribute count |
| `32..39` | Normalized Punk type enum |
| `40..47` | Exact head variant enum   |

## Bitmap Rows

A bitmap row answers a question like "which Punks have Hoodie?" The row has
one bit per Punk. If bit `6980` is set, Punk `6980` is in the answer.

Bitmap rows are inverted indexes. Instead of checking 10,000 Punks one by one,
a frontend or indexer reads 40 `uint256` words and decodes the set bits
locally. The same row layout is reused for traits, colors, exact visible pixel
counts, and exact visible color counts.

With 10,000 Punks, each row has 40 words:

```text
ceil(10000 / 256) = 40
```

`wordIndex` selects the Punk id range:

```text
wordIndex 0  -> Punk ids 0..255
wordIndex 1  -> Punk ids 256..511
...
wordIndex 39 -> Punk ids 9984..9999 plus unused high bits
```

To test whether `punkId` is present in a returned bitmap row:

```solidity
uint8 wordIndex = uint8(uint256(punkId) / 256);
uint256 bitIndex = uint256(punkId) % 256;
uint256 word = data.traitBitmapWord(traitId, wordIndex);
bool included = ((word >> bitIndex) & uint256(1)) == 1;
```

Bitmap blobs are stored row-major. The byte offset for any row and word is:

```text
(row * 40 + wordIndex) * 32
```

The meaning of `row` depends on the bitmap table:

| Blob                | Row key            | Reader                 |
| ------------------- | ------------------ | ---------------------- |
| `TraitBitmaps`      | `traitId`          | `traitBitmapWord`      |
| `ColorBitmaps`      | `colorId`          | `colorBitmapWord`      |
| `PixelCountBitmaps` | `pixelCount - 148` | `pixelCountBitmapWord` |
| `ColorCountBitmaps` | `colorCount - 2`   | `colorCountBitmapWord` |

The last word contains unused high bits because `40 * 256 = 10240`. Ignore
bits for ids `10000..10239`.

## Blob Storage

Some data is too big to keep neatly in normal Solidity variables, so the
contract stores big byte strings in separate helper contracts and remembers
where each chunk ends.

`BlobStorage` is an append-only, chunked, SSTORE2-style byte store. Each
loaded chunk is deployed as bytecode by `BytecodeBlob.write`. The runtime code
is `STOP || data`, so reads skip the first byte and copy data with
`extcodecopy`. The parent contract stores each chunk pointer plus its
cumulative end offset. Reads binary-search the chunk list, then copy across as
many chunks as needed. This keeps large immutable tables readable without
putting every byte in ordinary contract storage.

The blob-backed storage types are:

| BlobId              | Layout                                                                | Used by                                 |
| ------------------- | --------------------------------------------------------------------- | --------------------------------------- |
| `TraitBitmaps`      | `111 * 40` big-endian `uint256` bitmap words                          | `traitBitmapWord`                       |
| `TraitMeta`         | 111 fixed 6-byte records, followed by a pooled trait-name byte string | `traitName`, `traitKind`, `traitSupply` |
| `Palette`           | 222 RGBA quads, 4 bytes per color                                     | `colorOf`, palette byte functions       |
| `PixelOffsets`      | 10,001 big-endian `uint24` offsets                                    | `indexedPixelsOf`, `colorAt`            |
| `CompressedPixels`  | Variable-length compressed image entries                              | `indexedPixelsOf`, `colorAt`            |
| `ColorBitmaps`      | `222 * 40` big-endian `uint256` bitmap words                          | `colorBitmapWord`                       |
| `PixelCountBitmaps` | `185 * 40` big-endian `uint256` bitmap words                          | `pixelCountBitmapWord`                  |
| `ColorCountBitmaps` | `13 * 40` big-endian `uint256` bitmap words                           | `colorCountBitmapWord`                  |

The live deployment stores finalized blob chunks and exposes them only through
the read functions listed above.

## Pixels And Palette

Each Punk picture is a 24 by 24 grid. Instead of storing full red, green,
blue, alpha bytes for every pixel, each pixel stores a small palette id. The
palette says what color each id means.

Decoded indexed pixels are always 576 bytes. Byte `y * 24 + x` is the global
palette id at coordinate `(x, y)`. Palette id `0` is transparent. Nonzero ids
are visible colors. The compressed storage avoids writing all 576 bytes per
Punk by storing a visible-pixel bitmap, a local palette of the visible colors
used by that Punk, and packed indexes into that local palette.

Compressed pixel entries are addressed by `PixelOffsets`:

```text
start = PixelOffsets[punkId]
end   = PixelOffsets[punkId + 1]
entry = CompressedPixels[start:end]
```

Each compressed entry is:

```text
visibleColorCount:uint8
visibleBitmap[72]
localPalette[visibleColorCount]
packedLocalIndexes
```

`visibleBitmap` has one bit for each of the 576 pixel positions. A set bit
means the pixel is visible. Invisible pixels decode to palette id `0`.
`localPalette` maps small local color indexes back to global palette ids.
`packedLocalIndexes` stores one local index for each visible pixel, using only
as many bits as that Punk's local palette needs.

Palette byte functions use the same color-id order:

- `paletteRgbBytes()` returns RGB triples: `rr gg bb`.
- `paletteAlphaBytes()` returns one alpha byte per color.
- `paletteRgbaBytes()` returns RGBA quads: `rr gg bb aa`.
- `colorOf(colorId)` returns a single RGBA quad as `bytes4`, displayed by most
  clients as `0xrrggbbaa`.
