# Disagreements

Each item points back to the original research note that introduces the claim.
Severity is my own judgment about how much the issue should slow down a green
light on building V2.

## 1. The Name "CryptoPunksDataV2"

**Severity: medium. Pure-naming, but in this codebase the confusion is
real.**

Where it appears: `04-final-recommendation.md` lines 1, 4–10, 21–34;
`07-visual-metrics-and-renderer-scope.md` lines 6, 172, 233.

This codebase already uses "V1" and "V2" to refer to *Punk token standards*.
`IPunksAuction.TokenStandard` enumerates `CRYPTOPUNKS` and
`CRYPTOPUNKS_V1` (`contracts/interfaces/IPunksAuction.sol:8`). A reader
seeing `CryptoPunksDataV2` will read it as "the data contract for V2 Punks"
before they read it as "the second version of the Punk data contract."

The first version of the data contract being upgraded is also somewhat
notional — Larva Labs's `0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2` is
"v1" only in the sense that it shipped first, not because it carries a v1
label.

I would rename. Candidates:

- `CryptoPunksAtlas` — it is a register of every Punk's traits, colors, and
  pixels, which fits "atlas" semantics.
- `OnchainPunkData` — descriptive, no version claim.
- `CanonicalPunkData` — emphasises the public-good intent.
- `PunkRegistry` — short, common naming pattern.

Whatever name is picked, the surface should *not* call itself a "V2" of
anything Punk-token-shaped.

## 2. Missing "Any-Of" Mask Semantic

**Severity: high. This is a real predicate gap that shows up immediately for
real bidders.**

Where it appears: `02-trait-filtering-interfaces.md` lines 113–134;
`04-final-recommendation.md` lines 41–46, 130–145.

The recommended predicate is:

```solidity
function hasTraits(
    uint16 punkId,
    uint256 requiredMask,
    uint256 forbiddenMask
) external view returns (bool);
```

This expresses two semantics:

- "must have *all* of these traits" (`requiredMask`),
- "must have *none* of these traits" (`forbiddenMask`).

It cannot express:

- "must have *at least one* of these traits" (a disjunction).

That is a common bidder request for category-shaped predicates — for example
"any sunglasses" (Big Shades, Classic Shades, Regular Shades, 3D Glasses,
Horned Rim Glasses, Nerd Glasses, Eye Patch, VR, Welding Goggles, Small
Shades, Eye Mask) or "any beard" (Big Beard, Front Beard, Front Beard Dark,
Goat, Handlebars, Luxurious Beard, Mustache, Muttonchops, Normal Beard,
Normal Beard Black, Shadow Beard, Chinstrap).

Without "any of," every bidder wanting "any sunglasses" has to either pick a
single sunglasses type or fragment liquidity across N offers. The research
explicitly *declines* to bake category traits like "Sunglasses" into the
canonical predicate space (`02-trait-filtering-interfaces.md` lines 71–74),
which is the right call — categories are subjective. But that decision is
exactly the one that makes an `anyOfMask` predicate necessary downstream.

Recommended interface:

```solidity
function hasTraits(
    uint16 punkId,
    uint256 requiredMask,
    uint256 forbiddenMask,
    uint256 anyOfMask
) external view returns (bool);
```

Semantics: returns true iff
`(m & requiredMask) == requiredMask`
AND `(m & forbiddenMask) == 0`
AND (`anyOfMask == 0` OR `(m & anyOfMask) != 0`),
where `m = traitMaskOf(punkId)`.

The third arg defaults to zero for offers that do not need "any-of" — no cost
penalty.

For storage, the auction-side `OfferCriteria` becomes:

```solidity
struct OfferCriteria {
    uint256 requiredMask;
    uint256 forbiddenMask;
    uint256 anyOfMask;
}
```

That is one extra slot per offer. For the offer population that does not use
"any-of" (likely most offers), the slot is zero and the `SSTORE` is a refund
opportunity if the slot is reused, otherwise a fixed 20K — but the same
applies to the existing `forbiddenMask`. Acceptable.

If "any-of" is going to be punted on, fine, but the research should *say* it
is being punted and explain why. Right now it is silently absent.

## 3. Storage Mapping Vs SSTORE2 For Hot Scalar Data

**Severity: medium. Internal consistency issue with the storage
recommendation.**

Where it appears: `03-storage-and-rendering-options.md` lines 39–62 (Option
A), 64–105 (Option B), 113–122 (recommended payload);
`04-final-recommendation.md` lines 102–121.

The framing throughout doc 03 is "deployment cost is not the primary
constraint" (line 3, line 59). The recommended payload (`punkMasks.bin`,
`traitBitmaps.bin`, `traitMeta.bin`, `palette.bin`, `indexedPixels.bin`,
`visualMetrics.bin`) places *every* dataset, including per-Punk trait masks,
in SSTORE2-style bytecode chunks.

That is the right shape for the large sequential blobs:

- 222-entry palette (888 bytes)
- 10,000 × 576-byte indexed pixels (5.76 MB)
- per-trait bitmaps (135 KB)
- color masks and histograms (≈ 550 KB)

For *per-Punk trait masks* (320 KB at uint256 width, 160 KB at uint128), a
plain storage mapping is the better hot-path shape:

- The mask is touched on every settlement.
- One `SLOAD` is 2,100 cold / 100 warm.
- One `EXTCODECOPY` of 32 bytes is 2,600 cold / 100 warm — strictly worse
  cold and equal warm.
- Storage masks are also a single `SLOAD`, so `traitMaskOf` and `hasTrait`
  are both as cheap as Solidity allows.
- The "deployment cost is not the primary constraint" framing already
  accepts the higher writeup cost: 10,000 × `SSTORE` is ~221 M gas at 22.1K
  per cold write, which is large but not implausible across multiple
  loader transactions.

