# PunksData

`PunksData` is the sealed data surface for CryptoPunks traits, visual
metrics, palette colors, and 24x24 indexed pixel art. It replaces the old
display-oriented `CryptoPunksData` shape with a machine-readable primitive
that other contracts can use for filtering, rendering, and metadata.

The contract lives at `contracts/contracts/PunksData.sol` and implements the
interfaces in `contracts/contracts/interfaces/IPunksData.sol`.

## Purpose

`PunksData` is designed as a canonical public-good data contract:

- 10,000 Punks.
- 111 canonical trait bits.
- 222 RGBA palette entries, with palette id `0` reserved for transparency.
- 576 indexed pixels per Punk, exposed in raster order.
- Per-Punk trait masks, color masks, pixel counts, color counts, normalized
  Punk types, and exact head variants.
- Per-trait, per-color, per-pixel-count, and per-color-count bitmap rows for
  indexers and batch search.

The dataset is loaded once, committed with `seal`, and then cannot be changed.
After sealing, `owner()` is set to the zero address and all loader entrypoints
revert.

## Contract Lifecycle

The constructor takes a temporary loader owner:

```solidity
constructor(address x1001)
```

That owner can call the loader functions inherited from `PunksDataLoader` while
`isSealed()` is false:

```solidity
function loadTraitMaskPairs(uint16 startPairIndex, uint256[] calldata packedPairs) external;
function loadColorMasks(uint16 startPunkId, uint256[] calldata masks) external;
function loadPackedScalars(uint16 startWordIndex, uint256[] calldata words) external;
function loadColorSupplies(uint8 startColorId, uint32[] calldata supplies) external;
function loadBlobChunk(BlobId blobId, uint16 chunkIndex, bytes calldata data) external;
function seal(DatasetCommitment calldata commitment) external;
```

The load script streams both packed storage values and bytecode-backed blob
chunks into the contract. `seal` verifies the required blob shapes, records the
dataset commitment, emits `DatasetCommitted`, flips `isSealed`, and clears
loader authority.

`datasetHash()` is zero until `seal` succeeds. After sealing it is:

```text
keccak256(abi.encode(
  traitCatalogHash,
  punkMaskHash,
  paletteHash,
  indexedPixelsHash,
  compressedPixelsHash
))
```

Use `isSealed()` and `datasetHash()` before trusting a deployment as canonical.

## Dataset Reference

The current generated dataset is pinned to the Larva Labs data contract on
Ethereum mainnet:

| Field | Value |
| --- | --- |
| Source contract | `0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2` |
| Chain id | `1` |
| Block number | `25044552` |
| Block hash | `0x2185f56dcb307a56cb8b90c1e61d4fd7898be906eb28d79e14c01d15f5cabb9f` |
| Source extcodehash | `0x52ab51c14a3f26a80eca178374e21027492fd276c7365f9ab234b737d34c6b60` |
| Dataset hash | `0x92117ce6cb6bb70f9ffb9bf51ebbca6a84eae10e70639295d9c4a07958cd1f68` |

The mainnet `PunksData` address recorded in the repo is
`0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C`.

## Blob Layout

Large sequential data is stored as chunked bytecode blobs. The blob ids are:

| BlobId | Contents |
| --- | --- |
| `TraitBitmaps` | 111 rows, 40 `uint256` words per row |
| `TraitMeta` | Packed trait kind, supply, and name data |
| `Palette` | 222 RGBA entries, 4 bytes each |
| `PixelOffsets` | 10,001 `uint24` offsets into `CompressedPixels` |
| `CompressedPixels` | Per-Punk sparse local-palette pixel entries |
| `ColorBitmaps` | 222 rows, 40 `uint256` words per row |
| `PixelCountBitmaps` | One row per supported visible pixel count |
| `ColorCountBitmaps` | One row per supported visible color count |

Bitmap blobs share the same row-major layout. A row selected by trait id, color
id, pixel-count offset, or color-count offset has 40 words. Each bit position
within the row corresponds to a Punk id.

## Trait Model

Traits are represented as a `uint256` mask. The canonical catalog uses bits
`0..110`; higher bits are invalid in this base contract.

| Bits | Kind | Meaning |
| --- | --- | --- |
| `0..4` | `NormalizedType` | `Alien`, `Ape`, `Female`, `Male`, `Zombie` |
| `5..15` | `HeadVariant` | Exact head variant from the source CSV |
| `16..23` | `AttributeCount` | Attribute count `0..7` |
| `24..110` | `Accessory` | 87 accessories, sorted alphabetically |

Historical source spellings are preserved. For example, `Tassle Hat`,
`Pink With Hat`, and `Do-rag` are treated as exact canonical names.

`Alien`, `Ape`, and `Zombie` have both a normalized-type bit and an exact
head-variant bit. They currently match the same Punks, but they mean different
things.

## Criteria API

The criteria surface is the settlement and search primitive:

```solidity
function traitCount() external pure returns (uint16);
function isValidTraitId(uint16 traitId) external pure returns (bool);
function traitName(uint16 traitId) external view returns (string memory);
function traitKind(uint16 traitId) external view returns (TraitKind);
function traitSupply(uint16 traitId) external view returns (uint16);

function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool);
function traitMaskOf(uint16 punkId) external view returns (uint256);
function hasTraits(
    uint16 punkId,
    uint256 requiredMask,
    uint256 forbiddenMask,
    uint256 anyOfMask
) external view returns (bool);
function traitBitmapWord(uint16 traitId, uint8 wordIndex) external view returns (uint256);

function headVariantOf(uint16 punkId) external view returns (HeadVariant);
function punkTypeOf(uint16 punkId) external view returns (PunkType);
function attributeCountOf(uint16 punkId) external view returns (uint8);
```

