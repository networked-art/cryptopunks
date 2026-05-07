# Final Recommendation

Build the new data surface as a sealed primitive contract plus a set of
format-specific encoder contracts, all reading from the data contract via
public views:

1. `PunksData`: immutable canonical traits, visual metrics, color catalog,
   indexed pixels, bitmaps, supplies, and dataset roots. Sealed after load,
   no admin, no upgrade path.
2. `PunksPng`: PNG encoder. Per-Punk PNG-8 plus paged byte-exact composite
   `punks.png` generator. Reads `palette.bin` + `indexedPixelsOf(punkId)`
   from `PunksData`.
3. `PunksSvg`: SVG encoder with status-color background modes.
4. `PunksMetadata`: OpenSea-shaped JSON metadata; embeds image data from
   `PunksPng` or `PunksSvg`.
5. `PunksTraitsCompat` (optional): single-method `hasTrait(uint16,uint16)`
   shim for third-party protocols that want a minimal hook. Not used by
   this repo's `Offers`.

This is a change from the first draft. The data contract is not bounded by
the auction interface. Trait bidding consumes the mask predicates on
`PunksData` directly — there is no compat adapter on the critical path.
Encoders are pluggable: anyone can deploy a better PNG/SVG/metadata
encoder later against the same sealed data contract.

The full set of accepted decisions is pinned in [decisions.md](./decisions.md).

## Suggested Architecture

```text
CryptoPunksAuctions (this repo)
  -> PunksData    (mask predicates, visual metrics)

Third-party Punk-aware protocol
  -> PunksTraitsCompat (optional hasTrait shim)
       -> PunksData

PunksData    (sealed, primitives only)
  -> packed punk trait masks (storage)
  -> trait bitmaps (SSTORE2)
  -> trait catalog and supplies
  -> color catalog, color masks (storage)
  -> visual metric scalars (storage, packed)
  -> palette (SSTORE2)
  -> indexed 24x24 image data (SSTORE2)
  -> dataset roots

PunksPng
  -> reads PunksData palette + indexedPixelsOf
  -> per-Punk PNG-8 (transparent + backgrounded)
  -> paged byte-exact composite punks.png chunks
  -> paged filtered mosaic chunks (predicate-gated)

PunksSvg
  -> reads PunksData primitives
  -> per-Punk SVG with status-color background modes

PunksMetadata
  -> reads PunksData primitives
  -> OpenSea-shaped JSON, embeds image from PunksPng or PunksSvg
```

## Core Data Scope

Required functions:

```solidity
function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool);
function traitMaskOf(uint16 punkId) external view returns (uint256);
function hasTraits(
    uint16 punkId,
    uint256 requiredMask,
    uint256 forbiddenMask,
    uint256 anyOfMask
) external view returns (bool);
function isValidTraitId(uint16 traitId) external view returns (bool);

function colorAt(uint16 punkId, uint8 x, uint8 y) external view returns (uint8 colorId);
function colorOf(uint8 colorId) external view returns (bytes4 rgba);
function colorMaskOf(uint16 punkId) external view returns (uint256);
function hasColor(uint16 punkId, uint8 colorId) external view returns (bool);
function pixelCountOf(uint16 punkId) external view returns (uint16);
function colorCountOf(uint16 punkId) external view returns (uint8);
function indexedPixelsOf(uint16 punkId) external view returns (bytes memory);
function visiblePixelBitmapOf(uint16 punkId) external view returns (uint256 word0, uint256 word1, uint256 word2);

function paletteRgbBytes() external view returns (bytes memory);   // 666 bytes
function paletteAlphaBytes() external view returns (bytes memory); // 222 bytes
function paletteRgbaBytes() external view returns (bytes memory);  // 888 bytes
```

`paletteRgbBytes` and `paletteAlphaBytes` exist so PNG encoders can build
PLTE and tRNS chunks without 222 individual `colorOf` calls. `paletteRgbaBytes`
serves consumers that want raw RGBA in one call.

Color predicates are visible-color predicates. `colorMaskOf`, `hasColor`, and
`colorCountOf` ignore transparent pixels; `hasColor` returns false for the
transparent palette entry. `colorSupply` may still expose the transparent
pixel total as a global palette statistic.

Public-good functions:

