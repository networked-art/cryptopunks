---
'@networked-art/punks-sdk': minor
---

Search text and offer criteria now support general trait OR groups.

- `formatSearchText` emits a general any-of trait mask as a quoted `A OR B`
  list (it previously threw for anything but skin-tone, female / male, or
  attribute-count groups), and rejects only the cases that genuinely cannot
  round-trip (a generic OR list combined with other criteria).
- The filter compiler folds multiple OR groups into a single any-of trait group
  when each alternative resolves to one trait; offer-slot compilation otherwise
  materializes an explicit id set (capped at 64) when criteria can't compress.
  This fixes curated-collection offer slots, which resolve to id sets.

By [@yougogirldoteth](https://github.com/yougogirldoteth).
