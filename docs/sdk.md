# TypeScript SDK

`@networked-art/punks-sdk` is the viem-based TypeScript read layer for the
CryptoPunks contracts in this repo. It has two client surfaces:

- `PunksDataClient` for traits, palette data, visual metrics, indexed pixels,
  bitmap search, and Punk summaries.
- `PunksRendererClient` for SVG, PNG-8, RGBA bytes, marketplace backgrounds,
  metadata JSON, and ERC721-style token URI reads.

Install it with viem:

```sh
pnpm add @networked-art/punks-sdk viem
```

Create both clients from any viem public client:

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

const punksData = createPunksDataClient({ publicClient })
const renderer = createPunksRendererClient({ publicClient })
```

## Exports

The package exports canonical mainnet constants and ABIs:

```ts
import {
  PUNKS_DATA_ADDRESS,
  PUNKS_DATA_DATASET_HASH,
  PUNKS_RENDERER_ADDRESS,
  PUNKS_RENDERER_BACKGROUND_DEFAULT,
  punksDataAbi,
  punksRendererAbi,
} from '@networked-art/punks-sdk'
```

`PunksDataClient` reads the canonical mainnet `PunksData` deployment. The
renderer client defaults to the canonical mainnet `PunksRenderer`, and accepts
an `address` override when reading another deployment.

## PunksData Client

Low-level reads map directly to `PunksData.sol` views:

```ts
await punksData.assertCanonicalDataset()

const name = await punksData.getTraitName(24)
const kind = await punksData.getTraitKind(24)
const supply = await punksData.getTraitSupply(24)

const traitMask = await punksData.getTraitMask(8348)
const colorMask = await punksData.getColorMask(8348)
const pixelCount = await punksData.getPixelCount(8348)
const colorCount = await punksData.getColorCount(8348)
const indexed = await punksData.getIndexedPixels(8348)
```

Catalog and palette helpers cache common lookups:

```ts
const catalog = await punksData.getTraitCatalog()
const hoodieId = await punksData.resolveTraitId({
  name: 'Hoodie',
  kind: 'Accessory',
})

const palette = await punksData.getPalette({ includeSupplies: true })
const blackId = await punksData.resolveColorId('#111111')
```

Search composes the contract's bitmap indexes locally:

```ts
const ids = await punksData.search({
  traits: {
    required: [{ name: 'Male', kind: 'NormalizedType' }],
    forbidden: [{ name: 'Cigarette', kind: 'Accessory' }],
    anyOf: [
      { name: 'Hoodie', kind: 'Accessory' },
      { name: 'Beanie', kind: 'Accessory' },
    ],
  },
  colors: { required: [12] },
  pixelCount: { min: 190, max: 240 },
  colorCount: { min: 3, max: 7 },
  limit: 50,
})
```

Use `getPunk()` for display summaries:

```ts
const punk = await punksData.getPunk(8348, {
  includeTraits: true,
  includeColors: true,
  includePixels: true,
})

punk.traits
punk.colors
punk.pixelCount
punk.colorCount
punk.punkTypeName
punk.headVariantName
punk.indexedPixels
```

Use `getRgbaPixels()` or `indexedPixelsToRgba()` when rendering locally:

```ts
import { indexedPixelsToRgba } from '@networked-art/punks-sdk'

const rgba = await punksData.getRgbaPixels(8348)

const indexedPixels = await punksData.getIndexedPixels(8348)
const paletteBytes = await punksData.getPaletteRgbaBytes()
const sameRgba = indexedPixelsToRgba(indexedPixels, paletteBytes)
```

## Renderer Client

`PunksRendererClient` wraps `PunksRenderer.sol` reads:

```ts
const svg = await renderer.getPunkSvg(8348)
const marketSvg = await renderer.getPunkMarketplaceSvg(8348)
const transparentPng = await renderer.getPunkPng(8348)
const flattenedPng = await renderer.getPunkPngWithBackground(8348, '#638596')
const rgba = await renderer.getPunkImage(8348)
const background = await renderer.getBackground(8348)
```

PNG and RGBA methods return `Uint8Array`. SVG methods return strings.
`getPunkPngWithBackground()` accepts RGB or RGBA hex and requires an opaque
alpha channel.

Metadata helpers expose the renderer's JSON surfaces:

```ts
const attributesCsv = await renderer.getPunkAttributes(8348)
const metadataJson = await renderer.getMetadataJson(8348)
const metadata = await renderer.getPunkMetadata(8348)
const tokenURI = await renderer.getTokenURI(8348)
```

Use dependency reads to verify a renderer deployment:

```ts
const dataAddress = await renderer.getDataContract()
const marketAddress = await renderer.getPunksMarketAddress()
const wrapper = await renderer.getWrapperAddress()
const c721Wrapper = await renderer.getC721WrapperAddress()
```

## Caching And Blocks

Both clients cache deterministic reads by default. Cache keys include
`blockNumber` or `blockTag` when supplied:

```ts
await punksData.search(query, { blockTag: 'safe' })
await renderer.getPunkSvg(8348, { blockNumber: 25_044_552n })
```

Bypass or clear cache per instance:

```ts
await renderer.getPunkSvg(8348, { cache: false })
punksData.clearCache()
renderer.clearCache()
```

Failed cached reads are evicted automatically so transient RPC errors can be
retried without clearing the whole client.
