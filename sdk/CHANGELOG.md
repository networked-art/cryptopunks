# @networked-art/punks-sdk

## 0.1.0

### Minor Changes

- [`01edc56`](https://github.com/networked-art/cryptopunks/commit/01edc56d45e0775604b927d43f8309797bb4db9f) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - Add `addressLabel` / `addressForLabel` for curated, non-ENS address labels.
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

- [`65bf873`](https://github.com/networked-art/cryptopunks/commit/65bf87333a5af6e1dc404bf697dc4e715e6f0b27) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - Add an optional per-Punk `sourceTemplate` to curated collections, plus `forPunk`
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

- [`0c4bac3`](https://github.com/networked-art/cryptopunks/commit/0c4bac326985696ffc6a391e67cb0a3108cbf030) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - Add an optional `standard` to `createPunksSdk` (and the offline data client) that
  scopes curated collections to a single Punk standard.
  - When set, only collections of that standard resolve in `text` search; an alias
    of any other standard falls through to a literal trait lookup. The
    `collections` facade (`list` / `get` / `has`) is scoped to match. Left unset,
    every collection resolves — the default, so existing behavior is unchanged.
  - `parseSearchText` takes a matching `{ standard }` option.
  - The standalone `searchCollections` / `getSearchCollection` exports stay global.

- [`37e2007`](https://github.com/networked-art/cryptopunks/commit/37e20072f0b1a4df6583e1926c39e6d3a85d4288) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - Every `ContractWritePlan` now carries a `kind` discriminator.
  - New required `kind: PlanKind` field on `ContractWritePlan`, a string-literal
    union naming every prepared transaction across the canonical market, the
    auction, the vault, the stash, the C721 / legacy / V1 wrappers, and the V1
    market — so a UI can branch on the action without parsing `description`.
  - `PlanKind` is exported alongside the existing action types. Plans built
    through the SDK gain the field automatically.

- [`37e2007`](https://github.com/networked-art/cryptopunks/commit/37e20072f0b1a4df6583e1926c39e6d3a85d4288) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - Add the native bidding surface to `PunksMarketClient`.
  - `bid(punkId)` reads the current `punkBids` entry into a new `PunkMarketBid`
    (`{ punkId, hasBid, bidder, valueWei }`).
  - `enterBid`, `acceptBid`, and `withdrawBid` (each with a `prepare*` variant)
    wrap `enterBidForPunk`, `acceptBidForPunk`, and `withdrawBidForPunk` on the
    canonical `CryptoPunksMarket`.

- [#7](https://github.com/networked-art/cryptopunks/pull/7) [`5510214`](https://github.com/networked-art/cryptopunks/commit/5510214541a31f80c0090e1a83ab4e7fb04b7484) Thanks [@seanbonner](https://github.com/seanbonner)! - Add a curated-collections layer: named, sourced sets of Punk ids that resolve
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

  By [@seanbonner](https://github.com/seanbonner).

- [#8](https://github.com/networked-art/cryptopunks/pull/8) [`691ac11`](https://github.com/networked-art/cryptopunks/commit/691ac11d467d08c9aef5e506d3fa5df36fdcb3f9) Thanks [@seanbonner](https://github.com/seanbonner)! - Add the `museum` curated collection (16 Punks across 6 institutions) with
  searchable per-institution sub-sets.
  - `punks.search({ text: 'museum punks' })` returns the whole institution-held
    set; `search('MOMA')`, `search('zkm')`, `search('museum of modern art')`,
    etc. each resolve to just that institution's Punks.
  - A collection may now nest `institutions`, each independently resolvable. The
    collection's `ids` is the union of its institutions, and the deep-freeze of
    the bundle extends to them. New `CuratedCollectionInstitution` type;
    `punks.collections.get('museum')` includes the `institutions` array.
  - Source data is MoMA, ZKM Karlsruhe, LACMA, Centre Pompidou, ICA Miami, and
    Toledo Museum of Art (museumpunks.com). Two of the museum Punks ([#2838](https://github.com/networked-art/cryptopunks/issues/2838),
    [#5449](https://github.com/networked-art/cryptopunks/issues/5449), both ZKM) are also in the `burned` set.

  By [@seanbonner](https://github.com/seanbonner).

- [#9](https://github.com/networked-art/cryptopunks/pull/9) [`5253171`](https://github.com/networked-art/cryptopunks/commit/5253171d85e9ac09e2b27624bc82825e862d8169) Thanks [@seanbonner](https://github.com/seanbonner)! - Add the `perfect-and-priceless` curated collection: the 24 Punks printed and
  shown in Kate Vass Galerie's 2018-2019 "Perfect & Priceless" exhibition, each
  framed print backed by its seed phrase sealed in an envelope.
  - Resolves under every name the set is known by — `perfect & priceless`,
    `perfect and priceless`, `kate vass`, `kate vass galerie`, `paper punks`,
    `paper`.
  - The collection alias matcher now skips punctuation-only tokens, so the `&`
    spelling of a name matches the same set as the spelled-out form.

  By [@seanbonner](https://github.com/seanbonner).

- [`37e2007`](https://github.com/networked-art/cryptopunks/commit/37e20072f0b1a4df6583e1926c39e6d3a85d4288) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - Add a `@networked-art/punks-sdk/similarity` entry point: an in-memory index
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

- [`37e2007`](https://github.com/networked-art/cryptopunks/commit/37e20072f0b1a4df6583e1926c39e6d3a85d4288) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - `PunksAuction` and its escrow are deployed on mainnet; wire up their addresses
  and round out the auction client.
  - New `PUNKS_AUCTION_ADDRESS` and `PUNKS_AUCTION_ESCROW_ADDRESS` constants.
    `PunksAuctionClient` now defaults to the live address (so `address` is
    optional in config but always set) and adds the deployed reads
    `escrowAddress()`, `punksDataAddress()`, `activeLotFor({ seller, standard,
punkId })`, and `balanceOf(account)`; `vaultFactoryAddress()` now reads
    `VAULTS`.
  - Combined create-and-execute flows `createLotAndAcceptOffer` and
    `createLotAndStartAuction` (mirrored on the SDK facade as `createLotAndAccept`
    / `createLotAndStartAuction`), plus `clearStaleLots(ids)` and `withdraw()` for
    ETH credited after a failed direct payout.
  - `adjustOfferAmount` now takes an absolute `newAmountWei` and reads the current
    offer on-chain to size `msg.value` (previously `{ amountWei, increase }`).
  - New `@networked-art/punks-sdk` `./auction` helpers mirroring the contract:
    the `PUNKS_AUCTION_*` constants (`MAX_LOT_ITEMS`, `MAX_INSTANT_ITEMS`,
    `MAX_OFFER_SLOTS`, `MAX_SLOT_IDS`, `TOTAL_WEIGHT_BPS`, `BID_INCREASE_BPS`,
    `BPS`, `DURATION_SECONDS`, `BIDDING_GRACE_SECONDS`), `minPunksAuctionBidWei`,
    `splitPunksAuctionLotWeights`, `punksAuctionOfferSlotMatchesPunk`,
    `punksAuctionLotMatchesOffer`, `isPunksFilterEmpty`, and the
    `PunksAuctionLotLike` / `PunksAuctionOfferLike` types. Lot and offer builders
    now enforce these bounds.

  Thanks [@yougogirldoteth](https://github.com/yougogirldoteth)!

- [`37e2007`](https://github.com/networked-art/cryptopunks/commit/37e20072f0b1a4df6583e1926c39e6d3a85d4288) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - Add a `PunksVault` client so the EOA controlling a vault can drive
  native-market actions on vaulted Punks without first reclaiming them.
  - New `PUNKS_VAULT_FACTORY_ADDRESS` and `PUNKS_VAULT_FACTORY_START_BLOCK`
    constants for the `PunksVaultFactory` that deploys deterministic per-user
    vault clones.
  - `createPunksVaultClient` / `PunksVaultClient` (and `PunksVaultFacade.at(address)`)
    prepare plans that target the vault and forward to the canonical
    `CryptoPunksMarket` (or any market passed per call): `prepareList` /
    `prepareUnlist`, `prepareTransferPunk`, `prepareAcceptBid`, and
    `prepareWithdrawFromMarket` / `prepareWithdrawFromMarketTo`.
  - New `PunksVaultClientConfig` and `PunksVaultConfig` types.

- [`37e2007`](https://github.com/networked-art/cryptopunks/commit/37e20072f0b1a4df6583e1926c39e6d3a85d4288) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - An unquoted query that exactly names a trait now matches that trait exactly.
  - `punks.search({ text: 'Dark Hair' })` behaves like `"Dark Hair"`: when the
    whole query is the exact name of a trait it folds to that single trait
    instead of fuzzy-matching each word. Partial or compound queries still take
    the substring path.
  - Applied on the filter-compile path (offer slots / onchain criteria) through
    `parseSearchTextWithExactTraitsSync`, so the same text round-trips to the same
    criteria in both search and offers.

  By [@yougogirldoteth](https://github.com/yougogirldoteth).

- [`37e2007`](https://github.com/networked-art/cryptopunks/commit/37e20072f0b1a4df6583e1926c39e6d3a85d4288) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - Numeric search constraints accept spelled-out numbers.
  - `<n> attributes` / `colors` / `pixels` (and the range and comparator forms)
    now accept `zero` through `seven` as words, so `five attributes` parses the
    same as `5 attributes`.

  By [@yougogirldoteth](https://github.com/yougogirldoteth).

- [`37e2007`](https://github.com/networked-art/cryptopunks/commit/37e20072f0b1a4df6583e1926c39e6d3a85d4288) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - Add a folk-synonym layer to search: human phrases rewrite to canonical trait
  search text before the query is compiled.
  - New bundled `search-synonyms.json` maps user-facing phrases (e.g. `velma`,
    `ringo starr`, `sunglasses`) to normal search text, so
    `punks.search({ text: 'sunglasses' })` resolves to `shades`. Multi-word keys
    match greedily (the longest phrase wins) and a quoted term still passes
    through as a literal trait lookup.
  - Exposed as `searchSynonyms` with a `SearchSynonymsMap` type. Synonyms expand
    _after_ curated collections resolve, so collection id sets and trait phrases
    never collide.

  Thanks [@seanbonner](https://github.com/seanbonner)!

- [`37e2007`](https://github.com/networked-art/cryptopunks/commit/37e20072f0b1a4df6583e1926c39e6d3a85d4288) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - Search text and offer criteria now support general trait OR groups.
  - `formatSearchText` emits a general any-of trait mask as a quoted `A OR B`
    list (it previously threw for anything but skin-tone, female / male, or
    attribute-count groups), and rejects only the cases that genuinely cannot
    round-trip (a generic OR list combined with other criteria).
  - The filter compiler folds multiple OR groups into a single any-of trait group
    when each alternative resolves to one trait; offer-slot compilation otherwise
    materializes an explicit id set (capped at 64) when criteria can't compress.
    This fixes curated-collection offer slots, which resolve to id sets.

  By [@yougogirldoteth](https://github.com/yougogirldoteth).
