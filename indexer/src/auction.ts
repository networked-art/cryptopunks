import { ponder } from 'ponder:registry'
import type { Context } from 'ponder:registry'
import {
  auctionAuction,
  auctionLot,
  auctionLotItem,
  auctionOffer,
  event as activityEvent,
} from 'ponder:schema'
import { asc, eq } from 'ponder'
import { getAddress } from 'viem'

import { ZERO_ADDRESS } from '../utils/contracts'
import { ensureAccounts, recordSelfInitiatedInteraction } from './accounts'
import { dayUnix, usdValueCentsForBlock } from './prices'

type Address = `0x${string}`

type EventMeta = {
  tx_hash: Address
  block_number: bigint
  log_index: number
  timestamp: bigint
}

type PonderEvent = {
  transaction: { hash: Address; from: Address }
  block: { number: bigint; timestamp: bigint }
  log: { logIndex: number }
}

const SOURCE_AUCTION = 'punks_auction'

// ─────────────────────────────────────────────────────────────────────────────
// Lots
// ─────────────────────────────────────────────────────────────────────────────

ponder.on('PunksAuction:LotCreated', async ({ event, context }) => {
  const seller = normalize(event.args.seller)
  const onlySellTo = nullableAddress(event.args.onlySellTo)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [seller, onlySellTo],
    event.block.number,
    event.block.timestamp,
  )

  await context.db
    .insert(auctionLot)
    .values({
      lot_id: event.args.lotId,
      seller,
      reserve_wei: event.args.reserveWei,
      only_sell_to: onlySellTo,
      item_count: event.args.itemCount,
      active: true,
      ...meta,
      updated_at: event.block.timestamp,
    })
    .onConflictDoUpdate({
      seller,
      reserve_wei: event.args.reserveWei,
      only_sell_to: onlySellTo,
      item_count: event.args.itemCount,
      active: true,
      ...meta,
      updated_at: event.block.timestamp,
    })

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_AUCTION,
    source_event: 'LotCreated',
    type: 'lot_created',
    actor: seller,
    seller,
    listing_wei: event.args.reserveWei,
    only_sell_to: onlySellTo,
    lot_id: event.args.lotId,
    ...meta,
  })
})

ponder.on('PunksAuction:LotItemDetail', async ({ event, context }) => {
  await context.db
    .insert(auctionLotItem)
    .values({
      lot_id: event.args.lotId,
      item_index: event.args.itemIndex,
      standard: standardName(event.args.standard),
      punk_id: BigInt(event.args.punkId),
      weight_bps: event.args.weightBps,
    })
    .onConflictDoUpdate({
      standard: standardName(event.args.standard),
      punk_id: BigInt(event.args.punkId),
      weight_bps: event.args.weightBps,
    })
})

ponder.on('PunksAuction:LotUpdated', async ({ event, context }) => {
  const existing = await context.db.find(auctionLot, {
    lot_id: event.args.lotId,
  })
  const onlySellTo = nullableAddress(event.args.onlySellTo)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [onlySellTo],
    event.block.number,
    event.block.timestamp,
  )

  if (existing) {
    await context.db.update(auctionLot, { lot_id: event.args.lotId }).set({
      reserve_wei: event.args.reserveWei,
      only_sell_to: onlySellTo,
      ...meta,
      updated_at: event.block.timestamp,
    })
  }

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_AUCTION,
    source_event: 'LotUpdated',
    type: 'lot_updated',
    actor: existing?.seller ?? null,
    seller: existing?.seller ?? null,
    listing_wei: event.args.reserveWei,
    only_sell_to: onlySellTo,
    lot_id: event.args.lotId,
    ...meta,
  })
})

ponder.on('PunksAuction:LotCancelled', async ({ event, context }) => {
  const existing = await context.db.find(auctionLot, {
    lot_id: event.args.lotId,
  })
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)

  if (existing) {
    await context.db
      .update(auctionLot, { lot_id: event.args.lotId })
      .set({ active: false, updated_at: event.block.timestamp })
  }

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_AUCTION,
    source_event: 'LotCancelled',
    type: 'lot_cancelled',
    actor: existing?.seller ?? null,
    seller: existing?.seller ?? null,
    lot_id: event.args.lotId,
    ...meta,
  })
})