`hasTraits` evaluates:

```solidity
(mask & requiredMask) == requiredMask
    && (mask & forbiddenMask) == 0
    && (anyOfMask == 0 || (mask & anyOfMask) != 0)
```

Mask validation is intentionally strict. The call reverts if a mask contains
unknown canonical bits, if `requiredMask` overlaps `forbiddenMask`, or if
`forbiddenMask` overlaps `anyOfMask`. An overlap between `requiredMask` and
`anyOfMask` is allowed but redundant.

Example, assuming the accessory trait ids have already been resolved from the
deployed catalog:

```solidity
function matchesAlienWithBeanie(
    IPunksDataCriteria data,
    uint16 punkId,
    uint16 beanieTraitId,
    uint16 cigaretteTraitId
) view returns (bool) {
    uint256 alien = uint256(1) << 0;
    uint256 beanie = uint256(1) << beanieTraitId;
    uint256 cigarette = uint256(1) << cigaretteTraitId;

    return data.hasTraits({
        punkId: punkId,
        requiredMask: alien,
        forbiddenMask: cigarette,
        anyOfMask: beanie
    });
}
```

For offers and settlement code, prefer `hasTraits` over looping through
individual `hasTrait` calls.

## Visual API

The visual surface exposes indexed pixels and color predicates without forcing
callers to render SVG or PNG:

```solidity
function paletteSize() external view returns (uint16);
function colorOf(uint8 colorId) external view returns (bytes4 rgba);
function colorSupply(uint8 colorId) external view returns (uint32 pixels);

function colorMaskOf(uint16 punkId) external view returns (uint256);
function hasColor(uint16 punkId, uint8 colorId) external view returns (bool);
function pixelCountOf(uint16 punkId) external view returns (uint16);
function colorCountOf(uint16 punkId) external view returns (uint8);

function colorBitmapWord(uint8 colorId, uint8 wordIndex) external view returns (uint256);
function pixelCountBitmapWord(uint16 pixelCount, uint8 wordIndex) external view returns (uint256);
function colorCountBitmapWord(uint8 colorCount, uint8 wordIndex) external view returns (uint256);

function indexedPixelsOf(uint16 punkId) external view returns (bytes memory);
function colorAt(uint16 punkId, uint8 x, uint8 y) external view returns (uint8 colorId);

function paletteRgbBytes() external view returns (bytes memory);
function paletteAlphaBytes() external view returns (bytes memory);
function paletteRgbaBytes() external view returns (bytes memory);
```

Color predicates count visible, non-transparent colors only:

- `colorMaskOf` never sets bit `0`.
- `hasColor(punkId, 0)` always returns false.
- `colorCountOf` excludes transparency.
- `colorSupply(0)` can still report the global transparent pixel count.

`indexedPixelsOf(punkId)` returns exactly 576 bytes: row-major palette ids for
the 24x24 Punk image. `colorAt(punkId, x, y)` is a convenience view over the
same decoded image and reverts when `x >= 24` or `y >= 24`.

Bulk palette views are provided for renderers:

| Function | Length | Use |
| --- | ---: | --- |
| `paletteRgbBytes()` | 666 bytes | PNG `PLTE` chunks |
| `paletteAlphaBytes()` | 222 bytes | PNG `tRNS` chunks |
| `paletteRgbaBytes()` | 888 bytes | RGBA expansion and SVG/metadata colors |

## Pixel Compression

The physical pixel storage is compressed per Punk. The public ABI hides this
format and always exposes decoded 576-byte indexed pixels.

Each compressed entry is:

```text
uint8 visibleColorCount
bytes72 visibleBitmap
uint8[visibleColorCount] localPalette
bitpacked local color indexes
```

Transparent pixels are implicit. Visible pixels use local palette indexes that
map back to global palette ids. The decoder validates entry length, palette
ids, bitmap/index consistency, and non-empty visible pixels.

## Bounds And Reverts

Important bounds:

| Value | Bound |
| --- | --- |
| Punk ids | `0..9999` |
| Trait ids | `0..110` |
| Palette ids | `0..221` |
| Bitmap word indexes | `0..39` |
| Visible pixel count | `148..332` |
| Visible color count | `2..14` |

Invalid inputs revert with custom errors such as `InvalidPunkId`,
`InvalidTraitId`, `InvalidColorId`, `InvalidWordIndex`,
`InvalidPixelCount`, `InvalidColorCount`, `InvalidCoordinate`, or
`InvalidMask`.

## Integration Notes

Use the split interfaces when a consumer only needs part of the ABI:

- `IPunksDataCriteria` for trait predicates and catalog data.
- `IPunksDataVisual` for color and visual metric predicates.
- `IPunksDataIndexed` for decoded pixels and palette bytes.
- `IPunksData` for the full loader plus read surface.

`PunksRenderer` is the first deployed consumer of this data contract. It reads
`indexedPixelsOf`, palette bytes, trait names, scalar metrics, and masks to
produce RGBA, SVG, PNG, and metadata outputs.

The research notes behind this design are in
`contracts/docs/cryptopunks-data-research/`, especially the decisions sheet.
