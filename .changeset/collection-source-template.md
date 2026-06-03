---
'@networked-art/punks-sdk': minor
---

Add an optional per-Punk `sourceTemplate` to curated collections, plus `forPunk`
and `matches` lookups for surfacing collections in a UI.

- A collection (or an institution) may set `sourceTemplate` — a URL with an
  `{id}` placeholder (e.g. `https://museumpunks.com/{id}`) — to deep-link a
  single Punk on the curating site. Optional and validated; `source` is
  unchanged.
- `punks.collections.forPunk(id)` returns the collections a Punk belongs to,
  each with the institutions that hold it and a resolved `sourceUrl` (the most
  specific `sourceTemplate` filled with the id, else the institution / collection
  `source`). Ids outside `0..9999` return `[]`.
- `punks.collections.matches(text)` returns every collection (optionally
  narrowed to one institution) whose alias appears anywhere in a phrase, for
  surfacing an explainer alongside a search.
- New `CuratedCollectionMembership` and `CuratedCollectionMatch` types;
  `sourceTemplate?` added to `CuratedCollection` and `CuratedCollectionInstitution`.
