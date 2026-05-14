# PunksAuction Redesign — Unified N-Item Lots and N-Slot Offers

This folder is the merged spec for the `PunksAuction` rewrite. It supersedes
two earlier research folders:

- [`docs/cryptopunks-offers-research/`](../cryptopunks-offers-research/) —
  offers redesign (mask-based filtering over `PunksData`).
- [`docs/punks-bundle-lots-research/`](../punks-bundle-lots-research/) —
  bundle lots research (V1+V2 pairs, six-Punk collections).

Both folders are now stubs that point here.

## Why merged

The auction contracts are immutable: one deployment, no migration path.
Designing single-Punk and bundle paths separately would either ship single-only
forever (locking out V1+V2 pairs and curated collections for the lifetime of
the contract) or ship parallel single+bundle code paths that double both the
testable surface and the auditable surface.

Unifying around N-item lots and N-slot offers — where N=1 is the common case —
deletes code rather than adding it. The per-offer/per-lot cost of unification
is small (~2 storage slots, ~32 calldata bytes for the array indirection).

## Locked decisions

| # | Decision |
| --- | --- |
| 1 | Lots hold `LotItem[]` of length 1..`MAX_PUNKS`. Offers carry `OfferSlot[]` of length 1..`MAX_PUNKS`. N=1 is the singleton case. |
| 2 | Offer slots bind to lot items by index — `offer.slots[i] ↔ lot.items[i]`. No permutation matching. |
| 3 | `weightBps` is mandatory on every `LotItem` and must sum to exactly 10_000 across the lot. Frontends default to equal split. |
| 4 | `MAX_PUNKS = 80`. Gas-bounded: worst-case (80 V1 items) settlement is ~13M, comfortably under the 30M L1 block limit with additional headroom under congestion. |
| 5 | `TokenStandard` is Punks-only: `{ CRYPTOPUNKS, CRYPTOPUNKS_V1 }`. The `ERC721`/`ERC1155` placeholders are removed. Every slot and every item names its standard explicitly; no "any standard" sentinel — order is index-bound, so the bidder is specific. |
| 6 | Two offer acceptance paths share one `Offer` struct: `acceptOffer(offerId, punkId, expectedListingWei)` keeps the singleton CryptoPunks-market arbitrage path (no escrow) while pinning the live listing price; `acceptOfferFromLot(offerId, lotId, minAmountWei)` is the lot-binding path that handles any N (including N=1 escrowed) while pinning a minimum current offer amount. |
| 7 | One auction lifecycle: `createLot` → `openAuction` → `bid` → `settle`. N=1 collapses to the current single-Punk path. No separate `BundleLot`/`BundleAuction` namespaces. |
| 8 | Offer criteria are trait masks + color count range only. Color masks, pixel count range, and Merkle baskets remain explicitly deferred. |
| 9 | `Offers` depends on the split predicate interfaces `IPunksDataCriteria` + `IPunksDataVisual`, not `IPunksData` whole. |
| 10 | Tests use a `MockPunksData` with mask setters; `MockCryptoPunksTraits` is deleted. |

## Documents

- [01-design.md](./01-design.md) — full spec: data structures, lifecycle,
  settlement, validation, events, gas analysis.
- [02-implementation-plan.md](./02-implementation-plan.md) — file-by-file
  change list, test plan, sequencing.

## Inputs

- [`docs/cryptopunks-data-research/decisions.md`](../cryptopunks-data-research/decisions.md)
  — locked spec for `PunksData` predicate APIs (`hasTraits`, `colorCountOf`,
  etc.).
