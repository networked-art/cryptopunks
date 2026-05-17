# indexer

Ponder indexer that tracks canonical CryptoPunks provenance from launch
through to today.

## Provenance model

The CryptoPunks history has a hard cutoff at the original V2 deployment
(block `3_914_495`):

- Blocks `3_842_489 … 3_914_494` — the original (buggy) V1 contract at
  `0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D` is canonical. All `Assign`,
  `PunkTransfer`, `PunkOffered`, `PunkBidEntered`, `PunkBought`, etc. on V1
  are indexed.
- Blocks `3_914_495 …` — the V2 contract at
  `0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB` is canonical and V1 is
  abandoned. Only V2 events are indexed from this block onward; V1 events
  emitted after the cutoff are ignored entirely (enforced by Ponder's
  per-contract `endBlock`).

Two V2 ERC-721 wrappers are also tracked over their full history:

- Wrapped CryptoPunks (`0xb7f7F6C52F2e2fdb1963Eab30438024864c313F6`)
- CryptoPunks721 (`0x000000000000003607fce1aC9E043a86675C5C2F`)

While a Punk is wrapped, the user-facing `punks.owner` column reflects the
ERC-721 owner; the underlying V2 owner (the wrapper itself) is preserved in
`native_owner`. Unwrap restores the native owner via an on-chain call to
V2's `punkIndexToAddress`.

## Schema

All user-facing activity flows into a single `events` table with a unified
shape (one row per indexed log). `source` ∈ `{ cryptopunks_v1,
cryptopunks_v2, wrapped_punks, cryptopunks_721 }` and `type` ∈ `{ assign,
transfer, listing, listing_cancelled, bid, bid_cancelled, sale, wrap,
unwrap }`. Per-Punk current state lives in `punks`; native V2 marketplace
state lives in `listings` and `punk_bids`.

## USD pricing

Every event row with a non-null `wei_amount` is stamped with
`usd_value_cents` — Stripe-style integer USD cents (e.g. `$1234.56 →
123_456`) using the ETH/USD price for the event's UTC day. The daily
prices live in `eth_usd_prices` (`day_unix` PK, `eth_usd_cents`, `source`,
plus Chainlink provenance columns).

Two price sources, both written into the same table:

1. **Chainlink (2021-07 onward, canonical)**. The indexer subscribes to the
   ETH/USD aggregator's `AnswerUpdated` events. The aggregator fires ~20-30
   updates per UTC day; each one upserts the row keyed on `day_unix`, so
   the final indexed state of every row is the day's last Chainlink round
   (≈ the daily close). `source = 'chainlink'` on these rows.
2. **Bundled CSV (V1 launch → 2021-07-20)**. `data/eth_usd_pre_chainlink.csv`
   is committed to the repo (1490 daily closes, one row per day). On
   startup `CryptoPunksV1:setup` reads the CSV from disk and bulk-inserts
   it under `source = 'csv:pre_chainlink_v1'`, guarded by a sentinel row in
   `backfill_markers` so the seed is idempotent across restarts. **The
   runtime never makes outbound HTTP for prices.**

To regenerate the CSV (developer-side, off-runtime):

```
pnpm tsx scripts/fetch-pre-chainlink-prices.ts
```

The script hits CryptoCompare's free histoday endpoint, trims to the
pre-Chainlink window, and rewrites the CSV — then bump
`PRE_CHAINLINK_SEED_NAME` in `src/prices.ts` so the seed re-runs and
commit both changes together.

When stamping a sale, the handler reads the row for the event's UTC day or
walks back up to a week to find the nearest preceding day. Conversion is
`usd_value_cents = wei_amount * eth_usd_cents / 1e18`, with Chainlink's
8-decimal answer rescaled to cents as `answer / 1e6`.

## Setup

Copy `.env.local.example` to `.env.local` and set:

- `PONDER_RPC_URLS_1`: one or more mainnet HTTP RPC URLs separated by spaces.
- `PONDER_RPC_FALLBACK_URLS_1`: optional fallback HTTP RPC URLs.
- `PONDER_WS_URL_1`: optional mainnet WebSocket RPC URL.
- `DATABASE_URL`: Postgres URL for ENS profile cache and Ponder.

## Local Postgres

`docker-compose.yml` ships a Postgres 16 instance on port `5412` for local
development. Start it with `docker compose up -d` and point `DATABASE_URL`
at `postgresql://punks:punks@localhost:5412/punks`.

## Deployment (Kamal)

Production deployment is driven by Kamal. The container image is built from
the repo-root `Dockerfile.indexer`; deploy config lives in
`config/deploy.yml`; secrets are templated from `.env.production` via
`.kamal/secrets`.

1. Copy `.env.production.example` to `.env.production` and fill in every
   value (registry credentials, deploy host, RPC URLs, DB password).
2. First-time host bootstrap: `pnpm kamal:setup`.
3. Subsequent releases: `pnpm kamal:deploy`.
4. Drop into a running container: `pnpm kamal:sh`.

Each deploy gets a fresh schema named after the commit hash
(`DATABASE_SCHEMA=$(git rev-parse HEAD)`); the stable public views are
projected into the `punks` schema by Ponder once the new schema is caught
up. The kamal `db` accessory binds Postgres 17 to `127.0.0.1:5467` on the
deploy host.
