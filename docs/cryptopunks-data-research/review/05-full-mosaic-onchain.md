# Full punks.png Mosaic, Generated Onchain

This proposal adds a "full mosaic" surface to V2 — the canonical 2400×2400
arrangement of all 10,000 Punks, computed entirely from primitives the V2
contract already stores (`palette.bin` + `indexedPixelsOf(punkId)`).

The constraint the user set explicitly: **derive from primitives, do not
store the canonical PNG bytes again.** Everything below respects that.

The art-piece value is in the *generation logic* living onchain, not in
caching the output. The contract knows how to compute the mosaic — at
the indexed-pixel level, the RGBA level, and the PNG-byte-stream level —
without holding any duplicated copy of the github punks.png file.

## Verification — punks.png Confirms The Layout

I downloaded the github file on 2026-05-07 only to verify the layout
convention. The file itself is *not* a deploy artifact and not a target
to byte-match against. What I confirmed:

```text
file:        punks.png
size:        848,174 bytes (compressed via zlib)
dimensions:  2400 × 2400
format:      8-bit RGBA, non-interlaced
distinct RGBA colors: 222
file sha256: ac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b
```

The 222-color palette matches the research's
`07-visual-metrics-and-renderer-scope.md` line 11 finding — same palette
as the source contract's `punkImage(uint16)` outputs.

I tile-sliced the PNG (24×24 RGBA tiles in row-major order, punkId 0
top-left, punkId N at column `N % 100`, row `N / 100`) and concatenated
all 10,000 tiles. SHA-256 over that byte stream:

```text
db0e780ac7553b5dd6a3bb02ed2bf8106c16659e15a36797294e01e8817286bf
```

That is **byte-equal** to the hash recorded in
`06-reproducibility-notes.md` line 124 over concatenated source
`punkImage(uint16)` outputs. So:

- The github punks.png decodes to exactly the bytes the V2 contract will
  store as indexed pixels (after palette expansion).
- The layout convention (100-column row-major, punkId 0 top-left,
  24×24 tiles, no padding) is canonical.
- The github file's SHA-256 (`ac39af…`) is *not* a verification target
  for this proposal because we are not byte-matching the file. The
  pixel-stream SHA-256 (`db0e780a…`) **is** the verification target —
  any onchain RGBA mosaic generator must produce a byte stream with
  this hash when concatenated in row-major tile order.

## The Constraint Reality — No Single-Call Full Return

EVM memory cost is `3·words + words² / 512` (Yellow Paper). That
quadratic term makes large returns impossibly expensive long before any
RPC limit kicks in. Payload sizes for the full mosaic:

| Return shape | Bytes | Words | Memory gas |
| --- | ---: | ---: | ---: |
| Indexed mosaic, raw (1 byte/pixel) | 5,760,000 | 180,000 | **~63.8 M** |
| RGBA mosaic, raw (4 bytes/pixel) | 23,040,000 | 720,000 | **~1.01 B** |
| PNG-8 onchain-generated (~uncompressed deflate) | ~5,800,000 | ~181,250 | **~64.7 M** |

All three blow past the typical eth_call gas cap (30–50 M on most
public RPCs). The "art piece, expensive is OK" framing does not change
this — memory cost is paid per call regardless of fees, and there is no
way to spend more gas to get a bigger return because the gas cap is
imposed by the RPC provider, not paid by the caller.

**The full mosaic must be paged.** This is physics, not a design
preference.

For comparison, paged sizes that *are* feasible:

| Return shape | Bytes | Words | Memory gas |
| --- | ---: | ---: | ---: |
| 1 Punk-row indexed (100 × 576) | 57,600 | 1,800 | ~12 K |
| 1 Punk-row RGBA (100 × 2,304) | 230,400 | 7,200 | ~123 K |
| 1 Punk-row PNG stripe (~57 KB) | ~57,700 | ~1,800 | ~12 K |
| 4 Punk-rows indexed | 230,400 | 7,200 | ~123 K |
| 10 Punk-rows indexed | 576,000 | 18,000 | ~687 K |

