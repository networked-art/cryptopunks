# @networked-art/punks-sdk

Collection-first TypeScript SDK for CryptoPunks.

The default API is built for application code: fast local search and
inspectable transaction plans for `CryptoPunksMarket` plus the
Networked Art auction/offer system. The low-level contract clients are still
exported for exact onchain reads, and local rendering is available by opting
into the bundled pixel data.

## Install

```sh
pnpm add @networked-art/punks-sdk viem
```

`viem` is a peer dependency. Search works without RPC from the default bundled
search data. Local rendering also works without RPC when you pass the optional
pixel bundle. Market and auction writes need a `walletClient`; market and
auction reads need a `publicClient`.

## Root API

| Surface                                       | Use it for                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| `punks.search`, `punks.count`, `punks.facets` | Local collection filtering                                                   |
| `punks.dataset`                               | Bundled trait, palette, bitmap, and optional pixel data                      |
| `punks.render`                                | Local SVG, PNG, RGBA, metadata, token URI output                             |
| `@networked-art/punks-sdk/similarity`         | Exact local similarity, explanations, and recommendations                    |
| `punks.market`                                | `CryptoPunksMarket` reads/writes                                             |
| `punks.v1Market`                              | Criteria-bid market wrapping the broken June 9th 2017 `CryptoPunks` contract |
| `punks.v1Wrapper`                             | `PunksV1Wrapper` ERC-721 with batch unwrap helper                            |
| `punks.data.contract`                         | `PunksData` reads                                                            |
| `punks.data.legacy`                           | Original `CryptopunksData` SVG and attributes                                |
| `punks.wrappers.modern`                       | `CryptoPunks721` and Stash wrapping flows                                    |
| `punks.wrappers.legacy`                       | `WrappedPunk` proxy wrapping flows                                           |
| `punks.stash.factory`                         | StashFactory deployment, lookup, implementation status, upgrades             |
| `punks.stash.at(address)`                     | Individual Stash funding, liquidity, bids, withdrawals                       |
| `punks.stashBids`                             | Node Foundation offchain bids orderbook (prepare, sign, submit, accept)      |
| `punks.offers`                                | Networked Art criterion offers                                               |
| `punks.auctions`                              | Vaults, lots, bidding, settlement                                            |

## Choosing The Right Surface

Use `punks.dataset` and `punks.search` for local app UI. They are
deterministic and do not need RPC. Use `punks.render` with the optional pixel
bundle when you need local images.

Use `@networked-art/punks-sdk/similarity` when you need exact local similarity
or recommendations without adding a vector index dependency.

Use `punks.data.contract` for live `PunksData` reads. Use
`punks.data.legacy` only when you need compatibility with the original Larva
Labs `CryptopunksData` strings.

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

### Text search language

`query.text` is parsed into the same shape as the structured fields above and
compiles 1:1 to an onchain `Punks.Filter`. Recognized phrases:

| Phrase                                            | Maps to                                               |
| ------------------------------------------------- | ----------------------------------------------------- |
| `2 colors`, `3 attributes`, `220 pixels`          | `colorCount` / `attributeCount` / `pixelCount` (`eq`) |
| `<=4 colors`, `>= 3 attributes`, `2-4 colors`     | numeric range on the same axis                        |
| `dark skin`, `albino skin`, `skin fair`, `albino` | `skinTone` (expands to Female + Male slot)            |
| `#1234`, bare `1234`                              | offer-slot `includeIds[]`                             |
| `-1234`, `-#1234`                                 | offer-slot `excludeIds[]`                             |
| `burned`, `burned punks`                          | curated-collection id set (see below)                 |
| Anything else                                     | case-insensitive trait name match                     |

Skin tones map to the four human head-variant slots: `Dark → 1`, `Brown → 2`,
`Fair → 3`, `Albino → 4`. Aliens, Apes, and Zombies are never selected by a
skin tone.

### Curated collections

Curated collections are named, sourced sets of Punk ids — `burned` today, more
to come. A collection alias resolves to its id set through the existing
`includeIds` path, so it composes with the rest of a query:

