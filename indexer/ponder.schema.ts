import { index, onchainTable, primaryKey } from 'ponder'

// Current state for each normal CryptoPunk (id 0..9999). `owner` is the
// user-facing owner: when wrapped, the ERC-721 owner; otherwise the native V2
// CryptoPunks owner. V1 current state is tracked separately in `v1_punks`.
export const punk = onchainTable(
  'punks',
  (t) => ({
    punk_id: t.bigint().primaryKey(),
    owner: t.hex().notNull(),
    native_owner: t.hex(),
    native_standard: t.text().notNull(),
    is_wrapped: t.boolean().notNull(),
    wrapper: t.text(),
    assigned_to: t.hex(),
    last_transfer_at: t.bigint(),
    last_sale_wei: t.bigint(),
    updated_at: t.bigint().notNull(),
    block_number: t.bigint().notNull(),
  }),
  (table) => ({
    ownerIdx: index('punk_owner_idx').on(table.owner),
    wrappedOwnerIdx: index('punk_wrapped_owner_idx').on(
      table.is_wrapped,
      table.owner,
    ),
    wrapperIdx: index('punk_wrapper_idx').on(table.wrapper),
    nativeStandardIdx: index('punk_native_standard_idx').on(
      table.native_standard,
    ),
  }),
)

// Current state for each V1 Punk. `owner` is the public owner: native V1 owner
// while unwrapped, ERC-721 owner while wrapped by the V1 wrapper.
export const v1Punk = onchainTable(
  'v1_punks',
  (t) => ({
    punk_id: t.bigint().primaryKey(),
    owner: t.hex(),
    native_owner: t.hex(),
    is_wrapped: t.boolean().notNull(),
    wrapper: t.text(),
    assigned_to: t.hex(),
    last_transfer_at: t.bigint(),
    last_sale_wei: t.bigint(),
    updated_at: t.bigint().notNull(),
    block_number: t.bigint().notNull(),
  }),
  (table) => ({
    ownerIdx: index('v1_punk_owner_idx').on(table.owner),
    wrappedOwnerIdx: index('v1_punk_wrapped_owner_idx').on(
      table.is_wrapped,
      table.owner,
    ),
    nativeOwnerIdx: index('v1_punk_native_owner_idx').on(table.native_owner),
    wrapperIdx: index('v1_punk_wrapper_idx').on(table.wrapper),
  }),
)

// Per-EOA registry. Populated whenever an address shows up in an event (V1/V2
// market, wrappers, PunksMarket bids, etc.). `vault` / `stash` are the
// deterministic per-user contract addresses read from `PunksVaultFactory.
// predictVault` and `StashFactory.stashAddressFor` — populated on first sight
// at or after the vault factory's deploy block. Earlier sightings store the
// address with `vault` / `stash` NULL; the next post-deploy sighting backfills
// them. `user_proxy` is set from `WrappedPunks:ProxyRegistered`. The vault /
// stash / user_proxy columns are individually indexed for fast reverse lookup
// (vault address → owner EOA), which powers profile-URL canonicalization.
export const account = onchainTable(
  'accounts',
  (t) => ({
    address: t.hex().primaryKey(),
    vault: t.hex(),
    stash: t.hex(),
    user_proxy: t.hex(),
    first_seen_at: t.bigint().notNull(),
    updated_at: t.bigint().notNull(),
  }),
  (table) => ({
    vaultIdx: index('account_vault_idx').on(table.vault),
    stashIdx: index('account_stash_idx').on(table.stash),
    proxyIdx: index('account_user_proxy_idx').on(table.user_proxy),
  }),
)

// Native V2 marketplace listings (PunkOffered / PunkNoLongerForSale). One row
// per Punk; updated in place as listings come and go.
export const listing = onchainTable(
  'listings',
  (t) => ({
    punk_id: t.bigint().primaryKey(),
    seller: t.hex().notNull(),
    min_value_wei: t.bigint().notNull(),
    only_sell_to: t.hex(),
    active: t.boolean().notNull(),
    tx_hash: t.hex().notNull(),
    block_number: t.bigint().notNull(),
    log_index: t.integer().notNull(),
    timestamp: t.bigint().notNull(),
    updated_at: t.bigint().notNull(),
  }),
  (table) => ({
    sellerIdx: index('listing_seller_idx').on(table.seller),
    activeIdx: index('listing_active_idx').on(table.active),
  }),
)

// Native V1 marketplace listings. Kept separate from V2 listings because both
// contracts use punk ids 0..9999 and can have independent market state.
export const v1Listing = onchainTable(
  'v1_listings',
  (t) => ({
    punk_id: t.bigint().primaryKey(),
    seller: t.hex().notNull(),
    min_value_wei: t.bigint().notNull(),
    only_sell_to: t.hex(),
    active: t.boolean().notNull(),
    tx_hash: t.hex().notNull(),
    block_number: t.bigint().notNull(),
    log_index: t.integer().notNull(),
    timestamp: t.bigint().notNull(),
    updated_at: t.bigint().notNull(),
  }),
  (table) => ({
    sellerIdx: index('v1_listing_seller_idx').on(table.seller),
    activeIdx: index('v1_listing_active_idx').on(table.active),
  }),
)

