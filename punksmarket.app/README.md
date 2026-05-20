# punksmarket.app

Nuxt 4 front-end for [punksmarket.app](https://punksmarket.app) — the native-ETH
market for the broken June 9th 2017 C̙ͦ͌ͣ̀ry̰͔̹̓̋̂pṫ̠͜ó̩͓Pͬ̋ù̓̽̂ͥ͟͝n_̹̜̳ͭ̀k͇̤̲̼͈̼̍s̸̨̗̍̀̎ contract — and the
[unwrap.punksmarket.app](https://unwrap.punksmarket.app) helper. Extends the
shared `@1001-digital/layers.evm` Nuxt layer for wagmi/wallet plumbing and
auto-registered UI primitives.

## Pages

- `/` — search and grid (`PunkGrid`, `PunkSearch`).
- `/punk/[id]` — single Punk: listing, bids, transfer, ownership.
- `/bids` — collection and criterion bids.
- `/activity` — recent sales / listings / wraps from the indexer.
- `/profile/[handle]` — owned Punks and bids for an address or ENS name.
- `/about` — project context.

## Architecture

- **Onchain reads** go through the SDK (`@networked-art/punks-sdk`) for the
  broken June 9th 2017 market, and through an inlined ABI
  (`app/utils/punksMarketAbi.ts`) for the repo's `PunksMarket.sol`.
- **Wallet writes** go directly to the connected wallet's own RPC via viem;
  they never hit our proxy.
- **RPC proxy** at `server/api/rpc.post.ts` keeps the upstream URL (and its API
  key) server-side. Only an allowlist of read methods is forwarded. The
  browser-side wagmi config points at the same-origin `/api/rpc`; the
  server-side wagmi plugin (`app/plugins/wagmi.ts`) swaps in `rpcUrl` directly
  so Nitro SSR hits the upstream without a self-loop.
- **Indexer reads** hit `NUXT_PUBLIC_INDEXER_URL` (Ponder/Postgres SQL +
  custom routes) — see [`indexer/`](../indexer/README.md).
- **Rendering** uses a 100×100 sprite sheet (`public/punks.png`) for the base
  image plus a pre-baked glitched variant (`public/punks-glitched.png`) for
  the hover effect. `PunkImage` composites the layers in CSS; for detail views
  the SDK's offline renderer is used.
- **UI primitives** (`Button`, `Card`, `BottomNav`, …) are auto-registered by
  `@1001-digital/layers.evm` → `@1001-digital/components.evm`. Don't re-author
  them locally; variants are class-based.

## Setup

```sh
cp .env.example .env
# fill in NUXT_RPC_URL at minimum
pnpm install
pnpm --filter @networked-art/punksmarket.app dev
```

Mainnet-only — the wagmi config does not declare any other chain.

## Scripts

| Script | Purpose |
| ------ | ------- |
| `pnpm dev`            | Nuxt dev server on `:3000`. |
| `pnpm build`          | Production Nitro build (node-cluster preset). |
| `pnpm generate`       | Static prerender (where applicable). |
| `pnpm preview`        | Preview the built app. |
| `pnpm typecheck`      | `nuxt typecheck` (vue-tsc). |
| `pnpm bake:glitch`    | Regenerate `public/punks-glitched.png` from `punks.png` using the deterministic per-tile glitch (`scripts/bake-glitch.mjs`). Run after the source sprite sheet changes. |

## Deployment (Kamal)

Production deployment is driven by Kamal. The container image is built from
the repo-root `Dockerfile.punksmarket.app`; deploy config lives in
`config/deploy.yml`; secrets are templated from `.env.production` via
`.kamal/secrets`.

1. Copy `.env.production.example` to `.env.production` and fill in every
   value (registry credentials, deploy host, RPC URL, indexer URL,
   WalletConnect project ID, public URL).
2. First-time host bootstrap: `pnpm kamal:setup`.
3. Subsequent releases: `pnpm kamal:deploy`.
4. Drop into a running container: `pnpm kamal:sh`.

Nitro is capped at 4 cluster workers via `NITRO_CLUSTER_WORKERS=4` in
`config/deploy.yml`.
