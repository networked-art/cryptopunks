# CryptoPunks Data Research — Decisions

This is the accepted-decision sheet for the data contract and encoder
contracts. The review notes remain useful background; this file is the spec
input to implement against.

## Already locked (by project memory and prior decisions)

- Renderer architecture is split: data contract + per-format encoder
  contracts (`...Png`, `...Svg`, `...Metadata`). Encoders are pluggable
  and read primitives via public views.
- `Offers.sol` consumes the rich predicate interface directly. The
  single-method `hasTrait` shim is an optional third-party deployment,
  not on this repo's critical path.
- No PNG bytes are stored anywhere. Every output byte is derived from
  `palette.bin` + `indexedPixelsOf(punkId)` plus encoder logic at call
  time.
- The full mosaic target is byte-identical to the GitHub `punks.png`, with
  the same SHA-256 hash. This requires reproducing the exact PNG container,
  IDAT chunking, zlib header, DEFLATE stream, and checksum bytes.
- Pre-deployment posture: interfaces, structs, and events are freely
  editable. No migration shims, no compat layers for "old" offers.

## Architecture

### A1. Per-Punk PNG format — PNG-8 indexed (PLTE + tRNS)

Why: ~600 bytes, no expansion, matches the data shape directly. Truecolor
RGBA at 24×24 buys nothing.

### A2. Mosaic PNG byte-match goal — YES

Target:

```text
sha256(generatedPunksPng) == ac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b
```

Why: The art/provenance goal is stronger than pixel equivalence. The
generated mosaic should be the canonical GitHub `punks.png` byte stream,
not merely a different PNG that decodes to the same pixels.

Implication: the encoder must reproduce the reference file exactly:
2400x2400 truecolor RGBA PNG, no ancillary chunks, filter byte 0 on every
scanline, reference IDAT chunking, zlib header, exact DEFLATE stream,
Adler-32, and PNG CRC32 values.

This is a separate encoder milestone and must not block `PunksData` or the
auction rewrite. The base data contract only needs enough primitives to prove
the uncompressed pixel stream:

```text
mosaicPixelsHash() == db0e780ac7553b5dd6a3bb02ed2bf8106c16659e15a36797294e01e8817286bf
```

No PNG payload bytes may be stored. Do not store the reference PNG bytes, full
IDAT stream, full literal/match token stream, per-output-byte copy
instructions, or anything morally equivalent to compressed `punks.png`.
Allowed constants are limited to reference hashes, dimensions, chunk sizes,
zlib settings, and generic encoder/checksum tables that do not encode the
image payload itself.

### A3. `anyOfMask` — IN

Why: Real bidder demand for "any sunglasses" / "any beard" exists. One
extra slot per offer. Categories stay subjective and out of the canonical
bit space; disjunction over individual bits is mechanical.

### A4. Storage shape — MIXED

Packed storage for hot per-Punk scalars (`traitMaskOf`, `colorMaskOf`,
packed `pixelCount`/`colorCount`); SSTORE2 for large sequential blobs
(palette, compressed pixels, per-trait bitmaps).

Why: SLOAD is cheaper than EXTCODECOPY on the settlement hot path. Blob
data has no settlement-path consumer.

Color predicates are visible non-transparent predicates. `colorMaskOf`,
`hasColor`, and `colorCountOf` ignore transparent pixels; `hasColor` returns
false for the transparent palette entry.

Per-Punk trait masks are stored as packed `uint128` values because the
canonical catalog uses only bits 0..110. Public predicate APIs still use
`uint256` masks for ergonomic bit operations and future adapter
compatibility.

### A5. Phased delivery — DATA ALL AT ONCE, EXACT MOSAIC SEPARATE

Why: The sealed data contract should ship as one canonical primitive surface:
traits, masks, bitmaps, palette, indexed pixels, and visual metrics. The
byte-exact composite PNG encoder is specialized compression work and ships
separately against the same sealed data contract.

### A6. Deployment chain — MAINNET ONLY

