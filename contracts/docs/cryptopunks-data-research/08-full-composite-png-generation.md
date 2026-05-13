# Full Composite PNG Generation

This note covers `PunksPng`'s composite-mosaic feature: generating the
full 10,000 Punk composite image onchain.

Requirement: the generated output must byte-match the canonical Larva Labs
`punks.png`, so the SHA-256 hash is identical, without storing that PNG
file byte-for-byte onchain. Per the [decisions sheet](./decisions.md), this
is the encoder's hard milestone — `PunksData` ships first and `PunksPng`
ships when the encoder reproduces the reference DEFLATE stream.

Reference image:

```text
https://raw.githubusercontent.com/larvalabs/cryptopunks/refs/heads/master/punks.png
```

Observed properties:

| Field | Value |
| --- | ---: |
| Dimensions | 2400 x 2400 |
| Punks | 100 x 100 |
| Punk size | 24 x 24 |
| Pixels | 5,760,000 |
| PNG file size | 848,174 bytes |
| PNG IHDR color type | 6, truecolor with alpha |
| PNG bit depth | 8 |
| Interlace | 0, none |
| Colors | 222 |
| SHA-256 of reference PNG | `ac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b` |

The reference file is visually palette-like because it uses only 222 RGBA
colors, but the PNG file itself is not an indexed-color PNG. It has no `PLTE`
or `tRNS` chunks. Exact byte reproduction therefore requires generating a
truecolor RGBA PNG.

## Reference PNG Structure

The reference file has this chunk structure:

| Chunk | Count | Lengths |
| --- | ---: | --- |
| `IHDR` | 1 | 13 bytes |
| `IDAT` | 26 | 25 chunks of 32,768 bytes, then 1 chunk of 28,617 bytes |
| `IEND` | 1 | 0 bytes |

Compressed `IDAT` payload:

```text
847,817 bytes
zlib header: 0x78da
zlib Adler-32 trailer: 0x64beea60
SHA-256 over concatenated IDAT data:
7d080b4bca3e4c8e19ed53254eb8dc1dd1c887c8b6b3560d3374436c19f9614f
```

Inflated scanline data:

```text
2400 rows * (1 filter byte + 2400 * 4 RGBA bytes)
= 23,042,400 bytes
SHA-256:
62a66b4618a72410d6d99b5fceee6013fabcb3574728ed5ce437b2a161da8673
```

All 2,400 scanlines use filter byte `0`.

## Feasibility

Generating the full composite is feasible because `PunksData` exposes
flattened indexed pixels:

```text
indexedPixelsOf(punkId)
  decodes the compressed pixel blob to 576 bytes
```

Each decoded Punk is a 24x24 indexed image. The composite generator only
needs to tile those indexed images into a 2400x2400 image.

For pixel-equivalent generation, indexed PNG would be the better output format.
For byte-identical generation, it cannot be used. The generator must expand
each indexed pixel to RGBA bytes and reproduce the reference PNG encoder's
compressed output exactly.

## Indexed PNG vs Exact Reference PNG

The collection's 222 colors make indexed pixels the right canonical
primitive:

```text
raw baseline: 10000 Punks * 576 color IDs = 5,760,000 bytes
```

But the reference PNG is RGBA:

```text
2400 rows * (1 filter byte + 2400 * 4 RGBA bytes)
= 23,042,400 bytes before zlib and PNG chunk overhead
```

So the data layer can expose decoded indexed pixels, but the exact-reference
renderer must expand to RGBA scanlines before compression. The data contract's
physical pixel storage should still be compressed for deployment efficiency.

## Compression Choice

For exact SHA equality, compression is the hard part.

PNG uses zlib-wrapped DEFLATE. DEFLATE is not canonical: many different
compressed byte streams can decompress to the exact same scanline bytes. Pixel
equality is therefore much easier than PNG byte equality.

There are three possible approaches:

### 1. PNG With Stored DEFLATE Blocks

