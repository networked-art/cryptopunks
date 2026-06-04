import { ponder } from 'ponder:registry'
import type { Context } from 'ponder:registry'
import {
  backfillMarker,
  bidColor,
  bidExcludeId,
  bidIncludeId,
  bidTrait,
  event as activityEvent,
  marketBid,
  punkColor,
  punkTrait,
  punkVisual,
  v1Listing,
  v1Punk,
  v1PunkBid,
} from 'ponder:schema'
import { OfflinePunksDataClient } from '@networked-art/punks-sdk/offline'
import { getAbiItem, getAddress, toEventSelector, toHex } from 'viem'

import { CryptoPunksV1Abi } from '../abis/CryptoPunksV1Abi'
import { V1WrapperAbi } from '../abis/V1WrapperAbi'
import {
  CRYPTOPUNKS_V1_ADDRESS,
  PUNKS_AUCTION_ADDRESS,
  PUNKS_AUCTION_ESCROW_ADDRESS,
  PUNKS_MARKET_ADDRESS,
  V1_WRAPPER_ADDRESS,
  ZERO_ADDRESS,
} from '../utils/contracts'
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

const SOURCE_V1 = 'cryptopunks_v1'
const SOURCE_WRAPPER = 'v1_wrapper'
const SOURCE_MARKET = 'punks_market'

// topic0 of the V1 contract's `PunkBought` event. `buyPunk` emits this right
// after its internal `punkNoLongerForSale` call — see `isBuyPunkByproduct`.
const PUNK_BOUGHT_TOPIC = toEventSelector(
  getAbiItem({ abi: CryptoPunksV1Abi, name: 'PunkBought' }),
)
// topic0 of the native V1 `Transfer(address,address,uint256)` — the log
// `acceptBidForPunk` emits just before its buyer-zeroing `PunkBought`. Used by
// `readAcceptBidBuyer` to recover the real recipient.
const V1_TRANSFER_TOPIC = toEventSelector(
  getAbiItem({ abi: CryptoPunksV1Abi, name: 'Transfer' }),
)
const V1_WRAPPER_TRANSFER_TOPIC = toEventSelector(
  getAbiItem({ abi: V1WrapperAbi, name: 'Transfer' }),
)
const ZERO_TOPIC = toHex(0n, { size: 32 })

// Sentinel name for the punks-dataset backfill. Bump suffix if the bundled
// dataset hash ever changes (it should not — PunksData is sealed onchain).
const DATASET_BACKFILL_NAME = 'punks_data_seed_v1'
const PUNK_COUNT = 10000
const DB_INSERT_CHUNK = 5000

// Seed punk_traits / punk_colors / punk_visuals once at startup from the
// SDK's bundled offline dataset (mirror of the sealed PunksData contract).
// Side tables join against these to evaluate bid predicates in SQL.
ponder.on('PunksMarket:setup', async ({ context }) => {
  const existing = await context.db.find(backfillMarker, {
    name: DATASET_BACKFILL_NAME,
  })
  if (existing) return

  const offline = new OfflinePunksDataClient()

  const traitRows: Array<{ punk_id: bigint; trait_id: number }> = []
  const colorRows: Array<{ punk_id: bigint; color_id: number }> = []
  const visualRows: Array<{
    punk_id: bigint
    pixel_count: number
    color_count: number
  }> = []

  for (let punkId = 0; punkId < PUNK_COUNT; punkId++) {
    const punkBig = BigInt(punkId)
    const traitMask = offline.getTraitMaskSync(punkId)
    const colorMask = offline.getColorMaskSync(punkId)

    for (const trait_id of bitsFromMask(traitMask, TRAIT_COUNT)) {
      traitRows.push({ punk_id: punkBig, trait_id })
    }
    for (const color_id of bitsFromMask(colorMask, PALETTE_SIZE)) {
      colorRows.push({ punk_id: punkBig, color_id })
    }
    visualRows.push({
      punk_id: punkBig,
      pixel_count: offline.getPixelCountSync(punkId),
      color_count: offline.getColorCountSync(punkId),
    })
  }

  for (const chunk of chunked(traitRows, DB_INSERT_CHUNK)) {
    await context.db.insert(punkTrait).values(chunk).onConflictDoNothing()
  }
  for (const chunk of chunked(colorRows, DB_INSERT_CHUNK)) {
    await context.db.insert(punkColor).values(chunk).onConflictDoNothing()
  }
  for (const chunk of chunked(visualRows, DB_INSERT_CHUNK)) {
    await context.db.insert(punkVisual).values(chunk).onConflictDoNothing()
  }

  await context.db.insert(backfillMarker).values({
    name: DATASET_BACKFILL_NAME,
    completed_at: BigInt(Date.now()),
  })
})

