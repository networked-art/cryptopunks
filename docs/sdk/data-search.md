# SDK: Data And Search

Use `PunksDataClient` when you need trait data, palette data, visual metrics,
indexed pixels, bitmap search, or Punk summaries.

```ts
import { createPunksDataClient } from '@networked-art/punks-sdk'

const punksData = createPunksDataClient({ publicClient })
```

## Low-Level Reads

Low-level methods map directly to `PunksData.sol` views:

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

## Catalog And Palette

`getTraitCatalog()` multicalls all trait names, kinds, and supplies once and
caches the result:

```ts
const catalog = await punksData.getTraitCatalog()
const hoodie = await punksData.resolveTrait('Hoodie')
hoodie.id
```

Color helpers work with palette ids or RGB/RGBA hex strings:

```ts
const palette = await punksData.getPalette({ includeSupplies: true })
const blackId = await punksData.resolveColorId('#111111')
const black = await punksData.getColor(blackId)
```

## Bitmap Search

`searchBitmap()` returns the composed 40-word Punk bitmap. `search()` returns
ascending Punk ids from that bitmap and supports `offset` and `limit`.

```ts
const ids = await punksData.search({
  attributes: {
    required: ['Male'],
    forbidden: ['Cigarette'],
    anyOf: [
      'Hoodie',
      'Beanie',
    ],
  },
  colors: { required: [12] },
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

## Offline Text Search

Use the offline subpath for bundled, RPC-free search across the full canonical
dataset:

```ts
import { createOfflinePunksDataClient } from '@networked-art/punks-sdk/offline'

const offline = createOfflinePunksDataClient()

const ids = offline.searchSync({
  text: 'zombie mohawk OR ape "3d glasses"',
})
```

Offline `text` search uses a prebuilt trait bitmap index. Whitespace terms are
ANDed, `OR` or `||` unions groups, and quoted phrases are exact attribute-name
matches. The same offline query can be combined with `punkType`, `headVariant`,
`attributeCount`, colors, pixel counts, include/exclude ids, sorting, facets,
and pagination.

## Punk Summaries

`getPunk()` and `getPunks()` batch common per-Punk reads and decode masks
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

## Indexed Pixels

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
