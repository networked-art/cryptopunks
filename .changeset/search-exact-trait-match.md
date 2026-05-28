---
'@networked-art/punks-sdk': minor
---

An unquoted query that exactly names a trait now matches that trait exactly.

- `punks.search({ text: 'Dark Hair' })` behaves like `"Dark Hair"`: when the
  whole query is the exact name of a trait it folds to that single trait
  instead of fuzzy-matching each word. Partial or compound queries still take
  the substring path.
- Applied on the filter-compile path (offer slots / onchain criteria) through
  `parseSearchTextWithExactTraitsSync`, so the same text round-trips to the same
  criteria in both search and offers.

By [@yougogirldoteth](https://github.com/yougogirldoteth).