ponder.on('CryptoPunksV1:Assign', async ({ event, context }) => {
  const to = normalize(event.args.to)
  const punkId = event.args.punkIndex
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(context, [to], event.block.number, event.block.timestamp)

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_V1,
    source_event: 'Assign',
    type: 'assign',
    punk_id: punkId,
    actor: to,
    to,
    ...meta,
  })

  await upsertPunk(context, {
    punkId,
    owner: to,
    nativeOwner: to,
    isWrapped: false,
    wrapper: null,
    assignedTo: to,
    lastTransferAt: event.block.timestamp,
    block: event.block.number,
    timestamp: event.block.timestamp,
  })
})

ponder.on('CryptoPunksV1:PunkTransfer', async ({ event, context }) => {
  const from = normalize(event.args.from)
  const to = normalize(event.args.to)
  const punkId = event.args.punkIndex
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [from, to],
    event.block.number,
    event.block.timestamp,
  )

  const unwrapByproduct =
    from === V1_WRAPPER_ADDRESS &&
    (await isV1UnwrapByproduct(context, meta.tx_hash, punkId))

  if (!unwrapByproduct) {
    await insertActivity(context, {
      id: eventId(event),
      source: SOURCE_V1,
      source_event: 'PunkTransfer',
      type: 'transfer',
      punk_id: punkId,
      actor: from,
      from,
      to,
      ...meta,
    })
  }

  const current = await context.db.find(v1Punk, { punk_id: punkId })
  if (current?.is_wrapped) {
    await context.db.update(v1Punk, { punk_id: punkId }).set({
      native_owner: to,
      last_transfer_at: event.block.timestamp,
      updated_at: event.block.timestamp,
      block_number: event.block.number,
    })
    return
  }

  await upsertPunk(context, {
    punkId,
    owner: to,
    nativeOwner: to,
    isWrapped: false,
    wrapper: null,
    lastTransferAt: event.block.timestamp,
    block: event.block.number,
    timestamp: event.block.timestamp,
  })
})

ponder.on('CryptoPunksV1:PunkOffered', async ({ event, context }) => {
  const punkId = event.args.punkIndex
  const offer = await readNativeListing(context, punkId, event.block.number)
  const seller = offer?.seller ?? ZERO_ADDRESS
  const minValue = offer?.minValue ?? event.args.minValue
  const onlySellTo = offer?.onlySellTo ?? normalize(event.args.toAddress)
  const active = offer?.isForSale ?? true
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [seller, onlySellTo],
    event.block.number,
    event.block.timestamp,
  )

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_V1,
    source_event: 'PunkOffered',
    type: 'listing',
    punk_id: punkId,
    actor: seller,
    seller,
    listing_wei: minValue,
    only_sell_to: onlySellTo === ZERO_ADDRESS ? null : onlySellTo,
    ...meta,
  })

  await context.db
    .insert(v1Listing)
    .values({
      punk_id: punkId,
      seller,
      min_value_wei: minValue,
      only_sell_to: onlySellTo === ZERO_ADDRESS ? null : onlySellTo,
      active,
      ...meta,
      updated_at: event.block.timestamp,
    })
    .onConflictDoUpdate({
      seller,
      min_value_wei: minValue,
      only_sell_to: onlySellTo === ZERO_ADDRESS ? null : onlySellTo,
      active,
      ...meta,
      updated_at: event.block.timestamp,
    })
})

ponder.on('CryptoPunksV1:PunkNoLongerForSale', async ({ event, context }) => {
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  const existing = await context.db.find(v1Listing, {
    punk_id: event.args.punkIndex,
  })

  // `buyPunk` calls `punkNoLongerForSale` internally, so a settlement, wrapper
  // deposit, or direct buy emits a redundant PunkNoLongerForSale already
  // covered by its own sale / wrap row. The contract also emits the event when
  // the owner calls `punkNoLongerForSale` defensively on a punk that wasn't
  // listed. Only a standalone PunkNoLongerForSale against a currently active
  // listing is a real cancellation.
  const settlementByproduct = await isBuyPunkByproduct(
    context,
    meta.tx_hash,
    event.args.punkIndex,
  )
  if (!settlementByproduct && existing?.active) {
    await insertActivity(context, {
      id: eventId(event),
      source: SOURCE_V1,
      source_event: 'PunkNoLongerForSale',
      type: 'listing_cancelled',
      punk_id: event.args.punkIndex,
      actor: existing.seller,
      seller: existing.seller,
      ...meta,
    })
  }

  await clearNativeListing(context, event.args.punkIndex, meta)
})

ponder.on('CryptoPunksV1:PunkBidEntered', async ({ event, context }) => {
  const bidder = normalize(event.args.fromAddress)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [bidder],
    event.block.number,
    event.block.timestamp,
  )

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_V1,
    source_event: 'PunkBidEntered',
    type: 'bid',
    punk_id: event.args.punkIndex,
    actor: bidder,
    bidder,
    bid_wei: event.args.value,
    wei_amount: event.args.value,
    ...meta,
  })

  await context.db
    .insert(v1PunkBid)
    .values({
      punk_id: event.args.punkIndex,
      bidder,
      value_wei: event.args.value,
      active: true,
      ...meta,
      updated_at: event.block.timestamp,
    })
    .onConflictDoUpdate({
      bidder,
      value_wei: event.args.value,
      active: true,
      ...meta,
      updated_at: event.block.timestamp,
    })
})

