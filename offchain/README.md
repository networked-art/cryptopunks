# @networked-art/punks-offchain

AdonisJS v7 API for offchain state around the `CryptoPunks` market: email-based
accounts, eth-address linkage, saved searches, search-match email notifications,
and buy-side inquiries.

## Quick start

```sh
docker compose -f docker-compose.dev.yml up -d
cp .env.example .env
node ace generate:key  # writes APP_KEY
node ace migration:run
pnpm dev
```

The API listens on `http://localhost:3333`. Mailpit (dev SMTP catcher) is at
`http://localhost:8025`.

## Architecture

- Auth: SIWE (`@signinwithethereum/siwe`) and email-PIN. Both flows mint a
  bearer token via `@adonisjs/auth`; the token also ships as the `oc_bearer`
  cookie for the frontends.
- Match engine: a queue-scheduled tick polls the in-repo Ponder indexer's
  GraphQL `events` endpoint for new listings/lots, evaluates every `notify`
  saved search against the affected punk via the SDK's `PunksDataset`, and
  enqueues a `notification_deliveries` row on a match.
- Inquiries are first-class records pointing at a saved search, with an
  admin-visible status lifecycle.

See `DATA_MODEL.md` for the full schema.
