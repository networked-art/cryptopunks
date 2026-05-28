# Data And Search

The root SDK searches the bundled canonical search dataset locally. It uses
the same bitmap data sealed into `PunksData`, but the application API is
shaped around collection queries rather than contract getters. Compressed
indexed pixels live in a separate optional bundle so search-only apps do not
load render data.

```ts
import { createPunksSdk } from '@networked-art/punks-sdk'

const punks = createPunksSdk()
```

## Search

```ts
const ids = punks.search({
  text: 'zombie mohawk OR ape "3d glasses"',
  type: ['Zombie', 'Ape'],
  attributes: {
    anyOf: ['Hoodie', 'Beanie'],
    forbidden: ['Cigarette'],
  },
  colorCount: { max: 4 },
  sort: 'rarity',
  limit: 50,
})
```

Available dimensions:

- `text`
- `type` (alias `punkType`)
- `head` (alias `headVariant`)
- `skinTone` — selects the four human head-variant slots: `Dark`, `Brown`,
  `Fair`, `Albino`. Aliens, Apes, and Zombies are never selected by a skin
  tone.
- `attributes` — `required`, `forbidden`, `anyOf`
- `colors` — `required`, `forbidden`, `anyOf`
- `pixelCount`, `colorCount`, `attributeCount` — number or `{ eq, min, max }`
- `ids` / `excludeIds`
- `sort` — `id`, `rarity`, `pixelCount`, `colorCount`, `attributeCount`, each
  with a `-desc` variant
- `offset`, `limit`

Use `count()` and `facets()` for result counts and filter UIs:

```ts
const total = punks.count({ type: 'Alien' })
const facets = punks.facets({ text: 'mohawk' })
```

Text search also expands a small offchain synonym map before matching canonical
traits. Folk names such as `marilyn`, `covid`, `claude`, `mr t`,
`ringo starr`, and `helena bonham carter` are mapped to normal search text like
`"medical mask"` or `female "blonde bob" "hot lipstick"`. The map lives at
`sdk/src/search-synonyms.json` as simple
key/value JSON so it can be extended by PR.

## Dataset Reads

Use `dataset` for canonical collection data:

```ts
const punk = punks.dataset.get(8348, {
  includeTraits: true,
  includeColors: true,
})

const traits = punks.dataset.traits()
const hoodie = punks.dataset.trait('Hoodie')
const palette = punks.dataset.palette({ includeSupplies: true })
```

`punks.dataset.indexedPixels(punkId)` requires the pixel bundle. Pass
`bundledOfflinePunksDataWithPixels` from
`@networked-art/punks-sdk/offline-pixel-data` to `createPunksSdk` to enable it.

## Offer Slot Compilation

Offer slots use the same query language where the query can be represented by
the onchain `Punks.Filter` struct:

```ts
const slot = punks.offers.slot({
  query: {
    type: 'Zombie',
    attributes: { anyOf: ['Hoodie', 'Beanie'] },
    colorCount: { max: 4 },
  },
})
```

Text search, pagination, and sorting are local-only. If an offer needs a
materialized basket, pass `includeIds` and `excludeIds`.

## Low-Level Data Contract

`punks.contracts.data` is `undefined` unless `createPunksSdk` was given a
`publicClient`. Configure one to access exact `PunksData` reads:

```ts
const punks = createPunksSdk({ publicClient })

await punks.contracts.data?.assertCanonicalDataset()
await punks.contracts.data?.getTraitName(62)
await punks.contracts.data?.search({ attributes: { required: ['Hoodie'] } })
```