// Native V2 marketplace per-Punk bids. One row per Punk reflecting the
// currently outstanding bid (matches the contract, which only allows one).
export const punkBid = onchainTable(
  'punk_bids',
  (t) => ({
    punk_id: t.bigint().primaryKey(),
    bidder: t.hex().notNull(),
    value_wei: t.bigint().notNull(),
    active: t.boolean().notNull(),
    tx_hash: t.hex().notNull(),
    block_number: t.bigint().notNull(),
    log_index: t.integer().notNull(),
    timestamp: t.bigint().notNull(),
    updated_at: t.bigint().notNull(),
  }),
  (table) => ({
    bidderIdx: index('punk_bid_bidder_idx').on(table.bidder),
    activeIdx: index('punk_bid_active_idx').on(table.active),
  }),
)

// Native V1 marketplace per-Punk bids.
export const v1PunkBid = onchainTable(
  'v1_punk_bids',
  (t) => ({
    punk_id: t.bigint().primaryKey(),
    bidder: t.hex().notNull(),
    value_wei: t.bigint().notNull(),
    active: t.boolean().notNull(),
    tx_hash: t.hex().notNull(),
    block_number: t.bigint().notNull(),
    log_index: t.integer().notNull(),
    timestamp: t.bigint().notNull(),
    updated_at: t.bigint().notNull(),
  }),
  (table) => ({
    bidderIdx: index('v1_punk_bid_bidder_idx').on(table.bidder),
    activeIdx: index('v1_punk_bid_active_idx').on(table.active),
  }),
)

// PunksMarket collection bids. Predicates are decomposed into side tables for
// fast SQL queries; JSON columns preserve the raw payload for clients.
export const marketBid = onchainTable(
  'market_bids',
  (t) => ({
    bid_id: t.bigint().primaryKey(),
    bidder: t.hex().notNull(),
    bid_wei: t.bigint().notNull(),
    settlement_wei: t.bigint().notNull(),
    active: t.boolean().notNull(),
    accepted_punk_id: t.bigint(),
    required_trait_mask: t.bigint().notNull(),
    forbidden_trait_mask: t.bigint().notNull(),
    any_of_trait_mask: t.bigint().notNull(),
    required_color_mask: t.bigint().notNull(),
    forbidden_color_mask: t.bigint().notNull(),
    any_of_color_mask: t.bigint().notNull(),
    min_pixel_count: t.integer().notNull(),
    max_pixel_count: t.integer().notNull(),
    min_color_count: t.integer().notNull(),
    max_color_count: t.integer().notNull(),
    has_include_ids: t.boolean().notNull(),
    criteria_json: t.text().notNull(),
    include_ids_json: t.text().notNull(),
    exclude_ids_json: t.text().notNull(),
    tx_hash: t.hex().notNull(),
    block_number: t.bigint().notNull(),
    log_index: t.integer().notNull(),
    timestamp: t.bigint().notNull(),
    updated_at: t.bigint().notNull(),
  }),
  (table) => ({
    bidderIdx: index('market_bid_bidder_idx').on(table.bidder),
    activeIdx: index('market_bid_active_idx').on(table.active),
    activeBidWeiIdx: index('market_bid_active_bid_wei_idx').on(
      table.active,
      table.bid_wei,
    ),
  }),
)

// One row per (bid, trait, kind). kind in { required, forbidden, anyOf }.
export const bidTrait = onchainTable(
  'bid_traits',
  (t) => ({
    bid_id: t.bigint().notNull(),
    trait_id: t.integer().notNull(),
    kind: t.text().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.bid_id, table.trait_id, table.kind] }),
    traitKindIdx: index('bid_trait_kind_idx').on(table.trait_id, table.kind),
    bidIdx: index('bid_trait_bid_idx').on(table.bid_id),
  }),
)

// One row per (bid, color, kind). kind in { required, forbidden, anyOf }.
export const bidColor = onchainTable(
  'bid_colors',
  (t) => ({
    bid_id: t.bigint().notNull(),
    color_id: t.integer().notNull(),
    kind: t.text().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.bid_id, table.color_id, table.kind] }),
    colorKindIdx: index('bid_color_kind_idx').on(table.color_id, table.kind),
    bidIdx: index('bid_color_bid_idx').on(table.bid_id),
  }),
)

export const bidIncludeId = onchainTable(
  'bid_include_ids',
  (t) => ({
    bid_id: t.bigint().notNull(),
    punk_id: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.bid_id, table.punk_id] }),
    punkIdx: index('bid_include_punk_idx').on(table.punk_id),
  }),
)

export const bidExcludeId = onchainTable(
  'bid_exclude_ids',
  (t) => ({
    bid_id: t.bigint().notNull(),
    punk_id: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.bid_id, table.punk_id] }),
    punkIdx: index('bid_exclude_punk_idx').on(table.punk_id),
  }),
)