```ts
punks.search({ text: 'burned punks' }) // the burned set
punks.search({ text: 'burned alien' }) // burned ∩ alien
punks.count({ text: 'burned OR alien' })
```

Matching is whole-phrase and on by default; the trailing `punk(s)` is optional
and quoting (`"burned"`) opts back out to a literal trait lookup. Look the sets
up directly for UI — each call returns a fresh, mutable copy:

```ts
punks.collections.list() // [{ slug, title, description, aliases, source, standard, ids }]
punks.collections.get('burned') // one collection, or undefined
punks.collections.has('burned')
```

Each collection carries a `standard` (`PunkStandard.CryptoPunks` /
`CryptoPunksV1`) so burns and holdings stay attributed to the right contract.

Use `dataset` directly when you want catalogs, palette data, or bitmaps:

```ts
const traits = punks.dataset.traits()
const hoodie = punks.dataset.trait('Hoodie')
const palette = punks.dataset.palette({ includeSupplies: true })
```

## Rendering

The root renderer is pure TypeScript. Import the separate pixel bundle when
you need local indexed pixels, SVG, PNG, RGBA, metadata, or token URI output:

```ts
import { createPunksSdk } from '@networked-art/punks-sdk'
import { bundledOfflinePunksDataWithPixels } from '@networked-art/punks-sdk/offline-pixel-data'

const punks = createPunksSdk({ dataset: bundledOfflinePunksDataWithPixels })

const svg = punks.render.svg(8348)
const rgba = punks.render.rgba(8348)
const png = punks.render.png(8348)
const metadata = punks.render.metadata(8348)
const tokenUri = punks.render.tokenUri(8348)
const indexed = punks.dataset.indexedPixels(8348)
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

Once a Punk is in custody, a seller can create the lot and settle a standing
offer in a single transaction — no separate `createLot` call, and no window for
the lot to be opened as an auction before the seller acts:

```ts
await punks.offers.createLotAndAccept({
  items: [{ punkId: 4156 }],
  offerId: 42n,
  minAmountWei: 250n * 10n ** 18n,
})
```

`punks.auctions.createLotAndStartAuction(...)` is the auction-creating variant,
seeding a 24h auction with the offer as its opening bid.

## Low-Level Exports

The package still exports:

- `createPunksDataClient` and `createPunksRendererClient`
- clients for `CryptoPunksMarket`, `PunksMarket`, `PunksV1Wrapper`, the `PunksMarket` indexer, wrappers, StashFactory, Stash, the Stash bids orderbook, auctions, and offers
- ABIs for `PunksData`, `PunksRenderer`, `CryptoPunksMarket`, `PunksMarket`, `PunksV1Wrapper`, `UnwrapV1Punks`, wrappers, Stash, auctions, and the auction vault
- bitmap utilities and validation helpers
- `@networked-art/punks-sdk/offline` for direct offline dataset access

## Development

```sh
pnpm --filter @networked-art/punks-sdk typecheck
pnpm --filter @networked-art/punks-sdk typecheck:api
pnpm --filter @networked-art/punks-sdk test
pnpm --filter @networked-art/punks-sdk build
```

## Full Docs

- [TypeScript SDK](../docs/sdk.md)
- [Data And Search](../docs/sdk/data-search.md)
- [Rendering And Metadata](../docs/sdk/rendering.md)
- [Original Marketplace](../docs/sdk/original-marketplace.md)
- [V1 Market](../docs/sdk/v1-market.md)
- [V1 Wrapper](../docs/sdk/v1-wrapper.md)
- [Punk Data Contracts](../docs/sdk/punk-data-contracts.md)
- [Wrappers](../docs/sdk/wrappers.md)
- [Stash](../docs/sdk/stash.md)
- [Stash Bids](../docs/sdk/stash-bids.md)
- [Offers And Auctions](../docs/sdk/offers-and-auctions.md)
- [Utilities And Caching](../docs/sdk/utilities.md)