Generate a valid zlib stream using DEFLATE block type `00`, also called stored
or uncompressed blocks.

Pros:

- Straightforward to implement onchain.
- No dynamic Huffman coding.
- Deterministic and easy to test.
- Produces a standards-compliant PNG.

Cons:

- Much larger than the reference PNG.
- Full return payload is roughly 5.8 MB plus overhead.
- Does not byte-match the reference file and therefore does not produce the
  canonical SHA-256.

This is useful for a pixel-equivalent generated PNG, but it does not satisfy the
exact-hash requirement.

### 2. Reproduce The Reference DEFLATE Stream

Implement the same compression decisions that produced the reference file:

- zlib header `0x78da`,
- all scanlines filter 0,
- exact LZ77 match/literal decisions,
- exact Huffman block choices,
- exact block boundaries,
- exact Adler-32,
- exact IDAT split into 32,768-byte chunks.

Pros:

- Produces the exact reference PNG and SHA-256.
- Does not store the PNG file byte-for-byte.

Cons:

- Requires reverse engineering or identifying the original encoder settings and
  compressor behavior.
- A generic DEFLATE implementation is large for Solidity.
- Matching an encoder bit-for-bit is much harder than creating a valid PNG.
- Different zlib versions and strategies can produce different valid streams.

This is the only route that satisfies the exact-hash requirement without
storing the reference bytes.

### 3. Store Compressed Hints Or Tokens

Store enough compressor-side data to recreate the exact compressed stream from
the generated pixels.

Pros:

- Less compute than full compression search.
- Could still derive final bytes from `PunksData` pixel data.

Cons:

- Easy to become morally equivalent to storing the compressed image.
- The more exact hints are stored, the less meaningful "generated from data"
  becomes.
- Needs a clear rule for what is acceptable to store.

Rule: do not store the reference PNG bytes, the full IDAT stream, the full
literal/match token stream, per-output-byte copy instructions, or any artifact
that is morally equivalent to compressed `punks.png`. Allowed constants are
limited to small public commitments and generic encoder machinery: reference
hashes, dimensions, chunk sizes, zlib settings, Huffman tables if they are
algorithmic/static for the compressor, CRC tables, and other format logic that
does not encode the image payload itself.

## Contract Boundary

`punks.png` generation lives in `PunksPng`, a dedicated encoder contract
that reads from `PunksData`.

Reasons:

- The byte-exact PNG goal is specialized and expensive.
- Exact zlib/DEFLATE reproduction is compression logic, not canonical data.
- The core data contract should remain small, immutable, and easy to trust.
- The encoder can be iterated or replaced without changing the data
  source.
- Other encoders (`PunksSvg`, `PunksMetadata`, future PNG variants) can
  still consume the same indexed pixels and palette.

Per-Punk PNG-8 lives in the same `PunksPng` contract because per-Punk and
composite share palette/CRC32/zlib machinery — splitting them buys
nothing.

Dependency direction:

```text
PunksData
  -> trait data
  -> visual metrics
  -> palette (paletteRgbBytes, paletteAlphaBytes, paletteRgbaBytes)
  -> compressed pixel blobs, exposed through indexedPixelsOf

PunksPng
  -> reads PunksData via public views
  -> per-Punk PNG-8 (transparent + flattened-background)
  -> generates exact RGBA scanlines for the mosaic
  -> generates byte-exact punks.png chunks once DEFLATE is reproduced
  -> filtered mosaic (predicate-gated, not byte-exact)
```

`PunksPng` is not on any settlement path.

## Composite Mosaic API on `PunksPng`

Concatenating `compositePngChunk(0..N-1)` is byte-equal to the GitHub
`punks.png` file. Chunking is an RPC return-size requirement, not a
different file format.

```solidity
function dataContract() external view returns (address);

function compositePngChunkCount() external pure returns (uint16);
function compositePngChunk(uint16 chunkIndex) external view returns (bytes memory);
```