ponder.on('CryptoPunksV1:PunkBidWithdrawn', async ({ event, context }) => {
  const bidder = normalize(event.args.fromAddress)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [bidder],
    event.block.number,
    event.block.timestamp,
  )

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_V1,
    source_event: 'PunkBidWithdrawn',
    type: 'bid_cancelled',
    punk_id: event.args.punkIndex,
    actor: bidder,
    bidder,
    bid_wei: event.args.value,
    wei_amount: event.args.value,
    ...meta,
  })

  await context.db
    .insert(v1PunkBid)
    .values({
      punk_id: event.args.punkIndex,
      bidder,
      value_wei: event.args.value,
      active: false,
      ...meta,
      updated_at: event.block.timestamp,
    })
    .onConflictDoUpdate({
      bidder,
      value_wei: event.args.value,
      active: false,
      ...meta,
      updated_at: event.block.timestamp,
    })
})

ponder.on('CryptoPunksV1:PunkBought', async ({ event, context }) => {
  const from = normalize(event.args.fromAddress)
  const punkId = event.args.punkIndex
  const meta = eventMeta(event)

  // `acceptBidForPunk` zeroes `toAddress`; recover the buyer from the sibling
  // `Transfer` log so the sale records its real recipient.
  let to = normalize(event.args.toAddress)
  if (to === ZERO_ADDRESS) {
    const recovered = await readAcceptBidBuyer(
      context,
      meta.tx_hash,
      from,
      meta.log_index,
    )
    if (recovered) to = recovered
  }

  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [from, to],
    event.block.number,
    event.block.timestamp,
  )
  const activeBid = await context.db.find(v1PunkBid, { punk_id: punkId })
  const saleWei =
    event.args.value === 0n ? (activeBid?.value_wei ?? 0n) : event.args.value

  await clearNativeListingAndBid(context, punkId, meta)

  if (to === V1_WRAPPER_ADDRESS && event.args.value === 0n) {
    return
  }

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_V1,
    source_event: 'PunkBought',
    type: 'sale',
    punk_id: punkId,
    actor: to,
    buyer: to,
    seller: from,
    from,
    to,
    wei_amount: saleWei,
    ...meta,
  })

  await upsertPunk(context, {
    punkId,
    owner: to,
    nativeOwner: to,
    isWrapped: false,
    wrapper: null,
    lastTransferAt: event.block.timestamp,
    // A 0-wei `PunkBought` is the V1 transfer workaround, not a real sale —
    // don't overwrite the punk's last meaningful sale price with zero.
    lastSaleWei: saleWei === 0n ? undefined : saleWei,
    block: event.block.number,
    timestamp: event.block.timestamp,
  })
})

ponder.on('V1Wrapper:Transfer', async ({ event, context }) => {
  const from = normalize(event.args.from)
  const to = normalize(event.args.to)
  const punkId = event.args.tokenId
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [from, to],
    event.block.number,
    event.block.timestamp,
  )

  if (from === ZERO_ADDRESS) {
    await insertActivity(context, {
      id: eventId(event),
      source: SOURCE_WRAPPER,
      source_event: 'Transfer',
      type: 'wrap',
      punk_id: punkId,
      actor: to,
      to,
      ...meta,
    })

    await upsertPunk(context, {
      punkId,
      owner: to,
      nativeOwner: V1_WRAPPER_ADDRESS,
      isWrapped: true,
      wrapper: 'v1_wrapper',
      lastTransferAt: event.block.timestamp,
      block: event.block.number,
      timestamp: event.block.timestamp,
    })
    await clearNativeListingAndBid(context, punkId, meta)
    return
  }

  if (to === ZERO_ADDRESS) {
    const nativeOwner = await readNativeOwner(
      context,
      punkId,
      event.block.number,
    )

    await insertActivity(context, {
      id: eventId(event),
      source: SOURCE_WRAPPER,
      source_event: 'Transfer',
      type: 'unwrap',
      punk_id: punkId,
      actor: from,
      from,
      to: nativeOwner,
      ...meta,
    })

    await upsertPunk(context, {
      punkId,
      owner: nativeOwner,
      nativeOwner,
      isWrapped: false,
      wrapper: null,
      lastTransferAt: event.block.timestamp,
      block: event.block.number,
      timestamp: event.block.timestamp,
    })
    return
  }

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_WRAPPER,
    source_event: 'Transfer',
    type: 'transfer',
    punk_id: punkId,
    actor: from,
    from,
    to,
    ...meta,
  })

  await upsertPunk(context, {
    punkId,
    owner: to,
    isWrapped: true,
    wrapper: 'v1_wrapper',
    lastTransferAt: event.block.timestamp,
    block: event.block.number,
    timestamp: event.block.timestamp,
  })
})

