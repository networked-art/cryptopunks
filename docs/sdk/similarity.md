# Similarity

The similarity scorer is a pure TypeScript exact-scan index for the fixed
10,000 CryptoPunks collection. It uses the bundled local dataset, so it does
not need RPC or an approximate-nearest-neighbor dependency.

```ts
import { createPunksSimilarity } from '@networked-art/punks-sdk/similarity'

const similarity = createPunksSimilarity()

const score = similarity.score(8348, 7804)
const matches = similarity.similar(8348, { limit: 12 })
```

Every component is normalized to `0..1`. The default `balanced` profile
combines normalized type, head variant, rarity-weighted accessories,
rarity-weighted palette overlap, and scalar closeness for pixel count, color
count, and attribute count.

## Find Similar Punks

```ts
const matches = similarity.similar(8348, {
  limit: 12,
  minScore: 0.45,
  excludeIds: [7861],
})

for (const match of matches) {
  match.punkId
  match.score
  match.components.accessories
}
```

`similar()` scans exact candidates, sorts by score descending, and breaks ties
by ascending Punk ID. Self matches are excluded by default; pass
`includeSelf: true` when you need them.

## Filter Recommendations

Use the same `PunkQuery` shape as SDK search to constrain candidates:

```ts
const zombieMatches = similarity.similar(8348, {
  filter: {
    type: 'Zombie',
    attributes: { anyOf: ['Hoodie', 'Beanie'] },
  },
  limit: 20,
})
```

Recommendations average similarity to liked Punks and subtract a configurable
penalty for disliked Punks. Liked and disliked IDs are excluded from the output
unless `includeSelf` is set.

```ts
const picks = similarity.recommend({
  liked: [8348, 7804],
  disliked: [1234],
  filter: { attributes: { required: ['Hoodie'] } },
  limit: 20,
  dislikedPenalty: 0.4,
  diversify: true,
})
```

## Explain A Match

`explain()` returns structured data for UI and debugging:

```ts
const explanation = similarity.explain(8348, 7861)

explanation.score
explanation.components
explanation.accessories.shared.map((trait) => trait.name)
explanation.colors.shared.map((color) => color.rgba)
explanation.scalars.pixelCount.delta
explanation.normalizedWeights
```

Profiles rebalance the same components:

```ts
similarity.similar(8348, { profile: 'traits' })
similarity.similar(8348, { profile: 'colors' })
```

Custom weights can override a profile:

```ts
similarity.similar(8348, {
  weights: {
    accessories: 0.6,
    colors: 0.25,
  },
})
```

## Visual Profile

The `visual` profile adds pixel-level indexed-color similarity when the
optional pixel bundle is supplied. Without pixel data, visual scoring falls
back to the available non-pixel components.

```ts
import { createPunksSimilarity } from '@networked-art/punks-sdk/similarity'
import { bundledOfflinePunksDataWithPixels } from '@networked-art/punks-sdk/offline-pixel-data'

const visualSimilarity = createPunksSimilarity({
  dataset: bundledOfflinePunksDataWithPixels,
})

const visualMatches = visualSimilarity.similar(8348, {
  profile: 'visual',
  limit: 12,
})
```
