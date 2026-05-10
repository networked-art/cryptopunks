# @networked-art/punks-sdk

TypeScript SDK for reading/searching `PunksData.sol` and rendering through
`PunksRenderer.sol`.

The SDK is built around viem reads and the contract's bitmap indexes. It gives
you direct getters for the onchain data surface, plus cached helpers for trait
catalogs, palettes, bitmap filtering, Punk summaries, and indexed-pixel
expansion. It also exposes a renderer client for SVG, PNG, RGBA bytes, and
metadata reads.

## Install

```sh
pnpm add @networked-art/punks-sdk viem
```

`viem` is a peer dependency so applications can choose their own viem version,
transport, chain config, and batching behavior.

## Quick Start

```ts
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import {
  createPunksDataClient,
  createPunksRendererClient,
} from '@networked-art/punks-sdk'

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.MAINNET_RPC_URL),
})

const punksData = createPunksDataClient({
  publicClient,
})

const punksRenderer = createPunksRendererClient({
  publicClient,
})

const hoodiePunks = await punksData.search({
  traits: {
    required: ['Hoodie'],
  },
})

const svg = await punksRenderer.getPunkSvg(hoodiePunks[0])
```

## What It Exposes

Low-level contract reads:

```ts
await punksData.getTraitName(24)
await punksData.getTraitKind(24)
await punksData.getTraitSupply(24)

await punksData.getTraitMask(8348)
await punksData.getColorMask(8348)
await punksData.getPixelCount(8348)
await punksData.getColorCount(8348)
await punksData.getIndexedPixels(8348)
```

Cached catalog and palette helpers:

```ts
const catalog = await punksData.getTraitCatalog()
const palette = await punksData.getPalette({ includeSupplies: true })

const hoodie = await punksData.resolveTrait('Hoodie')
hoodie.id
hoodie.kind
hoodie.supply

const black = await punksData.resolveColor('#111111')
black.id
black.rgba
```

Bitmap-first search:

```ts
const ids = await punksData.search({
  traits: {
    required: [
      'Male',
      '3D Glasses',
    ],
    forbidden: ['Cigarette'],
    anyOf: [
      'Hoodie',
      'Beanie',
    ],
  },
  colors: {
    required: [12],
  },
  pixelCount: { min: 190, max: 240 },
  colorCount: { min: 3, max: 7 },
  limit: 50,
})
```

Punk summaries:

```ts
const punk = await punksData.getPunk(8348, {
  includeTraits: true,
  includeColors: true,
  includePixels: true,
})

punk.traitIds
punk.traits
punk.colorIds
punk.colors
punk.pixelCount
punk.colorCount
punk.attributeCount
punk.punkTypeName
punk.headVariantName
punk.indexedPixels
```

Pixel expansion:

```ts
const rgba = await punksData.getRgbaPixels(8348)
```

Or expand manually when you already have the palette:

```ts
import { indexedPixelsToRgba } from '@networked-art/punks-sdk'

const indexed = await punksData.getIndexedPixels(8348)
const palette = await punksData.getPaletteRgbaBytes()
const rgba = indexedPixelsToRgba(indexed, palette)
```

## Renderer Client

`PunksRendererClient` wraps `PunksRenderer.sol` reads:

```ts
const renderer = createPunksRendererClient({ publicClient })

const svg = await renderer.getPunkSvg(8348)
const marketSvg = await renderer.getPunkMarketplaceSvg(8348)
const png = await renderer.getPunkPng(8348)
const flattenedPng = await renderer.getPunkPngWithBackground(8348, '#638596')
const metadata = await renderer.getPunkMetadata(8348)
const tokenURI = await renderer.getTokenURI(8348)
```

PNG and RGBA byte methods return `Uint8Array`. SVG, metadata JSON, token URI,
and attribute methods return strings. Use `getBackground()` for the
marketplace-aware RGBA background selected by the renderer.

## Search Model

`PunksData` exposes inverted bitmap rows for efficient offchain filtering:

- `traitBitmapWord` answers trait membership.
- `colorBitmapWord` answers visible palette-color membership.
- `pixelCountBitmapWord` answers exact visible-pixel count.
- `colorCountBitmapWord` answers exact visible-color count.

The SDK composes those rows locally with bigint set operations. This avoids
10,000 per-Punk predicate calls for broad searches.

Use `searchBitmap()` if you want the composed 40-word bitmap:

```ts
const bitmap = await punksData.searchBitmap({
  traits: { required: ['Ape'] },
})
```

Use `search()` if you want sorted Punk ids:

```ts
const ids = await punksData.search({
  colors: { required: [12] },
  offset: 100,
  limit: 25,
})
```

Use `count()` if you only need the match count:

```ts
const total = await punksData.count({
  traits: { required: ['Zombie'] },
})
```

## Pure Bitmap Utilities

The package exports the same bitmap operations used by the client:

```ts
import {
  bitmapToPunkIds,
  countPunkBitmap,
  fullPunkBitmap,
  intersectPunkBitmaps,
  punkBitmapFromIds,
  subtractPunkBitmaps,
  unionPunkBitmaps,
} from '@networked-art/punks-sdk'
```

These work on `bigint[]` bitmaps with 40 words. Tail bits above Punk id `9999`
are masked out by the helpers.

## Caching

Client instances cache immutable reads by default:

- trait catalog
- palette bytes and expanded palette records
- color supplies
- bitmap rows

Cache keys include `blockNumber` or `blockTag` when supplied:

```ts
await punksData.search(query, { blockTag: 'safe' })
await punksData.search(query, { blockNumber: 25_044_552n })
```

Bypass or clear the cache when needed:

```ts
await punksData.getTraitCatalog({ cache: false })
punksData.clearCache()
```

Failed cached reads are evicted automatically, so transient RPC failures can be
retried without clearing the whole client.

## Deployment Constants

```ts
import {
  PUNKS_DATA_ADDRESS,
  PUNKS_DATA_ENS,
  PUNK_COUNT,
  TRAIT_COUNT,
  PALETTE_SIZE,
} from '@networked-art/punks-sdk'
```

The canonical mainnet deployment is:

```text
punksdata.eth
0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C
```

`createPunksDataClient` always reads this address. It is not exposed as a
constructor option because `PunksData` is an immutable mainnet public good.

## ABI Exports

For direct viem usage:

```ts
import {
  punksDataAbi,
  punksDataReadAbi,
} from '@networked-art/punks-sdk'
```

`punksDataReadAbi` contains the read surface and read-side custom errors used
by the SDK.

## Development

```sh
pnpm --filter @networked-art/punks-sdk typecheck
pnpm --filter @networked-art/punks-sdk test
pnpm --filter @networked-art/punks-sdk build
```
