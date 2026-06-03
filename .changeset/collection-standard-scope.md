---
'@networked-art/punks-sdk': minor
---

Add an optional `standard` to `createPunksSdk` (and the offline data client) that
scopes curated collections to a single Punk standard.

- When set, only collections of that standard resolve in `text` search; an alias
  of any other standard falls through to a literal trait lookup. The
  `collections` facade (`list` / `get` / `has`) is scoped to match. Left unset,
  every collection resolves — the default, so existing behavior is unchanged.
- `parseSearchText` takes a matching `{ standard }` option.
- The standalone `searchCollections` / `getSearchCollection` exports stay global.
