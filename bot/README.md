# @networked-art/punks-bot

A Twitter bot that watches CryptoPunks sales and, for each buyer, posts a grid
of their whole collection with the **newly-acquired punks rendered at 2× scale**.

It's built as a small, generic Twitter-bot framework with the punk grid as the
first concrete renderer — adding another bot is a matter of writing a new
`Source` and `Renderer`, not touching the loop or the publisher.

## How it works

Each tick is a one-shot run, re-invoked on an interval by `bin/run-loop`:

1. **Source** — `PunksSource` reads the indexer's sales feed since the stored
   cursor, groups sales by buyer, and fetches each buyer's full holdings
   (canonical + V1, unioned).
2. **Renderer** — `PunksRenderer` renders every owned punk offline via the SDK
   and hands them to [`@visualizevalue/img-grid`](https://www.npmjs.com/package/@visualizevalue/img-grid)
   as `data:` URIs, marking the just-acquired ones as `highlight` (img-grid
   enlarges those to a 2×2 block), then writes the caption.
3. **Publisher** — `TwitterPublisher` posts text + image (or `DryRunPublisher`
   prints the text and writes the image to a temp file).

The first ever run just records "now" as the cursor and posts nothing, so a
fresh deploy reacts to new sales instead of replaying history.

## Architecture

```
src/
  core/            # generic, domain-agnostic bot framework
    types.ts       #   Source / Renderer / Publisher / Post contracts
    bot.ts         #   runOnce: read cursor → pull → render → publish → save
    twitter.ts     #   TwitterPublisher (OAuth 1.0a) + DryRunPublisher
    state.ts       #   StateFile: the single JSON state file
  punks/           # the concrete renderer service
    indexer.ts     #   PunksIndexer: sales feed + holdings (GraphQL)
    source.ts      #   PunksSource: sales → per-buyer Acquisition subjects
    renderer.ts    #   PunksRenderer: Acquisition → caption + 2×-highlight grid
    names.ts       #   NameResolver: ENS (indexer profiles) → label → short addr
  index.ts         # wires the punk bot together and runs one tick
  preview.ts       # render a grid locally without Twitter
```

The split is the point: `core/` knows nothing about punks. The grid itself is
the published `@visualizevalue/img-grid` package — the punk renderer feeds it
offline-rendered punks as `data:` URIs and highlights the new ones.

## Usage

```bash
pnpm install

# Preview a grid for an account without any credentials (writes preview.png):
pnpm preview 0xYourAddress --new 1234,5678

# Or render an explicit set of ids:
pnpm preview --ids 1,2,3,4,5 --new 1

# Dry run against the live sales feed (prints tweets, writes images to /tmp):
DRY_RUN=true pnpm start
```

Copy `.env.example` to `.env` and fill in the Twitter/X OAuth 1.0a credentials
(API key/secret + the account's access token/secret, app set to Read + Write)
to post for real. See the file for every option.

## Deploy

Kamal config lives in `config/deploy.yml` and builds the root `Dockerfile.bot`.
It runs as a worker (no exposed port) and mounts `/var/lib/punks-bot` so the
sales cursor survives deploys.

```bash
cp .env.production.example .env.production   # fill in, then:
pnpm kamal:setup
pnpm kamal:deploy
```