```solidity
function supportsInterface(bytes4 interfaceId) external view returns (bool);
function sourceDataContract() external view returns (address);
function datasetHash() external view returns (bytes32);
function traitCount() external view returns (uint16);
function traitName(uint16 traitId) external view returns (string memory);
function traitIdByNameHash(bytes32 nameHash, uint8 kind) external view returns (uint16, bool);
function traitKind(uint16 traitId) external view returns (uint8);
function traitSupply(uint16 traitId) external view returns (uint16);
function traitBitmapWord(uint16 traitId, uint8 wordIndex) external view returns (uint256);
function headVariantOf(uint16 punkId) external view returns (uint8);
function punkTypeOf(uint16 punkId) external view returns (uint8);
function attributeCountOf(uint16 punkId) external view returns (uint8);
function colorSupply(uint8 colorId) external view returns (uint32 pixels);
function colorBitmapWord(uint8 colorId, uint8 wordIndex) external view returns (uint256);
function pixelCountBitmapWord(uint16 pixelCount, uint8 wordIndex) external view returns (uint256);
function colorCountBitmapWord(uint8 colorCount, uint8 wordIndex) external view returns (uint256);
```

Use `uint256` masks even though the first version fits in 128 bits. That leaves
room for stable derived predicates without a second mask type.

Invalid Punk IDs and trait IDs should revert. A bad filter should fail loudly
instead of becoming an accidental "false" predicate.

Malformed masks should also revert. `hasTraits` rejects unknown bits,
`requiredMask & forbiddenMask != 0`, and `forbiddenMask & anyOfMask != 0`.
`requiredMask & anyOfMask` is allowed but redundant. Frontends should submit
canonical masks; for "any hat except Beanie", subtract `Beanie` from
`anyOfMask` and include it in `forbiddenMask`.

## Trait ID Policy

Bit assignment is alphabetical by kind, derivable from the CSV crawl alone:

| Bits | Kind | Source |
| --- | --- | --- |
| 0–4 | normalized types alphabetical (Alien, Ape, Female, Male, Zombie) | derived |
| 5–15 | exact head variants alphabetical (`Alien`, `Ape`, `Female 1..4`, `Male 1..4`, `Zombie`) | source CSV |
| 16–23 | attribute count 0–7 | derived |
| 24–110 | accessories alphabetical, exact source casing | source CSV |

111 bits, fits `uint128`. Masks are returned as `uint256`; bits 128–255 are
reserved for derived predicates added later in optional adapter contracts.
The base data contract never sets bits ≥ 128.

Do not silently fix historical spellings: `Tassle Hat`, `Pink With Hat`,
`Do-rag` are kept exactly as the source emits them. Aliases live in
optional taxonomy contracts, never in the settlement predicate namespace.

Alien / Ape / Zombie each get *both* a normalized-type bit and an exact
head-variant bit. The matching sets coincide today, but the predicate
*meaning* is different. Kind-aware lookups (`traitIdByNameHash(nameHash,
kind)`) disambiguate.

Name hash semantics for `traitIdByNameHash`: `keccak256(bytes(name))` over
the exact source bytes. No casing, trimming, or normalization.

## Storage Choice

Use a mixed layout: storage mappings for hot per-Punk scalars, SSTORE2
bytecode chunks for large sequential blobs.

Storage mappings (one cold SLOAD ~2,100 / warm ~100):

- `traitMaskOf(punkId)` — `mapping(uint16 => uint256)`. Hit on every
  settlement; SLOAD is cheaper than EXTCODECOPY.
- `colorMaskOf(punkId)` — `mapping(uint16 => uint256)`.
- visual metric scalars (`pixelCountOf`, `colorCountOf`, packed
  `visiblePixelBitmapOf`) — packed into 1–3 slots per Punk so hot lookups
  are one SLOAD.

SSTORE2 bytecode chunks (cheaper at deploy for large sequential reads,
EXTCODECOPY for retrieval):

- `traitBitmaps.bin` — 40 words per trait, ~135 KB total.
- `palette.bin` — 222 RGBA entries, 888 bytes.
- `indexedPixels.bin` — 576 color IDs per Punk, ~5.76 MB.
- `traitMeta.bin` — kind, supply, name offsets.

Why mixed: the per-Punk trait mask is read on every settlement-time call.
A storage SLOAD is read-cheaper than an SSTORE2 EXTCODECOPY at the 32-byte
size, and the readability cost compounds across the lifetime of the
contract. Large sequential data has no settlement-path consumer, so the
SSTORE2 deploy-cost win applies cleanly there.

