# SDK: Utilities And Caching

The SDK exports contract constants, ABIs, pure bitmap helpers, pixel helpers,
and shared read options for block-scoped reads.

## Constants And ABIs

Use exported addresses and ABIs when you want direct viem reads:

```ts
import {
  PUNKS_DATA_ADDRESS,
  PUNKS_DATA_DATASET_HASH,
  PUNKS_RENDERER_ADDRESS,
  punksDataAbi,
  punksDataReadAbi,
  punksRendererAbi,
  punksRendererReadAbi,
  cryptoPunksMarketAbi,
  punksAuctionAbi,
  punksEscrowAbi,
} from '@networked-art/punks-sdk'
```

The package also exports core dataset constants:

```ts
import {
  PUNK_COUNT,
  PUNK_WIDTH,
  PUNK_HEIGHT,
  PIXELS_PER_PUNK,
  TRAIT_COUNT,
  PALETTE_SIZE,
} from '@networked-art/punks-sdk'
```

## Bitmap Utilities

The bitmap helpers operate on `bigint[]` Punk bitmaps with 40 words:

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

Use them when you want to compose cached bitmap rows yourself:

```ts
const hoodie = await punksData.getTraitBitmap('Hoodie')
const beanie = await punksData.getTraitBitmap('Beanie')

const ids = bitmapToPunkIds(unionPunkBitmaps([hoodie, beanie]), {
  limit: 100,
})
```

Tail bits above Punk id `9999` are masked out by the helpers.

## Pixel Utilities

Use `indexedPixelsToRgba()` when you already have indexed pixels and palette
bytes:

```ts
import { indexedPixelsToRgba } from '@networked-art/punks-sdk'

const indexed = await punksData.getIndexedPixels(8348)
const palette = await punksData.getPaletteRgbaBytes()
const rgba = indexedPixelsToRgba(indexed, palette)
```

The helper validates the indexed pixel buffer and palette color ids before
expanding to `24 * 24 * 4` RGBA bytes.

## Block Options

Read methods accept `blockNumber`, `blockTag`, and `cache` options:

```ts
await punksData.search(query, { blockTag: 'safe' })
await renderer.getPunkSvg(8348, { blockNumber: 25_044_552n })
await renderer.getPunkSvg(8348, { cache: false })
```

Use either `blockNumber` or `blockTag`, not both. Supported block tags are
`latest`, `earliest`, `pending`, `safe`, and `finalized`.

## Caching

Both clients cache deterministic reads by default. Cache keys include the block
option when supplied.

```ts
punksData.clearCache()
renderer.clearCache()
```

Failed cached reads are evicted automatically, so transient RPC errors can be
retried without clearing the whole client. If you are reading from an unsealed
or actively loading `PunksData` deployment, prefer `{ cache: false }` or clear
the cache after sealing.

## Validation

The SDK validates common inputs before RPC calls:

- Punk ids and token ids must be integers from `0` to `9999`.
- Trait ids, color ids, bitmap word indexes, pixel counts, and color counts
  must stay inside the canonical dataset ranges.
- Renderer flattened PNG backgrounds must be opaque RGBA.
- Hex byte strings must be valid even-length hex.
