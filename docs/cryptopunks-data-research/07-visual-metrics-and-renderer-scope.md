# Visual Metrics And Renderer Scope

This note updates the first-pass research with a broader goal: a maximally
useful Punk data contract, not only a trait oracle for the current auction
interface.

## Why This Changes The Direction

The live `punkImage(uint16)` crawl found:

- 222 total RGBA colors across the collection, including transparent.
- 221 visible RGBA colors.
- Only three alpha values appear: 0, 128, and 255.
- Every 24x24 Punk can be represented as 576 one-byte color IDs.

That makes a full indexed-image dataset realistic. Instead of storing or
returning 2,304 raw RGBA bytes per Punk, a V2 data contract can store 576 bytes
per Punk plus a 222-entry palette.

This is much more useful than a traits-only contract:

- exact color predicates become possible,
- color count and pixel count become first-class metrics,
- renderers can avoid the old asset-composition algorithm,
- any consumer can reconstruct raw RGBA from stable indexed pixels,
- the same data supports SVG, bitmap, metadata, and filtering.

## Crawl Hashes

Source:

```text
0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2.punkImage(uint16)
```

Hash over concatenated 2,304-byte `punkImage` outputs for Punk IDs 0 through
9999:

```text
db0e780ac7553b5dd6a3bb02ed2bf8106c16659e15a36797294e01e8817286bf
```

Hash over visual metric lines formatted as
`punkId:visiblePixels:visibleColorCount:sortedVisibleColors\n`:

```text
03a45587db7de6c2b56af7c05c37fdc4f0c8bede398c9360e880ccf55b058a41
```

## Pixel And Color Metrics

There are 5,760,000 total pixel positions across the collection.

| Alpha | Pixel count | Meaning |
| ---: | ---: | --- |
| 0 | 3,668,906 | transparent |
| 128 | 8,226 | semi-transparent visible pixels |
| 255 | 2,082,868 | opaque visible pixels |

Visible pixel count per Punk:

| Metric | Value |
| --- | ---: |
| Minimum | 148 |
| 5th percentile | 161 |
| 25th percentile | 191 |
| Median | 206 |
| Mean | 209.1094 |
| 75th percentile | 223 |
| 95th percentile | 259 |
| 99th percentile | 306 |
| Maximum | 332 |

Examples with minimum visible pixel count 148:

```text
31, 60, 89, 121, 127, 140, 209, 226, 242, 275, 350, 428
```

Examples with maximum visible pixel count 332:

```text
465, 1250, 1422, 3216, 3543, 4757, 5473, 6400, 7171, 7674, 7748
```

Visible color count per Punk:

| Color count | Punks |
| ---: | ---: |
| 2 | 24 |
| 3 | 170 |
| 4 | 463 |
| 5 | 1,262 |
| 6 | 2,165 |
| 7 | 2,226 |
| 8 | 1,747 |
| 9 | 1,040 |
| 10 | 589 |
| 11 | 215 |
| 12 | 73 |
| 13 | 24 |
| 14 | 2 |

Examples with 2 visible colors:

```text
338, 615, 676, 871, 1006, 1403, 2743, 2752, 2801, 3054, 3065, 3665
```

Examples with 14 visible colors:

```text
4067, 7334
```

## Most Common Visible Colors

| RGBA | Pixel count |
| --- | ---: |
| `#000000ff` | 799,786 |
| `#ae8b61ff` | 234,594 |
| `#dbb180ff` | 233,981 |
| `#713f1dff` | 218,509 |
| `#ead9d9ff` | 80,944 |
| `#fff68eff` | 49,700 |
| `#a66e2cff` | 45,868 |
| `#e22626ff` | 36,597 |
| `#555555ff` | 20,485 |
| `#8119b7ff` | 17,901 |
| `#ffffffff` | 17,092 |
| `#28b143ff` | 13,611 |
| `#710cc7ff` | 13,305 |
| `#1a43c8ff` | 12,506 |
| `#51360cff` | 12,144 |

The transparent color `#00000000` appears 3,668,906 times.

## Proposed Visual Data API

Exact color and pixel metrics should be part of the canonical data contract:

