---
'@networked-art/punks-sdk': minor
---

Add a `@networked-art/punks-sdk/similarity` entry point: an in-memory index
that scores how alike two Punks are and surfaces look-alikes and
recommendations from a set of likes and dislikes.

- `createPunksSimilarity` / `PunkSimilarityIndex` build over the offline
  dataset (optionally including per-pixel data). `score(a, b)` returns a 0–1
  score, `components(a, b)` its breakdown across type, head, accessories,
  colors, scalar traits, and (when available) pixels, and `explain(a, b)` the
  shared / only-A / only-B traits and colors plus per-axis scalar deltas behind
  that score.
- `similar(punkId, options)` ranks the rest of the collection; `recommend({
  liked, disliked, ... })` blends multiple seeds with a dislike penalty. Both
  take a `profile` (`balanced` | `traits` | `visual` | `colors`) or explicit
  `weights`, plus `filter` / `excludeIds` / `includeSelf` / `limit` /
  `minScore` / `diversify`.
- New types: `PunkSimilarityProfile`, `PunkSimilarityComponents`,
  `PunkSimilarityWeights`, `PunkSimilarityOptions`,
  `PunkSimilarityRecommendOptions`, `PunkSimilarityResult`,
  `PunkSimilarityScalarDelta`, `PunkSimilarityExplanation`, and
  `PunksSimilarityConfig`.