Why: Larva Labs's data contract is on mainnet; canonical successor lives
where Punks live. Cost (~0.8–8 ETH at SSTORE2-everywhere; lower with
mixed layout) is real but not prohibitive for a sealed deployment.

### A7. Filtered mosaic generator — IN SCOPE (same encoder)

Why: Same encoder contract, ~10 lines of generator logic, zero new
storage, big art-piece value. Composes `PunksData` trait masks with mosaic
generation: "all 9 Aliens in canonical positions", "every 0-attribute
Punk", etc.

### A8. Pixel storage — COMPRESSED, DECODED AT READ TIME

Pixels should be stored as efficiently as practical. Extra decode compute in
views is acceptable.

The target storage shape is a per-Punk sparse local-palette encoding:

```text
pixelOffsets.bin
  10001 uint24 offsets into compressedPixels.bin

compressedPixels.bin entry for each Punk
  uint8 visibleColorCount
  bytes72 visibleBitmap              // 1 = non-transparent pixel
  uint8[visibleColorCount] paletteIds // visible global color IDs, sorted
  bitpacked local color indexes      // visible pixels only, raster order
```

Transparent pixels are implicit and decode to the transparent palette ID.
`indexedPixelsOf(punkId)` remains the public primitive and returns the
canonical 576-byte indexed image. The compressed storage format is an
implementation detail, but the generator must pin it byte-for-byte and prove
that decoding every Punk reproduces the canonical indexed pixels.

A quick pass over the reference mosaic put this shape around 1.65 MB
including uint24 offsets, versus 5.76 MB for raw 576-byte indexed tiles. The
final generator should benchmark this against other lossless encodings before
Solidity is written, but the accepted direction is "smallest verified
lossless pixel blob", not raw `indexedPixels.bin`.

## Naming

### N1. Data contract — `PunksData`

Why: Short, humble, and close enough to Larva Labs's original
`CryptopunksData` to be legible without implying a Punk token-standard
distinction.
The plural `Punks` keeps it general and avoids version confusion.

### N2. Encoders — `PunksPng`, `PunksSvg`, `PunksMetadata`

Why: Format-per-contract, no version suffix. Prefix-less to match
`PunksData` and `punksdata.eth`.

### N3. Compat shim — `PunksTraitsCompat`

Why: Single-method `hasTrait(uint16,uint16)` for third-party protocols.
Optional deployment, not used by this repo's `Offers`.

### N4. `BackgroundMode.Default` — rename to `Owned`

Why: "Default" is ambiguous; "Owned" matches the actual `#638596` status
semantic.

### N5. `tokenUriJson` — rename to `metadataJson`

Why: Doesn't claim to be the canonical tokenURI for any specific Punk
token contract.

## Pinning the catalog

### P1. Trait ID assignment — alphabetical by kind

Concrete bit map:

- bits 0–4: normalized types alphabetical (Alien, Ape, Female, Male,
  Zombie).
- bits 5–15: 11 exact head variants alphabetical.
- bits 16–23: attribute count 0–7.
- bits 24–110: 87 accessories alphabetical, exact source casing
  (`Tassle Hat` preserved, `Pink With Hat` preserved).

Why: Determinable from the CSV crawl alone; doesn't depend on internal
`assetNames` order. 111 bits, fits `uint128`. Bits 128+ reserved for
derived predicates in optional adapter contracts.

### P2. `nameHash` semantics — `keccak256(bytes(name))`

Source-derived names use exact source bytes — casing preserved, typos
preserved (`Tassle Hat`, `Pink With Hat`, `Do-rag`), no trimming, no
lowercasing, no normalization. This covers head variants and accessories.

Synthesized names are pinned to canonical literal strings:

- Normalized types (`TraitKind.NormalizedType`): `Alien`, `Ape`, `Female`,
  `Male`, `Zombie`.
- Attribute counts (`TraitKind.AttributeCount`): `0 Attributes`, `1
  Attributes`, ..., `7 Attributes` (always plural for code symmetry).

Frontends build a static name → hash table at build time.

### P3. `traitIdByNameHash(nameHash, kind)` — kind enum

