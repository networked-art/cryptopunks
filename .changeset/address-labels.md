---
'@networked-art/punks-sdk': minor
---

Add `addressLabel` / `addressForLabel` for curated, non-ENS address labels.

- `addressLabel(address)` returns an `AddressLabel` (`{ short, name }`) for a
  known address, or `undefined`. Checksum-insensitive. `short` is the compact
  form for inline display (e.g. `NODE`); `name` is the full name for headings
  and tooltips (e.g. `NODE FOUNDATION`).
- `addressForLabel(text)` is the reverse: it resolves either label form (short
  or full) to its address, case- and punctuation-insensitively — for resolving
  a typed label to an account in search.
- Hand-curated seeds: NODE FOUNDATION and YUGALABS (in `address-labels.ts`).
- Curated-collection institutions are the single source of truth for their own
  label: `CuratedCollectionInstitution` gains an optional `address` (drives the
  label) and an optional `short` (compact badge form, defaulting to the slug
  uppercased). `addressLabel` derives `{ short, name: title }` for any
  institution that declares an `address`. No addresses are bundled yet; add
  verified ones to the institution entries in `search-collections.json`.