EIP-170 still caps any one bytecode object at 24,576 bytes, so SSTORE2
blobs are chunked. EIP-3860's 49,152-byte init-code limit does not bind
because each chunk is `runtime_data + ~24 byte wrapper` ≈ 24,600 bytes
of init code.

## Auction Contract Changes

These contracts are pre-deployment. There is no live oracle to migrate
from and no live offers to preserve, so `Offers.sol` consumes the rich
predicate interface on `PunksData` directly.

Replace dynamic `TraitFilter[]` storage with three mask slots:

```solidity
struct CompactTraitFilter {
    uint256 requiredMask;
    uint256 forbiddenMask;
    uint256 anyOfMask;
}
```

Settlement becomes one external call regardless of filter count:

```solidity
if (!PUNKS.hasTraits(punkId, f.requiredMask, f.forbiddenMask, f.anyOfMask)) {
    revert PunkTraitMismatch();
}
```

Knock-on changes in this repo:

- `Offer.traitFilters` field replaced with the mask trio.
- `placeOffer` calldata reshaped accordingly.
- `OfferPlaced` event reshaped accordingly.
- `_requireOfferMatchesPunk` becomes one external `hasTraits` call, not a
  per-filter loop.
- `MockCryptoPunksTraits` rewritten with `mapping(uint16 => uint256)
  punkMask` + `setMask` helper.
- `ICryptoPunksTraits` is replaced; the new interface is
  `IPunksDataCriteria` (see doc 02).

`PunksTraitsCompat` is still worth shipping as a separately deployed
contract for *external* protocols that want a minimal `hasTrait` hook,
but it is not on this repo's critical path. Settlement here calls
`PunksData` directly.

Include and exclude token ID arrays remain for exact baskets, or move
large baskets to Merkle roots if needed (bound proof length to 14 for
the 10,000-Punk tree).

## Encoder Contracts

Encoders are split by output format. Each is a standalone contract that
reads `PunksData` via public views.

`PunksSvg`:

- `punkSvg(uint16 punkId, BackgroundMode mode) external view returns (string memory)`
- `punkSvgCustomBackground(uint16 punkId, bytes4 rgba) external view returns (string memory)`
- background modes: `Transparent`, `Owned` (`#638596`), `ForSale`,
  `HasBid`, `Transfer`, `Wrapped`, `LegacyWrapped`, `Custom`.
- scanline rect merging or color-grouped paths internally.

`PunksMetadata`:

- `metadataJson(uint16 punkId, BackgroundMode mode) external view returns (string memory)`
- OpenSea-shaped attributes; embeds image data from `PunksPng` or
  `PunksSvg`.
- Renamed from `tokenUriJson` — does not claim to be the canonical
  `tokenURI` for any specific Punk token contract.

`PunksPng`: see the next section.

Encoders consume flattened indexed pixels from `PunksData` rather than
reconstructing Punks via the old asset-composition algorithm. Renderer
views are for offchain display and `eth_call` consumption only — no
auction or settlement function calls a renderer.

## PunksPng Encoder

PNG generation lives in `PunksPng`, a single encoder contract that handles
both per-Punk PNG-8 and the paged composite mosaic. PNG goes in its own
contract because the byte-exact composite goal is compression-sensitive
and would bloat the data contract; per-Punk and composite share the same
palette/CRC32/zlib machinery so there's no benefit to splitting them
further.

Per-Punk:

```solidity
function punkPng(uint16 punkId) external view returns (bytes memory);
function punkPng(uint16 punkId, bytes4 backgroundRgba) external view returns (bytes memory);
```

First overload returns transparent-background PNG-8 (~600 bytes). Second
flattens against an opaque background and returns alpha-255 throughout.

Composite mosaic — Layer 1 (pixel generation):

```solidity
function mosaicIndexedRow(uint8 rowIndex) external view returns (bytes memory);
function mosaicRgbaRow(uint8 rowIndex)    external view returns (bytes memory);
function mosaicPixelsHash() external pure returns (bytes32); // 0xdb0e780a…
```

Composite mosaic — Layer 2 (paged byte-exact PNG):

