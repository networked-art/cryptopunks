# punks.auction

Nuxt 4 front-end for [punks.auction](https://punks.auction) — a zero-fee
auction house for CryptoPunks. Sellers custody Punks in their own vault, open
24h auctions from multi-Punk lots, and collectors place native-ETH purchase
offers against trait/colour criteria. Extends the shared
`@1001-digital/layers.evm` Nuxt layer for wagmi/wallet plumbing and
auto-registered UI primitives.

## Pages

- `/` — landing page.
- `/punks` — search and grid (`PunkSearch`, `PunkGrid`); `/punks/[id]` and
  `/punks/v1/[id]` open a canonical or June 9th 2017 Punk with its traits,
  ownership, and any auction/lot/offer it appears in.
- `/auctions` — live auctions, with open lots below; `/auctions/[id]` is a
  single auction.
- `/lots/new` — create a lot from vaulted Punks; `/lots/[id]` is a single lot.
- `/purchase-offers` — open native-ETH purchase offers; `/purchase-offers/new`
  places one and `/purchase-offers/[id]` opens one.
- `/activity` — recent auction-house and market activity.
- `/profile/[handle]` — owned Punks, auction activity, and claimable escrow
  for an address or ENS name; sub-pages `/vault`, `/offers`, `/wrappers`, and
  `/settings`.
- `/about`, `/terms` — project context and terms.

## Architecture

- **Onchain reads** go straight to the chain. The collection itself (search,
  rendering, traits) is served from the SDK's bundled offline dataset
  (`@networked-art/punks-sdk`). Auctions, lots, and offers are enumerated from
  `PunksAuction` via viem `multicall` (`lastAuctionId` / `lastLotId` /
  `lastOfferId` + the public getters).
- **Wallet writes** — creating lots, opening and bidding on auctions, placing
  and managing offers, vault deposits and approvals — are built by the SDK as
  contract write plans and sent through the connected wallet with wagmi
  (`app/composables/useWritePlan.ts`). The SDK owns address/ABI/args/value;
  wagmi owns the wallet transport.
- **Activity feed** is served by the shared indexer (the same service behind
  punksmarket.app). `app/composables/useActivityFeed.ts` reads the
  `cryptopunks_v2`, `wrapped_punks`, `cryptopunks_721`, and `punks_auction`
  sources.
- **RPC proxy** at `server/api/rpc.post.ts` keeps the upstream URL (and its API
  key) server-side. Only an allowlist of read methods is forwarded. The
  browser-side wagmi config points at the same-origin `/api/rpc`; the
  server-side wagmi plugin (`app/plugins/wagmi.ts`) swaps in `rpcUrl` directly
  so Nitro SSR hits the upstream without a self-loop.
- **Contract address** — `PunksAuction` is deployed at
  `0x6f99d7E85b4Ba6fFD9ff60A09fc12201027b7873` (escrow
  `0x366662a518702CE9bC0Be44930ec8d176eF56aD5`), hardcoded in
  `app/utils/addresses.ts`.
- **Rendering** uses the CDN-hosted optimized 100×100 sprite sheet
  (`punks.optimized.png`) for grid cells; detail views render through the SDK's
  offline renderer.
- **UI primitives** (`Button`, `Card`, `BottomNav`, …) are auto-registered by
  `@1001-digital/layers.evm` → `@1001-digital/components.evm`. Don't re-author
  them locally; variants are class-based.

## Setup

```sh
cp .env.example .env
# fill in NUXT_RPC_URL at minimum
pnpm install
pnpm --filter @networked-art/punks.auction dev
```

Mainnet-only — the wagmi config does not declare any other chain.

## Scripts

| Script           | Purpose                                       |
| ---------------- | --------------------------------------------- |
| `pnpm dev`       | Nuxt dev server on `:3000`.                   |
| `pnpm build`     | Production Nitro build (node-cluster preset). |
| `pnpm generate`  | Static prerender (where applicable).          |
| `pnpm preview`   | Preview the built app.                        |
| `pnpm typecheck` | `nuxt typecheck` (vue-tsc).                   |

## Deployment (Kamal)

Production deployment is driven by Kamal. The container image is built from
the repo-root `Dockerfile.punks.auction`; deploy config lives in
`config/deploy.yml`; secrets are templated from `.env.production` via
`.kamal/secrets`.

1. Copy `.env.production.example` to `.env.production` and fill in every
   value (registry credentials, deploy host, RPC URL, WalletConnect project
   ID, public URL).
2. First-time host bootstrap: `pnpm kamal:setup`.
3. Subsequent releases: `pnpm kamal:deploy`.
4. Drop into a running container: `pnpm kamal:sh`.

Nitro is capped at 4 cluster workers via `NITRO_CLUSTER_WORKERS=4` in
`config/deploy.yml`.