The full-return form `compositePng()` is omitted. EVM memory cost
(`3·words + words² / 512`) makes a multi-megabyte single-call return
prohibitively expensive regardless of fees, and most RPC providers reject
returns of this size anyway.

Layer 1 (pixel-level views) for consumers that want bytes without the PNG
container:

```solidity
function mosaicIndexedRow(uint8 rowIndex) external view returns (bytes memory);
function mosaicRgbaRow(uint8 rowIndex) external view returns (bytes memory);
function mosaicPixelsHash() external pure returns (bytes32);
```

`mosaicPixelsHash()` returns
`0xdb0e780ac7553b5dd6a3bb02ed2bf8106c16659e15a36797294e01e8817286bf`,
the SHA-256 over the concatenation of all 10,000 source `punkImage` outputs
in row-major tile order. It's the verification anchor for any consumer
that wants to confirm pixel correctness without trusting the PNG encoder.

This byte order is Punk-ID tile order: Punk 0's 24x24 RGBA bytes, then Punk 1's
24x24 RGBA bytes, and so on through Punk 9999. It is not the same byte order as
`mosaicRgbaRow(rowIndex)`, which returns raster rows for 100 tiles side by
side. A consumer starting from `mosaicRgbaRow(0..99)` must retile the raster
rows back into Punk-ID tile order before comparing to `mosaicPixelsHash`.
For PNG scanline verification, use `referenceInflatedScanlinesSha256()`
instead; that hash covers raster scanlines with one filter byte per row.

Reference hashes are exposed as `pure` views so consumers can verify the
encoder targets without inspecting bytecode:

```solidity
function referencePngSha256() external pure returns (bytes32);
// 0xac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b
function referenceIdatSha256() external pure returns (bytes32);
// 0x7d080b4bca3e4c8e19ed53254eb8dc1dd1c887c8b6b3560d3374436c19f9614f
function referenceInflatedScanlinesSha256() external pure returns (bytes32);
// 0x62a66b4618a72410d6d99b5fceee6013fabcb3574728ed5ce437b2a161da8673
```

A filtered-mosaic generator composes `PunksData` trait masks with the mosaic
surface, but it is *not* part of the byte-exact target — these are new
compositions, not the canonical GitHub image:

```solidity
function compositePngChunkFiltered(
    uint16 chunkIndex,
    uint256 requiredMask,
    uint256 forbiddenMask,
    uint256 anyOfMask
) external view returns (bytes memory);
```

## Generation Algorithm

The composite layout is row-major:

```text
punkId = gridY * 100 + gridX
gridX = x / 24
gridY = y / 24
localX = x % 24
localY = y % 24
```

For each PNG scanline:

```text
write filter byte 0
for x in 0..2399:
  punkId = (y / 24) * 100 + (x / 24)
  localOffset = (y % 24) * 24 + (x % 24)
  colorId = indexedPixels[punkId][localOffset]
  write rgba(colorId)
```

The PNG generator then wraps those scanlines with:

- PNG signature,
- `IHDR` for 2400x2400, 8-bit truecolor with alpha,
- one or more `IDAT` chunks,
- `IEND`.

For byte-identical output, there must be no `PLTE`, `tRNS`, metadata, or
ancillary chunks because the reference file has none.

## Checksums

A valid PNG needs:

- CRC32 for each PNG chunk.
- Adler-32 for the zlib stream.

These can be generated onchain. CRC32 is more tedious than difficult. For an
art-piece renderer, this is acceptable, but it should be isolated and tested
hard.

Implementation notes:

- Store or compute a CRC32 lookup table.
- Match the reference IDAT chunking exactly: 25 chunks of 32,768 bytes and one
  final chunk of 28,617 bytes.
- Match the exact reference zlib/DEFLATE stream; merely using the same pixels
  and a valid compressor is not enough.
- Compute Adler-32 over the uncompressed scanline bytes.
- Keep chunk sizes modest enough for RPC return limits.

## Why Chunked, Not Full Return

