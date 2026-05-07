# CryptoPunks Data Research — Decisions

This is a defaults sheet. Each item proposes one answer with a short
rationale. Strike or rewrite the ones you disagree with; what's left becomes
the spec input for the data contract and the encoder contracts.

## Already locked (by project memory and prior decisions)

- Renderer architecture is split: data contract + per-format encoder
  contracts (`...Png`, `...Svg`, `...Metadata`). Encoders are pluggable
  and read primitives via public views.
- `Offers.sol` consumes the rich predicate interface directly. The
  single-method `hasTrait` shim is an optional third-party deployment,
  not on this repo's critical path.
- No PNG bytes are stored anywhere. Every output byte is derived from
  `palette.bin` + `indexedPixelsOf(punkId)` at call time.
- Pre-deployment posture: interfaces, structs, and events are freely
  editable. No migration shims, no compat layers for "old" offers.

## Architecture

### A1. Per-Punk PNG format — PNG-8 indexed (PLTE + tRNS)

Why: ~600 bytes, no expansion, matches the data shape directly. Truecolor
RGBA at 24×24 buys nothing.

### A2. Mosaic PNG byte-match goal — NO

Why: Reproducing the github file's exact zlib/DEFLATE stream is reverse
engineering, may not be feasible, and adds no informational value. Anchor
verification on `mosaicPixelsHash() = 0xdb0e780a…` instead. Use stored
(uncompressed) deflate; the resulting PNG is valid, decodes to the same
pixels, and has a different SHA.

Alternate if you disagree: pursue byte-match as a stretch goal in a later
encoder version that depends on the same data contract; do not block the
first encoder on it.

### A3. `anyOfMask` — IN

Why: Real bidder demand for "any sunglasses" / "any beard" exists. One
extra slot per offer. Categories stay subjective and out of the canonical
bit space; disjunction over individual bits is mechanical.

### A4. Storage shape — MIXED

Storage mapping for hot per-Punk scalars (`traitMaskOf`, `colorMaskOf`,
packed `pixelCount`/`colorCount`); SSTORE2 for large sequential blobs
(palette, indexed pixels, per-trait bitmaps).

Why: SLOAD is cheaper than EXTCODECOPY on the settlement hot path. Blob
data has no settlement-path consumer.

### A5. Phased delivery — ALL AT ONCE

Why: Spec is clear, deployment cost deprioritized, public-good positioning
favors one canonical sealed contract over partial deliveries.

### A6. Deployment chain — MAINNET

Why: Larva Labs's data contract is on mainnet; canonical successor lives
where Punks live. Cost (~0.8–8 ETH at SSTORE2-everywhere; lower with
mixed layout) is real but not prohibitive for a sealed deployment.

Flag: this is the only decision with material cost. If you want L2 or
L2 + a thin mainnet pointer, say so.

### A7. Filtered mosaic generator — IN SCOPE (same encoder)

Why: Same encoder contract, ~10 lines of generator logic, zero new
storage, big art-piece value. Composes V2 trait masks with mosaic
generation: "all 9 Aliens in canonical positions", "every 0-attribute
Punk", etc.

## Naming

### N1. Data contract — `CryptoPunksAtlas`

Why: Matches "register of every Punk's traits, colors, pixels". No
collision with V1/V2 token-standard naming, no collision with Larva Labs's
`CryptoPunksData`.

### N2. Encoders — `CryptoPunksPng`, `CryptoPunksSvg`, `CryptoPunksMetadata`

Why: Format-per-contract, no version suffix.

### N3. Compat shim — `CryptoPunksTraitsCompat`

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

Why: Exact source bytes, casing preserved, typos preserved. No trimming,
no lowercasing, no normalization. Frontends build a static name → hash
table at build time.

### P3. `traitIdByNameHash(nameHash, kind)` — kind enum

- 0 = head variant
- 1 = normalized type
- 2 = attribute count
- 3 = accessory

Why: Resolves the Alien/Ape/Zombie collision between exact head variant
and normalized type.

### P4. Mask width — `uint256`

Bits 0–127 canonical traits. Bits 128–255 reserved for derived predicates
added later in adapter contracts. Base contract never sets bits ≥ 128.

### P5. `datasetHash()` — keccak256 over sub-hashes

Construction:

```
traitCatalogHash  = keccak256(forEach trait: utf8(name) || uint8(kind))
punkMaskHash      = keccak256(forEach punk:  traitMaskOf(p))
paletteHash       = keccak256(palette bytes)
indexedPixelsHash = keccak256(forEach punk:  indexedPixelsOf(p))

datasetHash = keccak256(abi.encode(
  traitCatalogHash, punkMaskHash, paletteHash, indexedPixelsHash
))
```

SHA-256 stays as the offchain tooling hash (README, generator artifacts).
Both coexist; `datasetHash()` is the contract's public commitment.

### P6. Source crawl pinning — chain ID 1, recent finalized block

Pin chain ID, block height, and source `extcodehash` at that block.
Static data, but pinning blocks fork-injection attacks against future
verifiers.

To do once you confirm: I'll re-crawl at a chosen block, write the height
and `extcodehash` into doc 06, and re-confirm `db0e780a…` /
`3974413596…` round-trip.

### P7. ERC-165 interfaces — split, not bundled

- `IPunkTraitsCompat` — `hasTrait(uint16,uint16)` only.
- `IPunkDataCriteria` — mask predicates.
- `IPunkDataVisual` — color and pixel views.
- `IPunkDataIndexed` — `indexedPixelsOf`, `colorAt`, palette views.

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

### E2. Mosaic adler32 — IMMUTABLE PRECOMPUTE

