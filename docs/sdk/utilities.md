# Utilities And Caching

The SDK exports contract constants, ABIs, pure bitmap helpers, pixel helpers,
text-search parsing, mask helpers, and shared read options for block-scoped
reads.

## Constants And ABIs

Use exported addresses, ENS names, and ABIs when you want direct viem reads:

```ts
import {
  // Sealed Punks data + renderer
  PUNKS_DATA_ADDRESS,
  PUNKS_DATA_ENS,
  PUNKS_DATA_DATASET_HASH,
  PUNKS_RENDERER_ADDRESS,
  PUNKS_RENDERER_ENS,
  // Canonical markets and data
  CRYPTOPUNKS_MARKET_ADDRESS,
  CRYPTOPUNKS_V1_ADDRESS,
  CRYPTOPUNKS_DATA_ADDRESS,
  PUNKS_V1_MARKET_ADDRESS,
  PUNKS_V1_MARKET_ENS,
  // Wrappers and Stash
  WRAPPED_PUNKS_ADDRESS,
  CRYPTOPUNKS_721_ADDRESS,
  STASH_FACTORY_ADDRESS,
  ZERO_ADDRESS,
  // ABIs
  punksDataAbi,
  punksDataReadAbi,
  punksRendererAbi,
  punksRendererReadAbi,
  legacyCryptoPunksDataAbi,
  cryptoPunksMarketAbi,
  cryptoPunks721Abi,
  wrappedPunksAbi,
  stashFactoryAbi,
  stashAbi,
  punksAuctionAbi,
  punksV1MarketAbi,
  punkVaultAbi,
  punkVaultFactoryAbi,
} from '@networked-art/punks-sdk'
```

The package also exports dataset and enum constants for low-level integrations:

```ts
import {
  // Dataset shape
  PUNK_COUNT,
  PUNK_WIDTH,
  PUNK_HEIGHT,
  PIXELS_PER_PUNK,
  TRAIT_COUNT,
  PALETTE_SIZE,
  // Bitmap layout
  BITMAP_WORD_COUNT,
  PUNKS_PER_BITMAP_WORD,
  FULL_BITMAP_WORD,
  LAST_BITMAP_WORD_BITS,
  LAST_BITMAP_WORD_MASK,
  // Validation ranges
  PIXEL_COUNT_MIN,
  PIXEL_COUNT_MAX,
  COLOR_COUNT_MIN,
  COLOR_COUNT_MAX,
  CANONICAL_TRAIT_MASK,
  CANONICAL_COLOR_MASK,
  // Enums and name tables
  PunkType,
  PunkStandard,
  HeadVariant,
  SkinTone,
  TraitKind,
  punkTypeNames,
  headVariantNames,
  skinToneNames,
  traitKindNames,
  skinToneHeadVariants,
} from '@networked-art/punks-sdk'
```

## Bitmap Utilities

The bitmap helpers operate on `Uint32Array` Punk bitsets. They still accept
external `bigint[]` 256-bit-word bitmaps, which is useful when adapting raw
contract bitmap words:

```ts
import {
  bitmapToPunkIds,
  clonePunkBitmap,
  countPunkBitmap,
  emptyPunkBitmap,
  fullPunkBitmap,
  intersectPunkBitmaps,
  invertPunkBitmap,
  normalizePunkBitmap,
  punkBitmapFromIds,
  punkBitmapHasId,
  punkBitmapWord,
  punkBitmapsEqual,
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

const firstContractWord = punkBitmapWord(hoodie, 0)
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

## Text Search Parsing

The same parser that backs `query.text` is exported for UI use — autocompletion,
quoted-phrase highlighting, or round-tripping between a query object and a
text input:

```ts
import {
  parseSearchText,
  tokenizeSearchText,
  formatSearchText,
  compilePunksFilter,
} from '@networked-art/punks-sdk'

const parsed = parseSearchText('zombie hoodie -1234 <=4 colors')

// `formatSearchText` inverts a placed bid's compiled criteria back into search
// text. It and the compiler both take the offline dataset that resolves trait
// names (here `punks.dataset.source`).
const text = formatSearchText(punks.dataset.source, {
  criteria: compilePunksFilter(punks.dataset.source, {
    type: 'Zombie',
    colorCount: { max: 4 },
  }),
})
```

## Query Compilation

The query → `Punks.Filter` compiler is exported for direct use without the
auction client:

```ts
import {
  compileOfferSlot,
  compilePunksFilter,
  emptyPunksFilter,
  normalizePunkStandard,
  toOfflineSearchQuery,
} from '@networked-art/punks-sdk'
```

`compilePunksFilter` produces a single `Punks.Filter`; `compileOfferSlot`
returns the full slot shape (filter plus include/exclude ids).

## Mask Helpers And Errors

Low-level mask, hex, and validation helpers are exported for integrations
that need raw onchain shapes:

```ts
import {
  PunksDataSdkError,
  PunksDataValidationError,
  idsFromMask,
  maskFromIds,
  bytesToHex,
  hexToBytes,
  normalizeRgbaHex,
  rgbaHexToParts,
  validateBitmapWordIndex,
  validateColorCount,
  validateColorCriteriaMasks,
  validateColorId,
  validateColorMask,
  validateCoordinate,
  validatePixelCount,
  validatePunkId,
  validateTraitCriteriaMasks,
  validateTraitId,
  validateTraitMask,
} from '@networked-art/punks-sdk'
```

`PunksDataSdkError` covers SDK-internal failures; `PunksDataValidationError`
wraps everything thrown from input validation.

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
retried without clearing the whole client.

## Validation

The SDK validates common inputs before RPC calls:

- Punk ids and token ids must be integers from `0` to `9999`.
- Trait ids, color ids, bitmap word indexes, pixel counts, and color counts
  must stay inside the canonical dataset ranges.
- Renderer flattened PNG backgrounds must be opaque RGBA.
- Hex byte strings must be valid even-length hex.
