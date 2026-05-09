# PunksData Loader And Storage API

Before the contract is sealed, the owner loads each storage shape: masks,
small summary numbers, color totals, and big byte blobs. Sealing locks the
data permanently.

The live `punksdata.eth` deployment is sealed, so normal consumers only use
read calls. The loader functions explain how each storage shape gets into the
contract. Direct per-Punk or per-color values are loaded through typed batch
functions. Large byte arrays are loaded through `loadBlobChunk`, which appends
SSTORE2-style bytecode chunks. `seal` verifies the fixed-size shapes, commits
the dataset hash, clears ownership, and prevents any future writes.

## `owner()`

```solidity
function owner() external view returns (address);
```

Returns the account that can load data before seal. After seal, the owner is
set to `address(0)`.

Use it only for deployment and verification tooling. Runtime consumers should
prefer `isSealed()` and `datasetHash()`.

## `isSealed()`

```solidity
function isSealed() external view returns (bool);
```

Returns whether the loader surface has been permanently locked.

Use it with `datasetHash()` when accepting a configurable data contract:

```solidity
require(data.isSealed(), "PunksData: unsealed");
require(data.datasetHash() == EXPECTED_DATASET_HASH, "PunksData: wrong data");
```

## `loadTraitMaskPairs(uint16 startPairIndex, uint256[] calldata packedPairs)`

```solidity
function loadTraitMaskPairs(
    uint16 startPairIndex,
    uint256[] calldata packedPairs
) external;
```

Loads per-Punk trait masks into `_traitMaskPairs`.

Storage detail: each `uint256` packs two masks. The low 128 bits are the even
Punk in the pair and the high 128 bits are the odd Punk in the pair. Each half
must only use canonical trait bits `0..110`.

Reverts after seal, from non-owner callers, when the batch overruns the 5,000
pair slots, or when any mask contains invalid bits.

## `loadColorMasks(uint16 startPunkId, uint256[] calldata masks)`

```solidity
function loadColorMasks(
    uint16 startPunkId,
    uint256[] calldata masks
) external;
```

Loads per-Punk visible-color masks into `_colorMasks`.

Storage detail: each Punk gets one `uint256`. Valid color mask bits are
`1..221`; bit `0` must be unset because transparency is deliberately excluded
from per-Punk color masks.

Reverts after seal, from non-owner callers, when the batch overruns the 10,000
Punk slots, or when any mask contains invalid bits.

## `loadPackedScalars(uint16 startWordIndex, uint256[] calldata words)`

```solidity
function loadPackedScalars(
    uint16 startWordIndex,
    uint256[] calldata words
) external;
```

Loads the small per-Punk visual and category summaries into
`_packedScalarWords`.

Storage detail: each word holds five 48-bit records. Each record packs
`pixelCount`, `colorCount`, `attributeCount`, `punkType`, and `headVariant`.
The loader validates each field against the canonical bounds before storing.

Reverts after seal, from non-owner callers, when the batch overruns the scalar
word slots, or when any field is outside its allowed range.

## `loadColorSupplies(uint8 startColorId, uint32[] calldata supplies)`

```solidity
function loadColorSupplies(
    uint8 startColorId,
    uint32[] calldata supplies
) external;
```

Loads global pixel totals into `_colorSupplies`.

Storage detail: each value counts pixels across the whole 10,000-Punk dataset.
For `colorId == 0`, this is the transparent pixel count. For nonzero colors,
it is the visible pixel count for that palette color.

Reverts after seal, from non-owner callers, or when the batch overruns the 222
palette ids.

## `loadBlobChunk(BlobId blobId, uint16 chunkIndex, bytes calldata data)`

```solidity
function loadBlobChunk(
    BlobId blobId,
    uint16 chunkIndex,
    bytes calldata data
) external;
```

Appends one byte chunk to one blob-backed table.

Storage detail: chunks must be appended in order. Each chunk is deployed as
bytecode by `BytecodeBlob.write`, and the parent contract records the pointer
plus the cumulative end offset. Blob reads later treat all chunks for the same
`BlobId` as one logical byte string.

Reverts after seal, from non-owner callers, when `chunkIndex` is not the next
sequential index, or when the chunk cannot be stored by the bytecode blob
helper.

## `seal(DatasetCommitment calldata commitment)`

```solidity
function seal(DatasetCommitment calldata commitment) external;
```

Locks the data forever and records the dataset hash.

Storage detail: seal verifies the required blob lengths for the canonical
dataset shape, computes the dataset hash from the five component hashes, stores
it in `_datasetHash`, flips `isSealed`, and clears `owner`.

The commitment fields are:

| Field | Meaning |
| --- | --- |
| `traitCatalogHash` | Hash of trait names and kinds |
| `punkMaskHash` | Hash of per-Punk trait masks |
| `paletteHash` | Hash of the RGBA palette |
| `indexedPixelsHash` | Hash of the decoded indexed pixels |
| `compressedPixelsHash` | Hash of the compressed pixel blob |

Reverts if any commitment hash is zero, if the dataset shape is incomplete, if
the caller is not the owner, or if the contract is already sealed.