ponder.on('PunksMarket:BidPlaced', async ({ event, context }) => {
  const bidder = normalize(event.args.bidder)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [bidder],
    event.block.number,
    event.block.timestamp,
  )
  const criteria = normalizeCriteria(event.args.criteria)
  const includeIds = idList(event.args.includeIds)
  const excludeIds = idList(event.args.excludeIds)
  const criteriaJson = toJson(criteria)
  const includeIdsJson = toJson(includeIds)
  const excludeIdsJson = toJson(excludeIds)
  const criteriaColumns = criteriaColumnsFrom(criteria)

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_MARKET,
    source_event: 'BidPlaced',
    type: 'bid',
    actor: bidder,
    bidder,
    bid_id: event.args.bidId,
    bid_wei: event.args.bidWei,
    settlement_wei: event.args.settlementWei,
    wei_amount: event.args.bidWei + event.args.settlementWei,
    ...meta,
  })

  await context.db
    .insert(marketBid)
    .values({
      bid_id: event.args.bidId,
      bidder,
      bid_wei: event.args.bidWei,
      settlement_wei: event.args.settlementWei,
      active: true,
      accepted_punk_id: null,
      ...criteriaColumns,
      has_include_ids: includeIds.length > 0,
      criteria_json: criteriaJson,
      include_ids_json: includeIdsJson,
      exclude_ids_json: excludeIdsJson,
      ...meta,
      updated_at: event.block.timestamp,
    })
    .onConflictDoUpdate({
      bidder,
      bid_wei: event.args.bidWei,
      settlement_wei: event.args.settlementWei,
      active: true,
      accepted_punk_id: null,
      ...criteriaColumns,
      has_include_ids: includeIds.length > 0,
      criteria_json: criteriaJson,
      include_ids_json: includeIdsJson,
      exclude_ids_json: excludeIdsJson,
      ...meta,
      updated_at: event.block.timestamp,
    })

  await insertBidPredicates(
    context,
    event.args.bidId,
    criteria,
    includeIds,
    excludeIds,
  )
})

ponder.on('PunksMarket:BidAdjusted', async ({ event, context }) => {
  const existing = await context.db.find(marketBid, {
    bid_id: event.args.bidId,
  })
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_MARKET,
    source_event: 'BidAdjusted',
    type: 'bid_adjusted',
    actor: existing?.bidder ?? null,
    bidder: existing?.bidder ?? null,
    bid_id: event.args.bidId,
    bid_wei: event.args.newBidWei,
    wei_amount: event.args.newBidWei,
    ...meta,
  })

  await context.db
    .insert(marketBid)
    .values({
      bid_id: event.args.bidId,
      bidder: existing?.bidder ?? ZERO_ADDRESS,
      bid_wei: event.args.newBidWei,
      settlement_wei: existing?.settlement_wei ?? 0n,
      active: true,
      accepted_punk_id: existing?.accepted_punk_id ?? null,
      ...carriedCriteriaColumns(existing),
      criteria_json: existing?.criteria_json ?? '{}',
      include_ids_json: existing?.include_ids_json ?? '[]',
      exclude_ids_json: existing?.exclude_ids_json ?? '[]',
      ...meta,
      updated_at: event.block.timestamp,
    })
    .onConflictDoUpdate({
      bid_wei: event.args.newBidWei,
      active: true,
      ...meta,
      updated_at: event.block.timestamp,
    })
})

ponder.on('PunksMarket:BidCancelled', async ({ event, context }) => {
  const existing = await context.db.find(marketBid, {
    bid_id: event.args.bidId,
  })
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_MARKET,
    source_event: 'BidCancelled',
    type: 'bid_cancelled',
    actor: existing?.bidder ?? null,
    bidder: existing?.bidder ?? null,
    bid_id: event.args.bidId,
    bid_wei: existing?.bid_wei ?? null,
    settlement_wei: existing?.settlement_wei ?? null,
    ...meta,
  })

  await context.db
    .insert(marketBid)
    .values({
      bid_id: event.args.bidId,
      bidder: existing?.bidder ?? ZERO_ADDRESS,
      bid_wei: existing?.bid_wei ?? 0n,
      settlement_wei: existing?.settlement_wei ?? 0n,
      active: false,
      accepted_punk_id: existing?.accepted_punk_id ?? null,
      ...carriedCriteriaColumns(existing),
      criteria_json: existing?.criteria_json ?? '{}',
      include_ids_json: existing?.include_ids_json ?? '[]',
      exclude_ids_json: existing?.exclude_ids_json ?? '[]',
      ...meta,
      updated_at: event.block.timestamp,
    })
    .onConflictDoUpdate({
      active: false,
      ...meta,
      updated_at: event.block.timestamp,
    })
})