So a Punk-row-at-a-time paging is the cheap default. Multi-row pages are
optional convenience.

## Recommended Surface — Two Layers Of Generation

Both layers live in the renderer (`CryptoPunksRendererV2`). Both are
*pure derivations* over `palette.bin` + `indexedPixelsOf(punkId)`. No
mosaic-specific data is stored.

### Layer 1 — Paged Pixel Generation (workhorse)

```solidity
interface ICryptoPunksMosaic {
    /// @notice Width and height of the canonical mosaic in pixels (always 2400).
    function mosaicSize() external pure returns (uint16 width, uint16 height);

    /// @notice Punks per mosaic row (always 100).
    function mosaicGridSize() external pure returns (uint8 columns, uint8 rows);

    /// @notice Coordinates of a Punk inside the mosaic.
    /// @return x = (punkId % 100) * 24, y = (punkId / 100) * 24
    function mosaicCoordOf(uint16 punkId) external pure returns (uint16 x, uint16 y);

    /// @notice Indexed pixels for one Punk-row of the mosaic.
    ///         Returns 100 * 576 = 57,600 bytes.
    /// @dev    The Punk-row is laid out as 24 pixel rows of 100 tiles
    ///         side-by-side. Output ordering: pixel row 0 of all 100
    ///         tiles, then pixel row 1 of all 100, ..., then pixel row 23.
    function mosaicIndexedRow(uint8 rowIndex) external view returns (bytes memory);

    /// @notice RGBA pixels for one Punk-row of the mosaic.
    ///         Returns 100 * 576 * 4 = 230,400 bytes.
    function mosaicRgbaRow(uint8 rowIndex) external view returns (bytes memory);

    /// @notice Public commitment to the canonical pixel byte stream.
    /// @return SHA-256 over the concatenation of mosaicRgbaRow(0..99)
    ///         after re-tiling each row into 24×24 punkId-order tile order;
    ///         equal to 0xdb0e780ac7553b5dd6a3bb02ed2bf8106c16659e15a36797294e01e8817286bf.
    function mosaicPixelsHash() external view returns (bytes32);
}
```

Notes:

- `mosaicIndexedRow(rowIndex)` reads `indexedPixelsOf(punkId)` for the
  100 Punks in that row and re-orders bytes from per-tile row-major to
  per-pixel-row-across-100-tiles. That is the layout PNG and most
  raster decoders want; it is also the layout punks.png itself uses. No
  per-tile reordering is needed at the consumer side.
- `mosaicRgbaRow(rowIndex)` is the same with `palette[colorId]`
  expansion applied — 4 bytes per pixel, fully resolved.
- `mosaicPixelsHash()` is `immutable`, set in the constructor, and is
  the load-bearing verification anchor for everything else.

Cost per call: ~50–200 K gas including SSTORE2 reads, palette lookup,
and memory expansion. 100 calls to fetch the full mosaic. Total cost
for assembling the full thing offchain: ~5–20 M gas total spent in
view calls (free for the caller; they hit RPCs not chain).

### Layer 2 — Paged PNG Stream (the art piece)

A consumer who wants a *single PNG file* can either:

- assemble it offchain from `mosaicRgbaRow` outputs (trivial; any
  encoder library does this in a few lines), or
- assemble it from the contract's own paged PNG generator.

The second option is where "fully onchain" gets interesting: every
byte of the resulting PNG file is computed on the chain, including
the PNG headers, palette chunk, deflate framing, CRCs, and adler32.
The consumer just concatenates the parts.