ponder.on('PunksAuction:LotCleared', async ({ event, context }) => {
  const cleaner = normalize(event.args.cleaner)
  const existing = await context.db.find(auctionLot, {
    lot_id: event.args.lotId,
  })
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [cleaner],
    event.block.number,
    event.block.timestamp,
  )

  if (existing) {
    await context.db
      .update(auctionLot, { lot_id: event.args.lotId })
      .set({ active: false, updated_at: event.block.timestamp })
  }

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_AUCTION,
    source_event: 'LotCleared',
    type: 'lot_cleared',
    actor: cleaner,
    seller: existing?.seller ?? null,
    lot_id: event.args.lotId,
    ...meta,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Auctions
// ─────────────────────────────────────────────────────────────────────────────

ponder.on('PunksAuction:AuctionInitialised', async ({ event, context }) => {
  const seller = normalize(event.args.seller)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [seller],
    event.block.number,
    event.block.timestamp,
  )

  // The lot has been consumed into the auction; mark it inactive.
  const existingLot = await context.db.find(auctionLot, {
    lot_id: event.args.lotId,
  })
  if (existingLot) {
    await context.db
      .update(auctionLot, { lot_id: event.args.lotId })
      .set({ active: false, updated_at: event.block.timestamp })
  }

  await context.db
    .insert(auctionAuction)
    .values({
      auction_id: event.args.auctionId,
      lot_id: event.args.lotId,
      seller,
      latest_bidder: ZERO_ADDRESS,
      latest_bid_wei: 0n,
      end_timestamp: BigInt(event.args.endTimestamp),
      settled: false,
      item_count: event.args.itemCount,
      ...meta,
      updated_at: event.block.timestamp,
    })
    .onConflictDoUpdate({
      seller,
      end_timestamp: BigInt(event.args.endTimestamp),
      item_count: event.args.itemCount,
      ...meta,
      updated_at: event.block.timestamp,
    })

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_AUCTION,
    source_event: 'AuctionInitialised',
    type: 'auction_started',
    actor: seller,
    seller,
    auction_id: event.args.auctionId,
    lot_id: event.args.lotId,
    ...meta,
  })
})

ponder.on('PunksAuction:Bid', async ({ event, context }) => {
  const bidder = normalize(event.args.bidder)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [bidder],
    event.block.number,
    event.block.timestamp,
  )

  const existing = await context.db.find(auctionAuction, {
    auction_id: event.args.auctionId,
  })
  if (existing) {
    await context.db
      .update(auctionAuction, { auction_id: event.args.auctionId })
      .set({
        latest_bidder: bidder,
        latest_bid_wei: event.args.amountWei,
        updated_at: event.block.timestamp,
      })
  }

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_AUCTION,
    source_event: 'Bid',
    type: 'bid',
    actor: bidder,
    bidder,
    seller: existing?.seller ?? null,
    wei_amount: event.args.amountWei,
    bid_wei: event.args.amountWei,
    auction_id: event.args.auctionId,
    ...meta,
  })
})

ponder.on('PunksAuction:AuctionExtended', async ({ event, context }) => {
  const existing = await context.db.find(auctionAuction, {
    auction_id: event.args.auctionId,
  })
  if (existing) {
    await context.db
      .update(auctionAuction, { auction_id: event.args.auctionId })
      .set({
        end_timestamp: BigInt(event.args.endTimestamp),
        updated_at: event.block.timestamp,
      })
  }
})

ponder.on('PunksAuction:AuctionItemDelivered', async ({ event, context }) => {
  const recipient = normalize(event.args.recipient)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [recipient],
    event.block.number,
    event.block.timestamp,
  )

  const auction = await context.db.find(auctionAuction, {
    auction_id: event.args.auctionId,
  })

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_AUCTION,
    source_event: 'AuctionItemDelivered',
    type: 'sale',
    punk_id: BigInt(event.args.punkId),
    actor: recipient,
    buyer: recipient,
    seller: auction?.seller ?? null,
    from: auction?.seller ?? null,
    to: recipient,
    wei_amount: event.args.itemWei,
    auction_id: event.args.auctionId,
    ...meta,
  })
})

