# Networked CryptoPunks

Monorepo for the onchain CryptoPunks data, rendering, and market contracts,
plus the TypeScript SDK, indexer, and front-end that build on them. All
contracts target Ethereum mainnet only.

## Packages

| Package                                            | Name                             | Purpose                                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`contracts/`](contracts/README.md)                | `@networked-art/punks-contracts` | Hardhat 3 sources for `PunksData`, `PunksRenderer`, `PunksMarket`, the auction/vault system, and the batch unwrap helper for the broken June 9th 2017 CryptoPunks contract. |
| [`sdk/`](sdk/README.md)                            | `@networked-art/punks-sdk`       | Collection-first TypeScript SDK: local search and rendering, original-market and broken June 9th 2017 market reads/writes, Stash, criterion offers, and auctions.           |
| [`indexer/`](indexer/README.md)                    | `@networked-art/punks-indexer`   | Ponder indexer that tracks the two CryptoPunks collections, their ERC-721 wrappers, and `PunksMarket`, with USD-cent prices stamped per event.                              |
| [`punksmarket.app/`](punksmarket.app/package.json) | `@networked-art/punksmarket.app` | Nuxt front-end for [punksmarket.app](https://punksmarket.app) and the [unwrap.punksmarket.app](https://unwrap.punksmarket.app) helper.                                      |
| [`docs/`](docs/index.md)                           | `@networked-art/punks-docs`      | VitePress documentation site for the contracts and SDK.                                                                                                                     |

## Documentation

Full per-surface docs live in [`docs/`](docs/index.md). Highlights:

- [PunksData](docs/contracts/punks-data.md) — trait masks, visual metrics, palette, indexed pixels, dataset commitments.
- [PunksRenderer](docs/contracts/punks-renderer.md) — SVG, PNG-8, RGBA, marketplace backgrounds, ERC-721 metadata.
- [PunksMarket](docs/contracts/punks-market.md) — the criteria-bid market that wraps the broken June 9th 2017 CryptoPunks contract.
- [TypeScript SDK](docs/sdk.md) — the collection-first SDK entry point.

## Development

Requires `pnpm@10`. If not installed:

```sh
npm install -g pnpm@10
```

Install all workspace dependencies:

```sh
pnpm install
```

### Running the front-end (`punksmarket.app`)

The SDK must be built before the Nuxt dev server can start — Vite resolves it
from `sdk/dist/` at runtime.

```sh
# 1. Build the SDK
pnpm --filter @networked-art/punks-sdk build

# 2. Set up the front-end env (only needed once)
cp punksmarket.app/.env.example punksmarket.app/.env
# Edit .env — set NUXT_RPC_URL to a mainnet JSON-RPC endpoint
# (e.g. https://eth.llamarpc.com for a free public one, or your Alchemy/Infura URL)

# 3. Start the dev server → http://localhost:3000
pnpm --filter @networked-art/punksmarket.app dev
```

## Development

```sh
pnpm test           # contracts + SDK
pnpm typecheck      # all packages
pnpm format         # prettier
pnpm docs:dev       # local VitePress preview
```

The workspace is pinned to `pnpm@10` and uses a `viem@2.48.4` override (see
`package.json`). Per-package scripts (Hardhat tasks, Ponder dev, Nuxt dev,
Kamal deploys) are documented in each package's README.
