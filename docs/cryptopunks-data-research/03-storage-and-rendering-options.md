# Storage And Rendering Options

Deployment cost is not the primary constraint. The right target is maximum
public usefulness with clear immutability and practical read APIs.

The useful data payload is still too large to put in one contract's runtime
bytecode. EIP-170 caps runtime bytecode at `0x6000` bytes or 24,576 bytes. Any
serious V2 needs either storage slots, bytecode-backed data chunks, or a
combination.

## Data Size Estimates

For trait predicates:

| Payload | Estimate |
| --- | ---: |
| 10,000 Punk masks, 128 bits each | 160,000 bytes |
| 108 trait bitmaps, 10,000 bits each | 135,000 bytes |
| 98 exact-name trait bitmaps | 122,500 bytes |
| 87 accessory-only bitmaps | 108,750 bytes |
| Trait names and metadata | about 2 KB |
| 10,000 indexed 24x24 images, 1 byte per pixel | 5,760,000 bytes |
| Global RGBA palette, 222 colors | 888 bytes |
| 10,000 visible-pixel bitmaps, 576 bits each | 720,000 bytes |
| 10,000 color masks, 256 bits each | 320,000 bytes |
| Packed per-Punk color histograms | about 230,000 bytes |

The most useful full trait package, masks plus bitmaps, is roughly 295 KB
before ABI/chunk overhead.

A maximally useful visual package is larger, but still tractable with chunked
immutable data. The live crawl found 222 total RGBA colors including
transparent, so every Punk image can be represented as a 576-byte indexed image
rather than 2,304 bytes of raw RGBA.

## Option A: Plain Storage Mapping

Shape:

```solidity
mapping(uint16 => uint128) internal punkMask;
mapping(uint16 => mapping(uint8 => uint256)) internal bitmapWords;
```

Pros:

- Simple Solidity.
- `hasTrait` is one or a few `SLOAD`s.
- Easy to audit.

Cons:

- Expensive initialization. This is acceptable if deployment cost is
  deliberately deprioritized, but it still means many loader calls.
- Masks plus bitmaps duplicate data.
- Requires many loader transactions unless constructor data is heavily packed.
- Multi-megabyte indexed image data is awkward as discrete storage slots and
  awkward to bulk-read back out.

Verdict: good for hot scalar data if simplicity matters. It is not the best
shape for the full indexed image dataset.

## Option B: Bytecode-Backed Blobs

Use SSTORE2-style storage contracts or a local equivalent. Data is stored as
contract bytecode and read via `EXTCODECOPY`.

Pros:

- Much cheaper for large immutable blobs than writing storage slots.
- Naturally immutable.
- Works well for packed masks and bitmap chunks.
- Fits public-good data because the dataset should never change.

Cons:

- Slightly more assembly and pointer management.
- Reads below 32 bytes are not always cheaper than an `SLOAD`.
- Needs careful chunking under the 24,576 byte code limit.
- Library choice should be audited or very small.

SSTORE2's own docs show why this pattern exists: it stores data in contract
code and reads it with `EXTCODECOPY`; it is cheaper than storage for larger
reads and writes.

Recommended blob layout:

```text
punkMasks.bin
  offset = punkId * 16
  value  = uint128 mask, little-endian or big-endian but documented

traitBitmaps.bin
  offset = (traitId * 40 + wordIndex) * 32
  value  = uint256 bitmap word

traitMeta.bin
  compact table of name offsets, kind, supply
```

With 295 KB total, this is about 13 chunks at 24 KB each.

Verdict: still the best fit for immutable public-good data. The reason is not
only deployment cost. Bytecode chunks are a natural way to publish large,
sealed, sequential data like indexed images, bitmaps, and histograms.

## Option B2: Full Indexed Image Dataset

Store fully flattened Punk images as palette indexes:

```text
palette.bin
  222 RGBA colors, colorId 0 reserved for transparent

indexedPixels.bin
  offset = punkId * 576 + y * 24 + x
  value  = uint8 colorId

visualMetrics.bin
  pixel count, color count, color mask, optional histogram pointer
```

Pros:

- Fully independent renderer can be simple and deterministic.
- `colorAt`, `indexedPixelsOf`, `rgbaPixelsOf`, SVG, and bitmap outputs all
  share one canonical data source.
- Exact color predicates become first-class.
- The original expensive composition algorithm does not need to run during
  rendering.

Cons:

- Roughly 5.76 MB just for indexed pixels.
- Requires many data chunks.
- Needs a generator and exhaustive verification against the source
  `punkImage(uint16)` output.