The right recommendation is *mixed*:

- per-Punk trait masks → storage mapping `mapping(uint16 => uint256)`,
- per-Punk color masks → storage mapping (smaller; same shape),
- per-Punk visible-pixel bitmaps (576 bits) → storage 3-tuple per Punk,
- per-trait bitmaps, palette, indexed pixels, color histograms → SSTORE2
  bytecode chunks.

The per-Punk visual scalars (`pixelCountOf`, `colorCountOf`) can be packed
together into one storage slot per Punk (e.g., `uint16 pixelCount | uint8
colorCount | ...`) so that a single `SLOAD` returns all hot scalar metrics.

Doc 03's Option A is "good for hot scalar data if simplicity matters," which
hints at exactly this. But the final recommendation in doc 04 then uses
SSTORE2 for `punkMasks.bin`, which is in tension with that hint.

Even if the team prefers SSTORE2 across the board for uniformity, the doc
should *explicitly* call out the read-side cost difference and accept it on
purpose. As written, the choice reads like an oversight, not a tradeoff.

## 4. The Recommendation To Always Revert On Invalid IDs

**Severity: low. I agree with the call but the tradeoff is worth being
explicit about.**

Where it appears: `02-trait-filtering-interfaces.md` lines 138–141;
`04-final-recommendation.md` line 84.

The recommendation is to revert on `punkId >= 10000` and
`traitId >= traitCount()`. I agree — silent `false` from a malformed filter
is exactly the bug class that turns a misconfigured offer into an exploit
("oh, this filter trivially matches because the trait ID was wrong, so
anyone can fulfil my offer with anything").

The cost: any frontend that bulk-queries `hasTrait(punkId, ?)` over a
candidate trait list will revert on invalid IDs and have to know the valid
range. That is the *right* contract behaviour, but downstream tooling needs
to handle it. Worth flagging in the doc so the frontend authors are not
surprised.

A small concrete suggestion: expose an explicit `isValidTraitId(uint16)`
view so consumers can probe without catching reverts. Cheap, helpful for
tooling.

## 5. "Loops In Settlement Path" Framing For `punksWithTrait`

**Severity: low. Wording, not substance.**

Where it appears: `02-trait-filtering-interfaces.md` lines 173–179.

The doc says `punksWithTrait` "should not be used inside settlement paths
because it loops." That is true, but the more important warning is that
unbounded loops on view functions can also blow the RPC gas limit and
become unusable for *any* consumer once the matching set is large. For
"Earring" the matching set is 2,459 elements; the function would return a
24,590-element-equivalent array. Not catastrophic, but RPC providers in the
wild cap response size. I would either:

- bound the function, e.g. `punksWithTrait(traitId, startIndex, count)`,
- or omit it entirely and let frontends derive sets from
  `traitBitmapWord(traitId, wordIndex)`.

The bitmap-word path is already in the recommendation
(`02-trait-filtering-interfaces.md` lines 146–161) and it scales fine, so
`punksWithTrait` is mostly redundant. I would drop it.

## 6. The Cost Framing For The New Views Is Qualitative

**Severity: low. The recommendation is sound, but the case for it is told
without numbers.**

Where it appears: `01-current-contract-findings.md` lines 56–84;
`04-final-recommendation.md` (no quantitative comparison).

Doc 01 lists actual gas estimates for the *existing* contract:
`punkAttributes(0)` ≈ 41K, `punkImage(0)` ≈ 1.18M, `punkImageSvg(0)` ≈ 13.7M.
Useful. But the proposed V2 views (`hasTrait`, `traitMaskOf`, `hasTraits`,
`indexedPixelsOf`) are not given equivalent estimates, even at the
back-of-envelope level.

A useful addition before any Solidity is written:

| Proposed view | Expected cost |
| --- | --- |
| `hasTrait` (storage mask) | ~2.7K cold / ~700 warm |
| `traitMaskOf` (storage mask) | ~2.7K cold / ~700 warm |
| `hasTraits` (one storage read + arithmetic) | ~2.8K cold / ~750 warm |
| `traitBitmapWord` (SSTORE2) | ~2.8K cold per chunk / ~700 warm |
| `indexedPixelsOf` (SSTORE2 of 576 bytes) | ~3.5K cold per chunk + 576 × MCOPY-equivalent |
| `colorAt` (SSTORE2 single byte) | dominated by EXTCODECOPY base cost |

Numbers are illustrative and rounded, but the shape matters: the new
predicate path saves an order of magnitude per filter at settlement vs the
current N×`hasTrait` external calls in `_requireOfferMatchesPunk`
(`contracts/offers/Offers.sol:243-250`). That is the headline value of V2 for
the auction system and the doc should make it explicit.

## 7. "Fork Test Every Punk Against The Source Contract" Is Necessary But
Not Sufficient

**Severity: low.**

Where it appears: `03-storage-and-rendering-options.md` lines 295–309;
`06-reproducibility-notes.md` lines 102–143.

A fork test against the source contract proves "the V2 dataset agrees with
the source contract *as deployed today*." For a public-good claim of "this
is canonical Punk data forever," I would also want:

1. A pinned source crawl: chain ID, block height, source contract address,
   source contract code hash. So that a future verifier can fetch the same
   bytes.
2. An offchain replay: a generator script that, given the pinned source
   crawl, produces the V2 blob bytes byte-for-byte and confirms each blob
   hash. This is independent of any onchain test environment.
3. A roundtrip claim for the renderer: `renderRgba(punkId)` byte-equals
   `IPunkData(source).punkImage(punkId)` for every Punk.

Doc 06 partially covers (3) under "Recommended Generator Checks" (line
113–114) but does not pin (1). See [02 Improvements](./02-improvements.md)
for the concrete pin.
