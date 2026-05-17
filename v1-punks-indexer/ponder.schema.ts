import { index, onchainTable, primaryKey } from 'ponder'

// Current canonical state for each V1 Punk. `owner` is the public owner:
// native V1 owner while unwrapped, ERC-721 owner while wrapped.
export const punk = onchainTable(
  'punks',
  (t) => ({
    punk_id: t.bigint().primaryKey(),
    owner: t.hex(),
    is_wrapped: t.boolean().notNull(),
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
  }),
)

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

// PunksMarket collection bids (V1-aware market). Predicates are decomposed
// into the bid_traits / bid_colors / bid_include_ids / bid_exclude_ids side
// tables for fast SQL queries; the JSON columns preserve the raw payload.
export const marketBid = onchainTable(
  'market_bids',
  (t) => ({
    bid_id: t.bigint().primaryKey(),
    bidder: t.hex().notNull(),
    bid_wei: t.bigint().notNull(),
    settlement_wei: t.bigint().notNull(),
    active: t.boolean().notNull(),
    accepted_punk_id: t.bigint(),

    // Normalized criteria — uint256 masks fit in numeric (drizzle bigint).
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
    // Denormalized flag for fast "is this bid constrained to a punk allow-list?"
    has_include_ids: t.boolean().notNull(),

    // Raw payload for client convenience.
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

// One row per (bid, trait, kind). kind ∈ { 'required', 'forbidden', 'anyOf' }.
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

// One row per (bid, color, kind). kind ∈ { 'required', 'forbidden', 'anyOf' }.
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

// Static Punk dataset, seeded once from the sealed PunksData (via the SDK
// offline bundle). Used to evaluate bid predicates in SQL.
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

// Sentinel rows so backfill runs are idempotent across restarts.
export const backfillMarker = onchainTable('backfill_markers', (t) => ({
  name: t.text().primaryKey(),
  completed_at: t.bigint().notNull(),
}))

// Unified user-facing activity. type ∈ { assign, transfer, wrap, unwrap,
// listing, listing_cancelled, bid, bid_adjusted, bid_cancelled, sale,
// escrow_credit, escrow_withdrawal }.
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
    listing_wei: t.bigint(),
    bid_wei: t.bigint(),
    settlement_wei: t.bigint(),
    only_sell_to: t.hex(),
    bid_id: t.bigint(),
    tx_hash: t.hex().notNull(),
    block_number: t.bigint().notNull(),
    log_index: t.integer().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    timestampIdx: index('event_timestamp_idx').on(table.timestamp),
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
