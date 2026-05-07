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

Generating the full composite is feasible because `PunksData` stores
flattened indexed pixels:

```text
indexedPixels.bin
  10000 * 576 bytes
```

Each Punk is already a 24x24 indexed image. The composite generator only needs
to tile those indexed images into a 2400x2400 image.

For pixel-equivalent generation, indexed PNG would be the better output format.
For byte-identical generation, it cannot be used. The generator must expand
each indexed pixel to RGBA bytes and reproduce the reference PNG encoder's
compressed output exactly.

## Indexed PNG vs Exact Reference PNG

The collection's 222 colors make indexed storage excellent for the data
contract:

```text
10000 Punks * 576 color IDs = 5,760,000 bytes
```

But the reference PNG is RGBA:

```text
2400 rows * (1 filter byte + 2400 * 4 RGBA bytes)
= 23,042,400 bytes before zlib and PNG chunk overhead
```

So the data layer can remain indexed, but the exact-reference renderer must
expand to RGBA scanlines before compression.

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
- Could still derive final bytes from V2 pixel data.

Cons:

- Easy to become morally equivalent to storing the compressed image.
- The more exact hints are stored, the less meaningful "generated from data"
  becomes.
- Needs a clear rule for what is acceptable to store.

This should be avoided unless the stored hints are small, general, and clearly
not a disguised copy of `IDAT`.

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
  -> indexed pixels (indexedPixelsOf)

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
function mosaicPixelsHash() external view returns (bytes32);
```

`mosaicPixelsHash()` returns
`0xdb0e780ac7553b5dd6a3bb02ed2bf8106c16659e15a36797294e01e8817286bf`,
the SHA-256 over the concatenation of all 10,000 source `punkImage` outputs
in row-major tile order. It's the verification anchor for any consumer
that wants to confirm pixel correctness without trusting the PNG encoder.

Reference hashes are exposed as `pure` views so consumers can verify the
encoder targets without inspecting bytecode:

```solidity
function compositePngSha256() external pure returns (bytes32);
// 0xac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b
function compositeIdatSha256() external pure returns (bytes32);
// 0x7d080b4bca3e4c8e19ed53254eb8dc1dd1c887c8b6b3560d3374436c19f9614f
function referenceInflatedScanlinesSha256() external pure returns (bytes32);
// 0x62a66b4618a72410d6d99b5fceee6013fabcb3574728ed5ce437b2a161da8673
```

A filtered-mosaic generator composes V2 trait masks with the mosaic
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
  -> indexed pixel data, palette, trait masks

PunksPng
  -> Layer 1: paged indexed/RGBA mosaic rows from PunksData
  -> Layer 2: paged byte-exact PNG chunks once DEFLATE is reproduced
```

Milestone 1 — pixel correctness:

- Generate exact RGBA scanlines from `PunksData` indexed pixels.
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
