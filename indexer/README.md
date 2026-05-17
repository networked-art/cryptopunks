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