```solidity
interface ICryptoPunksMosaicPng {
    /// @notice First bytes of a valid PNG-8 file: signature + IHDR + PLTE + tRNS
    ///         + the IDAT chunk header + the zlib stream header + the first
    ///         deflate stored-block header.
    /// @return ~1 KB.
    function pngHeader() external view returns (bytes memory);

    /// @notice One stripe of pixel data wrapped in stored deflate format
    ///         and a valid IDAT chunk (length, type, data, CRC32).
    /// @param  rowIndex 0..99. One stripe = one Punk-row of mosaic =
    ///         24 pixel rows × 2401 bytes (one filter byte + 2400 indexed
    ///         pixel bytes per row) = 57,624 bytes payload, fits in one
    ///         deflate stored block (max 65,535).
    /// @return ~57,700 bytes including framing and CRC.
    function pngStripe(uint8 rowIndex) external view returns (bytes memory);

    /// @notice Closing bytes of a valid PNG-8 file: deflate empty final
    ///         block + zlib adler32 trailer + IEND chunk.
    /// @return ~30 bytes.
    function pngFooter() external view returns (bytes memory);

    /// @notice Total stripe count (always 100).
    function pngStripeCount() external pure returns (uint8);

    /// @notice Public commitment to the bytes pngHeader() ||
    ///         concat(pngStripe(0..99)) || pngFooter() — i.e. the SHA-256
    ///         of a complete onchain-generated PNG file.
    /// @dev    This is *not* equal to the github file's SHA-256 because
    ///         the github file uses zlib's compressed deflate, while the
    ///         onchain generator uses stored (uncompressed) deflate.
    ///         Both are valid PNGs and decode to identical pixel data;
    ///         only the encoded byte streams differ.
    function pngStreamHash() external view returns (bytes32);
}
```

Caller flow:

```text
bytes png = pngHeader();
for (i = 0; i < 100; i++) png = concat(png, pngStripe(i));
png = concat(png, pngFooter());
// png is a valid 2400×2400 PNG-8 file
// sha256(png) == pngStreamHash()
// pixel data of png == pixel data of github punks.png
```

Total output size: ~5.78 MB (uncompressed deflate is the same size as
the input + small overhead). Total caller-side gas spent on view calls:
~10–20 M gas total across ~102 calls.

The output PNG file *decodes* to the same 5,760,000 RGBA pixels as the
github punks.png — confirmed by `mosaicPixelsHash() == 0xdb0e780a…` —
but the byte stream is different because reproducing zlib's exact
deflate output in Solidity is not realistic. The art piece is "the
contract knows how to build a valid PNG," not "the contract reproduces
that specific file byte-for-byte."

### Generator Implementation Sketch

For `pngHeader`:

- 8 bytes PNG signature: `89 50 4E 47 0D 0A 1A 0A`.
- 25 bytes IHDR chunk: `00 00 00 0D` length, `49 48 44 52` type,
  `00 00 09 60 00 00 09 60 08 03 00 00 00` data
  (2400 × 2400, 8 bits per sample, color type 3 = palette,
  no interlace), 4 bytes CRC32.
- ~678 bytes PLTE chunk: 222 × 3 RGB bytes derived from `palette.bin`,
  framed with length + type + CRC32.
- ~234 bytes tRNS chunk: 222 alpha bytes derived from `palette.bin`,
  framed.
- ~14 bytes start of first IDAT: chunk length placeholder + `49 44 41 54`
  type + `78 01` zlib header.

For `pngStripe(rowIndex)`:

- Deflate stored-block header: 5 bytes
  (`00 LEN_LO LEN_HI NLEN_LO NLEN_HI`), where LEN = 57,624 = `0xE118`.
- 57,624 bytes of pixel data: for each of the 24 pixel rows in this
  Punk-row, one filter byte (`0x00`, no filtering) followed by 2,400
  indexed pixel bytes drawn from
  `indexedPixelsOf(punkId)[pixelRowOffset .. pixelRowOffset + 24)`
  for `punkId = rowIndex * 100 + col`, `col in 0..99`.
- 4 bytes CRC32 of (chunk_type || chunk_data).

For `pngFooter`:

- 5 bytes final deflate stored block (empty, with BFINAL=1):
  `01 00 00 FF FF`.
