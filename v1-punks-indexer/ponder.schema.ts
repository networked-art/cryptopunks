import { index, onchainTable } from 'ponder'

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

export const marketBid = onchainTable(
  'market_bids',
  (t) => ({
    bid_id: t.bigint().primaryKey(),
    bidder: t.hex().notNull(),
    bid_wei: t.bigint().notNull(),
    settlement_wei: t.bigint().notNull(),
    active: t.boolean().notNull(),
    accepted_punk_id: t.bigint(),
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
  }),
)

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
