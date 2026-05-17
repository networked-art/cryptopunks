# v1-punks-indexer

Ponder indexer for CryptoPunks V1, the V1 ERC-721 wrapper, and this repo's
`PunksMarket.sol`.

## Setup

Copy `.env.local.example` to `.env.local` and set:

- `PONDER_RPC_URLS_1`: one or more mainnet HTTP RPC URLs separated by spaces.
- `PONDER_RPC_FALLBACK_URLS_1`: optional fallback HTTP RPC URLs.
- `PONDER_WS_URL_1`: optional mainnet WebSocket RPC URL.
- `PUNKS_MARKET_ADDRESS`: deployed `PunksMarket.sol` address.
- `PUNKS_MARKET_START_BLOCK`: deployment block for `PUNKS_MARKET_ADDRESS`.
- `DATABASE_URL`: Postgres URL for ENS profile cache and Ponder.

If `PUNKS_MARKET_ADDRESS` is unset, the generated config keeps the contract
shape available for type generation but points it at the zero address.

## Local Postgres

`docker-compose.yml` ships a Postgres 16 instance on port `5411` for local
development. Start it with `docker compose up -d` and point `DATABASE_URL`
at `postgresql://v1_punks:v1_punks@localhost:5411/v1_punks`.

## Deployment (Kamal)

Production deployment is driven by Kamal. The container image is built from
the repo-root `Dockerfile.v1-punks-indexer`; deploy config lives in
`config/deploy.yml`; secrets are templated from `.env.production` via
`.kamal/secrets`.

1. Copy `.env.production.example` to `.env.production` and fill in every
   value (registry credentials, deploy host, RPC URLs, DB password,
   `PunksMarket` address + start block).
2. First-time host bootstrap: `pnpm kamal:setup`.
3. Subsequent releases: `pnpm kamal:deploy`.
4. Drop into a running container: `pnpm kamal:sh`.

Each deploy gets a fresh schema named after the commit hash
(`DATABASE_SCHEMA=$(git rev-parse HEAD)`); the stable public views are
projected into the `v1_punks` schema by Ponder once the new schema is
caught up. The kamal `db` accessory binds Postgres 17 to `127.0.0.1:5466`
on the deploy host.