Verdict: with deployment cost deprioritized, this becomes the best target for a
maximally useful data contract.

## Option C: Bitmap-Only Contract

Store only trait bitmaps and derive `hasTrait` by reading one bitmap word:

```solidity
wordIndex = punkId / 256;
bitIndex = punkId % 256;
has = (bitmapWord(traitId, wordIndex) & (1 << bitIndex)) != 0;
```

Pros:

- Great for UI filtering.
- Smaller than storing both masks and bitmaps.
- `traitSupply` can be stored separately or computed offchain.

Cons:

- `hasTraits` with multiple filters reads one word per filter.
- The auction path keeps dynamic filter loops.
- Less compact for "does this Punk satisfy all of these filters?" than a single
  Punk mask.

Verdict: good minimal public-good data layer if UI filtering is the priority.
For auctions, masks are worth the extra data.

## Option D: Mask-Only Contract

Store only per-Punk trait masks.

Pros:

- `hasTrait` and `hasTraits` are cheap.
- Smaller than masks plus bitmaps.
- Directly improves the auction contract.

Cons:

- Frontends must fetch all 10,000 masks to build trait result sets.
- No cheap "all Punks with trait X" view.
- Less useful as a general public good.

Verdict: best minimum viable auction improvement. Not enough if the goal is
excellent trait browsing.

## Option E: Merkle Roots Of Trait Sets

Store a Merkle root per trait and require proofs at settlement.

Pros:

- Very small onchain footprint.
- Familiar from Seaport criteria orders.
- Can support arbitrary sets.

Cons:

- Proof generation and UX complexity.
- Trait supply and membership are not directly readable without offchain data.
- Worse than direct masks for common canonical traits.

Verdict: useful for arbitrary baskets, not for the canonical data contract.

## Renderer Improvements

The existing renderer is expensive because it builds the full RGBA image and
then appends one SVG rect per visible pixel.

Better options:

### 1. Keep Canonical Data Separate From Rendering

The renderer can be separate, but it should consume the canonical data contract
rather than recompute from the Larva Labs asset encoding. That keeps rendering
logic replaceable while the data stays stable.

### 2. SVG Run-Length Renderer

After final pixel composition, merge adjacent same-color pixels on each row:

```xml
<rect x="4" y="8" width="6" height="1" fill="#..."/>
```

This reduces SVG node count and string length compared with one rect per pixel.

Pros:

- Still readable SVG.
- No PNG encoder required.
- Lower response size for many Punks.

Cons:

- Still needs final pixel composition.
- More logic than the existing simple rect loop.

### 3. SVG Path Grouping By Color

Group all pixels of the same color into one `<path>` per color.

Pros:

- Often fewer elements than run-length rects.
- Good for 24x24 pixel art with a small palette.

Cons:

- Path string generation is trickier.
- Need to benchmark output length. For isolated pixels, path commands can be
  longer than rects.

### 4. Precomputed Render Blobs

Store compressed per-Punk SVG or PNG data.

Pros:

- Fastest renderer.
- Easy to make marketplace metadata cheap.

Cons:

- Data volume is much larger. The existing generated SVG for Punk 0 is roughly
  20 KB and Punk 8348 is roughly 28 KB. Multiplying that by 10,000 is not a
  sensible mainnet payload.
- Precomputed PNGs are smaller than SVG, but still likely multiple megabytes.

Verdict: not recommended for the base public-good contract.

### 5. Renderer Wrapper Over Existing Data Contract

Call `punkImage(uint16)` on the Larva Labs data contract, then build optimized
SVG or JSON metadata.

Pros:

- Avoids copying image asset data.
- Fast to implement.
- Keeps provenance tied to the official data contract.

Cons:

- Not fully independent.
- `punkImage` itself is still about 1.2M to 1.6M gas in representative probes.
- Calls another contract during a heavy view.

Verdict: a practical interim renderer, but the canonical V2 renderer should not
depend on it.

## Immutability And Verification

For a public-good deployment:

- Prefer constructor-time immutable roots or one-time loader plus `seal`.
- Emit a `DatasetCommitted` event with:
  - source data contract address,
  - attribute CSV hash,
  - trait catalog hash,
  - mask blob hash,
  - bitmap blob hash.
- Keep an explicit `datasetHash()` view.
- Publish a generator that reconstructs all blobs from the Larva Labs contract.
- Fork-test every Punk against the source contract before deployment.
- Do not make trait aliases mutable unless they are in a separate alias
  registry that the settlement path does not trust.
- If storing indexed pixels, verify that expanding palette indexes recreates
  every byte returned by source `punkImage(uint16)`.
