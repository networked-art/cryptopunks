import { ponder } from 'ponder:registry'
import type { Context } from 'ponder:registry'
import {
  account,
  event as activityEvent,
  listing,
  punk,
  punkBid,
} from 'ponder:schema'
import { eq, or } from 'ponder'
import { getAbiItem, getAddress, toEventSelector, toHex } from 'viem'

import { CryptoPunksV2Abi } from '../abis/CryptoPunksV2Abi'
import { StashProxyAbi } from '../abis/StashFactoryAbi'
import { WrappedPunksAbi } from '../abis/WrappedPunksAbi'
import {
  CRYPTOPUNKS_V2_ADDRESS,
  PUNKS_AUCTION_ADDRESS,
  PUNKS_AUCTION_ESCROW_ADDRESS,
  PUNKS_MARKET_ADDRESS,
  WRAPPER_ADDRESSES_LOWER,
  ZERO_ADDRESS,
  wrapperKindFor,
} from '../utils/contracts'
import {
  ensureAccounts,
  markStashDeployed,
  markVaultDeployed,
  recordSelfInitiatedInteraction,
  recordUserProxy,
} from './accounts'
import {
  dayUnix,
  seedPreChainlinkPricesFromCsv,
  usdValueCentsForBlock,
} from './prices'
import './v1'
import './auction'

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

type TransferActivityType =
  | 'transfer'
  | 'stashed'
  | 'unstashed'
  | 'vaulted'
  | 'unvaulted'
  | 'escrowed'

type CustodyAccount = Pick<
  typeof account.$inferSelect,
  'address' | 'vault' | 'stash'
>

const SOURCE_V2 = 'cryptopunks_v2'
const SOURCE_WPUNKS = 'wrapped_punks'
const SOURCE_C721 = 'cryptopunks_721'

const NATIVE_V2 = 'v2'

const WRAPPER_TRANSFER_TOPIC = toEventSelector(
  getAbiItem({ abi: WrappedPunksAbi, name: 'Transfer' }),
)
// topic0 of the canonical CryptoPunks `Transfer(address,address,uint256)` — the
// log `acceptBidForPunk` emits just before its buyer-zeroing `PunkBought`. Used
// by `readAcceptBidBuyer` to recover the real recipient.
const V2_TRANSFER_TOPIC = toEventSelector(
  getAbiItem({ abi: CryptoPunksV2Abi, name: 'Transfer' }),
)
const ZERO_TOPIC = toHex(0n, { size: 32 })

// One-time seed of daily ETH/USD prices for the pre-Chainlink window (V1
// launch → ~2021-07) from the committed CSV. Runs before the first V1 event
// so the cache is warm and sale handlers can stamp `usd_value_cents` from
// the cache without an RPC call. Post-CSV days are lazy-filled by the sale
// handlers themselves via Chainlink's onchain `latestRoundData`.
ponder.on('CryptoPunksV1:setup', async ({ context }) => {
  await seedPreChainlinkPricesFromCsv(context)
})

// ─────────────────────────────────────────────────────────────────────────────
// V2 — canonical CryptoPunks from block 3_914_495 onward.
// ─────────────────────────────────────────────────────────────────────────────

ponder.on('CryptoPunksV2:Assign', async ({ event, context }) => {
  const to = normalize(event.args.to)
  const punkId = event.args.punkIndex
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  await ensureAccounts(context, [to], event.block.number, event.block.timestamp)

  await insertActivity(context, {
    id: eventId(event),
    source: SOURCE_V2,
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
    nativeStandard: NATIVE_V2,
    isWrapped: false,
    wrapper: null,
    assignedTo: to,
    lastTransferAt: event.block.timestamp,
    block: event.block.number,
    timestamp: event.block.timestamp,
  })
})

