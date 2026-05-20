# Punk Data Contracts

The SDK has three data surfaces with different jobs.

## Choosing The Right Surface

Use `punks.dataset` for local application work: search, facets, trait
catalogs, palette reads, and summaries. It uses the canonical search dataset
bundled with the package and does not require RPC. Rendering previews and
indexed pixels use the separate optional pixel bundle.

Use `punks.data.contract` or `punks.data.onchain` when you need exact reads
from this repo's `PunksData` deployment.

Use `punks.data.legacy` when you need the original Larva Labs
`CryptopunksData` SVG or CSV strings.

## Local Dataset

```ts
const ids = punks.search({
  type: 'Zombie',
  attributes: { required: ['Hoodie'] },
})

const punk = punks.get(8348, { includeTraits: true })
const palette = punks.dataset.palette({ includeSupplies: true })
```

Pass the pixel bundle when you need local indexed pixels:

```ts
import { createPunksSdk } from '@networked-art/punks-sdk'
import { bundledOfflinePunksDataWithPixels } from '@networked-art/punks-sdk/offline-pixel-data'

const punks = createPunksSdk({ dataset: bundledOfflinePunksDataWithPixels })
const indexedPixels = punks.dataset.indexedPixels(8348)
```

## `PunksData`

`punks.data.contract` and `punks.data.onchain` are aliases for the same
`PunksDataClient`.

```ts
const hash = await punks.data.contract.datasetHash()
const trait = await punks.data.contract.traitName(62)
const pixels = await punks.data.contract.indexedPixelsOf(8348)

// Raw mask-based predicate that mirrors `PunksData`:
const matches = await punks.data.contract.hasTraits(
  8348,
  requiredMask,
  forbiddenMask,
  anyOfMask,
)

// Convenience that takes name arrays and resolves masks for you:
const matchesByName = await punks.data.contract.matchesTraitCriteria(8348, {
  required: ['Hoodie'],
  forbidden: ['Cigarette'],
})
```

## Legacy CryptopunksData

```ts
const svg = await punks.data.legacy.punkImageSvg(8348)
const csv = await punks.data.legacy.punkAttributes(8348)
```

The legacy contract is useful for compatibility with older integrations. For
new filtering, rendering, and trait work, prefer the local dataset or
`PunksData`.