ponder.on('PunksMarket:BidAccepted', async ({ event, context }) => {
  const seller = normalize(event.args.seller)
  const bidder = normalize(event.args.bidder)
  const caller = normalize(event.args.caller)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [seller, bidder, caller],
    event.block.number,
    event.block.timestamp,
  )

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_MARKET,
    source_event: 'BidAccepted',
    type: 'sale',
    punk_id: event.args.punkId,
    actor: caller,
    buyer: bidder,
    seller,
    bidder,
    settler: caller,
    bid_id: event.args.bidId,
    listing_wei: event.args.listingWei,
    bid_wei: event.args.bidWei,
    settlement_wei: event.args.settlementWei,
    wei_amount: event.args.listingWei,
    ...meta,
  })

  await context.db
    .insert(marketBid)
    .values({
      bid_id: event.args.bidId,
      bidder,
      bid_wei: event.args.bidWei,
      settlement_wei: event.args.settlementWei,
      active: false,
      accepted_punk_id: event.args.punkId,
      ...carriedCriteriaColumns(null),
      criteria_json: '{}',
      include_ids_json: '[]',
      exclude_ids_json: '[]',
      ...meta,
      updated_at: event.block.timestamp,
    })
    .onConflictDoUpdate({
      bidder,
      bid_wei: event.args.bidWei,
      settlement_wei: event.args.settlementWei,
      active: false,
      accepted_punk_id: event.args.punkId,
      ...meta,
      updated_at: event.block.timestamp,
    })
})

ponder.on('PunksMarket:PunkPurchased', async ({ event, context }) => {
  const seller = normalize(event.args.seller)
  const recipient = normalize(event.args.recipient)
  const caller = normalize(event.args.caller)
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(
    context,
    [seller, recipient, caller],
    event.block.number,
    event.block.timestamp,
  )

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_MARKET,
    source_event: 'PunkPurchased',
    type: 'sale',
    punk_id: event.args.punkId,
    actor: caller,
    buyer: caller,
    seller,
    to: recipient,
    listing_wei: event.args.listingWei,
    wei_amount: event.args.listingWei,
    ...meta,
  })
})

ponder.on('PunksMarket:Credited', async ({ event, context }) => {
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
    source: SOURCE_MARKET,
    source_event: 'Credited',
    type: 'escrow_credit',
    actor: account,
    to: account,
    wei_amount: event.args.amount,
    ...meta,
  })
})

ponder.on('PunksMarket:Withdrawal', async ({ event, context }) => {
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
    source: SOURCE_MARKET,
    source_event: 'Withdrawal',
    type: 'escrow_withdrawal',
    actor: account,
    from: account,
    wei_amount: event.args.amount,
    ...meta,
  })
})

async function upsertPunk(
  context: Context,
  args: {
    punkId: bigint
    owner: Address
    nativeOwner?: Address
    isWrapped: boolean
    wrapper: 'v1_wrapper' | null
    assignedTo?: Address
    lastTransferAt?: bigint
    lastSaleWei?: bigint
    block: bigint
    timestamp: bigint
  },
) {
  await context.db
    .insert(v1Punk)
    .values({
      punk_id: args.punkId,
      owner: args.owner,
      native_owner: args.nativeOwner ?? args.owner,
      is_wrapped: args.isWrapped,
      wrapper: args.wrapper,
      assigned_to: args.assignedTo ?? null,
      last_transfer_at: args.lastTransferAt ?? null,
      last_sale_wei: args.lastSaleWei ?? null,
      updated_at: args.timestamp,
      block_number: args.block,
    })
    .onConflictDoUpdate((row) => ({
      owner: args.owner,
      native_owner: args.nativeOwner ?? row.native_owner,
      is_wrapped: args.isWrapped,
      wrapper: args.wrapper,
      assigned_to: args.assignedTo ?? row.assigned_to,
      last_transfer_at: args.lastTransferAt ?? row.last_transfer_at,
      last_sale_wei: args.lastSaleWei ?? row.last_sale_wei,
      updated_at: args.timestamp,
      block_number: args.block,
    }))
}

async function clearNativeListingAndBid(
  context: Context,
  punkId: bigint,
  meta: EventMeta,
) {
  await Promise.all([
    clearNativeListing(context, punkId, meta),
    clearNativeBid(context, punkId, meta),
  ])
}

async function clearNativeListing(
  context: Context,
  punkId: bigint,
  meta: EventMeta,
) {
  await context.db
    .insert(v1Listing)
    .values({
      punk_id: punkId,
      seller: ZERO_ADDRESS,
      min_value_wei: 0n,
      only_sell_to: null,
      active: false,
      ...meta,
      updated_at: meta.timestamp,
    })
    .onConflictDoUpdate((row) => ({
      seller: row.seller,
      min_value_wei: row.min_value_wei,
      only_sell_to: row.only_sell_to,
      active: false,
      ...meta,
      updated_at: meta.timestamp,
    }))
}

async function clearNativeBid(
  context: Context,
  punkId: bigint,
  meta: EventMeta,
) {
  await context.db
    .insert(v1PunkBid)
    .values({
      punk_id: punkId,
      bidder: ZERO_ADDRESS,
      value_wei: 0n,
      active: false,
      ...meta,
      updated_at: meta.timestamp,
    })
    .onConflictDoUpdate((row) => ({
      bidder: row.bidder,
      value_wei: row.value_wei,
      active: false,
      ...meta,
      updated_at: meta.timestamp,
    }))
}

