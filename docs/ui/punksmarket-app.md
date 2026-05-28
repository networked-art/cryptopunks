# punksmarket.app

[punksmarket.app](https://punksmarket.app) is the web interface for trading
Punks held on the broken June 9th 2017 `CryptoPunks` contract, settled
safely through [`PunksMarket`](/contracts/punks-market). It also hosts the
[unwrap.punksmarket.app](https://unwrap.punksmarket.app) helper for
unwrapping `PunksV1Wrapper` tokens. It is a Nuxt 4 app that extends the
shared `@1001-digital/layers.evm` layer for wallet plumbing and UI
primitives.

## Interface

| Route               | What it shows                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `/`                 | Search and grid over the collection.                                |
| `/punk/[id]`        | A single Punk: listing, bids, transfer, and ownership.              |
| `/listings`         | Directed listings available to buy through the market.              |
| `/bids`             | Collection and criterion bids.                                      |
| `/activity`         | Recent sales, listings, and wraps.                                  |
| `/profile/[handle]` | Owned Punks and bids for an address or ENS name.                    |
| `/about`            | Project context.                                                    |

## How it works

- **Reads.** The broken `CryptoPunks` market is read through the SDK
  (`@networked-art/punks-sdk`); the repo's `PunksMarket` is read through an
  inlined ABI. The collection dataset and renderer come from the SDK.
- **Writes.** Wallet actions — listing, buying, bidding, transferring,
  unwrapping — go directly to the connected wallet's own RPC via viem and
  never touch the app's proxy.
- **Activity feed.** `/activity` is served by the shared indexer
  (`NUXT_PUBLIC_INDEXER_URL`, a Ponder/Postgres service) — see
  [`indexer/`](https://github.com/networked-art/cryptopunks/tree/master/indexer).
- **Rendering.** The grid composites a CDN-hosted sprite sheet with
  pre-baked glitch outline and stripe overlays in CSS; detail views render
  through the SDK's offline renderer.
- **RPC proxy.** A server route keeps the upstream RPC URL and key
  server-side; the browser talks to a same-origin `/api/rpc` that forwards
  only an allowlist of read methods.

Mainnet-only — the wagmi config declares no other chain. For the contract
behind it, see [`PunksMarket`](/contracts/punks-market); for the matching
client surface, see [V1 Market](/sdk/v1-market).