ponder.on('PunksAuction:AuctionSettled', async ({ event, context }) => {
  const winner = normalize(event.args.winner)
  const seller = normalize(event.args.seller)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [winner, seller],
    event.block.number,
    event.block.timestamp,
  )

  await context.db
    .update(auctionAuction, { auction_id: event.args.auctionId })
    .set({
      settled: true,
      latest_bidder: winner,
      latest_bid_wei: event.args.finalWei,
      seller,
      updated_at: event.block.timestamp,
    })

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_AUCTION,
    source_event: 'AuctionSettled',
    type: 'auction_settled',
    actor: winner,
    buyer: winner,
    seller,
    wei_amount: event.args.finalWei,
    auction_id: event.args.auctionId,
    ...meta,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Offers
// ─────────────────────────────────────────────────────────────────────────────

ponder.on('PunksAuction:OfferPlaced', async ({ event, context }) => {
  const offerer = normalize(event.args.offerer)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [offerer],
    event.block.number,
    event.block.timestamp,
  )

  await context.db
    .insert(auctionOffer)
    .values({
      offer_id: event.args.offerId,
      offerer,
      amount_wei: event.args.amountWei,
      slot_count: event.args.slotCount,
      kind: null,
      specific_punk_id: null,
      active: true,
      ...meta,
      updated_at: event.block.timestamp,
    })
    .onConflictDoUpdate({
      offerer,
      amount_wei: event.args.amountWei,
      slot_count: event.args.slotCount,
      kind: null,
      specific_punk_id: null,
      active: true,
      ...meta,
      updated_at: event.block.timestamp,
    })

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_AUCTION,
    source_event: 'OfferPlaced',
    type: 'offer_placed',
    actor: offerer,
    bidder: offerer,
    wei_amount: event.args.amountWei,
    bid_wei: event.args.amountWei,
    offer_id: event.args.offerId,
    ...meta,
  })
})

ponder.on('PunksAuction:OfferSlotDetail', async ({ event, context }) => {
  const existing = await context.db.find(auctionOffer, {
    offer_id: event.args.offerId,
  })
  if (!existing) return

  const slotKind = offerSlotKind(
    event.args.criteria,
    event.args.includeIds.length,
  )
  const combinedKind = combineOfferKind(
    existing.kind,
    slotKind,
    existing.slot_count,
  )

  // Single-slot offers that target exactly one Punk get a punk_id stamped on
  // their activity row so it renders the PunkThumb (same shape as a V2 bid).
  const specificPunkId =
    existing.slot_count === 1 && slotKind === 'specific'
      ? BigInt(event.args.includeIds[0]!)
      : null

  const offerPatch: Partial<typeof auctionOffer.$inferInsert> = {}
  if (combinedKind !== existing.kind) offerPatch.kind = combinedKind
  if (specificPunkId !== null && existing.specific_punk_id !== specificPunkId)
    offerPatch.specific_punk_id = specificPunkId
  if (Object.keys(offerPatch).length) {
    await context.db
      .update(auctionOffer, { offer_id: event.args.offerId })
      .set(offerPatch)
  }

  // The OfferPlaced activity row was inserted earlier in the same tx with the
  // same block_number / log_index recorded on `auctionOffer`. Patch it so the
  // feed can pick the right icon without a second lookup.
  const placedEventId = `${existing.block_number}-${existing.log_index}`
  const activityPatch: Partial<typeof activityEvent.$inferInsert> = {
    offer_kind: combinedKind,
  }
  if (specificPunkId !== null) activityPatch.punk_id = specificPunkId
  await context.db
    .update(activityEvent, { id: placedEventId })
    .set(activityPatch)
})

ponder.on('PunksAuction:OfferCancelled', async ({ event, context }) => {
  const existing = await context.db.find(auctionOffer, {
    offer_id: event.args.offerId,
  })
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)

  if (existing) {
    await context.db
      .update(auctionOffer, { offer_id: event.args.offerId })
      .set({ active: false, updated_at: event.block.timestamp })
  }

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_AUCTION,
    source_event: 'OfferCancelled',
    type: 'offer_cancelled',
    actor: existing?.offerer ?? null,
    bidder: existing?.offerer ?? null,
    bid_wei: existing?.amount_wei ?? null,
    offer_id: event.args.offerId,
    offer_kind: existing?.kind ?? null,
    punk_id: existing?.specific_punk_id ?? null,
    ...meta,
  })
})

ponder.on('PunksAuction:OfferAmountAdjusted', async ({ event, context }) => {
  const existing = await context.db.find(auctionOffer, {
    offer_id: event.args.offerId,
  })
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)

  if (existing) {
    await context.db
      .update(auctionOffer, { offer_id: event.args.offerId })
      .set({
        amount_wei: event.args.newAmountWei,
        ...meta,
        updated_at: event.block.timestamp,
      })
  }

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_AUCTION,
    source_event: 'OfferAmountAdjusted',
    type: 'offer_adjusted',
    actor: existing?.offerer ?? null,
    bidder: existing?.offerer ?? null,
    wei_amount: event.args.newAmountWei,
    bid_wei: event.args.newAmountWei,
    offer_id: event.args.offerId,
    offer_kind: existing?.kind ?? null,
    punk_id: existing?.specific_punk_id ?? null,
    ...meta,
  })
})