// Static Punk dataset, seeded once from the SDK offline bundle. Used to
// evaluate PunksMarket bid predicates in SQL.
export const punkTrait = onchainTable(
  'punk_traits',
  (t) => ({
    punk_id: t.bigint().notNull(),
    trait_id: t.integer().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.punk_id, table.trait_id] }),
    traitIdx: index('punk_trait_trait_idx').on(table.trait_id),
  }),
)

export const punkColor = onchainTable(
  'punk_colors',
  (t) => ({
    punk_id: t.bigint().notNull(),
    color_id: t.integer().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.punk_id, table.color_id] }),
    colorIdx: index('punk_color_color_idx').on(table.color_id),
  }),
)

export const punkVisual = onchainTable(
  'punk_visuals',
  (t) => ({
    punk_id: t.bigint().primaryKey(),
    pixel_count: t.integer().notNull(),
    color_count: t.integer().notNull(),
  }),
  (table) => ({
    pixelIdx: index('punk_visual_pixel_idx').on(table.pixel_count),
    colorIdx: index('punk_visual_color_idx').on(table.color_count),
  }),
)

// Daily ETH/USD close, double-keyed cache. Pre-Chainlink rows (V1 launch
// through ~2021-07) come from `data/eth_usd_prices.csv` seeded once at
// startup; later rows are filled on demand by sale handlers reading
// Chainlink's onchain aggregator. Lives onchain (not in the offchain
// schema) because Ponder indexing handlers can only read/write onchain
// tables — and we want sale events to be stamped with `usd_value_cents`
// at indexing time using this cache. `eth_usd_cents` is Stripe-style
// integer cents (USD × 100, e.g. $1234.56 → 123_456).
export const ethUsdPrice = onchainTable(
  'eth_usd_prices',
  (t) => ({
    day_unix: t.bigint().primaryKey(),
    eth_usd_cents: t.bigint().notNull(),
    source: t.text().notNull(),
    block_number: t.bigint(),
    updated_at: t.bigint().notNull(),
  }),
  (table) => ({
    sourceIdx: index('eth_usd_price_source_idx').on(table.source),
  }),
)

// Sentinel rows so the pre-Chainlink CSV seed is idempotent across restarts.
// Bump the suffix in `src/prices.ts` to force a re-seed when the CSV content
// materially changes.
export const backfillMarker = onchainTable('backfill_markers', (t) => ({
  name: t.text().primaryKey(),
  completed_at: t.bigint().notNull(),
}))

// Unified user-facing activity stream. `source` ∈ { cryptopunks_v1,
// cryptopunks_v2, wrapped_punks, cryptopunks_721, v1_wrapper, punks_market }.
// `type` ∈ { assign, transfer, listing, listing_cancelled, bid, bid_adjusted,
// bid_cancelled, sale, wrap, unwrap, escrow_credit, escrow_withdrawal }.
// `day_unix` is the UTC day of `timestamp` — stable JOIN key against
// `eth_usd_prices`. `usd_value_cents` is the Stripe-style USD-cent equivalent
// of `wei_amount` at the day's ETH/USD price, cached on the row at indexing
// time so sale lookups don't need a JOIN.
export const event = onchainTable(
  'events',
  (t) => ({
    id: t.text().primaryKey(),
    source: t.text().notNull(),
    source_event: t.text().notNull(),
    type: t.text().notNull(),
    punk_id: t.bigint(),
    actor: t.hex(),
    from: t.hex(),
    to: t.hex(),
    buyer: t.hex(),
    seller: t.hex(),
    bidder: t.hex(),
    settler: t.hex(),
    wei_amount: t.bigint(),
    usd_value_cents: t.bigint(),
    listing_wei: t.bigint(),
    bid_wei: t.bigint(),
    settlement_wei: t.bigint(),
    only_sell_to: t.hex(),
    bid_id: t.bigint(),
    tx_hash: t.hex().notNull(),
    block_number: t.bigint().notNull(),
    log_index: t.integer().notNull(),
    timestamp: t.bigint().notNull(),
    day_unix: t.bigint().notNull(),
  }),
  (table) => ({
    timestampIdx: index('event_timestamp_idx').on(table.timestamp),
    dayUnixIdx: index('event_day_unix_idx').on(table.day_unix),
    sourceTimestampIdx: index('event_source_timestamp_idx').on(
      table.source,
      table.timestamp,
    ),
    typeTimestampIdx: index('event_type_timestamp_idx').on(
      table.type,
      table.timestamp,
    ),
    punkTimestampIdx: index('event_punk_timestamp_idx').on(
      table.punk_id,
      table.timestamp,
    ),
    actorTimestampIdx: index('event_actor_timestamp_idx').on(
      table.actor,
      table.timestamp,
    ),
    fromTimestampIdx: index('event_from_timestamp_idx').on(
      table.from,
      table.timestamp,
    ),
    toTimestampIdx: index('event_to_timestamp_idx').on(
      table.to,
      table.timestamp,
    ),
  }),
)
