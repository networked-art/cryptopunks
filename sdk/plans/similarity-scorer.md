# CryptoPunks Similarity Scorer Plan

## Goal

Build a pure TypeScript, exact-scoring similarity package for the SDK, exported as an independent subpath:

```ts
import { createPunksSimilarity } from '@networked-art/punks-sdk/similarity'
```

The first version should avoid ANN/vector dependencies such as `usearch`. CryptoPunks is a fixed 10,000-item collection, and the SDK already has compact local trait, color, scalar, bitmap, and optional pixel data. Exact scoring should be fast enough, deterministic, explainable, browser-friendly, and easier to tune.

## Public API

Expose these primary methods:

```ts
const similarity = createPunksSimilarity()

similarity.score(8348, 7804)
similarity.explain(8348, 7804)
similarity.similar(8348, { limit: 12 })
similarity.recommend({ liked: [8348, 7804], disliked: [1234], limit: 20 })
```

Suggested core types:

```ts
type PunkSimilarityResult = {
  punkId: number
  score: number
  components: PunkSimilarityComponents
}

type PunkSimilarityComponents = {
  type: number
  head: number
  accessories: number
  colors: number
  scalars: number
  pixels?: number
}

type PunkSimilarityOptions = {
  profile?: 'balanced' | 'traits' | 'visual' | 'colors'
  weights?: Partial<PunkSimilarityWeights>
  filter?: PunkQuery
  excludeIds?: Iterable<number>
  includeSelf?: boolean
  limit?: number
  minScore?: number
  diversify?: boolean
}
```

## Scoring Model

Start with an explainable deterministic model. Every component should normalize to `0..1`.

- `type`: exact normalized Punk type match.
- `head`: exact head variant match, with possible partial score for same broader type family.
- `accessories`: rarity-weighted Jaccard over accessory traits only.
- `colors`: weighted Jaccard over palette color IDs, excluding transparent/background where appropriate.
- `scalars`: closeness across `pixelCount`, `colorCount`, and `attributeCount`.
- `pixels`: optional visual similarity only when pixel data is loaded.

Default `balanced` weights:

```ts
{
  type: 0.18,
  head: 0.12,
  accessories: 0.38,
  colors: 0.18,
  scalars: 0.14,
}
```

Optional profiles can rebalance these:

- `traits`: emphasize type, head, and accessories.
- `visual`: add or increase `pixels` when `offline-pixel-data` is supplied.
- `colors`: emphasize palette overlap and scalar visual shape.
- `balanced`: default general recommendation behavior.

## Files

Add:

- `sdk/src/similarity.ts`
- `sdk/test/similarity.test.mjs`
- `docs/sdk/similarity.md`

Update:

- `sdk/package.json`: add `./similarity` export.
- `sdk/src/index.ts`: optionally re-export public types/helpers, while keeping the subpath independently usable.
- `sdk/test-d/public-api.test.ts`: assert public types compile.
- `docs/sdk.md`: link the new page.

## Implementation Checklist

1. Build `PunkSimilarityIndex`.
   - Accept the same dataset config pattern as `PunksDataset`.
   - Cache all 10,000 summaries once with `dataset.getMany()`.
   - Keep construction synchronous, matching existing local SDK surfaces.

2. Precompute trait metadata.
   - Split trait IDs by `TraitKind`.
   - Keep normalized type, head variant, attribute-count, and accessory groups separate.
   - Calculate rarity weights from `trait.supply`.
   - Keep color supplies available for optional rarity-weighted color scoring.

3. Implement pair scoring.
   - Validate both Punk IDs.
   - Compute all component scores.
   - Normalize final weighted score to `0..1`.
   - Keep scoring symmetric: `score(a, b) === score(b, a)`.

4. Implement candidate ranking.
   - `similar(punkId, options)` should exact-scan candidates.
   - Use `dataset.bitmap(options.filter)` when a filter is provided.
   - Apply `excludeIds`, `includeSelf`, `minScore`, and `limit`.
   - Sort by score descending, then `punkId` ascending for deterministic ties.

5. Implement explanation.
   - Include component scores and final score.
   - Include shared accessories, differing accessories, shared colors, scalar deltas, and profile/weight details.
   - Keep the explanation data structured, not prose-only.

6. Implement recommendations.
   - Score each candidate by averaging similarity to liked Punks.
   - Subtract a configurable penalty for similarity to disliked Punks.
   - Support the same filters and exclusions as `similar`.
   - Add optional MMR-style diversification so recommendations are not all near-duplicates.

7. Add tests.
   - Score bounds are always `0..1`.
   - Scoring is deterministic and symmetric.
   - Self matches behave according to `includeSelf`.
   - Filters constrain candidate sets.
   - `minScore`, `limit`, and `excludeIds` work.
   - Explanations contain expected shared traits/colors.
   - Profile weights change ordering or component totals as expected.
   - Visual profile handles missing pixel data gracefully.

8. Add docs.
   - Find similar Punks.
   - Filter recommendations to a query, for example listed Zombies or Hoodies.
   - Explain why two Punks match.
   - Use visual mode with `offline-pixel-data`.

## Deferred Work

- Do not add clustering in the first pass.
- Do not add `usearch`, FAISS, HNSW, or other ANN dependencies in the first pass.
- Do not precompute or ship neighbor graphs until scoring behavior feels right.
- Later clustering can be built from exact pair scores or a precomputed top-k graph without changing the first public API.
