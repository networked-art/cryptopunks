# Trait And Criteria Interfaces

This note covers the predicate surface needed by trait bidding and filtering.
This is one layer of the canonical `PunksData` contract, not the whole
contract. Decisions that refine the original sketch in this note are pinned
in [decisions.md](./decisions.md).

The central criteria problem is to turn a display-oriented source contract into
a predicate-oriented data surface.

For bidding, the settlement contract needs only one thing:

```solidity
does punkId satisfy the bidder's criteria?
```

For public-good usefulness, frontends and indexers also need:

```solidity
what traits exist, what do they mean, how many Punks have them, and how can I
quickly fetch membership sets?
```

## Existing Repo Surface

The current local interface is intentionally small:

```solidity
interface ICryptoPunksTraits {
    function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool);
}
```

`Offers` stores `TraitFilter[]`, where each filter is:

```solidity
struct TraitFilter {
    bool required;
    uint16 traitId;
}
```

The current matching semantics are:

- Every required filter must be present.
- Every forbidden filter must be absent.
- Include IDs and exclude IDs are checked separately.

This is good enough for a first release if the external trait contract is
trustworthy and immutable.

## Trait Namespace

Treat `traitId` as a predicate ID, not just an accessory ID.

Namespace:

| Kind | Bit ID | Count | Purpose |
| --- | --- | ---: | --- |
| Normalized type | 0–4 | 5 | `Alien`, `Ape`, `Female`, `Male`, `Zombie` (alphabetical) |
| Exact head variant | 5–15 | 11 | `Alien`, `Ape`, `Female 1..4`, `Male 1..4`, `Zombie` (alphabetical) |
| Attribute count | 16–23 | 8 | `0 Attributes` through `7 Attributes` |
| Accessory | 24–110 | 87 | source-cased accessory names alphabetical |

111 bits total, fits in `uint128`. Masks are returned as `uint256`; bits
0–127 are canonical, bits 128–255 are reserved for derived predicates added
later in optional adapter contracts. The base data contract never sets bits
≥ 128.

Alien, Ape, and Zombie each get *both* a normalized-type bit (0–4) and an
exact-head-variant bit (5–15) — the matching sets coincide today, but the
predicate kinds are semantically different and downstream code should be
able to distinguish them. The kind enum (below) handles disambiguation in
name lookups.

Accessories are pinned to source casing, including the `Tassle Hat` typo
and `Pink With Hat`. No alias normalization in the base namespace; aliases
live in optional taxonomy contracts.

### Kind Enum

```solidity
uint8 constant KIND_HEAD_VARIANT    = 0;
uint8 constant KIND_NORMALIZED_TYPE = 1;
uint8 constant KIND_ATTRIBUTE_COUNT = 2;
uint8 constant KIND_ACCESSORY       = 3;
```

### Name Hash

`nameHash` for `traitIdByNameHash` is `keccak256(bytes(name))` over the
*exact* source bytes — casing preserved, typos preserved, no trimming, no
lowercasing, no normalization. Frontends build a static name → hash table
at build time.

Avoid subjective category predicates in the immutable base contract unless they
are explicitly versioned. Examples: "hair", "hat", "glasses", "mouth", "beard".
Those are useful for UI, but they introduce taxonomy arguments. They can live
in a separate optional taxonomy contract.

Visual metrics should be a separate predicate namespace. Exact colors, visible
pixel count, and visible color count are objective and valuable enough to expose
beside traits:

```solidity
function hasColor(uint16 punkId, uint8 colorId) external view returns (bool);
function colorMaskOf(uint16 punkId) external view returns (uint256);
function pixelCountOf(uint16 punkId) external view returns (uint16);
function colorCountOf(uint16 punkId) external view returns (uint8);
```

`colorMaskOf`, `hasColor`, and `colorCountOf` are visible-color predicates:
transparent pixels are excluded. If `colorId` is the transparent palette entry,
`hasColor(punkId, colorId)` returns false for every Punk. `colorSupply` may
still report transparent-pixel supply as a palette statistic.

For bids, color and metric criteria should not be crammed into `traitId` unless
the criteria type is also encoded. A clean interface separates trait masks,
color masks, and numeric bounds.

## Core Interface

```solidity
interface IPunksDataCriteria {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);

    function sourceDataContract() external view returns (address);
    function datasetHash() external view returns (bytes32);
    function traitCount() external view returns (uint16);

    function traitName(uint16 traitId) external view returns (string memory);
    function traitIdByNameHash(
        bytes32 nameHash,
        uint8 kind
    ) external view returns (uint16 traitId, bool exists);
    function traitKind(uint16 traitId) external view returns (uint8);
    function traitSupply(uint16 traitId) external view returns (uint16);
    function isValidTraitId(uint16 traitId) external view returns (bool);

    function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool);
    function traitMaskOf(uint16 punkId) external view returns (uint256);

    function hasTraits(
        uint16 punkId,
        uint256 requiredMask,
        uint256 forbiddenMask,
        uint256 anyOfMask
    ) external view returns (bool);

    function headVariantOf(uint16 punkId) external view returns (uint8);
    function punkTypeOf(uint16 punkId) external view returns (uint8);
    function attributeCountOf(uint16 punkId) external view returns (uint8);
}
```

`hasTraits` semantics: returns true iff
`(m & requiredMask) == requiredMask`
AND `(m & forbiddenMask) == 0`
AND (`anyOfMask == 0` OR `(m & anyOfMask) != 0`),
where `m = traitMaskOf(punkId)`.