- `TraitKind.HeadVariant`
- `TraitKind.NormalizedType`
- `TraitKind.AttributeCount`
- `TraitKind.Accessory`

Why: Resolves the Alien/Ape/Zombie collision between exact head variant
and normalized type.

### P4. Mask width — `uint256` API, `uint128` base storage

Bits 0–127 canonical traits. Bits 128–255 reserved for derived predicates
added later in adapter contracts. Base contract never sets bits ≥ 128.

The base data contract stores per-Punk canonical masks packed as `uint128`
values. `traitMaskOf` returns `uint256`, and `hasTraits` accepts `uint256`
arguments, so callers and future adapters do not need a second mask type.

### P5. `datasetHash()` — keccak256 over sub-hashes

Construction:

```
traitCatalogHash  = keccak256(forEach trait: utf8(name) || uint8(kind))
punkMaskHash      = keccak256(forEach punk:  traitMaskOf(p))
paletteHash       = keccak256(palette bytes)
indexedPixelsHash = keccak256(forEach punk:  indexedPixelsOf(p)) // decoded 576-byte images
compressedPixelsHash = keccak256(pixelOffsets.bin || compressedPixels.bin)

datasetHash = keccak256(abi.encode(
  traitCatalogHash,
  punkMaskHash,
  paletteHash,
  indexedPixelsHash,
  compressedPixelsHash
))
```

SHA-256 stays as the offchain tooling hash (README, generator artifacts).
Both coexist; `datasetHash()` is the contract's public commitment.

### P6. Source crawl pinning — chain ID 1, block 25044552

Pin chain ID, block height, and source `extcodehash` at that block.
Static data, but pinning blocks fork-injection attacks against future
verifiers.

Pinned in doc 06:

```text
chain ID:        1
block height:    25044552
block hash:      0x2185f56dcb307a56cb8b90c1e61d4fd7898be906eb28d79e14c01d15f5cabb9f
source extcodehash:
  0x52ab51c14a3f26a80eca178374e21027492fd276c7365f9ab234b737d34c6b60
```

### P7. ERC-165 interfaces — split, not bundled

- `IPunksTraitsCompat` — `hasTrait(uint16,uint16)` only.
- `IPunksDataCriteria` — mask predicates.
- `IPunksDataVisual` — color and pixel views.
- `IPunksDataIndexed` — `indexedPixelsOf`, `colorAt`, palette views.

`bytes4` IDs computed from the final function set; pinned in spec before
Solidity is written.

## Encoder details

### E1. Bulk palette views on the data contract

```solidity
function paletteRgbBytes()   external view returns (bytes memory); // 666
function paletteAlphaBytes() external view returns (bytes memory); // 222
function paletteRgbaBytes()  external view returns (bytes memory); // 888
```

Why: Encoders need PLTE/tRNS split; reading 222 `colorOf` calls per
generation is wasteful. Cheap to expose from the data contract.

### E2. Reference PNG commitments

Expose immutable commitments for the exact-reference target:

```solidity
function referencePngSha256() external pure returns (bytes32);
function referenceInflatedScanlinesSha256() external pure returns (bytes32);
function referenceIdatSha256() external pure returns (bytes32);
```

Pinned values:

```text
referencePngSha256:
  ac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b
referenceInflatedScanlinesSha256:
  62a66b4618a72410d6d99b5fceee6013fabcb3574728ed5ce437b2a161da8673
referenceIdatSha256:
  7d080b4bca3e4c8e19ed53254eb8dc1dd1c887c8b6b3560d3374436c19f9614f
```

Why: The final PNG hash proves byte identity. The inflated-scanline hash
proves the indexed pixels and palette expand into the correct 2400x2400 RGBA
image. The IDAT hash isolates the hard compression target.

### E3. Per-Punk PNG signatures

```solidity
function punkPng(uint16 punkId) external view returns (bytes memory);
function punkPng(uint16 punkId, bytes4 backgroundRgba) external view returns (bytes memory);
```

First overload returns transparent-background PNG-8. Second flattens
against an opaque background and returns alpha-255 throughout.

