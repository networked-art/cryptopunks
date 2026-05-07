# Trait And Criteria Interfaces

This note covers the predicate surface needed by trait bidding and filtering.
After the expanded visual-metrics pass, this should be treated as one layer of
`CryptoPunksDataV2`, not the whole data contract.

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

## Recommended V2 Trait Namespace

Treat `traitId` as a predicate ID, not just an accessory ID.

Minimum namespace:

| Kind | Count | Purpose |
| --- | ---: | --- |
| Exact head variant | 11 | `Male 1`, `Female 4`, `Alien`, etc. |
| Normalized type | 5 | `Male`, `Female`, `Zombie`, `Ape`, `Alien` |
| Attribute count | 8 | `0 Attributes` through `7 Attributes` |
| Accessory | 87 | `Hoodie`, `Beanie`, `Earring`, etc. |

This gives roughly 111 predicate IDs if rare types are duplicated in both
`Exact head variant` and `Normalized type`, or roughly 108 IDs if exact rare
head variants double as normalized rare types. Either fits in one `uint128`,
but returning `uint256` leaves room for future non-canonical convenience
predicates.

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

For bids, color and metric criteria should not be crammed into `traitId` unless
the criteria type is also encoded. A clean interface separates trait masks,
color masks, and numeric bounds.

## Core Interface

Use a compatibility surface plus a richer mask surface:

```solidity
interface ICryptoPunksCriteriaV2 {
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

    function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool);
    function traitMaskOf(uint16 punkId) external view returns (uint256);

    function hasTraits(
        uint16 punkId,
        uint256 requiredMask,
        uint256 forbiddenMask
    ) external view returns (bool);

    function headVariantOf(uint16 punkId) external view returns (uint8);
    function punkTypeOf(uint16 punkId) external view returns (uint8);
    function attributeCountOf(uint16 punkId) external view returns (uint8);
}
```

`hasTrait` keeps this repo compatible as-is. `traitMaskOf` and `hasTraits`
enable a later auction version to store compact criteria:

```solidity
struct CompactTraitFilter {
    uint256 requiredMask;
    uint256 forbiddenMask;
}
```

That avoids storing and looping over dynamic `TraitFilter[]` arrays for the
common all-of/none-of case.

Invalid `punkId >= 10000` and invalid `traitId >= traitCount()` should revert.
For bidding, silent false on invalid IDs is dangerous because it can hide a
misconfigured offer or UI bug.

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

Optional convenience views:

```solidity
function traitBitmapWords(
    uint16 traitId,
    uint8 startWord,
    uint8 wordCount
) external view returns (uint256[] memory);

function punksWithTrait(
    uint16 traitId
) external view returns (uint16[] memory);
```

`punksWithTrait` is fine as an offchain view helper, but should not be used
inside settlement paths because it loops.

## Criteria Registry Option

If offers become heavily trait-based, the auction contract can store criteria
by ID:

```solidity
struct Criteria {
    uint256 requiredMask;
    uint256 forbiddenMask;
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
not need it. `requiredMask` and `forbiddenMask` are simpler and cover most
valuable filters.

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

A Punk data V2 can expose both:

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
