# PunksData TypeScript SDK

`@cryptopunks/punks-data-sdk` is the TypeScript read layer for
`PunksData.sol`. It uses viem for RPC calls, keeps viem as a peer dependency,
and builds higher-level catalog, palette, bitmap, search, Punk summary, and
pixel helpers on top of the contract read API.

Install it with viem:

```sh
pnpm add @cryptopunks/punks-data-sdk viem
```

Create a client from any viem public client:

```ts
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import {
  createPunksDataClient,
  PUNKS_DATA_ADDRESS,
} from '@cryptopunks/punks-data-sdk'

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.MAINNET_RPC_URL),
})

const punksData = createPunksDataClient({
  publicClient,
  address: PUNKS_DATA_ADDRESS,
})
```

## Dataset Pinning

The SDK exports the canonical mainnet address and dataset hash:

```ts
import {
  PUNKS_DATA_ADDRESS,
  PUNKS_DATA_DATASET_HASH,
} from '@cryptopunks/punks-data-sdk'
```

Use `assertCanonicalDataset` before trusting a configurable address:

```ts
await punksData.assertCanonicalDataset()
```

It checks `isSealed()` and `datasetHash()` against the expected sealed mainnet
hash. Pass `expectedDatasetHash` if you are intentionally reading a different
sealed deployment.

## Low-Level Reads

Every read-only `PunksData` surface has a direct method:

```ts
const name = await punksData.getTraitName(24)
const kind = await punksData.getTraitKind(24)
const supply = await punksData.getTraitSupply(24)

const traitMask = await punksData.getTraitMask(8348)
const colorMask = await punksData.getColorMask(8348)
const pixelCount = await punksData.getPixelCount(8348)
const colorCount = await punksData.getColorCount(8348)

const color = await punksData.getColor(12)
const indexed = await punksData.getIndexedPixels(8348)
```

The package also exports `punksDataReadAbi` and `punksDataAbi` for callers that
want to use viem directly.

## Catalog And Palette

`getTraitCatalog()` multicalls all trait names, kinds, and supplies once and
caches the result:

```ts
const catalog = await punksData.getTraitCatalog()
const hoodie = await punksData.resolveTraitId({
  name: 'Hoodie',
  kind: 'Accessory',
})
```

Names are kind-aware because some names can appear in more than one category.
For example, `Alien` is both a normalized type and a head variant, so a bare
`resolveTraitId('Alien')` throws an ambiguity error.

`getPalette()` reads `paletteRgbaBytes()` once and expands each entry:

```ts
const palette = await punksData.getPalette({ includeSupplies: true })

palette[1]
// {
//   id: 1,
//   rgba: '0x...',
//   rgb: '0x...',
//   alpha: 255,
//   r: ...,
//   g: ...,
//   b: ...,
//   a: 255,
//   supply: ...
// }
```

Color references can be palette ids or RGBA/RGB hex values:

```ts
const colorId = await punksData.resolveColorId('#111111')
```

RGB hex is treated as opaque RGBA by appending `ff`.

## Bitmap Helpers

Bitmap rows are the fast path for filtering. Each row has 40 `uint256` words,
where bit `punkId % 256` in word `Math.floor(punkId / 256)` corresponds to a
Punk id.

```ts
import { bitmapToPunkIds } from '@cryptopunks/punks-data-sdk'

const hoodieBitmap = await punksData.getTraitBitmap({
  name: 'Hoodie',
  kind: 'Accessory',
})

const ids = bitmapToPunkIds(hoodieBitmap)
```

The SDK exports pure bitmap utilities:

```ts
import {
  countPunkBitmap,
  intersectPunkBitmaps,
  punkBitmapFromIds,
  subtractPunkBitmaps,
  unionPunkBitmaps,
} from '@cryptopunks/punks-data-sdk'
```

Use them when you want to compose cached rows yourself instead of using
`search()`.

## Search

`searchBitmap()` returns a composed bitmap. `search()` returns ascending Punk
ids from that bitmap and supports `offset` and `limit`.

```ts
const ids = await punksData.search({
  traits: {
    required: [{ name: 'Hoodie', kind: 'Accessory' }],
    forbidden: [{ name: 'Cigarette', kind: 'Accessory' }],
    anyOf: [
      { name: 'Male', kind: 'NormalizedType' },
      { name: 'Zombie', kind: 'NormalizedType' },
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

Search composes the contract's inverted indexes:

- `traitBitmapWord` for required, forbidden, and any-of trait groups.
- `colorBitmapWord` for visible palette-color filters.
- `pixelCountBitmapWord` for exact or range visible-pixel counts.
- `colorCountBitmapWord` for exact or range visible-color counts.
- Optional include and exclude id bitmaps.

For counts, use either a number for exact matching or `{ min, max }` for a
range:

```ts
await punksData.search({ pixelCount: 209 })
await punksData.search({ colorCount: { min: 2, max: 5 } })
```

## Punk Summaries

`getPunk()` and `getPunks()` batch the common per-Punk reads and decode masks
locally:

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

Leave `includePixels` off for list views. It reads the 576-byte indexed pixel
buffer for each Punk.

## Pixels

Use `getIndexedPixels()` when you want the raw 24x24 palette ids:

```ts
const indexed = await punksData.getIndexedPixels(8348)
const colorId = indexed[y * 24 + x]
```

Use `getRgbaPixels()` when you want local RGBA bytes:

```ts
const rgba = await punksData.getRgbaPixels(8348)
const offset = (y * 24 + x) * 4
const r = rgba[offset]
const g = rgba[offset + 1]
const b = rgba[offset + 2]
const a = rgba[offset + 3]
```

If you already have palette bytes, use the pure helper:

```ts
import { indexedPixelsToRgba } from '@cryptopunks/punks-data-sdk'

const palette = await punksData.getPaletteRgbaBytes()
const rgba = indexedPixelsToRgba(indexed, palette)
```

## Caching And Blocks

The client caches immutable reads by default: dataset status, trait catalog,
palette bytes, palette records, supplies, and bitmap rows. Cache keys include
`blockNumber` or `blockTag` when supplied.

```ts
await punksData.search(query, { blockTag: 'safe' })
punksData.clearCache()
```

Pass `cache: false` to a read when you need to bypass the instance cache:

```ts
const status = await punksData.getDatasetStatus({ cache: false })
```

The cache is per SDK instance. Create a fresh client or call `clearCache()`
when switching addresses or RPC assumptions.
