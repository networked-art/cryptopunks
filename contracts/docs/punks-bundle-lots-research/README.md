# Punk Bundle Lots Research

> **Superseded.** This research was merged into
> [`docs/punks-auction-redesign/`](../punks-auction-redesign/). The auction
> contracts are immutable; designing bundle lots as an additive layer on top
> of the existing single-Punk path would double the auditable surface, while
> deferring bundle support entirely would lock out V1+V2 pairs and curated
> multi-Punk lots forever. The merged design unifies lots around `LotItem[]`
> of length 1..40 where N=1 is the singleton case. See
> [`punks-auction-redesign/01-design.md`](../punks-auction-redesign/01-design.md)
> and
> [`02-implementation-plan.md`](../punks-auction-redesign/02-implementation-plan.md).
>
> The body below is preserved for historical context — the bounded
> Punk-specific bundle approach, weighted ETH split, and `MAX_LOT_ITEMS`
> rationale carry over (with the bound raised from 8 to 40) into the merged
> spec.

This folder captures design notes for making `PunksAuction` lots hold more
than one Punk. The motivating examples are V1 + V2 Punk pairs and larger lots
such as six-Punk bundles.

## Documents

- [01 Flexible Bundle Lots](./01-flexible-bundle-lots.md)

## High-Level Takeaway

Bundle lots are feasible, but they should be bounded and Punk-specific rather
than fully generic arbitrary-token lots. The safest first design is a lot made
from 1 to `MAX_LOT_ITEMS` Punk items, where each item is a
`{standard, punkId}` pair using the existing canonical and V1 Punk escrow
routes.

The auction bidding model can stay mostly unchanged: bids are for the whole
bundle, the reserve is for the whole bundle, and the seller is paid exactly
once. The main changes are in custody validation, stale-lot invalidation, item
storage, settlement accounting, and event design.
