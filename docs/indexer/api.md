# Indexer API

The service exposes both generic and purpose-built read surfaces over the
indexed [schema](/indexer/schema). The generic ones cover ad-hoc queries;
the REST routes wrap the queries the apps run constantly (recent sales, bid
matching, collection stats) so clients don't re-implement them. For the
high-level role of the service, see the [overview](/indexer).

All routes are read-only. The example deployment is at
[`indexer.punksmarket.app`](https://indexer.punksmarket.app).

## Generic surfaces

| Route         | Returns                                                              |
| ------------- | -------------------------------------------------------------------- |
| `/` (GraphQL) | Ponder's generated GraphQL schema over every table                   |
| `/sql/*`      | Read-only SQL over the public schema (Ponder's SQL-over-HTTP client) |
| `/profiles/*` | ENS profile resolution (name, avatar) backed by the offchain cache   |

GraphQL and `/sql/*` reach every table in the [schema](/indexer/schema), so
queries the REST routes below don't cover can be expressed directly.

## Sales

```text
GET /sales?limit=&offset=
```

Recent `sale` events, newest first. Each item carries `usd_value_cents`
already on the row — no JOIN, no follow-up RPC. `limit` defaults to `50`
and caps at `200`. Returns `{ items, limit, offset }`, each item with `id`,
`source`, `type`, `punk_id`, `buyer`, `seller`, `wei_amount`,
`usd_value_cents`, `tx_hash`, `block_number`, `timestamp`, and `day_unix`.

## Bids

The `PunksMarket` criteria-bid surface. `serialize` returns each bid
hydrated with its decoded `criteria` (trait/color masks plus pixel/color
ranges) and its `includeIds` / `excludeIds`.

```text
GET /bids?active=&bidder=&limit=&offset=&sort=
```

Paginated bid list. `active` filters by the active flag; `bidder` filters
by address; `sort ∈ { bid_wei, timestamp, bid_id } × { -asc, -desc }`
(default `bid_wei-desc`). Returns `{ items, total, limit, offset }`.

```text
GET /bids/matching/punk/:punkId
GET /bids/matching/trait/:traitId
GET /bids/matching/color/:colorId
```

The hosted matching predicate. `/matching/punk` returns the active bids
that would accept that Punk; `/matching/trait` and `/matching/color` return
the active bids that would accept at least one Punk carrying that trait or
color. Each runs the full predicate against the
[predicate side tables](/indexer/schema#punksmarket-criteria-bids) —
include/exclude lists, required/forbidden/anyOf trait and color sets, and
pixel/color-count ranges — ordered by `bid_wei` descending. `trait_id`
must be `0..110`; `color_id` must be `1..221`.

```text
GET /bids/:bidId
```

A single bid, hydrated like the list items. `404` when the id is unknown.

## Stats

```text
GET /stats
GET /stats/:window
GET /stats/history/:interval?limit=&cursor=&from=&to=&order=&source=
```

`/stats` is a compact summary across all windows (no time series).
`/stats/:window` returns one window with its time series. `/stats/history/:interval`
is the full-history bucketed series with cursor pagination — each item is
one UTC-aligned calendar bucket; `cursor` is the previous page's
`nextCursor`, `from` / `to` are unix-second bounds, `order` defaults to
`desc`, and `source` scopes to one event source.

## Punks

```text
GET /punks/market-state?fresh=1
```

A compact snapshot of the canonical CryptoPunks market: the `listed` ids
(with parallel `listed_prices`, null for private `onlySellTo` listings),
`active_bids`, and `wrapped` / `legacy_wrapped` sets. Memoized for ten
seconds; pass `?fresh=1` to bypass the cache (e.g. right after a
wrap/unwrap) so the caller sees the new state immediately.

```text
GET /punks/pairs?owner=&limit=&offset=
```

V1+V2 Punk pairs whose current public owner matches in both tables. `owner`
optionally filters to one wallet/custody address; without it, the route
returns the global pair list. `limit` defaults to `100` and caps at `1000`.
Returns `{ items, total, limit, offset }`; each item includes `punk_id`,
the shared `owner`, and compact `v1` / `v2` ownership state.

## Accounts

```text
GET /accounts/stats?addresses=&eoa=&scope=
```

Per-account aggregates for a profile page. `addresses` is the
comma-separated custody set (EOA + vault + stash, capped at 8); `eoa` is
the address used for the per-EOA lookups (last-active, first-seen); `scope=v2`
restricts the sale aggregates to the canonical CryptoPunks market, while the
default sums across every indexed sale source.