ponder.on('PunksAuction:OfferAccepted', async ({ event, context }) => {
  const seller = normalize(event.args.seller)
  const offerer = normalize(event.args.offerer)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [seller, offerer],
    event.block.number,
    event.block.timestamp,
  )

  await context.db
    .update(auctionOffer, { offer_id: event.args.offerId })
    .set({ active: false, updated_at: event.block.timestamp })

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_AUCTION,
    source_event: 'OfferAccepted',
    type: 'sale',
    punk_id: event.args.punkId,
    actor: event.transaction.from,
    buyer: offerer,
    seller,
    from: seller,
    to: offerer,
    wei_amount: event.args.amountWei,
    offer_id: event.args.offerId,
    ...meta,
  })
})

ponder.on('PunksAuction:OfferAcceptedFromLot', async ({ event, context }) => {
  const seller = normalize(event.args.seller)
  const offerer = normalize(event.args.offerer)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [seller, offerer],
    event.block.number,
    event.block.timestamp,
  )

  await context.db
    .update(auctionOffer, { offer_id: event.args.offerId })
    .set({ active: false, updated_at: event.block.timestamp })
  const existingLot = await context.db.find(auctionLot, {
    lot_id: event.args.lotId,
  })
  if (existingLot) {
    await context.db
      .update(auctionLot, { lot_id: event.args.lotId })
      .set({ active: false, updated_at: event.block.timestamp })
  }

  const items = await context.db.sql
    .select()
    .from(auctionLotItem)
    .where(eq(auctionLotItem.lot_id, event.args.lotId))
    .orderBy(asc(auctionLotItem.item_index))

  // Mirror the contract's _settleBundleDelivery allocation: each non-last
  // item gets totalWei * weightBps / TOTAL_WEIGHT_BPS, the last gets the
  // remainder so per-item sums round to exactly amountWei.
  const totalWei = BigInt(event.args.amountWei)
  const allocations = allocateBundleWei(items, totalWei)

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    await insertActivity(context, {
      id: `${eventId(event)}-item-${item.item_index}`,
      source: SOURCE_AUCTION,
      source_event: 'OfferAcceptedFromLot',
      type: 'sale',
      punk_id: item.punk_id,
      actor: event.transaction.from,
      buyer: offerer,
      seller,
      from: seller,
      to: offerer,
      wei_amount: allocations[i]!,
      offer_id: event.args.offerId,
      lot_id: event.args.lotId,
      ...meta,
    })
  }
})

ponder.on(
  'PunksAuction:OfferAuctionInitialised',
  async ({ event, context }) => {
    const offerer = normalize(event.args.offerer)
    await recordSelfInitiatedInteraction(context, event)
    await ensureAccounts(
      context,
      [offerer],
      event.block.number,
      event.block.timestamp,
    )

    await context.db
      .update(auctionOffer, { offer_id: event.args.offerId })
      .set({ active: false, updated_at: event.block.timestamp })
    const existingLot = await context.db.find(auctionLot, {
      lot_id: event.args.lotId,
    })
    if (existingLot) {
      await context.db
        .update(auctionLot, { lot_id: event.args.lotId })
        .set({ active: false, updated_at: event.block.timestamp })
    }

    // No activity row: AuctionInitialised + the opening Bid in the same tx
    // already capture the auction-started + first-bid pair. This handler only
    // marks the offer and lot as consumed.
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Push/pull escrow
// ─────────────────────────────────────────────────────────────────────────────

ponder.on('PunksAuction:Credited', async ({ event, context }) => {
  const account = normalize(event.args.account)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [account],
    event.block.number,
    event.block.timestamp,
  )

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_AUCTION,
    source_event: 'Credited',
    type: 'escrow_credit',
    actor: account,
    to: account,
    wei_amount: event.args.amount,
    ...meta,
  })
})