ponder.on('CryptoPunksV2:PunkTransfer', async ({ event, context }) => {
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
    WRAPPER_ADDRESSES_LOWER.has(from.toLowerCase()) &&
    (await isWrapperUnwrapByproduct(context, meta.tx_hash, from, punkId))

  if (!unwrapByproduct) {
    const transferActivity = await classifyNativeTransfer(context, from, to)

    await insertActivity(context, {
      id: eventId(event),
      source: SOURCE_V2,
      source_event: 'PunkTransfer',
      type: transferActivity.type,
      punk_id: punkId,
      actor: transferActivity.actor,
      from,
      to,
      ...meta,
    })
  }

  // Wrap state is owned by the wrapper Transfer handlers. We only touch the
  // public `owner` field here when the Punk is not currently wrapped — a
  // wrapped Punk reports the ERC-721 owner, not the native one.
  const current = await context.db.find(punk, { punk_id: punkId })
  if (current?.is_wrapped) {
    await context.db.update(punk, { punk_id: punkId }).set({
      native_owner: to,
      native_standard: NATIVE_V2,
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
    nativeStandard: NATIVE_V2,
    isWrapped: false,
    wrapper: null,
    lastTransferAt: event.block.timestamp,
    block: event.block.number,
    timestamp: event.block.timestamp,
  })
})

ponder.on('CryptoPunksV2:PunkOffered', async ({ event, context }) => {
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
    source: SOURCE_V2,
    source_event: 'PunkOffered',
    type: 'listing',
    punk_id: punkId,
    actor: seller,
    seller,
    listing_wei: minValue,
    only_sell_to: onlySellTo === ZERO_ADDRESS ? null : onlySellTo,
    ...meta,
  })

  await upsertListing(context, punkId, {
    seller,
    minValueWei: minValue,
    onlySellTo: onlySellTo === ZERO_ADDRESS ? null : onlySellTo,
    active,
    meta,
  })
})

ponder.on('CryptoPunksV2:PunkNoLongerForSale', async ({ event, context }) => {
  const meta = eventMeta(event)
  await recordSelfInitiatedInteraction(context, event)
  const existing = await context.db.find(listing, {
    punk_id: event.args.punkIndex,
  })

  // The contract emits `PunkNoLongerForSale` whenever the owner calls
  // `punkNoLongerForSale`, regardless of whether the punk was actually listed.
  // Only record a cancellation activity if there was a real prior listing.
  if (existing?.active) {
    await insertActivity(context, {
      id: eventId(event),
      source: SOURCE_V2,
      source_event: 'PunkNoLongerForSale',
      type: 'listing_cancelled',
      punk_id: event.args.punkIndex,
      actor: existing.seller,
      seller: existing.seller,
      ...meta,
    })
  }

  await clearListing(context, event.args.punkIndex, meta)
})

ponder.on('CryptoPunksV2:PunkBidEntered', async ({ event, context }) => {
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
    source: SOURCE_V2,
    source_event: 'PunkBidEntered',
    type: 'bid',
    punk_id: event.args.punkIndex,
    actor: bidder,
    bidder,
    wei_amount: event.args.value,
    ...meta,
  })

  await upsertPunkBid(context, event.args.punkIndex, {
    bidder,
    valueWei: event.args.value,
    active: true,
    meta,
  })
})

ponder.on('CryptoPunksV2:PunkBidWithdrawn', async ({ event, context }) => {
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
    source: SOURCE_V2,
    source_event: 'PunkBidWithdrawn',
    type: 'bid_cancelled',
    punk_id: event.args.punkIndex,
    actor: bidder,
    bidder,
    wei_amount: event.args.value,
    ...meta,
  })

  await upsertPunkBid(context, event.args.punkIndex, {
    bidder,
    valueWei: event.args.value,
    active: false,
    meta,
  })
})

