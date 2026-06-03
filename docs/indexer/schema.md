# Indexer Schema

The indexer writes a single unified event log plus a set of current-state
tables. Everything is a Ponder *onchain* table — the USD price cache lives
there too, because indexing handlers can only read and write onchain
tables. For the high-level role of the service, see the
[overview](/indexer).

## Events

All user-facing activity flows into one `events` table — one row per
indexed log, with a unified shape so an activity feed can render any event
type without joining.

```text
source ∈ { cryptopunks_v1, cryptopunks_v2, wrapped_punks, cryptopunks_721,
           v1_wrapper, punks_market, punks_auction }

type   ∈ { assign, transfer, stashed, unstashed, vaulted, unvaulted,
           escrowed, listing, listing_cancelled, bid, bid_adjusted,
           bid_cancelled, sale, wrap, unwrap, escrow_credit,
           escrow_withdrawal, lot_created, lot_cancelled, lot_cleared,
           lot_updated, auction_started, auction_settled, offer_placed,
           offer_cancelled, offer_adjusted }
```

| Column                                                  | Holds                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `id`                                                    | Primary key (deterministic per log)                                    |
| `source`, `source_event`, `type`                        | Origin contract, raw event name, and normalized activity type          |
| `punk_id`                                               | The Punk involved, when applicable                                     |
| `actor`, `from`, `to`, `buyer`, `seller`, `bidder`, `settler` | The addresses involved, by role                                  |
| `wei_amount`, `listing_wei`, `bid_wei`, `settlement_wei` | The relevant ETH amounts                                              |
| `usd_value_cents`                                       | Denormalized USD-cent value of `wei_amount` (see [USD pricing](#usd-pricing)) |
| `only_sell_to`                                          | Directed-listing / restricted-lot target, when set                     |
| `bid_id`, `lot_id`, `auction_id`, `offer_id`            | The `PunksMarket` / `PunksAuction` entity ids                          |
| `offer_kind`                                            | `collection` / `specific` / `selection` / `trait` for offer rows                    |
| `tx_hash`, `block_number`, `log_index`                  | Onchain location                                                       |
| `timestamp`, `day_unix`                                 | Event time and its UTC day (the JOIN key against `eth_usd_prices`)      |

Indexes on `timestamp`, `source`, `type`, `punk_id`, and the actor columns
back the common feed queries (global, per-source, per-type, per-Punk, and
per-account).

## Current-state collections

Per-Punk current state is split into two tables because both contracts use
ids `0..9999` and carry independent market state:

- `punks` — canonical CryptoPunks (`punk_id` PK, `owner`, `native_owner`,
  `native_standard`, `is_wrapped`, `wrapper`, `last_sale_wei`, …).
- `v1_punks` — June 9th 2017 Punks, with nearly the same shape, minus the
  V2-only `native_standard` column.

In both, `owner` is the public owner (the ERC-721 owner while wrapped, the
native owner otherwise) and `native_owner` preserves the underlying holder.

## Native market state

The two native markets each get a listings table and a per-Punk bid table,
updated in place as state changes:

| Table                          | One row per | Holds                                          |
| ------------------------------ | ----------- | ---------------------------------------------- |
| `listings` / `v1_listings`     | Punk        | `seller`, `min_value_wei`, `only_sell_to`, `active` |
| `punk_bids` / `v1_punk_bids`   | Punk        | `bidder`, `value_wei`, `active`                |

The per-Punk bid tables hold a single outstanding bid each, mirroring the
contract, which only allows one.

## PunksMarket criteria bids

`PunksMarket` collection bids are decomposed for SQL matching. The scalar
row lives in `market_bids`; the predicate is exploded into side tables so a
"which bids match this Punk?" query runs as a join rather than re-deriving
criteria in the client:

| Table                                  | Holds                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `market_bids`                          | `bid_id` PK, `bidder`, `bid_wei`, `settlement_wei`, `active`, the trait/color masks and pixel/color-count ranges, `has_include_ids`, and the raw `criteria_json` / `include_ids_json` / `exclude_ids_json` payloads |
| `bid_traits`                           | One row per `(bid_id, trait_id, kind)`, `kind ∈ { required, forbidden, anyOf }` |
| `bid_colors`                           | One row per `(bid_id, color_id, kind)`, same `kind` set                      |
| `bid_include_ids` / `bid_exclude_ids`  | One row per `(bid_id, punk_id)` allow/deny entry                             |

The matching query joins these against a static Punk dataset, seeded once
from the SDK offline bundle:

| Table          | Holds                                            |
| -------------- | ------------------------------------------------ |
| `punk_traits`  | One row per `(punk_id, trait_id)`                |
| `punk_colors`  | One row per `(punk_id, color_id)`                |
| `punk_visuals` | `punk_id` PK, `pixel_count`, `color_count`       |

The hosted matching predicate is exposed through the
[`/bids/matching/*` routes](/indexer/api#bids).

## Auction state

`PunksAuction` lots, auctions, and offers each mirror their contract struct
so handlers can recover the seller/offerer at cancel or settle time without
re-reading from chain (the contract has often deleted the entity by then):

| Table                | Holds                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------- |
| `auction_lots`       | `lot_id` PK, `seller`, `reserve_wei`, `only_sell_to`, `item_count`, `active`           |
| `auction_lot_items`  | One row per `(lot_id, item_index)`: `standard`, `punk_id`, `weight_bps`                |
| `auction_auctions`   | `auction_id` PK, `lot_id`, `seller`, `item_count`, `latest_bidder`, `latest_bid_wei`, `end_timestamp`, `settled` |
| `auction_offers`     | `offer_id` PK, `offerer`, `amount_wei`, `slot_count`, `kind`, `specific_punk_id`, `active` |

`auction_lots` and `auction_offers` are kept around after an entity is
consumed or cancelled so the corresponding handlers can still resolve the
party.

## Accounts

`accounts` is a per-EOA registry, populated whenever an address appears in
an event. It pins each user's deterministic custody contracts —
`vault` (`PunksVaultFactory.predictVault`) and `stash`
(`StashFactory.stashAddressFor`) — plus the `user_proxy` from the legacy
wrapper, and tracks whether each clone is `*_deployed` on-chain. The vault,
stash, and proxy columns are individually indexed for reverse lookup
(custody address → owner EOA), which powers profile-URL canonicalization.

## USD pricing

Every event row carries `usd_value_cents` — the USD-cent equivalent of
`wei_amount` at the day's ETH/USD price, **denormalized onto the row at
indexing time**. Consumers reading recent sales never need a JOIN or a
follow-up RPC.

The day-keyed cache lives in `eth_usd_prices` (`day_unix` PK,
`eth_usd_cents` as Stripe-style integer cents, `source`, `block_number`),
filled by two layered sources:

1. **CSV historical baseline** — `data/eth_usd_prices.csv` ships daily
   closes from the June 9th launch through today, seeded once on startup and
   guarded by a row in `backfill_markers` so the seed is idempotent across
   restarts.
2. **Chainlink live fill** — when a sale handler finds no cached row for the
   event's UTC day, it reads Chainlink's ETH/USD aggregator at the event's
   historical block, caches the result under `day_unix`, and stamps the row.
   Blocks before Chainlink existed (mid-2021) fall back to the CSV baseline;
   if neither covers the day, `usd_value_cents` stays null.