The reference PNG is 848,174 bytes. That is not large by normal software
standards, but EVM memory cost (`3·words + words² / 512`) makes a single
multi-megabyte return prohibitively expensive long before any RPC limit
kicks in. Sample numbers for a one-shot 5.76 MB indexed mosaic return:
~64 M gas just for memory expansion, regardless of who pays for it.

Public RPC providers also enforce per-call gas caps independent of
caller fees, so there is no "spend more gas" path to a bigger return.

Layer-1 pixel views and the chunked PNG bytestream both page on Punk-row
boundaries. 100 calls reassemble the full mosaic offchain.

## Relationship To Reference `punks.png`

For this stricter requirement, the generated PNG must byte-match the reference
file.

The usual pixel-equality target is insufficient because:

- PNG encoders can choose different chunk boundaries.
- PNG encoders can choose different compression parameters.
- DEFLATE has many valid encodings for the same data.
- Stored DEFLATE output will not match the reference compressed stream.

The verification target becomes:

```text
sha256(generated PNG) == ac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b
```

Useful intermediate checks:

```text
generated composite pixels == tiling of all source punkImage(uint16) outputs
sha256(inflated generated scanlines) == 62a66b4618a72410d6d99b5fceee6013fabcb3574728ed5ce437b2a161da8673
sha256(generated IDAT payload) == 7d080b4bca3e4c8e19ed53254eb8dc1dd1c887c8b6b3560d3374436c19f9614f
```

## Milestones

Composite PNG work is split into two milestones inside `PunksPng`:

```text
PunksData
  -> compressed pixel data, palette, trait masks

PunksPng
  -> Layer 1: paged indexed/RGBA mosaic rows from PunksData
  -> Layer 2: paged byte-exact PNG chunks once DEFLATE is reproduced
```

Milestone 1 — pixel correctness:

- Generate exact RGBA scanlines from `PunksData` decoded indexed pixels.
- Prove `mosaicPixelsHash() == 0xdb0e780a…` over concatenated source
  `punkImage` outputs.
- Prove inflated scanline hash matches
  `0x62a66b4618a72410d6d99b5fceee6013fabcb3574728ed5ce437b2a161da8673`.

Milestone 2 — byte-exact PNG:

- Reverse engineer or reproduce the reference zlib/DEFLATE stream.
- Prove the IDAT payload hash matches
  `0x7d080b4bca3e4c8e19ed53254eb8dc1dd1c887c8b6b3560d3374436c19f9614f`.
- Prove the final PNG hash matches
  `0xac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b`.

Milestone 2 is the encoder's hard problem and may take iteration. It does
not block `PunksData` deployment. `PunksPng` ships when the encoder
reproduces the stream; if a future encoder version improves on
correctness or compression, it can be deployed alongside the first one
against the same sealed data contract.

The hard part is not PNG assembly; it is reproducing the exact compressed
stream that produced the reference file. Different zlib versions and
strategies produce different valid streams that all decode to the same
pixels.

## Reference zlib Reproduction Notes

A full token-stream comparison against the reference `punks.png` confirms the
compressed stream is reproducible from the inflated scanline bytes by zlib
1.3.1 with default level-9 settings. It does not require hidden per-image
hints, but it does require reproducing zlib's exact LZ77 and dynamic-Huffman
choices.

The matching compressor profile is:

```text
zlib version: 1.3.1
windowBits: 15
memLevel: 8
level: 9
strategy: Z_DEFAULT_STRATEGY
wrapper: zlib
method: deflate_slow
good_length: 32
max_lazy: 258
nice_length: 258
max_chain: 4096
hash_bits: 15
hash_shift: 5
window size: 32768
max distance: 32506
TOO_FAR: 4096
symbol buffer: 16383 non-EOB tokens per full block
```

Important edge cases:

- zlib uses `NIL == 0`, so the string at absolute input position `0` is never
  a valid match head. The reference stream begins with two zero literals, then
  distance-1 matches.
