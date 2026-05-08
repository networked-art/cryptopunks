# Offers Redesign — Mask-Based Filtering Over PunksData

## Context

The current `contracts/offers/Offers.sol` (inspired by
[`cryptopunks-bids`](https://github.com/MouseDev/cryptopunks-bids)) accepts a
`TraitFilter[] { bool required; uint16 traitId; }` array and validates each
filter at settlement by calling `ICryptoPunksTraits.hasTrait(punkId, traitId)`
once per filter. Against the original Larva Labs `CryptopunksData` contract this
meant a tight per-trait loop over a CSV-string-backed lookup.

The new `PunksData` contract (see
[`docs/cryptopunks-data-research/decisions.md`](../cryptopunks-data-research/decisions.md))
replaces that with packed canonical trait masks plus a rich predicate surface.
`IPunksDataCriteria.hasTraits(punkId, requiredMask, forbiddenMask, anyOfMask)`
collapses a full filter set into one external call against a single
SLOAD-backed mask. Visual scalars (`pixelCountOf`, `colorCountOf`) and color
masks are also cheap.

Decisions doc O4 from the data research already locked the trait-side swap for
`Offers`. This document captures the full redesign scope including the optional
color-count extension, the resulting `Offers` shape, and the file-by-file plan.

## What PunksData enables

| Capability | View | Notes |
| --- | --- | --- |
| Trait predicates | `hasTraits(punkId, req, forb, anyOf)` | One call, bounded gas; reverts on malformed masks. |
| Trait introspection | `hasTrait`, `traitMaskOf`, `traitCount`, `traitName`, `traitKind`, `traitSupply`, `traitBitmapWord` | For UI / discovery. |
| Color predicates | `colorMaskOf`, `hasColor`, `colorBitmapWord`, `colorSupply` | All 222 visible palette entries fit in one `uint256`. |
| Visual scalars | `pixelCountOf`, `colorCountOf`, `attributeCountOf`, `pixelCountBitmapWord`, `colorCountBitmapWord` | Packed scalar SLOAD per Punk. |
| Indexed pixels | `indexedPixelsOf`, `colorAt`, `paletteRgba/Rgb/Alpha Bytes` | Renderer concern; not used by `Offers`. |

`attributeCount` is already encoded in the canonical trait bit space (bits
16–23) so "exactly N attributes" or "≤ N attributes" expressions piggyback on
the trait mask trio without a separate predicate.

## Locked scope for v1

1. **Trait mask trio** (`requiredTraitMask` / `forbiddenTraitMask` /
   `anyOfTraitMask`) — required by data-research decisions doc O4.
2. **Color count range** (`minColorCount` / `maxColorCount`) — minimalist Punk
   demand, no overlap with the trait bit space.
3. **Single `OfferCriteria` calldata struct** for `placeOffer` — keeps the ABI
   stable as predicates evolve.
4. **Split interfaces** — `Offers` depends on `IPunksDataCriteria` +
   `IPunksDataVisual`, not `IPunksData` whole. Avoids dragging the
   indexed-pixel ABI into the auction module.
5. **`MockPunksData`** with mask setters replaces `MockCryptoPunksTraits`.

Deferred:

- **Color masks** (`requiredColorMask` / `forbiddenColorMask` /
  `anyOfColorMask`). Cheap to add later; passing now keeps the offer struct at
  four storage slots and the surface tight.
- **Pixel count range**. Adds storage and a view call without a clear bidder
  demand signal.
- **Merkle-rooted include/exclude baskets**. Useful for very large lists; defer
  until a real user wants 1000+ Punks in `includeIds`.

## Proposed shapes

```solidity
struct OfferCriteria {
    uint256 requiredTraitMask;
    uint256 forbiddenTraitMask;
    uint256 anyOfTraitMask;
    uint8   minColorCount;   // 0 = no lower bound (real floor is 2)
    uint8   maxColorCount;   // 0 = filter disabled (real ceiling is 14)
}

struct Offer {
    uint96  amountWei;
    uint96  settlementWei;
    address offerer;
    address receiver;
    TokenStandard standard;
    OfferCriteria criteria;
    uint16[] includeIds;
    uint16[] excludeIds;
}
```

Storage: three slots for the trait masks, one packed slot covering
`(minColorCount, maxColorCount)` together with the offerer/receiver/amount
fields, plus dynamic-array roots for the two ID lists. A four-trait filter
under the old shape was already nine or more slots.

### `placeOffer` signature

```solidity
function placeOffer(
    TokenStandard standard,
    uint96 amountWei,
    uint96 settlementWei,
    address receiver,
    OfferCriteria calldata criteria,
    uint16[] calldata includeIds,
    uint16[] calldata excludeIds
) external payable returns (uint256 offerId);
```

### Settlement check

```solidity
OfferCriteria memory c = offer.criteria;

if ((c.requiredTraitMask | c.forbiddenTraitMask | c.anyOfTraitMask) != 0) {
    if (!PUNKS_CRITERIA.hasTraits(
        punkId, c.requiredTraitMask, c.forbiddenTraitMask, c.anyOfTraitMask
    )) revert PunkTraitMismatch();
}

if (c.maxColorCount != 0) {
    uint8 cc = PUNKS_VISUAL.colorCountOf(punkId);
    if (cc < c.minColorCount || cc > c.maxColorCount) revert PunkVisualMismatch();
}
```

Bounded: at most one `hasTraits` call plus one `colorCountOf` call regardless
of how many trait bits were set. Trait validation cost is independent of filter
complexity.

### Place-time validation

```solidity
uint256 canonical = (uint256(1) << PUNKS_CRITERIA.traitCount()) - 1;
uint256 union = c.requiredTraitMask | c.forbiddenTraitMask | c.anyOfTraitMask;
if (
    (union & ~canonical) != 0
    || (c.requiredTraitMask & c.forbiddenTraitMask) != 0
    || (c.forbiddenTraitMask & c.anyOfTraitMask) != 0
) revert InvalidTraitMask();

if (c.maxColorCount != 0 && (
    c.minColorCount > c.maxColorCount || c.maxColorCount > COLOR_COUNT_MAX
)) revert InvalidColorCountRange();
```

`COLOR_COUNT_MAX` (14) is hardcoded in `Offers` as a sealed-dataset invariant
with a comment, rather than expanding `IPunksDataVisual` to expose bounds. The
canonical trait mask is derived from `traitCount()` so the check tracks
whatever PunksData was sealed with.

`requiredMask & anyOfMask` overlap is allowed (it is redundant but not
malformed), matching `PunksData.hasTraits` semantics.

Validating at place-time means malformed offers cannot be parked. Settlement
still revalidates via `hasTraits`'s own checks.

## What the redesign unlocks

- "Any sunglasses" / "any beard" — mechanical via `anyOfTraitMask`. No manual
  adapter contract required.
- Bounded gas at settlement — a 50-trait filter is no slower than a 1-trait
  filter. Trait-side cost is independent of filter complexity.
- Minimalist Punks — `maxColorCount = 4` for the rare ≤4-color art-direction
  bid. Five-color minimum: `minColorCount = 5` with `maxColorCount = 14`.
- Attribute count expressions — "exactly 3 attributes" is one bit in
  `anyOfTraitMask`; "≤ 2 attributes" is three bits. Already covered by the
  trait mask space, no separate predicate needed.
- Failing closed on malformed offers at place-time, not settle-time.

## File-by-file change plan

### `contracts/interfaces/IPunksAuction.sol`

- Drop `struct TraitFilter`.
- Add `struct OfferCriteria`.
- Update `struct Offer` (replace `traitFilters` field with `criteria`).
- Update `placeOffer` signature.
- Update `OfferPlaced` event payload.
- Rename `getOfferFilters` → `getOfferCriteria`, returning
  `(OfferCriteria, uint16[], uint16[])`.
- Drop `TraitsUnavailable` error.
- Add `InvalidTraitMask`, `InvalidColorCountRange`, `PunkVisualMismatch`
  errors.
- Keep `PunkTraitMismatch`, `PunkNotIncluded`, `PunkExcluded`.

### `contracts/interfaces/ICryptoPunksTraits.sol`

- Delete.

### `contracts/offers/Offers.sol`

- Replace `import "../interfaces/ICryptoPunksTraits.sol"` with
  `import "../interfaces/IPunksData.sol"`.
- Constructor: rename `traits` → `punksData`; revert on `address(0)`.
- Replace `ICryptoPunksTraits public immutable TRAITS` with two narrow
  immutables:

  ```solidity
  IPunksDataCriteria public immutable PUNKS_CRITERIA;
  IPunksDataVisual   public immutable PUNKS_VISUAL;
  ```

  Both pointing at the same address, typed narrowly at every call site.
- `placeOffer`: take `OfferCriteria calldata criteria`; call
  `_requireValidCriteria(criteria)` before storing.
- Storage helper: replace per-filter push loop with one struct copy for
  `criteria`, plus the existing copy for `includeIds` / `excludeIds`.
- `_requireOfferMatchesPunk`: replace the per-filter loop with the bounded
  check above.
- `getOfferFilters` → `getOfferCriteria`.

### `contracts/PunksAuction.sol`

- Constructor third arg renamed `traits` → `punksData`. Forward to
  `Offers(punksData)`.

### `contracts/mocks/MockCryptoPunksTraits.sol`

- Delete; replace with `contracts/mocks/MockPunksData.sol` implementing the
  slice of `IPunksDataCriteria` + `IPunksDataVisual` that `Offers` calls:
  - `traitCount`, `hasTraits`, `hasTrait`, `traitMaskOf`
  - `colorCountOf`
- Test surface:
  - `setTraitMask(uint16 punkId, uint256 mask)`
  - `setColorCount(uint16 punkId, uint8 cc)`
  - `setTraitCount(uint16 count)` — controls the canonical mask range used by
    `hasTraits` validation.
- Other interface methods can revert `Unimplemented` until needed.

### `test/PunksAuction.test.ts`

- Update offer placement helper to take `OfferCriteria`.
- Migrate existing test cases:
  - `traitFilters: [{ required: true, traitId: 7 }]` →
    `criteria: { requiredTraitMask: 1n << 7n, forbiddenTraitMask: 0n,
    anyOfTraitMask: 0n, minColorCount: 0, maxColorCount: 0 }`.
- Add coverage for:
  - `anyOfTraitMask` matching ("any sunglasses").
  - Color count range matching, lower-only, upper-only, exact-bracket.
  - Place-time rejection of overlapping required/forbidden masks.
  - Place-time rejection of bits beyond canonical.
  - Place-time rejection of inverted color-count range or out-of-range max.
- Replace `MockCryptoPunksTraits` deploy + `setTrait` calls with `MockPunksData`
  + `setTraitMask` / `setColorCount` / `setTraitCount`.

## Open decisions

1. **`getOfferFilters` rename to `getOfferCriteria`** — preferred, but the
   auto-generated `offers(id)` getter from the public mapping already covers
   most use cases (it just hides the dynamic arrays). Could drop the explicit
   accessor entirely instead of renaming. _Default: rename._
2. **`PunksAuction` constructor arg name** — `punksData` (concrete) vs
   `criteriaSource` (role-based). _Default: `punksData`._
3. **Optional vs required PunksData address** — current `Offers` accepts
   `address(0)`. Switch to required-non-zero, since rich-predicate consumption
   is the entire point of the rewrite. _Default: required._ Decision: PunksData address is hardcoded at contract deployment and immutable...

## Out of scope (revisitable)

- Color mask trio. Add later as a third optional block if bidder demand
  surfaces.
- Pixel count range. Same.
- Merkle-rooted include/exclude. Same.
- An `IPunksOfferData` shim interface bundling the exact two methods Offers
  calls. Worth considering only if the split-interface dependency feels noisy.
