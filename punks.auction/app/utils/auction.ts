import type { Address, PublicClient } from 'viem'
import {
  punksAuctionAbi,
  type PunkQuery,
  type PunksFilter,
} from '@networked-art/punks-sdk'
import { PUNKS_AUCTION_ADDRESS, isAuctionDeployed } from '~/utils/addresses'

// ──────────────────────────────── Constants ────────────────────────────────

/// Mirrors `PunksAuction`'s on-chain constants.
export const BID_INCREASE_BPS = 1_000n
export const BPS = 10_000n
export const AUCTION_DURATION_SECONDS = 24 * 60 * 60
export const BIDDING_GRACE_SECONDS = 15 * 60

// ────────────────────────────────── Types ──────────────────────────────────

/// Punk standards an auction lot/offer item can reference.
export const TokenStandard = {
  CryptoPunks: 0,
  CryptoPunksV1: 1,
} as const
export type TokenStandardValue =
  (typeof TokenStandard)[keyof typeof TokenStandard]

export function standardLabel(standard: TokenStandardValue): string {
  return standard === TokenStandard.CryptoPunksV1 ? 'V1' : 'CryptoPunks'
}

/// Route to the right punk detail page for an item's standard.
export function punkHref(standard: TokenStandardValue, punkId: number): string {
  return standard === TokenStandard.CryptoPunksV1
    ? `/punks/v1/${punkId}`
    : `/punks/${punkId}`
}

export type LotItem = {
  standard: TokenStandardValue
  punkId: number
  weightBps: number
}

export function formatLotItemLabel(item: Pick<LotItem, 'standard' | 'punkId'>) {
  return `Punk #${item.punkId}${
    item.standard === TokenStandard.CryptoPunksV1 ? ' (V1)' : ''
  }`
}

export function formatLotItemsLabel(items: readonly LotItem[]) {
  const [item] = items
  if (items.length === 1 && item) return formatLotItemLabel(item)
  return `${items.length.toLocaleString()} Punks`
}

export type LotRecord = {
  id: bigint
  seller: Address
  reserveWei: bigint
  onlySellTo: Address
  items: LotItem[]
}

export type AuctionRecord = {
  id: bigint
  seller: Address
  latestBidder: Address
  latestBidWei: bigint
  endTimestamp: number
  settled: boolean
  items: LotItem[]
}

export type OfferSlot = {
  criteria: PunksFilter
  standard: TokenStandardValue
  includeIds: number[]
  excludeIds: number[]
}

export type OfferRecord = {
  id: bigint
  offerer: Address
  amountWei: bigint
  slots: OfferSlot[]
}

export type AuctionStatus = 'live' | 'ended' | 'settled'

// ──────────────────────────────── Helpers ──────────────────────────────────

export function auctionStatus(
  auction: Pick<AuctionRecord, 'endTimestamp' | 'settled'>,
  nowSec: number = Math.floor(Date.now() / 1000),
): AuctionStatus {
  if (auction.settled) return 'settled'
  return nowSec > auction.endTimestamp ? 'ended' : 'live'
}

/// Minimum next bid: the previous bid raised by `BID_INCREASE_BPS`, rounded up
/// — identical to `PunksAuction._currentMinBidWei`.
export function minNextBidWei(previousWei: bigint): bigint {
  return (previousWei * (BPS + BID_INCREASE_BPS) + BPS - 1n) / BPS
}

