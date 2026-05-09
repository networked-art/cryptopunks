# PunksData Criteria API

These functions answer questions about Punk traits. Use them when the question
is about type, head, accessory count, or accessories like `Hoodie`.

The criteria surface is built around the canonical trait catalog and per-Punk
trait masks. Single-Punk readers unpack direct storage, while
`traitBitmapWord` reads the inverted index for batch search. Contracts that
only need trait filtering should depend on `IPunksDataCriteria` instead of the
full ABI.

Use the criteria surface when matching Punks by type, head variant, attribute
count, or accessory traits. Offer settlement code should usually depend on the
narrow `IPunksDataCriteria` interface instead of the broader contract ABI.

## `datasetHash()`

```solidity
function datasetHash() public view returns (bytes32);
```

Returns the hash of the committed dataset. On `punksdata.eth`, this is
`0x92117ce6cb6bb70f9ffb9bf51ebbca6a84eae10e70639295d9c4a07958cd1f68`.

Live read: [`datasetHash()`](https://evm.now/address/punksdata.eth/read#datasetHash).

Use this to pin a consumer contract or frontend to one known dataset:

```solidity
if (!data.isSealed() || data.datasetHash() != EXPECTED_DATASET_HASH) {
    revert WrongPunksData();
}
```

## `traitCount()`

```solidity
function traitCount() external pure returns (uint16);
```

Returns the number of canonical trait ids, currently `111`.

Live read: [`traitCount()`](https://evm.now/address/punksdata.eth/read#traitCount).

Use this as the upper bound when enumerating the catalog offchain:

```solidity
for (uint16 traitId; traitId < data.traitCount(); ++traitId) {
    string memory name = data.traitName(traitId);
}
```

## `isValidTraitId(uint16 traitId)`

```solidity
function isValidTraitId(uint16 traitId) external pure returns (bool);
```

Returns `true` when `traitId < traitCount()`.

Live read: [`isValidTraitId(3)`](https://evm.now/address/punksdata.eth/read#isValidTraitId:3).

Use this in UI, indexer, or validation code that wants to check a trait id
without relying on a revert. Functions such as `traitName`, `hasTrait`, and
`traitBitmapWord` still revert for invalid trait ids.

## `traitName(uint16 traitId)`

```solidity
function traitName(uint16 traitId) external view returns (string memory);
```

Returns the exact display name for a trait id. The name comes from the sealed
trait catalog and preserves the source spelling.

Storage detail: `TraitMeta` stores one 6-byte record per trait. That record
points into the pooled name bytes that start after the fixed-size header.

Live read: [`traitName(3)`](https://evm.now/address/punksdata.eth/read#traitName:3).

Use it to build user-facing labels or an offchain lookup map:

```text
(traitKind, traitName) -> traitId
```

The pair is important because some names can be meaningful only within a kind.
For example, type traits, head variants, attribute counts, and accessories are
separate catalog categories.

Reverts with `InvalidTraitId` when `traitId >= 111`.

## `traitKind(uint16 traitId)`

```solidity
function traitKind(uint16 traitId) external view returns (TraitKind);
```

Returns the category of a trait id.

Storage detail: this reads the `kind` byte from the trait's `TraitMeta`
record.

Live read: [`traitKind(3)`](https://evm.now/address/punksdata.eth/read#traitKind:3).

| Enum | Meaning |
| --- | --- |
| `TraitKind.HeadVariant` | Exact source head variant |
| `TraitKind.NormalizedType` | Normalized market type |
| `TraitKind.AttributeCount` | Number of accessories |
| `TraitKind.Accessory` | Accessory trait |

Use it when presenting filters or reconstructing a kind-aware trait catalog.
Reverts with `InvalidTraitId` when the trait id is out of range.

## `traitSupply(uint16 traitId)`

```solidity
function traitSupply(uint16 traitId) external view returns (uint16);
```

Returns how many of the 10,000 Punks have the given trait. For accessory
traits this is the familiar rarity count. For type, head-variant, and
attribute-count traits it is the count of Punks in that category.

Storage detail: this reads the big-endian `supply:uint16` field from the
trait's `TraitMeta` record.

Live read: [`traitSupply(3)`](https://evm.now/address/punksdata.eth/read#traitSupply:3).

Use it for rarity displays, filter counts, or sanity checks against bitmap
popcounts.

Reverts with `InvalidTraitId` when the trait id is out of range.

## `hasTrait(uint16 punkId, uint16 traitId)`

```solidity
function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool);
```

Returns whether bit `traitId` is set in `traitMaskOf(punkId)`.

Storage detail: this reads the packed trait-mask pair for `punkId`, unpacks
the low or high 128-bit half, then checks one bit.

Live read: [`hasTrait(6980, 3)`](https://evm.now/address/punksdata.eth/read#hasTrait:6980:3).

Use it for simple one-off checks:

```solidity
bool wearsHoodie = data.hasTrait(punkId, hoodieTraitId);
```

For settlement or matching with multiple traits, prefer `hasTraits` so all
criteria are evaluated with one external call.

Reverts with `InvalidPunkId` when `punkId >= 10000` and `InvalidTraitId` when
`traitId >= 111`.

## `traitMaskOf(uint16 punkId)`

```solidity
function traitMaskOf(uint16 punkId) external view returns (uint256);
```

Returns the complete canonical trait mask for one Punk.

Storage detail: the mask comes from `_traitMaskPairs[punkId >> 1]`. Even Punk
ids use the low half of the packed word; odd Punk ids use the high half.

Live read: [`traitMaskOf(6980)`](https://evm.now/address/punksdata.eth/read#traitMaskOf:6980).

Use it when a consumer wants to do multiple checks locally:

```solidity
uint256 mask = data.traitMaskOf(punkId);
bool isMale = (mask & (uint256(1) << 3)) != 0;
bool hasTraitX = (mask & (uint256(1) << traitId)) != 0;
```

Reverts with `InvalidPunkId` when `punkId >= 10000`.

## `hasTraits(uint16 punkId, uint256 requiredMask, uint256 forbiddenMask, uint256 anyOfMask)`

```solidity
function hasTraits(
    uint16 punkId,
    uint256 requiredMask,
    uint256 forbiddenMask,
    uint256 anyOfMask
) external view returns (bool);
```

Evaluates a compact group of trait rules against one Punk.

Storage detail: this unpacks the same per-Punk trait mask as `traitMaskOf` and
applies all three rule masks locally inside the data contract.

Live read: [`hasTraits(6980, 8, 0, 0)`](https://evm.now/address/punksdata.eth/read#hasTraits:6980:8:0:0).

```solidity
(mask & requiredMask) == requiredMask
    && (mask & forbiddenMask) == 0
    && (anyOfMask == 0 || (mask & anyOfMask) != 0)
```

Use `requiredMask` for traits the Punk must have, `forbiddenMask` for traits
the Punk must not have, and `anyOfMask` for an optional OR group where at
least one bit must match. Set `anyOfMask` to zero when no OR group is needed.

Example:

```solidity
function matchesOffer(
    IPunksDataCriteria data,
    uint16 punkId,
    uint16 hoodieTraitId,
    uint16 cigaretteTraitId
) view returns (bool) {
    uint256 male = uint256(1) << 3;
    uint256 hoodie = uint256(1) << hoodieTraitId;
    uint256 cigarette = uint256(1) << cigaretteTraitId;

    return data.hasTraits({
        punkId: punkId,
        requiredMask: male,
        forbiddenMask: cigarette,
        anyOfMask: hoodie
    });
}
```

Mask validation is strict. The call reverts with `InvalidMask` if any mask
contains unknown bits, if `requiredMask` overlaps `forbiddenMask`, or if
`forbiddenMask` overlaps `anyOfMask`. Overlap between `requiredMask` and
`anyOfMask` is allowed but redundant.

Reverts with `InvalidPunkId` when `punkId >= 10000`.

## `traitBitmapWord(uint16 traitId, uint8 wordIndex)`

```solidity
function traitBitmapWord(
    uint16 traitId,
    uint8 wordIndex
) external view returns (uint256);
```

Returns one 256-Punk bitmap word for a trait. `wordIndex` selects the Punk id
range.

Storage detail: this does not read the per-Punk mask. It reads the
`TraitBitmaps` blob at `(traitId * 40 + wordIndex) * 32`, so callers can scan
all Punks that have a trait by fetching 40 words.

Live read: [`traitBitmapWord(3, 27)`](https://evm.now/address/punksdata.eth/read#traitBitmapWord:3:27).

```text
wordIndex 0  -> Punk ids 0..255
wordIndex 1  -> Punk ids 256..511
...
wordIndex 39 -> Punk ids 9984..9999 plus unused high bits
```

Use it for indexers and frontends that need to reconstruct matching Punk sets
efficiently. For example, fetch all 40 words for `Hoodie`, all 40 words for
`Male`, intersect the words locally, and decode set bits into Punk ids.

Reverts with `InvalidTraitId` when `traitId >= 111` and `InvalidWordIndex`
when `wordIndex >= 40`.

## `headVariantOf(uint16 punkId)`

```solidity
function headVariantOf(uint16 punkId) external view returns (HeadVariant);
```

Returns the exact head variant enum for a Punk:

Live read: [`headVariantOf(6980)`](https://evm.now/address/punksdata.eth/read#headVariantOf:6980).

```solidity
enum HeadVariant {
    Alien,
    Ape,
    Female1,
    Female2,
    Female3,
    Female4,
    Male1,
    Male2,
    Male3,
    Male4,
    Zombie
}
```

Use this when rendering metadata or when a consumer cares about the exact
source-image head class rather than the normalized market type.

Storage detail: this unpacks the 8-bit `headVariant` field from the Punk's
48-bit scalar record inside `_packedScalarWords`.

Reverts with `InvalidPunkId` when `punkId >= 10000`.

## `punkTypeOf(uint16 punkId)`

```solidity
function punkTypeOf(uint16 punkId) external view returns (PunkType);
```

Returns the normalized type enum for a Punk:

Live read: [`punkTypeOf(6980)`](https://evm.now/address/punksdata.eth/read#punkTypeOf:6980).

```solidity
enum PunkType {
    Alien,
    Ape,
    Female,
    Male,
    Zombie
}
```

Use this for broad type filters, market categories, and metadata fields. For
the equivalent trait bit, use bit `uint8(punkTypeOf(punkId))` in the trait
mask.

Storage detail: this unpacks the 8-bit `punkType` field from the Punk's
48-bit scalar record inside `_packedScalarWords`.

Reverts with `InvalidPunkId` when `punkId >= 10000`.

## `attributeCountOf(uint16 punkId)`

```solidity
function attributeCountOf(uint16 punkId) external view returns (uint8);
```

Returns the number of accessory attributes on a Punk, from `0` through `7`.
This count does not include normalized type, head variant, or the
attribute-count trait itself.

Live read: [`attributeCountOf(6980)`](https://evm.now/address/punksdata.eth/read#attributeCountOf:6980).

Use it for metadata, rarity summaries, or filters that care about how many
accessories a Punk has. The equivalent trait bit is `16 + attributeCount`.

Storage detail: this unpacks the 8-bit `attributeCount` field from the Punk's
48-bit scalar record inside `_packedScalarWords`.

Reverts with `InvalidPunkId` when `punkId >= 10000`.