```solidity
function colorCount() external view returns (uint16);
function colorOf(uint8 colorId) external view returns (bytes4 rgba);
function colorSupply(uint8 colorId) external view returns (uint32 pixels);

function indexedPixelsOf(uint16 punkId) external view returns (bytes memory);
function rgbaPixelsOf(uint16 punkId) external view returns (bytes memory);
function colorAt(uint16 punkId, uint8 x, uint8 y) external view returns (uint8 colorId);

function pixelCountOf(uint16 punkId) external view returns (uint16);
function colorCountOf(uint16 punkId) external view returns (uint8);
function colorMaskOf(uint16 punkId) external view returns (uint256);
function hasColor(uint16 punkId, uint8 colorId) external view returns (bool);

function visiblePixelBitmapOf(uint16 punkId)
    external
    view
    returns (uint256 word0, uint256 word1, uint256 word2);

function colorBitmapWord(uint8 colorId, uint8 wordIndex) external view returns (uint256);
function pixelCountBitmapWord(uint16 pixelCount, uint8 wordIndex) external view returns (uint256);
function colorCountBitmapWord(uint8 colorCount, uint8 wordIndex) external view returns (uint256);
```

Because there are only 221 visible colors, a single `uint256 colorMask` can
describe all colors used by a Punk.

## Renderer Scope

Encoders are split by output format and read primitives from `PunksData`
via public views, not from the old Larva Labs asset-composition contract.

`PunksSvg` API:

```solidity
enum BackgroundMode {
    Transparent,
    Owned,         // #638596
    ForSale,
    HasBid,
    Transfer,
    Wrapped,
    LegacyWrapped,
    Custom
}

function punkSvg(uint16 punkId, BackgroundMode mode) external view returns (string memory);
function punkSvgCustomBackground(uint16 punkId, bytes4 rgba) external view returns (string memory);
```

`PunksMetadata` API:

```solidity
function metadataJson(uint16 punkId, BackgroundMode mode) external view returns (string memory);
```

`PunksMetadata` returns OpenSea-shaped JSON and embeds image data from
`PunksPng` or `PunksSvg`. Renamed from `tokenUriJson` so it does not
claim to be the canonical `tokenURI` for any specific Punk token
contract.

`PunksPng` API (per-Punk + paged composite):

```solidity
function punkPng(uint16 punkId) external view returns (bytes memory);
function punkPng(uint16 punkId, bytes4 backgroundRgba) external view returns (bytes memory);

function mosaicIndexedRow(uint8 rowIndex) external view returns (bytes memory);
function mosaicRgbaRow(uint8 rowIndex) external view returns (bytes memory);
function compositePngChunkCount() external pure returns (uint16);
function compositePngChunk(uint16 chunkIndex) external view returns (bytes memory);
```

For contract consumers wanting raw bytes, `mosaicIndexedRow` /
`mosaicRgbaRow` (Layer 1) are the primitives. Per-Punk indexed bytes are
already exposed by `PunksData.indexedPixelsOf(uint16)` directly.

Concatenating `compositePngChunk(0..N-1)` is byte-equal to the canonical
GitHub `punks.png`. Reproducing the reference truecolor RGBA PNG and its
exact zlib/DEFLATE stream is the encoder's hard milestone — see
[08 Full Composite PNG Generation](./08-full-composite-png-generation.md).

## Background Colors

The official current app bundle exposes these tile color constants:

| Mode | Color |
| --- | --- |
| Default / owned | `#638596` |
| For sale | `#95554f` |
| Has bid | `#8e6fb6` |
| Transfer | `#75bf80` |
| Wrapped | `#66a670` |
| Legacy wrapped | `#66a6705e` |

The current app's download dropdown offers owned/default, for-sale, has-bid,
and transparent backgrounds. The archived Larva Labs page describes the
traditional rule as blue for not for sale with no current bids, red for
available for sale, and purple for an active bid. Its history table also uses
lighter row colors:

| History row | Color |
| --- | --- |
| Bid | `#b8a7ce` |
| Sale | `#adc9d6` |
| Offered | `#d6adad` |
| Transfer / claimed | `#add6b8` |
| Wrap | `#9bbfa5` |

The renderer should expose the status colors as display modes, not infer live
status. Live status belongs to market/indexer code or a separate state adapter.

## Data Layout Implication

Recommended immutable blobs:

```text
palette.bin
  222 * 4 bytes

indexedPixels.bin
  10000 * 576 bytes

traitMasks.bin
  10000 * 32 bytes

traitBitmaps.bin
  traitCount * 40 * 32 bytes

colorMasks.bin
  10000 * 32 bytes

visualMetrics.bin
  pixel count, color count, histogram offsets

colorHistograms.bin
  packed (colorId, pixelCount) pairs
```

This is a bigger deployment than a traits-only oracle, but it is much more
useful and still straightforward to verify. The generator must prove that
expanding each indexed image through `palette.bin` exactly reproduces the
source `punkImage(uint16)` bytes.
