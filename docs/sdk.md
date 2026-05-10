# TypeScript SDK

`@networked-art/punks-sdk` is the viem-based TypeScript read layer for the
CryptoPunks contracts in this repo. It has two client surfaces and a small set
of pure helpers:

- `PunksDataClient` for traits, palette data, visual metrics, indexed pixels,
  bitmap search, and Punk summaries.
- `PunksRendererClient` for SVG, PNG-8, RGBA bytes, marketplace backgrounds,
  metadata JSON, and ERC721-style token URI reads.
- Bitmap and pixel utilities for local filtering and RGBA expansion.

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

## Sections

| Section | Use it for |
| --- | --- |
| [Data And Search](/sdk/data-search) | Catalogs, palettes, trait/color lookups, bitmap search, Punk summaries, and indexed pixels |
| [Rendering And Metadata](/sdk/rendering) | SVG, PNG, RGBA bytes, marketplace backgrounds, metadata JSON, and token URI reads |
| [Utilities And Caching](/sdk/utilities) | Exported constants/ABIs, bitmap helpers, `indexedPixelsToRgba`, block options, and cache behavior |

## Quick Examples

Search through `PunksData` and render through `PunksRenderer`:

```ts
await punksData.assertCanonicalDataset()

const hoodiePunks = await punksData.search({
  traits: {
    required: [{ name: 'Hoodie', kind: 'Accessory' }],
  },
  limit: 25,
})

const svg = await renderer.getPunkSvg(hoodiePunks[0])
```

Read metadata or image bytes directly:

```ts
const metadata = await renderer.getPunkMetadata(8348)
const transparentPng = await renderer.getPunkPng(8348)
const marketplaceSvg = await renderer.getPunkMarketplaceSvg(8348)
```

## Deployments

`PunksDataClient` reads the canonical mainnet `PunksData` deployment.
`PunksRendererClient` defaults to the canonical mainnet `PunksRenderer`, and
accepts an `address` override when reading another renderer deployment.
