# Filter Library

`Punks` (`contracts/contracts/lib/Punks.sol`) is the Solidity helper library
that other onchain contracts use to build, validate, and evaluate composite
filters against the sealed `PunksData` contract. It packages the
trait/color/visual primitives that the [Criteria](/contracts/punks-data/criteria)
and [Visual](/contracts/punks-data/visual) APIs expose individually into a
single `Filter` value, and mirrors `PunksData._requireCriteriaMasks` so a
consumer can pre-flight a filter before paying for the predicate call.

The library is pure logic — no storage, no constructor. It is reused inside
this repo by [`PunksMarket`](/contracts/punks-market) for criteria-bid
matching, and any third-party contract that wants onchain trait or color
filtering against the sealed dataset can use it directly.

## Filter

```solidity
struct Filter {
    uint256 requiredTraitMask;
    uint256 forbiddenTraitMask;
    uint256 anyOfTraitMask;
    uint256 requiredColorMask;
    uint256 forbiddenColorMask;
    uint256 anyOfColorMask;
    uint16 minPixelCount;
    uint16 maxPixelCount;
    uint8 minColorCount;
    uint8 maxColorCount;
}
```

| Field                | Meaning                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `requiredTraitMask`  | Every set bit must be present in the Punk's trait mask.                                                          |
| `forbiddenTraitMask` | No set bit may be present in the Punk's trait mask.                                                              |
| `anyOfTraitMask`     | At least one set bit must be present in the Punk's trait mask. Zero disables the constraint.                     |
| `requiredColorMask`  | Every set bit must be present in the Punk's color mask.                                                          |
| `forbiddenColorMask` | No set bit may be present in the Punk's color mask.                                                              |
| `anyOfColorMask`     | At least one set bit must be present in the Punk's color mask. Zero disables the constraint.                     |
| `minPixelCount`      | Minimum visible-pixel count. Used only when `maxPixelCount != 0`.                                                |
| `maxPixelCount`      | Maximum visible-pixel count. `0` disables the range.                                                             |
| `minColorCount`      | Minimum unique-color count. Used only when `maxColorCount != 0`.                                                 |
| `maxColorCount`      | Maximum unique-color count. `0` disables the range.                                                              |