- Default strategy still rejects length-3 matches farther than `TOO_FAR`
  (`4096`). Omitting this rule diverges from the reference stream at output
  byte `115350`.
- Near end-of-input, zlib may read guard bytes while searching; match lengths
  are still capped to `lookahead`, so the output is deterministic.
- Match length `258` is encoded with literal/length symbol `285` and no extra
  bits. Do not let a naive range search encode it as symbol `284` with extra
  value `31`.

The parsed reference stream has:

```text
dynamic DEFLATE blocks: 23
non-EOB tokens: 363963
literals: 55934
matches: 308029
```

Block non-EOB token counts:

```text
22 blocks * 16383 tokens, final block * 3537 tokens
```

Inflated output ranges per DEFLATE block:

```text
0:  0        .. 1075553
1:  1075553  .. 2181796
2:  2181796  .. 3247978
3:  3247978  .. 4293495
4:  4293495  .. 5376040
5:  5376040  .. 6386042
6:  6386042  .. 7458564
7:  7458564  .. 8470335
8:  8470335  .. 9545347
9:  9545347  .. 10564580
10: 10564580 .. 11632119
11: 11632119 .. 12628996
12: 12628996 .. 13693158
13: 13693158 .. 14680234
14: 14680234 .. 15737120
15: 15737120 .. 16723822
16: 16723822 .. 17759827
17: 17759827 .. 18782505
18: 18782505 .. 19786532
19: 19786532 .. 20825577
20: 20825577 .. 21793818
21: 21793818 .. 22851278
22: 22851278 .. 23042400
```

Compressed raw-DEFLATE bit ranges per block, excluding the 2-byte zlib header
and 4-byte Adler-32 trailer:

```text
0:  0       .. 304576
1:  304576  .. 612155
2:  612155  .. 919475
3:  919475  .. 1224474
4:  1224474 .. 1528708
5:  1528708 .. 1833212
6:  1833212 .. 2137876
7:  2137876 .. 2445230
8:  2445230 .. 2750826
9:  2750826 .. 3056217
10: 3056217 .. 3361045
11: 3361045 .. 3667211
12: 3667211 .. 3972211
13: 3972211 .. 4277027
14: 4277027 .. 4581609
15: 4581609 .. 4886183
16: 4886183 .. 5189839
17: 5189839 .. 5493763
18: 5493763 .. 5800597
19: 5800597 .. 6104207
20: 6104207 .. 6409532
21: 6409532 .. 6715796
22: 6715796 .. 6782488
```

This narrows Milestone 2 to a concrete Solidity port of zlib 1.3.1's level-9
pipeline:

1. Generate the canonical scanline stream from `PunksData`.
2. Run zlib's `deflate_slow` LZ77 tokenization with the parameters above.
3. Split blocks at zlib's symbol-buffer boundary.
4. Build the dynamic literal/length, distance, and bit-length trees exactly as
   zlib `trees.c` does.
5. Emit the zlib wrapper, dynamic DEFLATE blocks, Adler-32 trailer, and PNG
   chunks with the reference 32,768-byte IDAT split.

The `analyze:punks-deflate` script checks all five requirements offchain:
it simulates zlib's level-9 LZ77 tokenization, rebuilds the dynamic
literal/length and distance code lengths from the token frequencies with
zlib's heap and overflow rules, builds the bit-length tree/header, and
re-emits the full dynamic DEFLATE payload byte-for-byte from the generated
token stream. It then wraps those generated DEFLATE bytes in the zlib container,
computes Adler-32, splits IDAT payloads into the reference 32,768-byte PNG
chunks, computes PNG CRC32 values, and verifies the final PNG bytes match the
reference `punks.png`. The reference stream is still parsed as the comparison
target, but not as the source for the emitter. That catches match-selection,
tree-length, tree-header, bit-order, extra-bit, checksum, and chunk-framing
mistakes before the algorithm is ported to Solidity.