ponder.on('CryptoPunksV2:PunkBought', async ({ event, context }) => {
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
  const activeBid = await context.db.find(punkBid, { punk_id: punkId })
  const saleWei =
    event.args.value === 0n ? (activeBid?.value_wei ?? 0n) : event.args.value

  await clearListingAndBid(context, punkId, meta)

  // PunkBought to a wrapper with 0 value is the wrap mechanic, not a sale.
  // The wrapper's mint Transfer will be recorded as a `wrap` event.
  const isWrapperSink =
    WRAPPER_ADDRESSES_LOWER.has(to.toLowerCase()) && event.args.value === 0n

  if (!isWrapperSink) {
    await insertActivity(context, {
      id: eventId(event),
      source: SOURCE_V2,
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
  }

  // Wrap state is updated by the wrapper Transfer event in the same tx; here
  // we only refresh native owner + sale price.
  const current = await context.db.find(punk, { punk_id: punkId })
  if (current?.is_wrapped) {
    await context.db.update(punk, { punk_id: punkId }).set({
      native_owner: to,
      native_standard: NATIVE_V2,
      last_transfer_at: event.block.timestamp,
      last_sale_wei: isWrapperSink ? current.last_sale_wei : saleWei,
      updated_at: event.block.timestamp,
      block_number: event.block.number,
    })
    return
  }

  await upsertPunk(context, {
    punkId,
    owner: to,
    nativeOwner: to,
    nativeStandard: NATIVE_V2,
    isWrapped: false,
    wrapper: null,
    lastTransferAt: event.block.timestamp,
    lastSaleWei: isWrapperSink ? undefined : saleWei,
    block: event.block.number,
    timestamp: event.block.timestamp,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Wrapped CryptoPunks (V2 wrapper).
// ─────────────────────────────────────────────────────────────────────────────

ponder.on('WrappedPunks:Transfer', async ({ event, context }) => {
  await handleWrapperTransfer({
    context,
    event,
    source: SOURCE_WPUNKS,
    wrapper: 'wrapped_punks',
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CryptoPunks721 (modern V2 wrapper).
// ─────────────────────────────────────────────────────────────────────────────

ponder.on('CryptoPunks721:Transfer', async ({ event, context }) => {
  await handleWrapperTransfer({
    context,
    event,
    source: SOURCE_C721,
    wrapper: 'cryptopunks_721',
  })
})

// Tracks every `UserProxy` registration so the `accounts` table can resolve
// proxy address → owner EOA for profile-URL canonicalization.
ponder.on('WrappedPunks:ProxyRegistered', async ({ event, context }) => {
  const user = normalize(event.args.user)
  const proxy = normalize(event.args.proxy)
  await recordSelfInitiatedInteraction(context, event)
  await recordUserProxy(
    context,
    user,
    proxy,
    event.block.number,
    event.block.timestamp,
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Per-user contract deployments (PunksVault clone, Yuga Stash proxy).
// ─────────────────────────────────────────────────────────────────────────────

// Fires the first time a user's `PunksVault` clone is deployed (by them or by
// a third party via `ensureVault`). The event carries both owner and vault,
// so we can flip `vault_deployed` without an extra eth_call.
ponder.on('PunksVaultFactory:VaultDeployed', async ({ event, context }) => {
  await recordSelfInitiatedInteraction(context, event)
  await markVaultDeployed(
    context,
    event.args.owner,
    event.args.vault,
    event.block.number,
    event.block.timestamp,
  )
})

// Fires for every Stash the factory deploys. The inherited ERC1967Factory
// event only carries `(proxy, implementation)`, so we read `proxy.owner()`
// at the event block to recover the EOA the Stash belongs to.
ponder.on('StashFactory:Deployed', async ({ event, context }) => {
  await recordSelfInitiatedInteraction(context, event)
  const proxy = event.args.proxy
  const owner = await context.client.readContract({
    address: proxy,
    abi: StashProxyAbi,
    functionName: 'owner',
    blockNumber: event.block.number,
  })
  await markStashDeployed(
    context,
    owner,
    proxy,
    event.block.number,
    event.block.timestamp,
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type WrapperTransferEvent = {
  args:
    | { from: Address; to: Address; tokenId: bigint }
    | {
        from: Address
        to: Address
        id: bigint
      }
} & PonderEvent

async function handleWrapperTransfer(opts: {
  context: Context
  event: WrapperTransferEvent
  source: typeof SOURCE_WPUNKS | typeof SOURCE_C721
  wrapper: 'wrapped_punks' | 'cryptopunks_721'
}) {
  const { context, event, source, wrapper } = opts
  const args = event.args as {
    from: Address
    to: Address
    tokenId?: bigint
    id?: bigint
  }
  const from = normalize(args.from)
  const to = normalize(args.to)
  const punkId = (args.tokenId ?? args.id) as bigint
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
      source,
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
      wrapper,
      lastTransferAt: event.block.timestamp,
      block: event.block.number,
      timestamp: event.block.timestamp,
    })
    await clearListingAndBid(context, punkId, meta)
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
      source,
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
      nativeStandard: NATIVE_V2,
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
    source,
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
    wrapper,
    lastTransferAt: event.block.timestamp,
    block: event.block.number,
    timestamp: event.block.timestamp,
  })
}

async function upsertPunk(
  context: Context,
  args: {
    punkId: bigint
    owner: Address
    nativeOwner?: Address
    nativeStandard?: typeof NATIVE_V2
    isWrapped: boolean
    wrapper: ReturnType<typeof wrapperKindFor>
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
      native_owner: args.nativeOwner ?? args.owner,
      native_standard: args.nativeStandard ?? NATIVE_V2,
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
      native_standard: args.nativeStandard ?? row.native_standard,
      is_wrapped: args.isWrapped,
      wrapper: args.wrapper,
      assigned_to: args.assignedTo ?? row.assigned_to,
      last_transfer_at: args.lastTransferAt ?? row.last_transfer_at,
      last_sale_wei: args.lastSaleWei ?? row.last_sale_wei,
      updated_at: args.timestamp,
      block_number: args.block,
    }))
}

async function upsertListing(
  context: Context,
  punkId: bigint,
  args: {
    seller: Address
    minValueWei: bigint
    onlySellTo: Address | null
    active: boolean
    meta: EventMeta
  },
) {
  await context.db
    .insert(listing)
    .values({
      punk_id: punkId,
      seller: args.seller,
      min_value_wei: args.minValueWei,
      only_sell_to: args.onlySellTo,
      active: args.active,
      ...args.meta,
      updated_at: args.meta.timestamp,
    })
    .onConflictDoUpdate({
      seller: args.seller,
      min_value_wei: args.minValueWei,
      only_sell_to: args.onlySellTo,
      active: args.active,
      ...args.meta,
      updated_at: args.meta.timestamp,
    })
}

async function upsertPunkBid(
  context: Context,
  punkId: bigint,
  args: {
    bidder: Address
    valueWei: bigint
    active: boolean
    meta: EventMeta
  },
) {
  await context.db
    .insert(punkBid)
    .values({
      punk_id: punkId,
      bidder: args.bidder,
      value_wei: args.valueWei,
      active: args.active,
      ...args.meta,
      updated_at: args.meta.timestamp,
    })
    .onConflictDoUpdate({
      bidder: args.bidder,
      value_wei: args.valueWei,
      active: args.active,
      ...args.meta,
      updated_at: args.meta.timestamp,
    })
}

async function clearListingAndBid(
  context: Context,
  punkId: bigint,
  meta: EventMeta,
) {
  await Promise.all([
    clearListing(context, punkId, meta),
    clearPunkBid(context, punkId, meta),
  ])
}

async function clearListing(context: Context, punkId: bigint, meta: EventMeta) {
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

async function clearPunkBid(context: Context, punkId: bigint, meta: EventMeta) {
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
        address: CRYPTOPUNKS_V2_ADDRESS,
        abi: CryptoPunksV2Abi,
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
    address: CRYPTOPUNKS_V2_ADDRESS,
    abi: CryptoPunksV2Abi,
    functionName: 'punkIndexToAddress',
    args: [punkId],
    blockNumber,
  })
  return normalize(owner)
}

async function classifyNativeTransfer(
  context: Context,
  from: Address,
  to: Address,
): Promise<{ type: TransferActivityType; actor: Address }> {
  const custodyOwner = await findCustodyOwner(context, from)
  if (custodyOwner && sameAddress(custodyOwner.stash, from)) {
    return { type: 'unstashed', actor: custodyOwner.address }
  }
  if (custodyOwner && sameAddress(custodyOwner.vault, from)) {
    // Vault → PunksAuctionEscrow is a lot deposit, not a generic unvault.
    // Surface it as its own kind so the activity feed can label it "Escrowed"
    // and keep the broader escrow-suppression rule intact for settlement
    // shuffles (escrow → buyer is already covered by `AuctionItemDelivered`).
    if (sameAddress(to, PUNKS_AUCTION_ESCROW_ADDRESS)) {
      return { type: 'escrowed', actor: custodyOwner.address }
    }
    return { type: 'unvaulted', actor: custodyOwner.address }
  }

  const sender = await context.db.find(account, { address: from })
  if (sameAddress(sender?.stash, to)) {
    return { type: 'stashed', actor: from }
  }
  if (sameAddress(sender?.vault, to)) {
    return { type: 'vaulted', actor: from }
  }

  return { type: 'transfer', actor: from }
}

async function findCustodyOwner(
  context: Context,
  custodyAddress: Address,
): Promise<CustodyAccount | null> {
  const address = custodyAddress.toLowerCase() as Address
  const rows = await context.db.sql
    .select({
      address: account.address,
      vault: account.vault,
      stash: account.stash,
    })
    .from(account)
    .where(or(eq(account.stash, address), eq(account.vault, address)))
    .limit(1)

  return rows[0] ?? null
}

// WrappedPunks and CryptoPunks721 unwraps burn the ERC-721 token, then transfer
// the native Punk from the wrapper contract to the caller. The burn is the
// user-facing unwrap row; the native PunkTransfer is bookkeeping for state.
async function isWrapperUnwrapByproduct(
  context: Context,
  txHash: Address,
  wrapperAddress: Address,
  punkId: bigint,
): Promise<boolean> {
  const receipt = await context.client.getTransactionReceipt({ hash: txHash })
  const punkTopic = toHex(punkId, { size: 32 })
  return receipt.logs.some(
    (log) =>
      normalize(log.address) === wrapperAddress &&
      log.topics[0] === WRAPPER_TRANSFER_TOPIC &&
      log.topics[2] === ZERO_TOPIC &&
      log.topics[3] === punkTopic,
  )
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
    if (normalize(log.address) !== CRYPTOPUNKS_V2_ADDRESS) continue
    if (log.topics[0] !== V2_TRANSFER_TOPIC) continue
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

// PunksMarket / PunksAuction settlements shuffle Punks through their own
// contracts (and PunksAuctionEscrow for the auction stack) before delivery,
// so the V2 / wrapper handlers see redundant transfer / sale logs that have
// nothing to do with the user-facing trade. Drop those — the canonical event
// is emitted by the originating market.
const SUPPRESS_ADDRESSES_LOWER = new Set<string>([
  PUNKS_MARKET_ADDRESS.toLowerCase(),
  PUNKS_AUCTION_ADDRESS.toLowerCase(),
  PUNKS_AUCTION_ESCROW_ADDRESS.toLowerCase(),
])

function touchesSuppressedAddress(addr: string | null | undefined): boolean {
  return !!addr && SUPPRESS_ADDRESSES_LOWER.has(addr.toLowerCase())
}

function shouldSuppressV2Activity(
  values: Omit<
    typeof activityEvent.$inferInsert,
    'day_unix' | 'usd_value_cents'
  >,
): boolean {
  // `escrowed` is the lot-deposit (vault → escrow) row we explicitly want to
  // surface — keep it even though `to` is the suppressed escrow address.
  if (values.type === 'escrowed') return false
  return (
    touchesSuppressedAddress(values.from) ||
    touchesSuppressedAddress(values.to) ||
    touchesSuppressedAddress(values.seller) ||
    touchesSuppressedAddress(values.buyer)
  )
}

async function insertActivity(
  context: Context,
  values: Omit<
    typeof activityEvent.$inferInsert,
    'day_unix' | 'usd_value_cents'
  >,
) {
  if (shouldSuppressV2Activity(values)) return
  // Compute USD cents whenever the event carries a wei amount. Cache lookup
  // first (zero RPC for any day in `eth_usd_prices`); on miss the helper
  // reads Chainlink's `latestRoundData` at this block and back-fills the
  // cache so the next event on the same day is a cheap hit. Pre-aggregator
  // days that aren't in the CSV stay null.
  let usdValueCents: bigint | null = null
  if (values.wei_amount !== null && values.wei_amount !== undefined) {
    usdValueCents = await usdValueCentsForBlock(
      context,
      { number: values.block_number, timestamp: values.timestamp },
      values.wei_amount,
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

function eventMeta(event: PonderEvent): EventMeta {
  return {
    tx_hash: event.transaction.hash,
    block_number: event.block.number,
    log_index: event.log.logIndex,
    timestamp: event.block.timestamp,
  }
}

function sameAddress(a: string | null | undefined, b: string): boolean {
  return !!a && a.toLowerCase() === b.toLowerCase()
}

function normalize(address: Address): Address {
  return getAddress(address)
}