A filter with every field zero matches every Punk — `Punks.isEmpty(filter)`
returns `true` in that case. Consumers that need a closed allowlist
typically pair an empty `Filter` with an explicit id list (see
[PunksMarket bid matching](/contracts/punks-market/reference#bid-matching)).

## Constants

| Name                   | Value                          | Meaning                                                                  |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| `TRAIT_COUNT`          | `111`                          | Number of canonical traits in the sealed dataset                         |
| `PALETTE_SIZE`         | `222`                          | Palette size, including reserved index 0 (transparency)                  |
| `PIXEL_COUNT_MIN`      | `148`                          | Smallest visible-pixel count any Punk has                                |
| `PIXEL_COUNT_MAX`      | `332`                          | Largest visible-pixel count any Punk has                                 |
| `COLOR_COUNT_MIN`      | `2`                            | Smallest unique-color count any Punk has                                 |
| `COLOR_COUNT_MAX`      | `14`                           | Largest unique-color count any Punk has                                  |
| `CANONICAL_TRAIT_MASK` | `(1 << TRAIT_COUNT) - 1`       | Bit set covering every valid trait id                                    |
| `CANONICAL_COLOR_MASK` | `(1 << PALETTE_SIZE) - 1`      | Bit set covering every valid color id                                    |
| `RESERVED_COLOR_BIT`   | `1`                            | Bit 0 of any color mask — reserved for transparency, never set on a Punk |

The pixel-count and color-count ranges match the dataset's actual extrema;
asking for `maxPixelCount = 500` will fail validation because no Punk has
that many visible pixels.

## Mask Builders

The mask helpers build a uint256 bitmask from a list of canonical ids.
Trait ids must be `< 111`; color ids must be in `1..221` (id `0` is
transparency and is rejected).

```solidity
function traitMask(uint16[] memory ids) internal pure returns (uint256);
function colorMask(uint8[] memory ids)  internal pure returns (uint256);

function containsTrait(uint256 mask, uint16 id) internal pure returns (bool);
function containsColor(uint256 mask, uint8 id)  internal pure returns (bool);
```

Example — build a filter for "Zombie heads with a hoodie OR beanie, ≤4
colors":

```solidity
uint16[] memory required = new uint16[](1);
required[0] = ZOMBIE_TRAIT_ID;

uint16[] memory anyOf = new uint16[](2);
anyOf[0] = HOODIE_TRAIT_ID;
anyOf[1] = BEANIE_TRAIT_ID;

Punks.Filter memory f = Punks.Filter({
    requiredTraitMask: Punks.traitMask(required),
    forbiddenTraitMask: 0,
    anyOfTraitMask: Punks.traitMask(anyOf),
    requiredColorMask: 0,
    forbiddenColorMask: 0,
    anyOfColorMask: 0,
    minPixelCount: 0,
    maxPixelCount: 0,
    minColorCount: 0,
    maxColorCount: 4
});
```

The TypeScript SDK ships `compilePunksFilter` to produce the same struct
from the high-level query language; see [V1 Market](/sdk/v1-market) for an
end-to-end example.

## Validators

```solidity
function validateTraitMasks(uint256 required, uint256 forbidden, uint256 anyOf) internal pure;
function validateColorMasks(uint256 required, uint256 forbidden, uint256 anyOf) internal pure;
function validatePixelCountRange(uint16 min, uint16 max) internal pure;
function validateColorCountRange(uint8 min, uint8 max)   internal pure;
function validate(Filter memory f) internal pure;
function isEmpty(Filter memory f) internal pure returns (bool);
```

`validate` calls each of the four field validators in turn. The trait-mask
validator mirrors `PunksData._requireCriteriaMasks` exactly: any bit
outside the canonical trait space is rejected, `required & forbidden`
overlap is rejected, and `forbidden & anyOf` overlap is rejected.
`required & anyOf` overlap is permitted because `PunksData.hasTraits`
allows it too.

The color-mask validator adds one extra rule on top of the trait shape:
bit `0` (transparency) is rejected in any of the three masks, because a
Punk's color mask never sets that bit and including it would silently
zero out a constraint.

The pixel and color count range validators encode the dataset extrema. If
`max == 0` the range is disabled and `min` must also be `0`; otherwise
`min <= max` and the closed interval must fit inside the dataset's
`[PIXEL_COUNT_MIN, PIXEL_COUNT_MAX]` or `[COLOR_COUNT_MIN, COLOR_COUNT_MAX]`.

Call `validate` at the boundary where a filter enters your contract (e.g.
inside a `placeBid` or `createOffer` entry point) so a stored filter never
needs to be re-validated on the matching path.

## Per-Punk Predicates

```solidity
function matchesTraits(
    IPunksDataCriteria data,
    uint16 punkId,
    uint256 requiredMask,
    uint256 forbiddenMask,
    uint256 anyOfMask
) internal view returns (bool);

function matchesColors(
    IPunksDataVisual data,
    uint16 punkId,
    uint256 requiredMask,
    uint256 forbiddenMask,
    uint256 anyOfMask
) internal view returns (bool);

function matchesPixelCountRange(
    IPunksDataVisual data,
    uint16 punkId,
    uint16 min,
    uint16 max
) internal view returns (bool);

function matchesColorCountRange(
    IPunksDataVisual data,
    uint16 punkId,
    uint8 min,
    uint8 max
) internal view returns (bool);

function matches(Filter memory f, IPunksDataCriteria criteria, IPunksDataVisual visual, uint16 punkId)
    internal view returns (bool);
function matches(Filter memory f, IPunksDataMatcher data, uint16 punkId)
    internal view returns (bool);
function matches(Filter memory f, IPunksData data, uint16 punkId)
    internal view returns (bool);
```

`matchesTraits` delegates to `PunksData.hasTraits`, which validates the
masks server-side and applies the predicate in one call. `matchesColors`
reads `colorMaskOf` once and applies the boolean logic locally — there is
no `hasColors` predicate on `PunksData`, so the caller is responsible for
having validated the color masks beforehand if the inputs are not already
trusted. The two range predicates read `pixelCountOf` and `colorCountOf`
respectively, and short-circuit to `true` when `max == 0`.

The four predicates short-circuit as soon as a constraint is empty so an
empty filter does not pay for any reads. When mixing them, evaluate the
cheapest one first: trait checks are one storage read, color and visual
checks are one storage read each, and pixel-range checks are one storage
read.

`matches` composes all four dimensions in cost order — traits, colors,
pixel range, color count range — and accepts either the split
`IPunksDataCriteria` / `IPunksDataVisual` interfaces, the combined
`IPunksDataMatcher`, or the full `IPunksData` ABI. The struct is the first
parameter so the `using` syntax works:

```solidity
using Punks for Punks.Filter;

if (filter.matches(PUNKS_DATA, punkId)) {
    // ...
}
```

Per-Punk gas is non-deterministic because the matcher short-circuits as
soon as any constraint fails. Worst-case is one read per active dimension.

## Errors

| Error                    | When                                                                            |
| ------------------------ | ------------------------------------------------------------------------------- |
| `InvalidTraitId`         | A trait id passed to `traitMask` or `containsTrait` is `>= 111`                 |
| `InvalidColorId`         | A color id passed to `colorMask` or `containsColor` is `0` or `>= 222`          |
| `InvalidTraitMask`       | `validateTraitMasks` finds an out-of-range bit or a disallowed mask overlap     |
| `InvalidColorMask`       | `validateColorMasks` finds an out-of-range bit, bit 0 set, or a mask overlap    |
| `InvalidPixelCountRange` | `validatePixelCountRange` rejects the range against `[148, 332]` or shape rules |
| `InvalidColorCountRange` | `validateColorCountRange` rejects the range against `[2, 14]` or shape rules    |

`InvalidTraitMask` and the `PunksData.InvalidMask` raised by
`hasTraits` cover the same shape — pre-flighting with `validate` lets a
consumer surface a clearer custom error before falling through to the
matcher's `InvalidMask`.

## Integration Pattern

The typical onchain consumer:

1. Accepts a `Punks.Filter` from a user (e.g. as `calldata` on a `placeBid`,
   `createOffer`, or `mintRewards` entry point).
2. Calls `Punks.validate(filter)` once at intake so the stored filter is
   guaranteed to be matcher-safe.
3. Stores the filter alongside any auxiliary state (escrow, expiry, owner).
4. Evaluates `filter.matches(PUNKS_DATA, punkId)` on the settlement path,
   typically combined with custom logic (id allowlists, ownership checks,
   listing validity).

[`PunksMarket`](/contracts/punks-market) is the reference consumer. Its
`placeBid` validates the filter once and stores it; `acceptBid` calls
`filter.matches(PUNKS_DATA, punkId)` together with `includeIds` /
`excludeIds` shortcuts to settle the bid.

When designing a new consumer:

- Keep the filter `calldata` at intake to avoid a memory copy, then copy to
  storage in one assignment.
- Validate at intake, not on the read path. The matcher does not
  re-validate beyond what `PunksData.hasTraits` enforces on the trait masks.
- Combine `Punks.Filter` with explicit id lists when the user needs a
  closed allowlist; the empty-filter + id-list pattern is the canonical
  shape (see [PunksMarket bid matching](/contracts/punks-market/reference#bid-matching)).
- Pin the `PunksData` address and verify
  [`datasetHash()`](/contracts/punks-data#trust-model) at deployment time
  if your contract is configurable.

For TypeScript callers building filters offchain, see
[Data And Search](/sdk/data-search) and
[V1 Market](/sdk/v1-market#writes).