async function readNativeListing(
  context: Context,
  punkId: bigint,
  blockNumber: bigint,
) {
  try {
    const [isForSale, , seller, minValue, onlySellTo] =
      await context.client.readContract({
        address: CRYPTOPUNKS_V1_ADDRESS,
        abi: CryptoPunksV1Abi,
        functionName: 'punksOfferedForSale',
        args: [punkId],
        blockNumber,
      })

    return {
      isForSale,
      seller: normalize(seller),
      minValue,
      onlySellTo: normalize(onlySellTo),
    }
  } catch {
    return null
  }
}

async function readNativeOwner(
  context: Context,
  punkId: bigint,
  blockNumber: bigint,
): Promise<Address> {
  const owner = await context.client.readContract({
    address: CRYPTOPUNKS_V1_ADDRESS,
    abi: CryptoPunksV1Abi,
    functionName: 'punkIndexToAddress',
    args: [punkId],
    blockNumber,
  })
  return normalize(owner)
}

// `acceptBidForPunk` clears `punkBids` / `punksOfferedForSale` before emitting
// `PunkBought`, so the event reports `toAddress = 0x0` (and `value = 0`). The
// real buyer is the recipient of the `Transfer(seller, buyer, 1)` the same call
// emits immediately beforehand — recover it from the receipt. With batched
// settlements each `PunkBought` is preceded by its own `Transfer`, so we take
// the closest preceding `Transfer` from the same seller.
async function readAcceptBidBuyer(
  context: Context,
  txHash: Address,
  seller: Address,
  punkBoughtLogIndex: number,
): Promise<Address | null> {
  const receipt = await context.client.getTransactionReceipt({ hash: txHash })
  let buyer: { logIndex: number; to: Address } | null = null
  for (const log of receipt.logs) {
    if (normalize(log.address) !== CRYPTOPUNKS_V1_ADDRESS) continue
    if (log.topics[0] !== V1_TRANSFER_TOPIC) continue
    const fromTopic = log.topics[1]
    const toTopic = log.topics[2]
    if (!fromTopic || !toTopic) continue
    if (normalize(`0x${fromTopic.slice(26)}`) !== seller) continue
    if (log.logIndex >= punkBoughtLogIndex) continue
    if (!buyer || log.logIndex > buyer.logIndex) {
      buyer = {
        logIndex: log.logIndex,
        to: normalize(`0x${toTopic.slice(26)}`),
      }
    }
  }
  return buyer?.to ?? null
}

// `buyPunk` emits `PunkNoLongerForSale` (via its internal `punkNoLongerForSale`
// call) immediately before `PunkBought` for the same punk. A seller-initiated
// cancellation calls the public `punkNoLongerForSale` and has no sibling
// `PunkBought`. Reading the receipt distinguishes settlement noise from a real
// cancellation precisely; `context.client` caches the lookup in `ponder_sync`.
async function isBuyPunkByproduct(
  context: Context,
  txHash: Address,
  punkId: bigint,
): Promise<boolean> {
  const receipt = await context.client.getTransactionReceipt({ hash: txHash })
  const punkTopic = toHex(punkId, { size: 32 })
  return receipt.logs.some(
    (log) =>
      normalize(log.address) === CRYPTOPUNKS_V1_ADDRESS &&
      log.topics[0] === PUNK_BOUGHT_TOPIC &&
      log.topics[1] === punkTopic,
  )
}

// `PunksV1Wrapper.unwrap` burns the ERC-721 token, then transfers the native
// V1 Punk from the wrapper contract to the caller. The burn is the user-facing
// unwrap row; the native PunkTransfer is bookkeeping needed only for state.
async function isV1UnwrapByproduct(
  context: Context,
  txHash: Address,
  punkId: bigint,
): Promise<boolean> {
  const receipt = await context.client.getTransactionReceipt({ hash: txHash })
  const punkTopic = toHex(punkId, { size: 32 })
  return receipt.logs.some(
    (log) =>
      normalize(log.address) === V1_WRAPPER_ADDRESS &&
      log.topics[0] === V1_WRAPPER_TRANSFER_TOPIC &&
      log.topics[2] === ZERO_TOPIC &&
      log.topics[3] === punkTopic,
  )
}

async function insertActivity(
  context: Context,
  values: Omit<
    typeof activityEvent.$inferInsert,
    'day_unix' | 'usd_value_cents'
  >,
) {
  if (shouldSuppressActivity(values)) return
  const normalized = normalizeZeroEthSale(values)

  let usdValueCents: bigint | null = null
  const displayedWeiAmount = normalized.wei_amount ?? normalized.listing_wei
  if (displayedWeiAmount !== null && displayedWeiAmount !== undefined) {
    usdValueCents = await usdValueCentsForBlock(
      context,
      { number: normalized.block_number, timestamp: normalized.timestamp },
      displayedWeiAmount,
    )
  }

  await context.db
    .insert(activityEvent)
    .values({
      ...normalized,
      day_unix: dayUnix(normalized.timestamp),
      usd_value_cents: usdValueCents,
    })
    .onConflictDoNothing()
}