- 4 bytes adler32 over the entire pixel data stream.
- 4 bytes CRC32 closing the IDAT chunk.
- 12 bytes IEND chunk: `00 00 00 00 49 45 4E 44 AE 42 60 82` (constant).

The CRC32 across an IDAT chunk that spans multiple Solidity calls
needs to be computed incrementally. The cleanest design avoids
streaming CRC entirely by **wrapping each stripe in its own IDAT
chunk**. PNG decoders concatenate consecutive IDAT chunks transparently,
so 100 small IDAT chunks produce the same logical zlib stream as one
big IDAT chunk. With per-stripe IDATs, each `pngStripe(n)` is fully
self-contained and CRC-closed.

The adler32 across 5.76 MB *does* need to be a single value at the end
of the zlib stream. Two clean options:

1. **Precompute at deploy.** The pixel data is fixed forever, so its
   adler32 is fixed forever. Compute it offchain, pass to the
   constructor, store as `bytes4 immutable mosaicAdler32`. Emit it
   from `pngFooter()`. Trivial.
2. **Compute incrementally.** `pngStripe(n)` returns an `(adler32_a,
   adler32_b)` partial state alongside its bytes. The caller combines
   them. More complex; only justified if the team wants every byte of
   the adler32 derived onchain at call time. The deploy-time precompute
   is simpler and equally trustworthy because the pixel data the adler
   is taken over is itself onchain and unchangeable.

Recommend option 1. The adler32 is a function of the pixel data, and
the pixel data is itself committed via `mosaicPixelsHash()`. Anyone
suspicious of the immutable adler32 can recompute it from
`mosaicRgbaRow(0..99)` outputs and confirm. Storing it is not the same
as storing the PNG.

## What Happens Without Layer 2

Layer 2 is optional. A caller can fully reconstruct a viewable PNG of
the canonical mosaic from Layer 1 alone — fetch all 100
`mosaicRgbaRow(rowIndex)` outputs, encode with any standard PNG
library, done. The PNG encoder is two lines of Pillow.

So Layer 1 is sufficient for "the mosaic is generable from onchain
data." Layer 2 is the *strict* art-piece deliverable: even the PNG
container format is constructed onchain, with no offchain encoder in
the trust path.

If shipping Layer 2 turns out to be intricate (CRC32 and PNG framing
are routine but not trivial in Solidity), Layer 1 alone still satisfies
the "fully onchain generation" framing in a meaningful sense — every
pixel is derived from chain primitives; only the file-format wrapper
lives outside.

A reasonable phasing:

- **Phase 1**: Layer 1 only. Ship paged indexed/RGBA mosaic generation,
  expose `mosaicPixelsHash`, document the conventions.
- **Phase 2**: Layer 2. Paged PNG generator with CRC32 + immutable
  adler32. Strict art piece.

Each phase is a separate immutable deployment that depends on the V2
data contract.

## Filtered Mosaic Variant (Bonus)

The same machinery enables a generative variant that is genuinely new:

```solidity
function mosaicIndexedRowFiltered(
    uint8 rowIndex,
    uint256 requiredMask,
    uint256 forbiddenMask,
    uint256 anyOfMask
) external view returns (bytes memory);
```

Returns one mosaic Punk-row, but with non-matching tiles rendered as
the transparent palette index. "All 9 Aliens in canonical positions" or
"every 0-attribute Punk" or "every Hoodie + Earring combination" become
one-call generations against the V2 trait predicates.

