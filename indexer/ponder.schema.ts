import { index, onchainTable } from 'ponder'

// Canonical state for each Punk (id 0..9999). `owner` is the user-facing
// owner: when wrapped, the ERC-721 owner; otherwise the native CryptoPunks
// owner. `native_standard` records which contract is currently canonical for
// this Punk — V1 only during the pre-V2 window, V2 from block 3_914_495 on.
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

// Unified user-facing activity stream. `source` ∈ { cryptopunks_v1,
// cryptopunks_v2, wrapped_punks, cryptopunks_721 }. `type` ∈ { assign,
// transfer, listing, listing_cancelled, bid, bid_cancelled, sale, wrap,
// unwrap }.
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
    wei_amount: t.bigint(),
    listing_wei: t.bigint(),
    only_sell_to: t.hex(),
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