// A 0-wei `sale` is the V1 contract's transfer workaround
// (`offerPunkForSaleToAddress(_, 0, _)` + `buyPunk`). Functionally a transfer
// — reclassify so the Sales / Transfers split stays meaningful. `source` and
// `source_event` are preserved so the audit trail still points at PunkBought.
function normalizeZeroEthSale(
  values: Omit<
    typeof activityEvent.$inferInsert,
    'day_unix' | 'usd_value_cents'
  >,
): Omit<typeof activityEvent.$inferInsert, 'day_unix' | 'usd_value_cents'> {
  if (values.type !== 'sale') return values
  if (values.wei_amount && values.wei_amount > 0n) return values
  return {
    ...values,
    type: 'transfer',
    actor: values.from ?? values.seller ?? values.actor,
    buyer: null,
    seller: null,
    wei_amount: null,
    listing_wei: null,
    bid_wei: null,
  }
}

// PunksMarket / PunksAuction settlements shuffle the punk through their own
// contracts (and PunksAuctionEscrow for the auction stack) before delivery,
// emitting redundant V1 / wrapper logs alongside the market's own sale event.
// Drop those so a single settlement is one activity row.
const SUPPRESS_ADDRESSES = new Set<string>([
  PUNKS_MARKET_ADDRESS.toLowerCase(),
  PUNKS_AUCTION_ADDRESS.toLowerCase(),
  PUNKS_AUCTION_ESCROW_ADDRESS.toLowerCase(),
])

function shouldSuppressActivity(
  values: Omit<
    typeof activityEvent.$inferInsert,
    'day_unix' | 'usd_value_cents'
  >,
): boolean {
  if (values.source !== SOURCE_V1 && values.source !== SOURCE_WRAPPER) {
    return false
  }
  // Listings carry the seller in `seller`/`actor` rather than `from`/`to`; sales
  // populate both buyer and seller. Check every party so settlement byproducts
  // (e.g. `PunkOffered` from `PunksAuctionEscrow.listForSettlement`) drop too.
  return (
    touchesSuppressedAddress(values.from) ||
    touchesSuppressedAddress(values.to) ||
    touchesSuppressedAddress(values.seller) ||
    touchesSuppressedAddress(values.buyer) ||
    touchesSuppressedAddress(values.actor)
  )
}

function touchesSuppressedAddress(addr: string | null | undefined): boolean {
  return !!addr && SUPPRESS_ADDRESSES.has(addr.toLowerCase())
}

function eventId(event: PonderEvent): string {
  return `${event.block.number}-${event.log.logIndex}`
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

function idList(ids: readonly number[]): number[] {
  return ids.map((id) => Number(id))
}

// Mirrors Punks.sol constants — keep in sync with contracts/contracts/lib/Punks.sol.
const TRAIT_COUNT = 111
const PALETTE_SIZE = 222

type NormalizedCriteria = {
  requiredTraitMask: bigint
  forbiddenTraitMask: bigint
  anyOfTraitMask: bigint
  requiredColorMask: bigint
  forbiddenColorMask: bigint
  anyOfColorMask: bigint
  minPixelCount: number
  maxPixelCount: number
  minColorCount: number
  maxColorCount: number
}

const CRITERIA_KEYS = [
  'requiredTraitMask',
  'forbiddenTraitMask',
  'anyOfTraitMask',
  'requiredColorMask',
  'forbiddenColorMask',
  'anyOfColorMask',
  'minPixelCount',
  'maxPixelCount',
  'minColorCount',
  'maxColorCount',
] as const

function normalizeCriteria(value: unknown): NormalizedCriteria {
  const raw: Record<string, unknown> = {}
  if (Array.isArray(value)) {
    CRITERIA_KEYS.forEach((key, i) => {
      raw[key] = value[i]
    })
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    CRITERIA_KEYS.forEach((key) => {
      raw[key] = record[key]
    })
  }
  return {
    requiredTraitMask: toBigInt(raw.requiredTraitMask),
    forbiddenTraitMask: toBigInt(raw.forbiddenTraitMask),
    anyOfTraitMask: toBigInt(raw.anyOfTraitMask),
    requiredColorMask: toBigInt(raw.requiredColorMask),
    forbiddenColorMask: toBigInt(raw.forbiddenColorMask),
    anyOfColorMask: toBigInt(raw.anyOfColorMask),
    minPixelCount: toInt(raw.minPixelCount),
    maxPixelCount: toInt(raw.maxPixelCount),
    minColorCount: toInt(raw.minColorCount),
    maxColorCount: toInt(raw.maxColorCount),
  }
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(value)
  if (typeof value === 'string' && value.length > 0) return BigInt(value)
  return 0n
}

function toInt(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.length > 0) return Number(value)
  return 0
}