This composes the trait masks recommended in
[01 Disagreements §2](./01-disagreements.md#2-missing-any-of-mask-semantic)
with the mosaic surface. No extra storage; just a predicate gate
applied during generation.

This is the kind of feature that makes "fully onchain mosaic
generation" more than a re-encoding of an existing artifact — it
generates *new* canonical compositions that the github file does not
contain, by composing primitives that are already onchain.

## Storage Cost At Deployment

**Zero.** Beyond what the V2 base spec already requires (palette + indexed
pixels + traits + visual metrics), the mosaic surface adds nothing to
the deployment payload. It is pure derivation logic — a few hundred
bytes of contract bytecode for the generator, plus the immutable
`mosaicPixelsHash` and (for Layer 2) `mosaicAdler32`.

## Where It Lives — A Dedicated PNG Contract

The PNG generation logic should live in its own contract, separate from
both the data contract and from any SVG / JSON-metadata renderer. Call
it `CryptoPunksPng` (or `PunksPngEncoder`) — the *encoder* framing is
accurate because the contract's job is to turn primitive Punk data into
valid PNG byte streams.

```text
CryptoPunksData (sealed, primitives only)
  ├── palette
  ├── indexedPixelsOf(punkId)
  ├── traits + masks
  └── visual metrics

CryptoPunksPng (separate contract, reads from CryptoPunksData)
  ├── per-Punk PNG: punkPng(punkId) → bytes
  ├── mosaic PNG, paged: pngHeader / pngStripe / pngFooter
  ├── filtered mosaic: pngStripeFiltered(rowIndex, masks)
  └── pixel commitments: mosaicPixelsHash, mosaicAdler32

CryptoPunksRenderer (separate, optional)
  ├── SVG outputs
  ├── JSON metadata (OpenSea-shaped)
  └── any other display formats
```

Why split this way:

1. **The data contract stays sealed and pure.** It holds canonical
   primitives forever. No rendering concerns — no PNG, no SVG, no
   JSON. If a better PNG strategy is invented next year, deploy a new
   PNG contract; the data contract does not need to be replaced. The
   data contract is a one-shot deployment; encoders are pluggable.

2. **PNG generation is self-contained.** Its inputs are
   `paletteRgbBytes()`, `paletteAlphaBytes()`, `indexedPixelsOf(punkId)`,
   and the trait masks. Nothing else. It does not need SVG or metadata
   logic in the same contract.

3. **Multiple PNG encoders can coexist.** The first version uses
   stored-deflate (uncompressed) for simplicity. A later version could
   ship LZ77+Huffman compression for smaller byte streams. Both can
   sit alongside the data contract; consumers pick which they want.

4. **Independent deployment economics.** The data contract can ship
   first, sealed. The PNG contract ships when the encoder logic is
   audited and tested. If PNG turns out to be more work than expected,
   the data contract is not blocked on it.

5. **Public-good composability.** Anyone — not necessarily the original
   deployer — can write and deploy a renderer/encoder against the
   sealed `CryptoPunksData`. The data contract is the canonical
   primitive set; encoders are how the community turns those primitives
   into things browsers can display.

### Data Contract Surface The Encoder Depends On

For PNG generation specifically, the data contract should expose:

```solidity
interface ICryptoPunksDataForPng {
    /// @notice The full palette, split into RGB triples for PNG PLTE chunks.
    /// @return 222 * 3 = 666 bytes, RGB only.
    function paletteRgbBytes() external view returns (bytes memory);

    /// @notice The full palette's alpha bytes for PNG tRNS chunks.
    /// @return 222 bytes, one alpha per palette entry.
    function paletteAlphaBytes() external view returns (bytes memory);

    /// @notice The 576 indexed pixel bytes for one Punk.
    /// @dev    Already in the V2 spec (doc 04 line 54).
    function indexedPixelsOf(uint16 punkId) external view returns (bytes memory);

    /// @notice The trait mask for one Punk, used by the filtered mosaic.
    /// @dev    Already in the V2 spec (doc 04 line 41).
    function traitMaskOf(uint16 punkId) external view returns (uint256);
}
```

`paletteRgbBytes` and `paletteAlphaBytes` are bulk read helpers that
the V2 spec does not currently include — the existing `colorOf(uint8)`
returns RGBA per color. The bulk views are added because PNG-8 needs
RGB and alpha separated (PLTE chunk vs tRNS chunk), and reading 222
individual `colorOf` calls per PNG generation would be wasteful.

If the team prefers to keep the data contract API tight, the encoder
contract can build the split-palette bytes from 222 `colorOf` calls at
deploy time and store the result as `bytes immutable plteBytes` and
`bytes immutable trnsBytes` in the encoder's own constructor. That
keeps the data contract's API minimal and pushes the cost into the
encoder's deployment. Acceptable either way.

### Per-Punk PNG, Same Contract

The encoder is a natural home for per-Punk PNG generation too. A 24×24
PNG-8 of a single Punk is small (~600 bytes total: signature + IHDR +
PLTE + tRNS + one IDAT chunk + IEND). Single-call return is trivial.

```solidity
interface ICryptoPunksPunkPng {
    /// @notice Full PNG-8 file for one Punk.
    /// @return ~600 bytes, valid PNG that decodes to 24x24 RGBA pixels
    ///         identical to the source contract's punkImage(punkId).
    function punkPng(uint16 punkId) external view returns (bytes memory);

    /// @notice PNG with a flattened opaque background.
    function punkPng(uint16 punkId, bytes4 backgroundRgba) external view returns (bytes memory);
}
```

This pairs nicely with the rest: the same encoder produces both
per-Punk and mosaic PNGs, using the same primitives, the same palette
bytes, and the same deflate/CRC machinery. Per-Punk PNGs are useful
for marketplace `tokenURI` metadata and for any consumer that wants
"render Punk N as a downloadable PNG."

### Naming

- `CryptoPunksPng` — short, descriptive, scopes to PNG generation.
- `PunksPngEncoder` — emphasises the "encoder" role, suggests it could
  be replaced.
- `OnchainPunksImage` — too generic.

I lean `CryptoPunksPng`. Whatever name, do not use a `V2` suffix —
this contract is "the first PNG encoder", not the second version of
anything (see [01 Disagreements §1](./01-disagreements.md#1-the-name-cryptopunksdatav2)).

## Summary Of The Final Recommendation

- **Generate, do not store.** The data contract already holds palette
  + indexed pixels — that is the canonical primitive set. Nothing
  about the mosaic is duplicated; every byte of every output is
  computed at call time.
- **A dedicated `CryptoPunksPng` contract.** PNG generation lives in
  its own contract that reads from `CryptoPunksData` via public views.
  The data contract stays sealed and primitive-only; the encoder is
  pluggable and can be replaced or augmented later without touching
  the data layer.
- **The full mosaic cannot be returned in one eth_call.** Page it.
  This is EVM physics, not a design choice.
- **Two delivery layers inside the encoder contract:**
  - Layer 1 (`mosaicIndexedRow`, `mosaicRgbaRow`, `mosaicPixelsHash`):
    paged pixel generation. Workhorse for any consumer that wants
    bytes.
  - Layer 2 (`pngHeader`, `pngStripe`, `pngFooter`): paged PNG
    byte-stream generation with CRC32 per chunk and an immutable
    adler32 trailer. Strict art-piece deliverable — even the file
    format wrapper is computed onchain, with no offchain encoder in
    the trust path.
- **Per-Punk PNG too.** `punkPng(uint16)` and `punkPng(uint16, bytes4
  background)` belong in the same encoder contract; the machinery is
  shared.
- **Bonus generator:** `pngStripeFiltered(rowIndex, requiredMask,
  forbiddenMask, anyOfMask)` composes V2 trait masks with mosaic
  generation. "All 9 Aliens in canonical positions", "every Hoodie",
  etc. — new compositions that the github punks.png does not contain,
  generated onchain from primitives.
- **Verification anchor:** `mosaicPixelsHash()` returns `0xdb0e780a…`,
  which I confirmed equals SHA-256 over the row-major tile bytes of
  the github punks.png. Any consumer can independently verify the
  encoder is canonical without trusting the deploy script.
- **Storage cost added by the encoder:** zero PNG bytes. A few
  hundred bytes of generator bytecode plus a couple of `bytes32`/
  `bytes4` immutables.
