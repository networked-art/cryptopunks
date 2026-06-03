---
'@networked-art/punks-sdk': minor
---

Add the `museum` curated collection (16 Punks across 6 institutions) with
searchable per-institution sub-sets.

- `punks.search({ text: 'museum punks' })` returns the whole institution-held
  set; `search('MOMA')`, `search('zkm')`, `search('museum of modern art')`,
  etc. each resolve to just that institution's Punks.
- A collection may now nest `institutions`, each independently resolvable. The
  collection's `ids` is the union of its institutions, and the deep-freeze of
  the bundle extends to them. New `CuratedCollectionInstitution` type;
  `punks.collections.get('museum')` includes the `institutions` array.
- Source data is MoMA, ZKM Karlsruhe, LACMA, Centre Pompidou, ICA Miami, and
  Toledo Museum of Art (museumpunks.com). Two of the museum Punks (#2838,
  #5449, both ZKM) are also in the `burned` set.

By [@seanbonner](https://github.com/seanbonner).