```solidity
function compositePngChunkCount() external pure returns (uint16);
function compositePngChunk(uint16 chunkIndex) external view returns (bytes memory);
function referencePngSha256() external pure returns (bytes32); // 0xac39af…
function referenceIdatSha256() external pure returns (bytes32); // 0x7d080b…
function referenceInflatedScanlinesSha256() external pure returns (bytes32); // 0x62a66b…
```

Concatenating `compositePngChunk(0..N)` is byte-equal to the GitHub
`punks.png` file. Chunking is an RPC return-size requirement, not a
different file format.

Filtered mosaic — bonus:

```solidity
function compositePngChunkFiltered(
    uint16 chunkIndex,
    uint256 requiredMask,
    uint256 forbiddenMask,
    uint256 anyOfMask
) external view returns (bytes memory);
```

Generates a mosaic with non-matching tiles transparent. Not part of the
byte-exact reference target — these are new compositions, not the
canonical GitHub image.

Reproducing the exact zlib/DEFLATE stream is the encoder's hard
milestone; doc 08 covers the constraints. The data contract does not
depend on this work — `PunksData` ships first and `PunksPng` ships when
the encoder is audited.

## Tradeoff Summary

| Approach | Bid strength | UI filtering | Visual data | Complexity | Recommendation |
| --- | --- | --- | --- | --- | --- |
| String adapter around `punkAttributes` | Low | Low | None | Medium | Avoid |
| Mask-only traits | High | Medium | None | Medium | Too narrow |
| Masks plus trait bitmaps | High | High | None | Medium | Useful but incomplete |
| Full data: traits plus colors plus indexed pixels | High | High | High | High | Best target |
| Merkle roots only | Medium | Low | None | High UX cost | Only for arbitrary baskets |
| Renderer wrapper over Larva data | None | Medium | Medium | Medium | Interim only |
| Renderer over indexed pixels | None | High | High | Medium | Best renderer target |

## Final Suggestion

Ship `PunksData` as an immutable canonical data contract with per-Punk
trait masks (storage), per-trait bitmaps (SSTORE2), color masks
(storage), visual metric scalars (storage, packed), palette and 24×24
indexed pixels (SSTORE2). Seal at deploy; no admin, no upgrade path.

This gives the auction system the most immediate leverage: bidders can
express high-conviction demand over traits, colors, color count, and
pixel count, while other consumers get a general-purpose Punk data layer.
Encoders are separate contracts that consume `PunksData` primitives —
SVG, JSON, and PNG (per-Punk + byte-exact composite) — and are pluggable
forever after.

## Concrete Next Steps

1. Re-crawl all 10,000 `punkAttributes` and `punkImage` outputs at the
   pinned source block (see doc 06), and produce:
   - trait catalog (alphabetical bit ordering per the table above),
   - per-Punk trait masks,
   - per-trait bitmaps,
   - palette,
   - indexed pixels,
   - color masks and visible-pixel bitmaps,
   - pixel-count and color-count bitmaps,
   - dataset hashes.
2. Assert generator invariants before seal:
   - `popcount(traitMaskOf(p)) == 2 + attributeCountOf(p)`,
   - head variant ↔ normalized type consistency table,
   - Σ popcount(traitMaskOf) == Σ traitSupply,
   - palette alpha values ∈ {0x00, 0x80, 0xFF},
   - `popcount(colorMaskOf(p)) == colorCountOf(p)`,
   - visible-pixel-bitmap popcount == `pixelCountOf(p)`,
   - palette-expanded indexed pixels byte-equal source `punkImage(p)`.
3. Fork-test `PunksData` against the source contract for every Punk.
4. Implement `PunksData` with immutable blob pointers, sealed-initializer
   pattern (`loadChunk` + one-shot `seal()` that emits
   `DatasetCommitted`).
5. Rewrite `Offers.sol` to consume `IPunksDataCriteria.hasTraits` directly
   with the mask trio (`requiredMask`, `forbiddenMask`, `anyOfMask`).
   Rewrite `MockCryptoPunksTraits` accordingly.
6. Implement `PunksSvg` and `PunksMetadata` over `PunksData` indexed
   pixels. Benchmark output sizes against the original `punkImageSvg`.
7. Implement `PunksPng`. First verify exact inflated scanlines from
   `PunksData` (`mosaicPixelsHash()` matches `0xdb0e780a…` and inflated
   scanline hash matches `0x62a66b…`); only then attempt exact
   zlib/DEFLATE reproduction for the reference PNG hash `0xac39af…`.
