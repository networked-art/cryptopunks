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
| `punks.offers` | Criterion offers through the Networked Art auction contract |
| `punks.auctions` | Vault deposits, lots, bids, settlement, reclaim |
| `punks.contracts` | Low-level `PunksData` and `PunksRenderer` viem wrappers |

## Sections

| Section | Use it for |
| --- | --- |
| [Data And Search](/sdk/data-search) | Query filtering, facets, dataset reads, and offer-slot compilation |
| [Rendering And Metadata](/sdk/rendering) | Local images, metadata, token URI generation, and exact onchain renderer reads |
| [Market, Offers, And Auctions](/sdk/market-actions) | Original marketplace writes, criterion offers, vaults, lots, bids, and settlement |
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