### E4. Mosaic surface — paged, byte-exact reference target

Layer 1 (pixel generation):

```solidity
function mosaicIndexedRow(uint8 rowIndex) external view returns (bytes memory);
function mosaicRgbaRow(uint8 rowIndex)    external view returns (bytes memory);
function mosaicPixelsHash() external pure returns (bytes32); // 0xdb0e780a…
```

`mosaicIndexedRow` and `mosaicRgbaRow` return raster-order Punk rows:
24 pixel rows, each row containing 100 side-by-side tiles. `mosaicPixelsHash`
is intentionally different: it is SHA-256 over the concatenation of all
10,000 24x24 RGBA `punkImage` outputs in Punk-ID tile order. Consumers that
start from raster rows must retile them before comparing to
`mosaicPixelsHash`; consumers that want PNG scanline verification use
`referenceInflatedScanlinesSha256()`.

Layer 2 (PNG byte stream):

```solidity
function compositePngChunkCount() external pure returns (uint16);
function compositePngChunk(uint16 chunkIndex) external view returns (bytes memory);
function referencePngSha256() external pure returns (bytes32);
function referenceIdatSha256() external pure returns (bytes32);
```

The concatenation of all `compositePngChunk(i)` outputs must be byte-equal to
the GitHub `punks.png` file. Chunking is an RPC/EVM return-size requirement,
not a different file format.

Bonus: `compositePngChunkFiltered(...)` is not part of the byte-exact
reference target because filtered mosaics are new generated compositions, not
the canonical GitHub image.

### E5. Drop `punksWithTrait`

Why: Bitmap-word path scales fine and is already specced. Unbounded
helper risks RPC blowups; bitmap reconstruction is the canonical
approach.

## Lifecycle

### L1. Deployer seals the data contract

- Constructor records `address admin`.
- `loadChunk(blobName, index, bytes)` admin-only, accumulates SSTORE2
  pointers.
- `seal()` called once: writes `datasetHash`, emits `DatasetCommitted`,
  sets `admin = address(0)`. All loader functions revert post-seal.
- No proxy. No upgrade. No emergency override.

The deployer is responsible for calling `seal()`. A deployed-but-unsealed
contract is not canonical.

### L2. `DatasetCommitted` event

```solidity
event DatasetCommitted(
    address indexed sourceData,
    bytes32 traitCatalogHash,
    bytes32 punkMaskHash,
    bytes32 paletteHash,
    bytes32 indexedPixelsHash,
    bytes32 compressedPixelsHash,
    bytes32 datasetHash
);
```

Emitted exactly once at seal. Makes the dataset auditable from event logs
alone. `indexedPixelsHash` commits to the decoded canonical images;
`compressedPixelsHash` commits to the deployed pixel blob bytes.

### L3. No ERC-4906 metadata update event

Why: no known consumer exists for a standalone renderer/data contract in this
deployment shape. `PunksData` is not the token contract that marketplaces
cache, and `PunksMetadata` does not own the canonical `tokenURI` for any Punk
token standard. Do not emit `BatchMetadataUpdate(0, 9999)`.

### L4. Invalid IDs and malformed masks — REVERT

Why: Silent `false` from a malformed filter is the bug class that turns a
misconfigured offer into an exploit. Add `isValidTraitId(uint16) view`
for tooling that wants to probe without catching reverts.

`hasTraits` reverts if any mask includes bits outside the canonical trait
range, if `requiredMask & forbiddenMask != 0`, or if
`forbiddenMask & anyOfMask != 0`. `requiredMask & anyOfMask` is allowed but
redundant. Frontends should normalize user intent before signing; for
"any hat except Beanie", remove `Beanie` from `anyOfMask` and put it in
`forbiddenMask`.

Same posture for scalar-keyed bitmap views:
`pixelCountBitmapWord(pc, …)` reverts for `pc` outside `[148, 332]`;
`colorCountBitmapWord(cc, …)` reverts for `cc` outside `[2, 14]`;
`colorBitmapWord(cid, …)` reverts for `cid >= colorCount()`. In-range
values with no matching Punks return zero; reverts only on out-of-range
keys.

