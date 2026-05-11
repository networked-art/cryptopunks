# SDK: Data And Search

The root SDK searches the bundled canonical dataset locally. It uses the same
bitmap data sealed into `PunksData`, but the application API is shaped around
collection queries rather than contract getters.

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
- `type`
- `head`
- `attributes`
- `colors`
- `pixelCount`
- `colorCount`
- `attributeCount`
- `ids` / `excludeIds`
- `sort`, `offset`, `limit`

Use `count()` and `facets()` for result counts and filter UIs:

```ts
const total = punks.count({ type: 'Alien' })
const facets = punks.facets({ text: 'mohawk' })
```

## Dataset Reads

Use `dataset` for canonical collection data:

```ts
const punk = punks.dataset.get(8348, {
  includeTraits: true,
  includeColors: true,
  includePixels: true,
})

const traits = punks.dataset.traits()
const hoodie = punks.dataset.trait('Hoodie')
const palette = punks.dataset.palette({ includeSupplies: true })
const indexedPixels = punks.dataset.indexedPixels(8348)
```

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

Configure a `publicClient` to access exact `PunksData` reads:

```ts
const punks = createPunksSdk({ publicClient })

await punks.contracts.data?.assertCanonicalDataset()
await punks.contracts.data?.getTraitName(62)
await punks.contracts.data?.search({ attributes: { required: ['Hoodie'] } })
```