`bytes4 immutable mosaicAdler32` set at deploy.

Why: Pixel data is fixed forever; adler32 is a function of fixed data.
Anyone suspicious can recompute from `mosaicRgbaRow(0..99)` outputs and
confirm. Storing the resulting four bytes is not the same as storing the
PNG.

### E3. Per-Punk PNG signatures

```solidity
function punkPng(uint16 punkId) external view returns (bytes memory);
function punkPng(uint16 punkId, bytes4 backgroundRgba) external view returns (bytes memory);
```

First overload returns transparent-background PNG-8. Second flattens
against an opaque background and returns alpha-255 throughout.

### E4. Mosaic surface — paged, two layers in the PNG encoder

Layer 1 (pixel generation):

```solidity
function mosaicIndexedRow(uint8 rowIndex) external view returns (bytes memory);
function mosaicRgbaRow(uint8 rowIndex)    external view returns (bytes memory);
function mosaicPixelsHash() external view returns (bytes32); // 0xdb0e780a…
```

Layer 2 (PNG byte stream):

```solidity
function pngHeader()  external view returns (bytes memory);
function pngStripe(uint8 rowIndex) external view returns (bytes memory);
function pngFooter()  external view returns (bytes memory);
function pngStreamHash() external view returns (bytes32);
```

Bonus: `pngStripeFiltered(uint8 row, uint256 required, uint256 forbidden, uint256 anyOf)`.

### E5. Drop `punksWithTrait`

Why: Bitmap-word path scales fine and is already specced. Unbounded
helper risks RPC blowups; bitmap reconstruction is the canonical
approach.

## Lifecycle

### L1. Sealed-initializer pattern

- Constructor records `address admin`.
- `loadChunk(blobName, index, bytes)` admin-only, accumulates SSTORE2
  pointers.
- `seal()` called once: writes `datasetHash`, emits `DatasetCommitted`,
  sets `admin = address(0)`. All loader functions revert post-seal.
- No proxy. No upgrade. No emergency override.

### L2. `DatasetCommitted` event

```solidity
event DatasetCommitted(
    address indexed sourceData,
    bytes32 traitCatalogHash,
    bytes32 punkMaskHash,
    bytes32 paletteHash,
    bytes32 indexedPixelsHash,
    bytes32 datasetHash
);
```

Emitted exactly once at seal. Makes the dataset auditable from event logs
alone.

### L3. `BatchMetadataUpdate(0, 9999)` — emit once at seal

Why: One-shot cache invalidation for marketplaces. Renderer replacements
emit from themselves later.

### L4. Invalid IDs — REVERT

Why: Silent `false` from a malformed filter is the bug class that turns a
misconfigured offer into an exploit. Add `isValidTraitId(uint16) view`
for tooling that wants to probe without catching reverts.

### L5. Generator invariants (asserted before seal)

- `popcount(traitMaskOf(p)) == 2 + attributeCountOf(p)` for every Punk
  (one head variant + one normalized type + accessories).
- Head variant bit ↔ normalized type bit consistency via hardcoded
  table.
- `Σ popcount(traitMaskOf(p)) == Σ traitSupply(t)`.
- All visible palette entries have alpha `0xFF` or `0x80`; one
  transparent entry has alpha `0x00`.
- `popcount(colorMaskOf(p)) == colorCountOf(p)`.
- visible-pixel-bitmap popcount equals `pixelCountOf(p)`.
- Indexed pixels expand through palette to byte-equal source
  `punkImage(p)` for every Punk.

## Operational

### O1. Deployer / owner / mirrorer

Flag: I don't know who's committing. Fill in name + address. Without it
the public-good claim has no name attached.

### O2. Post-deploy artifacts

- ENS subdomain (TBD — suggest `punks-data.eth` or scoped under an
  existing name).
- Etherscan source verification with deterministic build (Solidity
  version + optimizer settings pinned in repo).
- IPFS mirror of: trait catalog JSON, palette JSON, dataset hashes,
  pinned source crawl info, generator script source.
- Dataset bundle CID recorded on the deploy artifact (not in the
  contract — derive-don't-duplicate).

### O3. Auction-side knock-on (downstream of the data contract)

- `Offer.traitFilters` (`TraitFilter[]`) replaced by `requiredMask` +
  `forbiddenMask` + `anyOfMask`.
- `_requireOfferMatchesPunk` becomes one external `hasTraits(...)` call
  per offer (not per filter).
- `placeOffer` calldata + `OfferPlaced` event reshaped accordingly.
- `MockCryptoPunksTraits` rewritten with `mapping(uint16 => uint256)`
  + `setMask` helper; the current per-trait-bool mock goes away.

### O4. Cost benchmarks — POST-IMPLEMENTATION

Why: Real numbers per view (`hasTrait`, `traitMaskOf`, `hasTraits`,
`indexedPixelsOf`, `colorAt`) reported in a benchmarks doc once contracts
are written. Spec doesn't block on speculative gas numbers.

## Doc cleanup once these decisions are agreed

- Doc 04 (final-recommendation): replace V2 naming, drop adapter-as-bridge
  framing, add `anyOfMask`, mark phasing decision, replace storage
  recommendation with mixed layout.
- Doc 02 (trait-filtering): add `anyOfMask` signature, kind enum, name
  hash semantics.
- Doc 06 (reproducibility): add pinned chain ID, block height, source
  `extcodehash`.
- Doc 08 (composite-PNG): replace byte-exact target with stored-deflate
  + pixel hash anchor; mark exact-DEFLATE as a possible later encoder.
- review/*: leave as-is (peer review of the original notes); decisions
  here are the synthesis.
