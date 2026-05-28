---
'@networked-art/punks-sdk': minor
---

Add a folk-synonym layer to search: human phrases rewrite to canonical trait
search text before the query is compiled.

- New bundled `search-synonyms.json` maps user-facing phrases (e.g. `velma`,
  `ringo starr`, `sunglasses`) to normal search text, so
  `punks.search({ text: 'sunglasses' })` resolves to `shades`. Multi-word keys
  match greedily (the longest phrase wins) and a quoted term still passes
  through as a literal trait lookup.
- Exposed as `searchSynonyms` with a `SearchSynonymsMap` type. Synonyms expand
  *after* curated collections resolve, so collection id sets and trait phrases
  never collide.

Thanks [@seanbonner](https://github.com/seanbonner)!
