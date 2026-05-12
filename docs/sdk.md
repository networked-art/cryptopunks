# TypeScript SDK

`@networked-art/punks-sdk` is the application SDK for CryptoPunks data,
rendering, marketplace actions, and Networked Art auction/offer flows.

The root API is collection-first. It does not require RPC for search or image
rendering because it ships with the canonical sealed dataset.

```ts
import { createPunksSdk } from '@networked-art/punks-sdk'

const punks = createPunksSdk()

const ids = punks.search({
  text: 'zombie hoodie',
  colorCount: { max: 4 },
})

const svg = punks.render.svg(ids[0])
const metadata = punks.render.metadata(ids[0])
```

## Main Surfaces

| Surface | Use it for |
| --- | --- |
| `punks.search`, `punks.count`, `punks.facets` | Fast local search/filtering over the canonical collection |
| `punks.dataset` | Trait catalog, palette, summaries, indexed pixels, bitmaps |
| `punks.render` | Local SVG, PNG, RGBA, metadata, token URI generation |
| `punks.market` | Original CryptoPunks market reads/writes |
| `punks.data.contract` | Exact reads for `PunksData.sol` |
| `punks.data.legacy` | Original `CryptopunksData` SVG and attribute reads |
| `punks.wrappers.modern` | CryptoPunks721 reads, approvals, and Stash wrapping flows |
| `punks.wrappers.legacy` | Legacy Wrapped Punks reads, approvals, proxy wrapping flows |
| `punks.stash.factory` | StashFactory lookup, deployment, implementation status, and Stash upgrades |
| `punks.stash.at(address)` | Individual Stash funding, liquidity, bids, withdrawals, and orders |
| `punks.offers` | Criterion offers through the Networked Art auction contract |
| `punks.auctions` | Vault deposits, lots, bids, settlement, reclaim |
| `punks.contracts` | Low-level `PunksData` and `PunksRenderer` viem wrappers |

## Choosing The Right Surface

Use the local SDK surfaces first for app UI: `punks.search`, `punks.dataset`,
and `punks.render` are fast, deterministic, and do not require RPC.

Use `punks.data.contract` when you need live reads from `PunksData.sol`, such
as validating a deployment or reading at a block.

Use `punks.data.legacy` only when compatibility requires the original Larva
Labs `CryptopunksData` SVG or attribute strings.

## Sections

| Section | Use it for |
| --- | --- |
| [Data And Search](/sdk/data-search) | Query filtering, facets, dataset reads, and offer-slot compilation |
| [Rendering And Metadata](/sdk/rendering) | Local images, metadata, token URI generation, and exact onchain renderer reads |
| [Original Marketplace](/sdk/original-marketplace) | Original CryptoPunks market reads and writes |
| [Punk Data Contracts](/sdk/punk-data-contracts) | Local dataset vs `PunksData.sol` vs legacy `CryptopunksData` |
| [Wrappers](/sdk/wrappers) | Modern Stash wrapping, legacy proxy wrapping, approvals, and transfers |
| [Stash](/sdk/stash) | StashFactory, Stash funding, liquidity, Punk bids, withdrawals, and orders |
| [Offers And Auctions](/sdk/offers-and-auctions) | Criterion offers, vaults, lots, bids, settlement |
| [Utilities And Caching](/sdk/utilities) | Constants, ABIs, bitmap helpers, validation, block options, and low-level cache behavior |

## Viem Configuration

Search and local rendering work with no clients:

```ts
const punks = createPunksSdk()
```

Marketplace and auction reads need a `publicClient`; writes need a
`walletClient`:

```ts
const punks = createPunksSdk({
  publicClient,
  walletClient,
  addresses: {
    auction: '0x...',
  },
})
```

## Transaction Plans

Every write has an executable method and a `prepare*` method. The prepared
plan is a plain object with a description and viem `writeContract` request:

```ts
const plan = punks.market.prepareList({
  punkId: 8348,
  priceWei: 100n * 10n ** 18n,
})

await walletClient.writeContract(plan.request)
```

The SDK's executable methods call the same plan with the configured
`walletClient`.

## Query Compilation

The same query language powers local filtering and offer-slot compilation:

```ts
const ids = punks.search({
  type: 'Zombie',
  attributes: { anyOf: ['Hoodie', 'Beanie'] },
  colorCount: { max: 4 },
})

const slot = punks.offers.slot({
  query: {
    type: 'Zombie',
    attributes: { anyOf: ['Hoodie', 'Beanie'] },
    colorCount: { max: 4 },
  },
})
```

Text search, pagination, and sorting are local-only. They cannot be represented
inside a single onchain `Punks.Filter`; use explicit `includeIds` when an offer
needs a materialized basket.