function criteriaColumnsFrom(c: NormalizedCriteria) {
  return {
    required_trait_mask: c.requiredTraitMask,
    forbidden_trait_mask: c.forbiddenTraitMask,
    any_of_trait_mask: c.anyOfTraitMask,
    required_color_mask: c.requiredColorMask,
    forbidden_color_mask: c.forbiddenColorMask,
    any_of_color_mask: c.anyOfColorMask,
    min_pixel_count: c.minPixelCount,
    max_pixel_count: c.maxPixelCount,
    min_color_count: c.minColorCount,
    max_color_count: c.maxColorCount,
  }
}

// Used by handlers that may run before BidPlaced is indexed (defensive). When
// no row exists yet, default to zeros — the active flag drives query visibility,
// not these columns.
function carriedCriteriaColumns(
  existing:
    | {
        required_trait_mask?: bigint | null
        forbidden_trait_mask?: bigint | null
        any_of_trait_mask?: bigint | null
        required_color_mask?: bigint | null
        forbidden_color_mask?: bigint | null
        any_of_color_mask?: bigint | null
        min_pixel_count?: number | null
        max_pixel_count?: number | null
        min_color_count?: number | null
        max_color_count?: number | null
        has_include_ids?: boolean | null
      }
    | null
    | undefined,
) {
  return {
    required_trait_mask: existing?.required_trait_mask ?? 0n,
    forbidden_trait_mask: existing?.forbidden_trait_mask ?? 0n,
    any_of_trait_mask: existing?.any_of_trait_mask ?? 0n,
    required_color_mask: existing?.required_color_mask ?? 0n,
    forbidden_color_mask: existing?.forbidden_color_mask ?? 0n,
    any_of_color_mask: existing?.any_of_color_mask ?? 0n,
    min_pixel_count: existing?.min_pixel_count ?? 0,
    max_pixel_count: existing?.max_pixel_count ?? 0,
    min_color_count: existing?.min_color_count ?? 0,
    max_color_count: existing?.max_color_count ?? 0,
    has_include_ids: existing?.has_include_ids ?? false,
  }
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size) as T[])
  }
  return out
}

function bitsFromMask(mask: bigint, maxBits: number): number[] {
  const out: number[] = []
  for (let i = 0; i < maxBits; i++) {
    if (((mask >> BigInt(i)) & 1n) === 1n) out.push(i)
  }
  return out
}

async function insertBidPredicates(
  context: Context,
  bidId: bigint,
  criteria: NormalizedCriteria,
  includeIds: number[],
  excludeIds: number[],
) {
  const traitRows = [
    ...bitsFromMask(criteria.requiredTraitMask, TRAIT_COUNT).map(
      (trait_id) => ({
        bid_id: bidId,
        trait_id,
        kind: 'required',
      }),
    ),
    ...bitsFromMask(criteria.forbiddenTraitMask, TRAIT_COUNT).map(
      (trait_id) => ({
        bid_id: bidId,
        trait_id,
        kind: 'forbidden',
      }),
    ),
    ...bitsFromMask(criteria.anyOfTraitMask, TRAIT_COUNT).map((trait_id) => ({
      bid_id: bidId,
      trait_id,
      kind: 'anyOf',
    })),
  ]
  const colorRows = [
    ...bitsFromMask(criteria.requiredColorMask, PALETTE_SIZE).map(
      (color_id) => ({
        bid_id: bidId,
        color_id,
        kind: 'required',
      }),
    ),
    ...bitsFromMask(criteria.forbiddenColorMask, PALETTE_SIZE).map(
      (color_id) => ({
        bid_id: bidId,
        color_id,
        kind: 'forbidden',
      }),
    ),
    ...bitsFromMask(criteria.anyOfColorMask, PALETTE_SIZE).map((color_id) => ({
      bid_id: bidId,
      color_id,
      kind: 'anyOf',
    })),
  ]
  const includeRows = includeIds.map((id) => ({
    bid_id: bidId,
    punk_id: BigInt(id),
  }))
  const excludeRows = excludeIds.map((id) => ({
    bid_id: bidId,
    punk_id: BigInt(id),
  }))

  const ops: Promise<unknown>[] = []
  if (traitRows.length > 0) {
    ops.push(
      context.db.insert(bidTrait).values(traitRows).onConflictDoNothing(),
    )
  }
  if (colorRows.length > 0) {
    ops.push(
      context.db.insert(bidColor).values(colorRows).onConflictDoNothing(),
    )
  }
  if (includeRows.length > 0) {
    ops.push(
      context.db.insert(bidIncludeId).values(includeRows).onConflictDoNothing(),
    )
  }
  if (excludeRows.length > 0) {
    ops.push(
      context.db.insert(bidExcludeId).values(excludeRows).onConflictDoNothing(),
    )
  }
  await Promise.all(ops)
}

function toJson(value: unknown): string {
  return JSON.stringify(value, (_, nested) =>
    typeof nested === 'bigint' ? nested.toString() : nested,
  )
}
