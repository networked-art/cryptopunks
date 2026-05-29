# @networked-art/punks-indexer

Ponder indexer that tracks `CryptoPunks`, `CryptoPunksMarket`, the wrappers,
and the repo's `PunksMarket` and `PunksAuction` — plus the vault and stash
custody factories — in one process.

An example deployment runs at <https://indexer.punksmarket.app>.

## Provenance model

Normal CryptoPunks and V1 Punks are tracked as separate current-state
collections:

- `punks` tracks the canonical collection plus the two normal ERC-721
  wrappers.
- `v1_punks` tracks the initial contract plus the V1 ERC-721 wrapper.

The combined indexer watches:

- [CryptoPunks.sol (June 9th)](https://evm.now/address/0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D) (`0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D`)
- [CryptoPunksMarket.sol (June 22nd)](https://evm.now/address/0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB) (`0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB`)
- [WrappedPunk.sol](https://evm.now/address/0xb7f7F6C52F2e2fdb1963Eab30438024864c313F6) (`0xb7f7F6C52F2e2fdb1963Eab30438024864c313F6`)
- [CryptoPunks721.sol](https://evm.now/address/0x000000000000003607fce1aC9E043a86675C5C2F) (`0x000000000000003607fce1aC9E043a86675C5C2F`)
- [PunksV1Wrapper.sol](https://evm.now/address/0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D) (`0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D`)
- [PunksMarket.sol](https://evm.now/address/0x64e507FEBF26521b73FbdfA533106B2042533218) (`0x64e507FEBF26521b73FbdfA533106B2042533218`)
- [PunksAuction.sol](https://evm.now/address/0x6f99d7E85b4Ba6fFD9ff60A09fc12201027b7873) (`0x6f99d7E85b4Ba6fFD9ff60A09fc12201027b7873`)
- [PunksVaultFactory.sol](https://evm.now/address/0xf3381B259B2FE142c0A87bffF463695d935D6F66) (`0xf3381B259B2FE142c0A87bffF463695d935D6F66`)
- [StashFactory.sol](https://evm.now/address/0x000000000000A6fA31F5fC51c1640aAc76866750) (`0x000000000000A6fA31F5fC51c1640aAc76866750`)

While a Punk is wrapped, the user-facing `punks.owner` column reflects the
ERC-721 owner; the underlying V2 owner (the wrapper itself) is preserved in
`native_owner`. Unwrap restores the native owner via an on-chain call to
`CryptoPunksMarket.punkIndexToAddress`. `v1_punks` follows the same public-owner model for
`PunksV1Wrapper`.

## Schema

All user-facing activity flows into a single `events` table with a unified
shape (one row per indexed log). `source` ∈ `{ cryptopunks_v1,
cryptopunks_v2, wrapped_punks, cryptopunks_721, v1_wrapper, punks_market,
punks_auction }`. Per-Punk current state lives in `punks` and
`v1_punks`; native marketplace state lives in `listings` / `punk_bids` for V2
and `v1_listings` / `v1_punk_bids` for V1. `PunksMarket` criteria bids live in
`market_bids` with predicate side tables for SQL matching. `PunksAuction`
state lives in `auction_lots` / `auction_lot_items` / `auction_auctions` /
`auction_offers`, and per-EOA custody (vault / stash / proxy) is tracked in
`accounts`.

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

- `GET /` — the generated GraphQL endpoint over every table.
- `GET /sql/*` — read-only SQL over the public schema (`eth_usd_prices` and
  every other table are reachable here — no custom route needed).
- `GET /bids`, `GET /bids/matching/{punk,trait,color}/:id`, `GET /bids/:id` —
  `PunksMarket` criteria-bid routes.
- `GET /sales` — recent sale events with `usd_value_cents` already on the
  row (no JOIN). Pagination via `?limit=`, `?offset=`.
- `GET /stats`, `GET /stats/:window`, `GET /stats/history/:interval` —
  collection volume and activity statistics.
- `GET /punks/market-state` — compact canonical-market snapshot.
- `GET /accounts/stats` — per-account aggregates for a profile.
- `GET /profiles/*` — ENS profile resolution.

## Setup

Copy `.env.local.example` to `.env.local` and set:

- `PONDER_RPC_URLS_1`: one or more mainnet HTTP RPC URLs separated by spaces.
- `PONDER_RPC_FALLBACK_URLS_1`: optional fallback HTTP RPC URLs.
- `PONDER_WS_URL_1`: optional mainnet WebSocket RPC URL.
- `DATABASE_URL`: Postgres URL for ENS profile cache and Ponder.

## Local Postgres

`docker-compose.yml` ships a Postgres 17 instance on port `5412` for local
development (matches the prod accessory version so dumps restore cleanly).
Start it with `pnpm postgres:up` and point `DATABASE_URL` at
`postgresql://punks:punks@localhost:5412/punks`.

| Command               | What it does                                     |
| --------------------- | ------------------------------------------------ |
| `pnpm postgres:up`    | Start the container in the background.           |
| `pnpm postgres:down`  | Stop the container, keep the volume.             |
| `pnpm postgres:reset` | Wipe the volume and re-create an empty Postgres. |

## Local fork mode

Run a fully populated indexer against a local mainnet fork — no RPC bills,
no waiting for backfill. The fork node lives in the `contracts` package
(`pnpm dev:fork`) at block `25171056`; this Ponder instance restores a
production snapshot taken at the same block, then live-tails the fork for
new events.

### 1. Get a production snapshot

The snapshot is a `pg_dump -Fc` of the prod `ponder` database wrapped in a
zip, kept under `dumps/` (gitignored). To generate one from the deploy host:

```sh
ssh root@<deploy-host> 'docker exec -i indexer-db pg_dump -U ponder -d ponder \
  -Fc -Z 6 --no-owner --no-acl' \
  > dumps/ponder-prod-block-<latest_safe_checkpoint>.dump
zip -0 dumps/ponder-prod-block-<block>.zip dumps/ponder-prod-block-<block>.dump
rm dumps/ponder-prod-block-<block>.dump
```

Look up `<latest_safe_checkpoint>` with:

```sh
ssh root@<deploy-host> 'docker exec -i indexer-db psql -U ponder -d ponder \
  -tA -c "SELECT split_part(safe_checkpoint::text, ''9'', 1)::bigint % 10000000000 \
          FROM ponder_<schema>._ponder_checkpoint"'
```

(Or just `SELECT MAX(number) FROM ponder_sync.blocks`.)

### 2. Restore into local Postgres

```sh
pnpm postgres:up        # boots Postgres 17 on :5412
pnpm restore:fork       # finds the latest dumps/ponder-prod-block-*.zip and restores
```

The script prints the active schema name (e.g.
`ponder_c896f90a9aa189f5`). Set `.env.local`:

```
PONDER_RPC_URLS_1=http://127.0.0.1:8545
DATABASE_URL=postgresql://punks:punks@localhost:5412/punks
DATABASE_SCHEMA=<schema printed by restore:fork>
PONDER_VIEWS_SCHEMA=punks
```

### 3. Boot the fork and start the indexer

Terminal A — in `../contracts`:

```sh
pnpm dev:fork           # long-running hardhat node @ http://127.0.0.1:8545 (chainId 1)
```

Terminal B — in this package:

```sh
pnpm start:fork
```

That single command checks the fork is up and serving chainId 1, ensures
Postgres is running, restores the snapshot if it isn't already loaded,
probes Ponder's local `buildId`, stamps it into `_ponder_meta`, normalizes
the sync intervals + checkpoint state to the fork's view of the chain, and
then `exec`s `ponder start`. Ponder reports `Detected crash recovery`,
serves cached blocks at 100% hit rate, and live-indexes the 20 seed
transfers within a second.

### Why we don't use `pnpm dev`

Ponder 0.16.6's `dev` command unconditionally rejects any pre-existing
schema (it's wired for hot-reload over a fresh schema), so it errors with
`Schema "…" was previously used by a different Ponder app.` regardless of
build_id. Only `ponder start` reuses the schema, and that's what
`start:fork` runs.

### What `start:fork` is patching, and why

`start:fork` mutates three things to bridge prod state onto a pinned fork:

1. **`_ponder_meta.build_id`** — replaced with whatever the locally
   installed indexer computes (probed by booting Ponder against a throwaway
   `ponder_probe` schema for a few seconds). Otherwise the snapshot's
   build_id from the deploy commit can't match local source.
2. **`_ponder_checkpoint`** — `finalized_checkpoint` is zeroed and
   `latest_checkpoint` is set to `safe_checkpoint`. Without this Ponder
   errors with `Finalized block for chain "1" cannot move backwards`,
   because the snapshot was taken with the prod chain's finalization
   running ahead of our pinned fork head.
3. **`ponder_sync.intervals`** — each multirange is intersected with
   `[lo, safe_block]` and rewritten to `[a,b]` (inclusive-end) form. The
   intersection drops cached intervals past the fork point (prod kept
   syncing while we were pinned), so Ponder doesn't ask the fork for
   blocks it doesn't have. The `[a,b]` rewrite is needed because Ponder's
   `getIntervals` does `JSON.parse('[' + mr.slice(1,-1) + ']')` which
   chokes on PostgreSQL's default `[a,b)` rendering.

These are all in-place SQL mutations against the local DB. The original
snapshot zip is untouched, so you can always `pnpm restore:fork` to start
over.

### Fresh re-index mode (`start:fork:fresh`)

When local schema or handlers have drifted from the snapshot — new tables,
new columns, new sources — `start:fork`'s crash recovery against the
snapshot schema breaks (Ponder's recovery SQL references columns from the
current schema against the snapshot's older tables). Use `pnpm
start:fork:fresh` instead. It leaves the snapshot alone and indexes into
a separate `ponder_local` schema, replaying handlers over the
`ponder_sync` cache that `restore:fork` already populated. The only RPC
traffic is for sources the snapshot didn't cover (e.g. contracts added
after the dump) plus the tiny post-`safe_block` delta the fork has
advanced past.

Idempotent: subsequent boots with unchanged code reuse `ponder_local` via
crash recovery; any build_id change drops and rebuilds it. Requires
`pnpm restore:fork` to have run at least once (the snapshot schema's
`safe_checkpoint` is used to trim `ponder_sync.intervals`, same as the
snapshot path).

### Caveats

- **Schema name pins to the snapshot.** `DATABASE_SCHEMA` in `.env.local`
  must match the hash from the dump (e.g. `ponder_c896f90a9aa189f5`).
  Update it whenever you take a new snapshot.
- **Fork chainId.** `contracts/hardhat.config.ts` defines a separate
  `hardhatFork` network with `chainId: 1` so the fork matches
  `ponder.config.ts`. The `--chain-id` CLI flag is a no-op in
  hardhat 3.4.5 — only the config field takes effect.
- **Code drift.** If you make schema or handler changes that diverge from
  the snapshot's deploy commit, Ponder will happily re-stamp the build_id
  and run, but new logic against old rows can drift. Re-run
  `pnpm restore:fork` to reset.

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
up. The kamal `db` accessory binds Postgres 17 to `127.0.0.1:5469` on the
deploy host.