/// Whether a slot pins a single Punk (one include id, no criteria, no
/// excludes) — the only shape `acceptOffer` settles directly.
function filterIsEmpty(filter: PunksFilter): boolean {
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

/// Rebuilds an offline `PunkQuery` from an offer slot so the UI can count
/// matches and link to the search page. `max === 0` means "no constraint" in
/// the on-chain `PunksFilter`.
export function offerSlotToQuery(slot: OfferSlot): PunkQuery {
  const c = slot.criteria
  const query: PunkQuery = {}
  if (
    c.requiredTraitMask !== 0n ||
    c.forbiddenTraitMask !== 0n ||
    c.anyOfTraitMask !== 0n
  ) {
    query.attributes = {
      requiredMask: c.requiredTraitMask,
      forbiddenMask: c.forbiddenTraitMask,
      anyOfMask: c.anyOfTraitMask,
    }
  }
  if (
    c.requiredColorMask !== 0n ||
    c.forbiddenColorMask !== 0n ||
    c.anyOfColorMask !== 0n
  ) {
    query.colors = {
      requiredMask: c.requiredColorMask,
      forbiddenMask: c.forbiddenColorMask,
      anyOfMask: c.anyOfColorMask,
    }
  }
  if (c.maxPixelCount > 0) {
    query.pixelCount = { min: c.minPixelCount, max: c.maxPixelCount }
  }
  if (c.maxColorCount > 0) {
    query.colorCount = { min: c.minColorCount, max: c.maxColorCount }
  }
  if (slot.includeIds.length) query.ids = slot.includeIds
  if (slot.excludeIds.length) query.excludeIds = slot.excludeIds
  return query
}

/// A short human label for an offer slot.
export function offerSlotSummary(slot: OfferSlot): string {
  if (slot.includeIds.length === 1 && filterIsEmpty(slot.criteria)) {
    return `Punk #${slot.includeIds[0]}`
  }
  const parts: string[] = []
  if (!filterIsEmpty(slot.criteria)) parts.push('trait criteria')
  if (slot.includeIds.length) parts.push(`${slot.includeIds.length} included`)
  if (slot.excludeIds.length) parts.push(`${slot.excludeIds.length} excluded`)
  return parts.length ? parts.join(' · ') : 'any Punk'
}

// ──────────────────────────────── Reads ────────────────────────────────────

const auctionContract = {
  address: PUNKS_AUCTION_ADDRESS,
  abi: punksAuctionAbi,
} as const

/// Resolves the highest assigned id for `lots` / `auctions` / `offers`.
async function lastId(
  client: PublicClient,
  fn: 'lastLotId' | 'lastAuctionId' | 'lastOfferId',
): Promise<bigint> {
  return client.readContract({ ...auctionContract, functionName: fn })
}

function idRange(last: bigint): bigint[] {
  const ids: bigint[] = []
  for (let i = 1n; i <= last; i++) ids.push(i)
  return ids
}

function decodeItems(
  raw: readonly { standard: number; punkId: number; weightBps: number }[],
): LotItem[] {
  return raw.map((item) => ({
    standard: item.standard as TokenStandardValue,
    punkId: item.punkId,
    weightBps: item.weightBps,
  }))
}

export async function readLots(client: PublicClient): Promise<LotRecord[]> {
  if (!isAuctionDeployed()) return []
  const ids = idRange(await lastId(client, 'lastLotId'))
  if (!ids.length) return []

  const cores = await client.multicall({
    contracts: ids.map((id) => ({
      ...auctionContract,
      functionName: 'lots' as const,
      args: [id] as const,
    })),
  })
  const present = ids
    .map((id, i) => ({ id, core: cores[i] }))
    .filter(
      (row) =>
        row.core?.status === 'success' &&
        (row.core.result as readonly [Address, bigint, Address])[0] !==
          '0x0000000000000000000000000000000000000000',
    )
  if (!present.length) return []

  const itemsResults = await client.multicall({
    contracts: present.map((row) => ({
      ...auctionContract,
      functionName: 'getLotItems' as const,
      args: [row.id] as const,
    })),
  })

  return present.map((row, i) => {
    const [seller, reserveWei, onlySellTo] = row.core!.result as readonly [
      Address,
      bigint,
      Address,
    ]
    const itemsRes = itemsResults[i]
    return {
      id: row.id,
      seller,
      reserveWei,
      onlySellTo,
      items:
        itemsRes?.status === 'success'
          ? decodeItems(itemsRes.result as never)
          : [],
    }
  })
}

export async function readAuctions(
  client: PublicClient,
): Promise<AuctionRecord[]> {
  if (!isAuctionDeployed()) return []
  const ids = idRange(await lastId(client, 'lastAuctionId'))
  if (!ids.length) return []

  const cores = await client.multicall({
    contracts: ids.map((id) => ({
      ...auctionContract,
      functionName: 'auctions' as const,
      args: [id] as const,
    })),
  })
  const present = ids
    .map((id, i) => ({ id, core: cores[i] }))
    .filter(
      (row) =>
        row.core?.status === 'success' &&
        Number(
          (row.core.result as readonly [Address, Address, bigint, number, boolean])[3],
        ) !== 0,
    )
  if (!present.length) return []

  const itemsResults = await client.multicall({
    contracts: present.map((row) => ({
      ...auctionContract,
      functionName: 'getAuctionItems' as const,
      args: [row.id] as const,
    })),
  })

  return present.map((row, i) => {
    const [seller, latestBidder, latestBidWei, endTimestamp, settled] = row.core!
      .result as readonly [Address, Address, bigint, number, boolean]
    const itemsRes = itemsResults[i]
    return {
      id: row.id,
      seller,
      latestBidder,
      latestBidWei,
      endTimestamp: Number(endTimestamp),
      settled,
      items:
        itemsRes?.status === 'success'
          ? decodeItems(itemsRes.result as never)
          : [],
    }
  })
}

export async function readOffers(client: PublicClient): Promise<OfferRecord[]> {
  if (!isAuctionDeployed()) return []
  const ids = idRange(await lastId(client, 'lastOfferId'))
  if (!ids.length) return []

  const cores = await client.multicall({
    contracts: ids.map((id) => ({
      ...auctionContract,
      functionName: 'offers' as const,
      args: [id] as const,
    })),
  })
  const present = ids
    .map((id, i) => ({ id, core: cores[i] }))
    .filter(
      (row) =>
        row.core?.status === 'success' &&
        (row.core.result as readonly [bigint, Address])[1] !==
          '0x0000000000000000000000000000000000000000',
    )
  if (!present.length) return []

  const slotResults = await client.multicall({
    contracts: present.map((row) => ({
      ...auctionContract,
      functionName: 'getOfferSlots' as const,
      args: [row.id] as const,
    })),
  })

  return present.map((row, i) => {
    const [amountWei, offerer] = row.core!.result as readonly [bigint, Address]
    const slotsRes = slotResults[i]
    return {
      id: row.id,
      offerer,
      amountWei,
      slots:
        slotsRes?.status === 'success'
          ? decodeSlots(slotsRes.result as never)
          : [],
    }
  })
}

type RawSlot = {
  criteria: PunksFilter
  standard: number
  includeIds: readonly number[]
  excludeIds: readonly number[]
}

function decodeSlots(raw: readonly RawSlot[]): OfferSlot[] {
  return raw.map((slot) => ({
    criteria: slot.criteria,
    standard: slot.standard as TokenStandardValue,
    includeIds: [...slot.includeIds],
    excludeIds: [...slot.excludeIds],
  }))
}

/// ETH credited to `account` in the auction's pull-payment escrow.
export async function readEscrowBalance(
  client: PublicClient,
  account: Address,
): Promise<bigint> {
  if (!isAuctionDeployed()) return 0n
  return client.readContract({
    ...auctionContract,
    functionName: 'balances',
    args: [account],
  })
}
