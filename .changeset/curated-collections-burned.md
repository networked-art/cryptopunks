---
'@networked-art/punks-sdk': minor
---

Add a curated-collections layer: named, sourced sets of Punk ids that resolve
in search and through a lookup API. Ships the on-chain `burned` set (12 Punks)
in a new bundled `search-collections.json`.

- `punks.search({ text: 'burned punks' })` resolves whole-phrase collection
  aliases to their id set via the existing `includeIds` path, composing with
  the rest of the query (`burned alien`, `burned OR alien`). Quoting opts back
  out to a literal trait lookup.
- `punks.collections.list()` / `.get(slug)` / `.has(slug)` expose the sets for
  UI, each with `{ slug, title, description, aliases, source, standard, ids }`.
  Standalone `searchCollections` and `getSearchCollection` are also exported.
- New `CuratedCollection` type. `normalizePunkStandard` and the `PunkStandardRef`
  type are unchanged for consumers (re-exported from their previous module).