### L5. Generator invariants (asserted before seal)

- `popcount(traitMaskOf(p)) == 3 + attributeCountOf(p)` for every Punk
  (one head variant + one normalized type + one attribute-count + accessories).
- Head variant bit ↔ normalized type bit consistency via hardcoded
  table.
- `Σ popcount(traitMaskOf(p)) == Σ traitSupply(t)`.
- All visible palette entries have alpha `0xFF` or `0x80`; one
  transparent entry has alpha `0x00`.
- `popcount(colorMaskOf(p)) == colorCountOf(p)`.
- compressed pixels decode to exactly 576 indexed bytes for every Punk.
- decoded indexed pixels expand through palette to byte-equal source
  `punkImage(p)` for every Punk.
- decoded visible-pixel popcount equals `pixelCountOf(p)`.

## Operational

### O1. Deployer / owner / mirrorer

Flag: choose the deployer/admin address before deployment. That address loads
the dataset and must call `seal()`. After seal, it has no authority.

### O2. ENS naming — `punksdata.eth`

Register and manage `punksdata.eth` as the public discovery namespace for the
contracts.

Name map:

```text
punksdata.eth              -> PunksData
png.punksdata.eth          -> PunksPng
svg.punksdata.eth          -> PunksSvg
metadata.punksdata.eth     -> PunksMetadata
traits.punksdata.eth       -> PunksTraitsCompat, optional
renderer.punksdata.eth     -> optional aggregate/default renderer, only if
                              such a contract is deployed
```

For each deployed contract, configure both directions:

- forward ENS record: name resolves to the contract address,
- reverse / primary name: contract address resolves back to the ENS name.

Deployment flow:

1. Register/control `punksdata.eth` from the deployer Safe.
2. Deploy contracts with temporary admin/owner authority where needed.
3. Set forward records for `punksdata.eth` and subnames.
4. Set reverse primary names through the Reverse Registrar while the deployer
   or temporary owner is still authorized.
5. Call `seal()` on `PunksData`; after seal, the data contract has no admin.

ENS is a discovery layer, not the security root. The canonical trust anchors
remain the deployed addresses, verified source, `DatasetCommitted`, and
`datasetHash()`. `PunksData` should not own `punksdata.eth`; keep ENS
ownership in a Safe so subnames, text records, and metadata can be maintained
without giving the sealed data contract mutable authority.

Reference:
`https://docs.ens.domains/web/naming-contracts/`

### O3. Post-deploy artifacts

- Etherscan source verification with deterministic build (Solidity
  version + optimizer settings pinned in repo).
- IPFS mirror of: trait catalog JSON, palette JSON, dataset hashes,
  pinned source crawl info, generator script source.
- Dataset bundle CID recorded on the deploy artifact (not in the
  contract — derive-don't-duplicate).

### O4. Auction-side knock-on (downstream of the data contract)

- `Offer.traitFilters` (`TraitFilter[]`) replaced by `requiredMask` +
  `forbiddenMask` + `anyOfMask`.
- `placeOffer` takes the mask trio directly:
  `placeOffer(standard, amountWei, settlementWei, receiver, requiredMask,
  forbiddenMask, anyOfMask, includeIds, excludeIds)`.
- `_requireOfferMatchesPunk` becomes one external `hasTraits(...)` call
  per offer (not per filter).
- `placeOffer` calldata + `OfferPlaced` event reshaped accordingly.
- `MockCryptoPunksTraits` rewritten with `mapping(uint16 => uint256)`
  + `setMask` helper; the current per-trait-bool mock goes away.

### O5. Cost benchmarks — POST-IMPLEMENTATION

Why: Real numbers per view (`hasTrait`, `traitMaskOf`, `hasTraits`,
`indexedPixelsOf`, `colorAt`) reported in a benchmarks doc once contracts
are written. Spec doesn't block on speculative gas numbers.

## Historical Review Notes

`review/*` remains a peer review of earlier drafts. Treat this file and docs
01–08 as the current synthesis.