The three-mask shape lets a single offer express *all of*, *none of*, and
*any of* in one settlement-time check. Disjunction (`anyOfMask`) covers
common bidder requests like "any sunglasses" or "any beard" without
fragmenting liquidity across N offers. An offer that does not need
disjunction passes `anyOfMask = 0`.

Malformed masks revert. Specifically:

- any bit outside the canonical trait range reverts,
- `requiredMask & forbiddenMask != 0` reverts,
- `forbiddenMask & anyOfMask != 0` reverts.

`requiredMask & anyOfMask` is allowed but redundant because the required bit
already satisfies the disjunction. Frontends should normalize overlaps before
signing. For "any hat except Beanie", remove `Beanie` from `anyOfMask` and put
it in `forbiddenMask`.

`hasTrait(punkId, traitId)` is also exposed as a third-party convenience.
This repo's `Offers` contract consumes the mask form directly.

The auction-side filter shape is:

```solidity
struct CompactTraitFilter {
    uint256 requiredMask;
    uint256 forbiddenMask;
    uint256 anyOfMask;
}
```

That replaces dynamic `TraitFilter[]` arrays. Settlement becomes one
external call regardless of filter count.

Invalid `punkId >= 10000` and invalid `traitId >= traitCount()` revert.
Silent false on invalid IDs would hide misconfigured offers and UI bugs.
`isValidTraitId(uint16)` is provided so tooling can probe without
catching reverts.

ERC-165 interface IDs are split rather than bundled, so a minimal renderer
or criteria-only adapter can advertise exactly what it supports:

- `IPunksTraitsCompat` — `hasTrait(uint16,uint16)` only.
- `IPunksDataCriteria` — mask predicates (this interface).
- `IPunksDataVisual` — color and pixel views (see doc 07).
- `IPunksDataIndexed` — `indexedPixelsOf`, `colorAt`, palette views.

`bytes4` IDs are pinned in the spec before Solidity is written.

## Bitmap Interface For Frontends

For UIs and indexers, trait bitmaps are much more useful than arrays:

```solidity
function traitBitmapWord(
    uint16 traitId,
    uint8 wordIndex
) external view returns (uint256);
```

With 10,000 Punks, each trait needs 40 words:

```text
ceil(10000 / 256) = 40
```

A frontend can fetch 40 words for "Hoodie", 40 words for "Male", intersect the
bitmaps locally, subtract forbidden bitmaps, and display the exact matching set
without parsing strings or trusting a centralized API.

Optional convenience view for fetching multiple words in one call:

```solidity
function traitBitmapWords(
    uint16 traitId,
    uint8 startWord,
    uint8 wordCount
) external view returns (uint256[] memory);
```

A `punksWithTrait(traitId) returns (uint16[])` helper is intentionally not
exposed: bitmap reconstruction at the consumer scales fine, and an
unbounded array return risks RPC blowups for high-supply traits like
`Earring` (2,459 entries).

## Criteria Registry Option

If offers become heavily trait-based, the auction contract can store criteria
by ID:

```solidity
struct Criteria {
    uint256 requiredMask;
    uint256 forbiddenMask;
    uint256 anyOfMask;
    bytes32 includeRoot;
    bytes32 excludeRoot;
}

function criteriaMatches(
    uint32 criteriaId,
    uint16 punkId,
    bytes32[] calldata includeProof,
    bytes32[] calldata excludeProof
) external view returns (bool);
```

This is useful when many offers reuse the same predicates, such as:

- any Alien,
- any Hoodie,
- any 0-attribute Punk,
- Male plus 3D Glasses,
- Zombie excluding a few known IDs.

Tradeoff: it adds coordination and lifecycle complexity. The first version does
not need it. The direct mask trio is simpler and covers most valuable filters.

## Seaport-Style Merkle Criteria

Seaport represents criteria-based NFT items with an `identifierOrCriteria`
field that can be a Merkle root of valid token IDs. Fulfillment supplies a token
ID and proof. That model is powerful for arbitrary sets and works even when the
marketplace contract does not know anything about traits.

For this auction system, a native trait predicate contract is better as the
primary mechanism:

- no proof generation for standard trait offers,
- no risk of users signing the wrong root,
- reusable by many protocols,
- trait supplies and bitmaps are public and inspectable,
- settlement checks are direct.

Merkle roots still make sense for arbitrary include/exclude sets or temporary
curated baskets.

## Metadata Compatibility

ERC-721 metadata is intentionally a string URI that points to JSON, and the
standard itself notes that metadata returned as a string is not meant for other
contracts to query. OpenSea's metadata format expects an `attributes` array
using `trait_type` and `value`.

`PunksData` and its encoders can expose both:

- numeric predicate functions for contracts,
- JSON attributes for marketplace display.

Example JSON attributes:

```json
[
  { "trait_type": "Type", "value": "Female" },
  { "trait_type": "Head Variant", "value": "Female 2" },
  { "display_type": "number", "trait_type": "Attribute Count", "value": 3 },
  { "trait_type": "Accessory", "value": "Earring" },
  { "trait_type": "Accessory", "value": "Blonde Bob" },
  { "trait_type": "Accessory", "value": "Green Eye Shadow" }
]
```

This keeps display systems happy without forcing contracts to parse display
strings.
