# Final Recommendation

Build the new data surface in three layers:

1. `CryptoPunksDataV2`: immutable canonical traits, visual metrics, color
   catalog, indexed pixels, bitmaps, supplies, and dataset roots.
2. `CryptoPunksCriteriaAdapter`: optional adapter for protocols that want a
   small predicate interface, including this auction system.
3. `CryptoPunksRendererV2`: renderer and metadata layer consuming
   `CryptoPunksDataV2`.

This is a change from the first draft. The main contract should not be bounded
by the current auction interface. Trait bidding remains important, but it should
be implemented as one use case of a richer canonical data surface.

## Suggested Architecture

```text
CryptoPunksAuctions or other bidding protocol
  -> CryptoPunksDataV2 / CriteriaAdapter

CryptoPunksDataV2
  -> packed punk masks
  -> trait bitmaps
  -> trait catalog and supplies
  -> color catalog and color masks
  -> visual metrics
  -> indexed 24x24 image data
  -> dataset roots

CryptoPunksRendererV2
  -> transparent, backgrounded, SVG, bitmap, and metadata outputs
```

## Core Data Scope

Required functions:

```solidity
function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool);
function traitMaskOf(uint16 punkId) external view returns (uint256);
function hasTraits(
    uint16 punkId,
    uint256 requiredMask,
    uint256 forbiddenMask
) external view returns (bool);

function colorAt(uint16 punkId, uint8 x, uint8 y) external view returns (uint8 colorId);
function colorOf(uint8 colorId) external view returns (bytes4 rgba);
function colorMaskOf(uint16 punkId) external view returns (uint256);
function hasColor(uint16 punkId, uint8 colorId) external view returns (bool);
function pixelCountOf(uint16 punkId) external view returns (uint16);
function colorCountOf(uint16 punkId) external view returns (uint8);
function indexedPixelsOf(uint16 punkId) external view returns (bytes memory);
function visiblePixelBitmapOf(uint16 punkId) external view returns (uint256 word0, uint256 word1, uint256 word2);
```

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

## Trait ID Policy

Use a deterministic versioned catalog, not ad hoc IDs.

Recommended predicate groups:

- exact head variants,
- normalized type,
- attribute count,
- exact accessory names from the current contract.

Do not silently fix historical spellings like `Tassle Hat`. Exact names should
match the source data. If aliases are useful, put them in metadata, not in the
settlement predicate namespace.

## Storage Choice

Use bytecode-backed immutable blobs for packed masks, bitmaps, histograms, and
indexed image data.

Why:

- Deployment cost is not the main constraint, but very large sequential data is
  cleaner as sealed bytecode chunks than as many individual storage slots.
- EIP-170 prevents putting the full dataset in one runtime bytecode object.
- SSTORE2-style chunks are a proven pattern for large immutable data.
- The data is static forever, so write-once code storage is appropriate.

Recommended payload:

- `punkMasks.bin`: 10,000 packed `uint128` or `uint256` masks.
- `traitBitmaps.bin`: 40 words per trait.
- `traitMeta.bin`: kind, supply, and name offsets.
- `palette.bin`: all RGBA colors, including transparent.
- `indexedPixels.bin`: 576 color IDs per Punk.
- `visualMetrics.bin`: pixel count, color count, color masks, histogram offsets.

## Auction Contract Follow-Up

The current auction contract can use an adapter that exposes
`ICryptoPunksTraits.hasTrait`, but future auction work should use the richer
canonical interface directly.

For a later `Offers` version, replace dynamic `TraitFilter[]` storage with:

```solidity
uint256 requiredTraitMask;
uint256 forbiddenTraitMask;
```

Then matching becomes:

```solidity
if (!TRAITS.hasTraits(punkId, requiredTraitMask, forbiddenTraitMask)) {
    revert PunkTraitMismatch();
}
```

This reduces offer storage, event size, and settlement loops for common filters.
Keep include and exclude token ID arrays for exact baskets, or move large
baskets to Merkle roots if needed.

## Renderer Follow-Up

Renderer work should be second because it does not block trait bidding.

Renderer scope:

- `tokenURI(uint16)`-style JSON helper with OpenSea-compatible attributes.
- transparent SVG and bitmap outputs.
- official-status background modes: default, for sale, has bid, transfer,
  wrapped, legacy wrapped, transparent, and custom.
- `punkImageSvgOptimized(uint16)` using scanline rect merging or color-grouped
  paths.
- `rgbaPixelsOf(uint16)` for compatibility with the original raw image surface.
- `indexedPixelsOf(uint16)` pass-through for efficient consumers.

The renderer should consume flattened indexed pixels from `CryptoPunksDataV2`.
That is more useful than wrapping the old composition contract because rendering
no longer pays the cost of reconstructing the Punk from assets.

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

Ship `CryptoPunksDataV2` as an immutable, bytecode-backed canonical data
contract with per-Punk trait masks, per-trait bitmaps, color masks, visual
metrics, and 24x24 indexed pixels.

This gives the auction system the most immediate leverage: bidders can express
high-conviction demand over traits, colors, color count, and pixel count, while
other consumers get a general-purpose Punk data layer. Rendering should be a
separate contract, but it should use the V2 indexed-pixel data rather than
rebuilding images through the old asset composition path.

## Concrete Next Steps

1. Write a generator that reads all 10,000 `punkAttributes` strings from the
   source contract and all 10,000 `punkImage` byte arrays, then emits:
   - trait catalog,
   - per-Punk masks,
   - per-trait bitmaps,
   - color catalog,
   - indexed pixels,
   - color masks and histograms,
   - pixel count and color count bitmaps,
   - dataset hashes.
2. Add a fork test that compares V2 attributes and expanded RGBA images against
   the source contract for every Punk.
3. Implement `CryptoPunksDataV2` with immutable blob pointers and no owner
   after deployment.
4. Build a small adapter or update the auction interface to consume the richer
   criteria functions.
5. Prototype `CryptoPunksRendererV2` over indexed pixels and benchmark SVG,
   raw bitmap, and backgrounded outputs against the current `punkImageSvg`.
