# indexer

Ponder indexer that tracks normal CryptoPunks, CryptoPunks V1, wrappers, and
the repo's `PunksMarket.sol` in one process.

## Provenance model

Normal CryptoPunks and V1 Punks are tracked as separate current-state
collections:

- `punks` tracks the normal V2 collection plus the two normal ERC-721
  wrappers.
- `v1_punks` tracks the original V1 contract plus the V1 ERC-721 wrapper.

The combined indexer watches:

- CryptoPunks V1 (`0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D`)
- CryptoPunks V2 (`0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB`)
- Wrapped CryptoPunks (`0xb7f7F6C52F2e2fdb1963Eab30438024864c313F6`)
- CryptoPunks721 (`0x000000000000003607fce1aC9E043a86675C5C2F`)
- V1 wrapper (`0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D`)
- PunksMarket, defaulting to
  `0x64e507FEBF26521b73FbdfA533106B2042533218`

While a Punk is wrapped, the user-facing `punks.owner` column reflects the
ERC-721 owner; the underlying V2 owner (the wrapper itself) is preserved in
`native_owner`. Unwrap restores the native owner via an on-chain call to
V2's `punkIndexToAddress`. `v1_punks` follows the same public-owner model for
the V1 wrapper.

## Schema

All user-facing activity flows into a single `events` table with a unified
shape (one row per indexed log). `source` ∈ `{ cryptopunks_v1,
cryptopunks_v2, wrapped_punks, cryptopunks_721, v1_wrapper, punks_market }`.
Per-Punk current state lives in `punks` and `v1_punks`; native marketplace
state lives in `listings` / `punk_bids` for V2 and `v1_listings` /
`v1_punk_bids` for V1. PunksMarket criteria bids live in `market_bids` with
predicate side tables for SQL matching.

## USD pricing

Every event row carries `usd_value_cents` — the Stripe-style USD-cent
equivalent of `wei_amount` at the day's ETH/USD price, **cached on the
row at indexing time**. Consumers querying recent sales never need a JOIN
or a follow-up RPC; the value is denormalized at write.

The cache itself lives in the onchain table `eth_usd_prices` (`day_unix`
PK, `eth_usd_cents`, `source`, `block_number`, `updated_at`). The table
lives in Ponder's onchain schema because indexing handlers can only
read/write onchain tables (`Insert` in
`ponder/dist/types/types/db.d.ts:14` has a literal `PonderTypeError` for
offchain tables). The reseeding-on-each-deploy cost is trivial — 3252 CSV
rows insert sub-second.

Two layered sources fill the cache:

1. **CSV historical baseline** (`source = 'csv:cryptocompare_v1'`).
   `data/eth_usd_prices.csv` is committed to the repo (3252 daily closes
   from V1 launch through today) and seeded once via the
   `CryptoPunksV1:setup` hook, guarded by a row in `backfill_markers`.
   Regenerate with `pnpm tsx scripts/fetch-prices.ts` then bump
   `PRE_CHAINLINK_SEED_NAME` in `src/prices.ts` if the contents materially
   change.

2. **Chainlink ETH/USD live fill** (`source = 'chainlink'`). When a sale
   handler finds no cache row for the event's UTC day, it calls
   `context.client.readContract` on Chainlink's onchain aggregator
   (`0x37bC7498f4FF12C19678ee8fE19d713b87F6a9e6`) with `blockNumber:
event.block.number` to get the latest round at that historical block,
   inserts it into `eth_usd_prices`, and stamps the event. Subsequent
   events on the same day hit the cache. Chainlink wasn't deployed before
   mid-2021, so for blocks earlier than that the call reverts and the
   event's `usd_value_cents` stays null — the CSV seed should cover any
   real pre-2021 event.

Stamp pseudocode (`src/prices.ts`):

```ts
const day = dayUnix(event.block.timestamp)
const cached = await context.db.find(ethUsdPrice, { day_unix: day })
const cents = cached
  ? cached.eth_usd_cents
  : await fetchAndCacheChainlinkAt(context, day, event.block) // ← inserts under day_unix
event.usd_value_cents =
  cents !== null ? (event.wei_amount * cents) / 10n ** 18n : null
```

API:

- `GET /bids` and `GET /bids/matching/*` — PunksMarket criteria-bid routes.
- `GET /sales` — recent sale events with `usd_value_cents` already on the
  row (no JOIN). Pagination via `?limit=`, `?offset=`.
- The `eth_usd_prices` table is exposed via the standard GraphQL endpoint
  and `/sql/*` for raw SQL — no custom route needed.

## Setup

Copy `.env.local.example` to `.env.local` and set:

- `PONDER_RPC_URLS_1`: one or more mainnet HTTP RPC URLs separated by spaces.
- `PONDER_RPC_FALLBACK_URLS_1`: optional fallback HTTP RPC URLs.
- `PONDER_WS_URL_1`: optional mainnet WebSocket RPC URL.
- `PUNKS_MARKET_ADDRESS`: optional deployed `PunksMarket.sol` address
  override.
- `PUNKS_MARKET_START_BLOCK`: optional deployment block override for
  `PUNKS_MARKET_ADDRESS`.
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
