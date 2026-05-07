# Full Composite PNG Generation

This note covers an optional renderer feature: generating the full 10,000 Punk
composite image onchain.

Updated requirement: the generated output should byte-match the canonical
Larva Labs `punks.png`, so the SHA-256 hash is identical, without storing that
PNG file byte-for-byte onchain.

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

Generating the full composite is feasible if `CryptoPunksDataV2` stores
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

`punks.png` generation should live in a separate contract that reads from
`CryptoPunksDataV2`.

Reasons:

- The byte-exact PNG goal is specialized and expensive.
- Exact zlib/DEFLATE reproduction is compression logic, not canonical data.
- The core data contract should remain small, immutable, and easy to trust.
- The composite renderer can be iterated or replaced without changing the data
  source.
- Other renderers can still consume the same indexed pixels and palette.

Suggested dependency direction:

```text
CryptoPunksDataV2
  -> trait data
  -> visual metrics
  -> palette
  -> indexed pixels

CryptoPunksCompositeRenderer
  -> reads CryptoPunksDataV2
  -> generates exact RGBA scanlines
  -> generates byte-exact punks.png if DEFLATE can be reproduced
```

The composite renderer should not be on any settlement path.

## Proposed API

Expose chunked generation first and full-return generation as an art-piece
convenience.

```solidity
interface ICryptoPunksCompositeRenderer {
    function dataContract() external view returns (address);

    function compositePng() external view returns (bytes memory);

    function compositePngHeader() external view returns (bytes memory);
    function compositePngChunkCount() external pure returns (uint16);
    function compositePngChunk(uint16 chunkIndex) external view returns (bytes memory);
    function compositePngFooter() external view returns (bytes memory);

    function compositeIndexedRows(
        uint16 startRow,
        uint16 rowCount
    ) external view returns (bytes memory);
}
```

`compositePng()` is conceptually clean, but many RPC providers will reject a
multi-megabyte `eth_call` return. The chunked path is the practical interface.

For exact reference generation, expose the expected hashes:

```solidity
function referencePngSha256() external pure returns (bytes32);
function referenceInflatedScanlinesSha256() external pure returns (bytes32);
function referenceIdatSha256() external pure returns (bytes32);
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

## Full Return vs Chunked Return

The reference PNG is 848,174 bytes. That is not large by normal software
standards, but it is large for EVM memory expansion and RPC return payloads.

Recommended API behavior:

- `compositePngChunk(index)`: primary public interface.
- `compositePng()`: optional, documented as best-effort / art-piece.
- `compositeIndexedRows(startRow, rowCount)`: useful for independent clients
  that want to assemble or compress the image offchain from onchain source
  data.

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

## Recommendation

Keep the full composite PNG generator as a separate renderer contract, but split
the work into two milestones:

```text
CryptoPunksDataV2
  -> indexed pixel data

CryptoPunksCompositeRenderer
  -> RGBA scanline generation from indexed pixels
  -> exact reference PNG generation if the DEFLATE stream can be reproduced
```

Milestone 1:

- Generate exact RGBA scanlines from V2 indexed pixels.
- Prove the inflated scanline hash matches
  `62a66b4618a72410d6d99b5fceee6013fabcb3574728ed5ce437b2a161da8673`.

Milestone 2:

- Reverse engineer or reproduce the reference zlib/DEFLATE stream.
- Prove the final PNG hash matches
  `ac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b`.

This fits the project as an onchain art/provenance feature, but exact byte
reproduction should not block the core data contract. The hard part is not PNG
assembly; it is reproducing the exact compressed stream.