ponder.on('PunksAuction:Withdrawal', async ({ event, context }) => {
  const account = normalize(event.args.account)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [account],
    event.block.number,
    event.block.timestamp,
  )

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_AUCTION,
    source_event: 'Withdrawal',
    type: 'escrow_withdrawal',
    actor: account,
    from: account,
    wei_amount: event.args.amount,
    ...meta,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function insertActivity(
  context: Context,
  values: Omit<
    typeof activityEvent.$inferInsert,
    'day_unix' | 'usd_value_cents'
  >,
) {
  let usdValueCents: bigint | null = null
  const displayedWeiAmount = values.wei_amount ?? values.listing_wei
  if (displayedWeiAmount !== null && displayedWeiAmount !== undefined) {
    usdValueCents = await usdValueCentsForBlock(
      context,
      { number: values.block_number, timestamp: values.timestamp },
      displayedWeiAmount,
    )
  }

  await context.db
    .insert(activityEvent)
    .values({
      ...values,
      day_unix: dayUnix(values.timestamp),
      usd_value_cents: usdValueCents,
    })
    .onConflictDoNothing()
}

function eventId(event: PonderEvent): string {
  return `${event.block.number}-${event.log.logIndex}`
}

type PunksFilter = {
  requiredTraitMask: bigint
  forbiddenTraitMask: bigint
  anyOfTraitMask: bigint
  requiredColorMask: bigint
  forbiddenColorMask: bigint
  anyOfColorMask: bigint
  maxPixelCount: number
  maxColorCount: number
}

type OfferKind = 'collection' | 'specific' | 'selection' | 'trait'

function offerSlotKind(criteria: PunksFilter, includeCount: number): OfferKind {
  if (!isFilterEmpty(criteria)) return 'trait'
  if (includeCount > 1) return 'selection'
  if (includeCount === 1) return 'specific'
  return 'collection'
}

// Mirrors `isPunksFilterEmpty` in the SDK — keep the two in sync.
function isFilterEmpty(filter: PunksFilter): boolean {
  return (
    filter.requiredTraitMask === 0n &&
    filter.forbiddenTraitMask === 0n &&
    filter.anyOfTraitMask === 0n &&
    filter.requiredColorMask === 0n &&
    filter.forbiddenColorMask === 0n &&
    filter.anyOfColorMask === 0n &&
    filter.maxPixelCount === 0 &&
    filter.maxColorCount === 0
  )
}

const OFFER_KIND_RANK: Record<OfferKind, number> = {
  collection: 0,
  specific: 1,
  selection: 2,
  trait: 3,
}

function combineOfferKind(
  current: string | null,
  next: OfferKind,
  slotCount: number,
): OfferKind {
  const merged: OfferKind = current
    ? OFFER_KIND_RANK[next] > OFFER_KIND_RANK[current as OfferKind]
      ? next
      : (current as OfferKind)
    : next
  // `specific` only makes sense for a single-slot offer that targets exactly
  // one Punk; on a multi-slot offer it's really a selection of specific Punks.
  return slotCount > 1 && merged === 'specific' ? 'selection' : merged
}

function eventMeta(event: PonderEvent): EventMeta {
  return {
    tx_hash: event.transaction.hash,
    block_number: event.block.number,
    log_index: event.log.logIndex,
    timestamp: event.block.timestamp,
  }
}

function normalize(address: Address): Address {
  return getAddress(address)
}

function nullableAddress(address: Address): Address | null {
  return address === ZERO_ADDRESS ? null : normalize(address)
}

// Mirrors the `TokenStandard` enum on `IPunksAuction`: 0 = canonical
// CryptoPunks, 1 = the bugged V1 market.
function standardName(value: number): string {
  return value === 0 ? 'cryptopunks' : 'cryptopunks_v1'
}

// Mirrors `PunkLots.TOTAL_WEIGHT_BPS`.
const TOTAL_WEIGHT_BPS = 10_000n

// Replicates the contract's `_settleBundleDelivery` allocation: per-item wei is
// `total * weightBps / TOTAL_WEIGHT_BPS`, with the final item absorbing the
// rounding remainder so the per-item sum exactly matches `total`.
function allocateBundleWei(
  items: ReadonlyArray<{ weight_bps: number }>,
  total: bigint,
): bigint[] {
  const allocations: bigint[] = []
  let allocated = 0n
  for (let i = 0; i < items.length; i++) {
    const isLast = i === items.length - 1
    const weight = BigInt(items[i]!.weight_bps)
    const wei = isLast ? total - allocated : (total * weight) / TOTAL_WEIGHT_BPS
    allocations.push(wei)
    allocated += wei
  }
  return allocations
}
