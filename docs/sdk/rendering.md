# SDK: Rendering And Metadata

Use `PunksRendererClient` when you want renderer contract outputs: SVG,
PNG-8, RGBA bytes, marketplace backgrounds, metadata JSON, or ERC721-style
token URIs.

```ts
import { createPunksRendererClient } from '@networked-art/punks-sdk'

const renderer = createPunksRendererClient({ publicClient })
```

The client defaults to the canonical mainnet renderer. Pass `address` when
reading another renderer deployment:

```ts
const renderer = createPunksRendererClient({
  publicClient,
  address: '0x...',
})
```

## Image Outputs

Default and marketplace-aware SVG methods return strings:

```ts
const svg = await renderer.getPunkSvg(8348)
const marketSvg = await renderer.getPunkMarketplaceSvg(8348)
```

PNG methods return `Uint8Array`:

```ts
const transparentPng = await renderer.getPunkPng(8348)
const flattenedPng = await renderer.getPunkPngWithBackground(8348, '#638596')
const marketplacePng = await renderer.getPunkMarketplacePng(8348)
```

`getPunkPngWithBackground()` accepts RGB or RGBA hex and requires an opaque
alpha channel. `#638596` is normalized to `0x638596ff`.

Use raw RGBA bytes when a canvas or image pipeline wants expanded pixels:

```ts
const rgba = await renderer.getPunkImage(8348)
```

## Marketplace Backgrounds

`getBackground()` reads the renderer's marketplace-aware background selection:

```ts
const background = await renderer.getBackground(8348)
```

The package exports the known renderer background constants:

```ts
import {
  PUNKS_RENDERER_BACKGROUND_DEFAULT,
  PUNKS_RENDERER_BACKGROUND_FOR_SALE,
  PUNKS_RENDERER_BACKGROUND_BID,
  PUNKS_RENDERER_BACKGROUND_WRAPPED,
  PUNKS_RENDERER_BACKGROUND_C721_WRAPPED,
} from '@networked-art/punks-sdk'
```

## Metadata

The renderer exposes raw JSON, parsed JSON, CSV attributes, and token URI
metadata:

```ts
const attributesCsv = await renderer.getPunkAttributes(8348)
const metadataJson = await renderer.getMetadataJson(8348)
const metadata = await renderer.getPunkMetadata(8348)
const tokenURI = await renderer.getTokenURI(8348)
```

`getPunkMetadata()` parses `metadataJson()` locally and returns the package's
`PunkMetadata` type.

## Dependency Checks

Use dependency reads to verify a renderer deployment before trusting outputs:

```ts
const dataAddress = await renderer.getDataContract()
const punksData = await renderer.getPunksDataAddress()
const marketAddress = await renderer.getPunksMarketAddress()
const wrapper = await renderer.getWrapperAddress()
const c721Wrapper = await renderer.getC721WrapperAddress()
```

`getDataContract()` and `getPunksDataAddress()` should agree for this renderer.
For canonical reads, pair this with `PunksDataClient.assertCanonicalDataset()`.
