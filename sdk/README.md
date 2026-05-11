# @networked-art/punks-sdk

Collection-first TypeScript SDK for CryptoPunks.

The default API is built for application code: fast local search, local image
rendering, and inspectable transaction plans for the original CryptoPunks
market plus the Networked Art auction/offer system. The low-level contract
clients are still exported for exact onchain reads.

## Install

```sh
pnpm add @networked-art/punks-sdk viem
```

`viem` is a peer dependency. Search and local rendering work without RPC.
Market and auction writes need a `walletClient`; market and auction reads need
a `publicClient`.

## Quick Start

```ts
import { createPunksSdk } from '@networked-art/punks-sdk'

const punks = createPunksSdk()

const ids = punks.search({
  text: 'zombie hoodie',
  colorCount: { max: 4 },
  limit: 20,
})

const punk = punks.get(ids[0], { includeTraits: true })
const svg = punks.render.svg(ids[0])
const png = punks.render.png(ids[0], { background: 'transparent' })
```

## Search

Search uses the bundled canonical dataset and bitmap indexes, so common queries
are local and fast:

```ts
punks.search({
  type: ['Alien', 'Ape', 'Zombie'],
  attributes: {
    required: ['Hoodie'],
    forbidden: ['Cigarette'],
  },
  pixelCount: { min: 190, max: 240 },
  sort: 'rarity',
})

punks.count({ text: '"3d glasses"' })
punks.facets({ text: 'mohawk' })
```

Use `dataset` directly when you want catalogs, palette data, pixels, or
bitmaps:

```ts
const traits = punks.dataset.traits()
const hoodie = punks.dataset.trait('Hoodie')
const palette = punks.dataset.palette({ includeSupplies: true })
const indexed = punks.dataset.indexedPixels(8348)
```

## Rendering

The root renderer is pure TypeScript and uses the bundled indexed pixels and
palette:

```ts
const svg = punks.render.svg(8348)
const rgba = punks.render.rgba(8348)
const png = punks.render.png(8348)
const metadata = punks.render.metadata(8348)
const tokenUri = punks.render.tokenUri(8348)
```

The default background is the classic CryptoPunks blue. Pass
`{ background: 'transparent' }` or any RGB/RGBA hex color when needed.

For exact onchain renderer output, configure a `publicClient` and use the
contract escape hatch:

```ts
const onchainSvg = await punks.contracts.renderer?.getPunkSvg(8348)
```

## Original Marketplace

Configure viem clients for reads and writes:

```ts
const punks = createPunksSdk({ publicClient, walletClient })

const listing = await punks.market.listing(8348)

await punks.market.list({
  punkId: 8348,
  priceWei: 100n * 10n ** 18n,
})

await punks.market.buy({
  punkId: 8348,
  maxPriceWei: 100n * 10n ** 18n,
})
```

Every write also has a `prepare*` method for UI confirmation, simulation, or
custom batching:

```ts
const plan = punks.market.prepareList({
  punkId: 8348,
  priceWei: 100n * 10n ** 18n,
})

plan.description
plan.request
```

## Offers And Auctions

Pass the auction contract address to enable Networked Art auction/offer writes:

```ts
const punks = createPunksSdk({
  publicClient,
  walletClient,
  addresses: {
    auction: '0x...',
  },
})
```

Criterion offers compile the same user query language into the onchain
`Punks.Filter` shape:

```ts
await punks.offers.place({
  amountWei: 50n * 10n ** 18n,
  query: {
    type: 'Zombie',
    attributes: { anyOf: ['Hoodie', 'Beanie'] },
    colorCount: { max: 4 },
  },
})
```

Lot and auction writes are similarly inspectable:

```ts
const lot = punks.auctions.prepareCreateLot({
  items: [
    { punkId: 4156, standard: 'cryptopunks-v1', weightBps: 500 },
    { punkId: 4156, standard: 'cryptopunks', weightBps: 9500 },
  ],
  reserveWei: 250n * 10n ** 18n,
  expiresAt: 1_800_000_000,
})

await punks.auctions.bid({
  auctionId: 12n,
  amountWei: 300n * 10n ** 18n,
})
```

Auction custody is explicit. Use `prepareDeposit()` to transfer a Punk to the
seller's deterministic vault before creating a lot:

```ts
const deposit = await punks.auctions.prepareDeposit({
  owner: account,
  punkId: 4156,
})
```

## Low-Level Exports

The package still exports:

- `createPunksDataClient` and `createPunksRendererClient`
- ABIs for `PunksData`, `PunksRenderer`, the original market, auctions, and escrow
- bitmap utilities and validation helpers
- `@networked-art/punks-sdk/offline` for direct offline dataset access

## Development

```sh
pnpm --filter @networked-art/punks-sdk typecheck
pnpm --filter @networked-art/punks-sdk test
pnpm --filter @networked-art/punks-sdk build
```

## Full Docs

- [TypeScript SDK](../docs/sdk.md)
- [Data And Search](../docs/sdk/data-search.md)
- [Rendering And Metadata](../docs/sdk/rendering.md)
- [Market, Offers, And Auctions](../docs/sdk/market-actions.md)
- [Utilities And Caching](../docs/sdk/utilities.md)
