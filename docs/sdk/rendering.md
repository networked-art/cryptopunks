# SDK: Rendering And Metadata

`punks.render` is a pure TypeScript renderer backed by the bundled canonical
indexed pixels and palette.

```ts
const svg = punks.render.svg(8348)
const png = punks.render.png(8348)
const rgba = punks.render.rgba(8348)
const metadata = punks.render.metadata(8348)
const tokenUri = punks.render.tokenUri(8348)
```

The default background is the classic CryptoPunks blue. Use a transparent or
custom background when needed:

```ts
punks.render.svg(8348, { background: 'transparent' })
punks.render.png(8348, { background: '#ffffff' })
```

Data URI helpers are available for browser and metadata usage:

```ts
const svgUri = punks.render.svgDataUri(8348)
const pngUri = punks.render.pngDataUri(8348)
```

## Onchain Renderer

Use the contract renderer only when you specifically need exact onchain output
or marketplace-aware background reads:

```ts
const punks = createPunksSdk({ publicClient })

const onchainSvg = await punks.contracts.renderer?.getPunkSvg(8348)
const marketSvg = await punks.contracts.renderer?.getPunkMarketplaceSvg(8348)
const background = await punks.contracts.renderer?.getBackground(8348)
```

The package exports the known onchain renderer background constants:

```ts
import {
  PUNKS_RENDERER_BACKGROUND_DEFAULT,
  PUNKS_RENDERER_BACKGROUND_FOR_SALE,
  PUNKS_RENDERER_BACKGROUND_BID,
  PUNKS_RENDERER_BACKGROUND_WRAPPED,
  PUNKS_RENDERER_BACKGROUND_C721_WRAPPED,
} from '@networked-art/punks-sdk'
```
