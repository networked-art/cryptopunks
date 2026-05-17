import { ponder } from 'ponder:registry'
import type { Context } from 'ponder:registry'
import {
  event as activityEvent,
  listing,
  marketBid,
  punk,
  punkBid,
} from 'ponder:schema'
import { getAddress } from 'viem'

import { CryptoPunksV1Abi } from '../abis/CryptoPunksV1Abi'
import {
  CRYPTOPUNKS_V1_ADDRESS,
  V1_WRAPPER_ADDRESS,
  ZERO_ADDRESS,
} from '../utils/contracts'

type Address = `0x${string}`

type EventMeta = {
  tx_hash: Address
  block_number: bigint
  log_index: number
  timestamp: bigint
}

type PonderEvent = {
  transaction: { hash: Address }
  block: { number: bigint; timestamp: bigint }
  log: { logIndex: number }
}

const SOURCE_V1 = 'cryptopunks_v1'
const SOURCE_WRAPPER = 'v1_wrapper'
const SOURCE_MARKET = 'punks_market'

ponder.on('CryptoPunksV1:Assign', async ({ event, context }) => {
  const to = normalize(event.args.to)
  const punkId = event.args.punkIndex
  const meta = eventMeta(event)

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
    isWrapped: false,
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

  const current = await context.db.find(punk, { punk_id: punkId })
  if (!current?.is_wrapped) {
    await upsertPunk(context, {
      punkId,
      owner: to,
      isWrapped: false,
      lastTransferAt: event.block.timestamp,
      block: event.block.number,
      timestamp: event.block.timestamp,
    })
  }
})

ponder.on('CryptoPunksV1:PunkOffered', async ({ event, context }) => {
  const punkId = event.args.punkIndex
  const offer = await readNativeListing(context, punkId, event.block.number)
  const seller = offer?.seller ?? ZERO_ADDRESS
  const minValue = offer?.minValue ?? event.args.minValue
  const onlySellTo = offer?.onlySellTo ?? normalize(event.args.toAddress)
  const active = offer?.isForSale ?? true
  const meta = eventMeta(event)

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
    .insert(listing)
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

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_V1,
    source_event: 'PunkNoLongerForSale',
    type: 'listing_cancelled',
    punk_id: event.args.punkIndex,
    ...meta,
  })

  await clearNativeListing(context, event.args.punkIndex, meta)
})

ponder.on('CryptoPunksV1:PunkBidEntered', async ({ event, context }) => {
  const bidder = normalize(event.args.fromAddress)
  const meta = eventMeta(event)

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
    .insert(punkBid)
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
    .insert(punkBid)
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
  const to = normalize(event.args.toAddress)
  const from = normalize(event.args.fromAddress)
  const punkId = event.args.punkIndex
  const meta = eventMeta(event)
  const activeBid = await context.db.find(punkBid, { punk_id: punkId })
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
    isWrapped: false,
    lastTransferAt: event.block.timestamp,
    lastSaleWei: saleWei,
    block: event.block.number,
    timestamp: event.block.timestamp,
  })
})

ponder.on('V1Wrapper:Transfer', async ({ event, context }) => {
  const from = normalize(event.args.from)
  const to = normalize(event.args.to)
  const punkId = event.args.tokenId
  const meta = eventMeta(event)

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
      isWrapped: true,
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
      isWrapped: false,
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
    lastTransferAt: event.block.timestamp,
    block: event.block.number,
    timestamp: event.block.timestamp,
  })
})

ponder.on('PunksMarket:BidPlaced', async ({ event, context }) => {
  const bidder = normalize(event.args.bidder)
  const meta = eventMeta(event)
  const criteriaJson = toJson(criteriaObject(event.args.criteria))
  const includeIdsJson = toJson(idList(event.args.includeIds))
  const excludeIdsJson = toJson(idList(event.args.excludeIds))

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
      criteria_json: criteriaJson,
      include_ids_json: includeIdsJson,
      exclude_ids_json: excludeIdsJson,
      ...meta,
      updated_at: event.block.timestamp,
    })
})

ponder.on('PunksMarket:BidAdjusted', async ({ event, context }) => {
  const existing = await context.db.find(marketBid, {
    bid_id: event.args.bidId,
  })
  const meta = eventMeta(event)

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
  const settler = normalize(event.args.settler)
  const meta = eventMeta(event)

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_MARKET,
    source_event: 'BidAccepted',
    type: 'sale',
    punk_id: event.args.punkId,
    actor: settler,
    buyer: bidder,
    seller,
    bidder,
    settler,
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
  const buyer = normalize(event.args.buyer)
  const meta = eventMeta(event)

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_MARKET,
    source_event: 'PunkPurchased',
    type: 'sale',
    punk_id: event.args.punkId,
    actor: buyer,
    buyer,
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
    isWrapped: boolean
    assignedTo?: Address
    lastTransferAt?: bigint
    lastSaleWei?: bigint
    block: bigint
    timestamp: bigint
  },
) {
  await context.db
    .insert(punk)
    .values({
      punk_id: args.punkId,
      owner: args.owner,
      is_wrapped: args.isWrapped,
      assigned_to: args.assignedTo ?? null,
      last_transfer_at: args.lastTransferAt ?? null,
      last_sale_wei: args.lastSaleWei ?? null,
      updated_at: args.timestamp,
      block_number: args.block,
    })
    .onConflictDoUpdate((row) => ({
      owner: args.owner,
      is_wrapped: args.isWrapped,
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
    .insert(listing)
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
    .insert(punkBid)
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

async function insertActivity(
  context: Context,
  values: typeof activityEvent.$inferInsert,
) {
  await context.db.insert(activityEvent).values(values).onConflictDoNothing()
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

function criteriaObject(criteria: unknown) {
  const keys = [
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

  if (Array.isArray(criteria)) {
    return Object.fromEntries(keys.map((key, index) => [key, criteria[index]]))
  }

  if (criteria && typeof criteria === 'object') {
    const record = criteria as Record<string, unknown>
    return Object.fromEntries(keys.map((key) => [key, record[key]]))
  }

  return Object.fromEntries(keys.map((key) => [key, null]))
}

function toJson(value: unknown): string {
  return JSON.stringify(value, (_, nested) =>
    typeof nested === 'bigint' ? nested.toString() : nested,
  )
}
