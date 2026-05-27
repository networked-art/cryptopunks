import { parseAbiItem, type Address, type PublicClient } from 'viem'
import {
  PUNKS_AUCTION_BIDDING_GRACE_SECONDS,
  PUNKS_AUCTION_BID_INCREASE_BPS,
  PUNKS_AUCTION_BPS,
  PUNKS_AUCTION_DURATION_SECONDS,
  PUNKS_AUCTION_MAX_INSTANT_ITEMS,
  PUNKS_AUCTION_MAX_LOT_ITEMS,
  PUNKS_AUCTION_TOTAL_WEIGHT_BPS,
  PunkStandard as TokenStandard,
  ZERO_ADDRESS,
  isPunksFilterEmpty as filterIsEmpty,
  minPunksAuctionBidWei as minNextBidWei,
  punksAuctionLotMatchesOffer as lotMatchesOffer,
  punksAuctionOfferSlotMatchesPunk as offerSlotMatchesPunk,
  punksAuctionAbi,
  splitPunksAuctionLotWeights as equalLotWeights,
  type CompiledOfferSlot,
  type LotItem as SdkLotItem,
  type PunkQuery,
  type PunksFilter,
  type PunkStandardValue,
} from '@networked-art/punks-sdk'
import {
  PUNKS_AUCTION_ADDRESS,
  PUNKS_AUCTION_START_BLOCK,
} from '~/utils/addresses'
import { PUNK_BACKGROUNDS } from '~/utils/render'

// ──────────────────────────────── Constants ────────────────────────────────

export {
  PUNKS_AUCTION_BIDDING_GRACE_SECONDS as BIDDING_GRACE_SECONDS,
  PUNKS_AUCTION_BID_INCREASE_BPS as BID_INCREASE_BPS,
  PUNKS_AUCTION_BPS as BPS,
  PUNKS_AUCTION_DURATION_SECONDS as AUCTION_DURATION_SECONDS,
  PUNKS_AUCTION_MAX_INSTANT_ITEMS as MAX_INSTANT_ITEMS,
  PUNKS_AUCTION_MAX_LOT_ITEMS as MAX_LOT_ITEMS,
  PUNKS_AUCTION_TOTAL_WEIGHT_BPS as TOTAL_WEIGHT_BPS,
  TokenStandard,
  ZERO_ADDRESS,
  equalLotWeights,
  filterIsEmpty,
  lotMatchesOffer,
  minNextBidWei,
  offerSlotMatchesPunk,
}

// ────────────────────────────────── Types ──────────────────────────────────

/// Punk standards an auction lot/offer item can reference.
export type TokenStandardValue = PunkStandardValue

export function standardLabel(standard: TokenStandardValue): string {
  return standard === TokenStandard.CryptoPunksV1 ? 'V1' : 'CryptoPunks'
}

/// Route to the right punk detail page for an item's standard.
export function punkHref(standard: TokenStandardValue, punkId: number): string {
  return standard === TokenStandard.CryptoPunksV1
    ? `/punks/v1/${punkId}`
    : `/punks/${punkId}`
}

export type LotItem = SdkLotItem

export function formatLotItemLabel(item: Pick<LotItem, 'standard' | 'punkId'>) {
  return `Punk #${item.punkId}${
    item.standard === TokenStandard.CryptoPunksV1 ? ' (V1)' : ''
  }`
}

export function formatLotItemsLabel(items: readonly LotItem[]) {
  const [item] = items
  if (items.length === 1 && item) return formatLotItemLabel(item)
  return `${items.length.toLocaleString()} Items`
}

export function lotItemBackground(standard: TokenStandardValue): string {
  return standard === TokenStandard.CryptoPunksV1
    ? PUNK_BACKGROUNDS.v1
    : PUNK_BACKGROUNDS.default
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
  sourceLotId?: bigint
  seller: Address
  latestBidder: Address
  latestBidWei: bigint
  endTimestamp: number
  settled: boolean
  items: LotItem[]
}

export type OfferSlot = CompiledOfferSlot

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

/// Rebuilds an offline `PunkQuery` from a slot's criteria. `max === 0` means
/// "no constraint" in the on-chain `PunksFilter`.
export function offerSlotCriteriaToQuery(
  slot: Pick<OfferSlot, 'criteria'>,
): PunkQuery {
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
  return query
}

export function offerSlotToQuery(slot: OfferSlot): PunkQuery {
  const query = offerSlotCriteriaToQuery(slot)
  if (slot.includeIds.length) query.ids = slot.includeIds
  if (slot.excludeIds.length) query.excludeIds = slot.excludeIds
  return query
}

/// Mirrors contract matching for display counts: explicit excludes always win,
/// explicit includes extend non-empty criteria, and include-only slots stay exact.
export function offerSlotMatchingIds(
  slot: OfferSlot,
  criteriaMatches: readonly number[],
): number[] {
  const excluded = new Set(slot.excludeIds)
  const ids =
    filterIsEmpty(slot.criteria) && slot.includeIds.length
      ? slot.includeIds
      : [...criteriaMatches, ...slot.includeIds]

  return [...new Set(ids)]
    .filter((punkId) => !excluded.has(punkId))
    .sort((a, b) => a - b)
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

const AUCTION_INITIALISED = parseAbiItem(
  'event AuctionInitialised(uint256 indexed auctionId, uint256 indexed lotId, address indexed seller, uint8 itemCount, uint40 endTimestamp)',
)

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

async function readLotCore(
  client: PublicClient,
  id: bigint,
): Promise<{
  id: bigint
  seller: Address
  reserveWei: bigint
  onlySellTo: Address
} | null> {
  const result = await client.readContract({
    ...auctionContract,
    functionName: 'lots',
    args: [id],
  })
  const [seller, reserveWei, onlySellTo] = result as readonly [
    Address,
    bigint,
    Address,
  ]
  if (seller === '0x0000000000000000000000000000000000000000') return null
  return { id, seller, reserveWei, onlySellTo }
}

export async function readLot(
  client: PublicClient,
  id: bigint | number,
): Promise<LotRecord | null> {
  const lotId = BigInt(id)
  const core = await readLotCore(client, lotId)
  if (!core) return null

  const items = await client.readContract({
    ...auctionContract,
    functionName: 'getLotItems',
    args: [lotId],
  })
  return { ...core, items: decodeItems(items as never) }
}

export async function readLots(client: PublicClient): Promise<LotRecord[]> {
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

async function readAuctionCore(
  client: PublicClient,
  id: bigint,
): Promise<{
  id: bigint
  seller: Address
  latestBidder: Address
  latestBidWei: bigint
  endTimestamp: number
  settled: boolean
} | null> {
  const result = await client.readContract({
    ...auctionContract,
    functionName: 'auctions',
    args: [id],
  })
  const [seller, latestBidder, latestBidWei, endTimestamp, settled] =
    result as readonly [Address, Address, bigint, number, boolean]
  if (Number(endTimestamp) === 0) return null
  return {
    id,
    seller,
    latestBidder,
    latestBidWei,
    endTimestamp: Number(endTimestamp),
    settled,
  }
}

export async function readAuction(
  client: PublicClient,
  id: bigint | number,
): Promise<AuctionRecord | null> {
  const auctionId = BigInt(id)
  const core = await readAuctionCore(client, auctionId)
  if (!core) return null

  const [items, sourceLotId] = await Promise.all([
    client.readContract({
      ...auctionContract,
      functionName: 'getAuctionItems',
      args: [auctionId],
    }),
    readSourceLotIdForAuction(client, auctionId),
  ])
  return {
    ...core,
    sourceLotId: sourceLotId ?? undefined,
    items: decodeItems(items as never),
  }
}

export async function readAuctions(
  client: PublicClient,
): Promise<AuctionRecord[]> {
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
          (
            row.core.result as readonly [
              Address,
              Address,
              bigint,
              number,
              boolean,
            ]
          )[3],
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
  const sourceLotIds = await readAuctionSourceLotIds(client)

  return present.map((row, i) => {
    const [seller, latestBidder, latestBidWei, endTimestamp, settled] = row
      .core!.result as readonly [Address, Address, bigint, number, boolean]
    const itemsRes = itemsResults[i]
    return {
      id: row.id,
      sourceLotId: sourceLotIds.get(row.id),
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

export async function readAuctionForLot(
  client: PublicClient,
  lotId: bigint | number,
): Promise<AuctionRecord | null> {
  const logs = await client.getLogs({
    address: PUNKS_AUCTION_ADDRESS,
    event: AUCTION_INITIALISED,
    args: { lotId: BigInt(lotId) },
    fromBlock: PUNKS_AUCTION_START_BLOCK,
    toBlock: 'latest',
  })
  const latest = logs.at(-1)
  const auctionId = latest?.args.auctionId
  if (auctionId === undefined) return null
  const auction = await readAuction(client, auctionId)
  return auction ? { ...auction, sourceLotId: BigInt(lotId) } : null
}

async function readSourceLotIdForAuction(
  client: PublicClient,
  auctionId: bigint,
): Promise<bigint | null> {
  const logs = await client.getLogs({
    address: PUNKS_AUCTION_ADDRESS,
    event: AUCTION_INITIALISED,
    args: { auctionId },
    fromBlock: PUNKS_AUCTION_START_BLOCK,
    toBlock: 'latest',
  })
  return logs.at(-1)?.args.lotId ?? null
}

async function readAuctionSourceLotIds(
  client: PublicClient,
): Promise<Map<bigint, bigint>> {
  const logs = await client.getLogs({
    address: PUNKS_AUCTION_ADDRESS,
    event: AUCTION_INITIALISED,
    fromBlock: PUNKS_AUCTION_START_BLOCK,
    toBlock: 'latest',
  })
  return new Map(
    logs
      .filter(
        (
          log,
        ): log is typeof log & {
          args: { auctionId: bigint; lotId: bigint }
        } => log.args.auctionId !== undefined && log.args.lotId !== undefined,
      )
      .map((log) => [log.args.auctionId, log.args.lotId]),
  )
}

export async function readOffers(client: PublicClient): Promise<OfferRecord[]> {
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

export async function readLastOfferId(client: PublicClient): Promise<bigint> {
  return lastId(client, 'lastOfferId')
}

export async function readOffer(
  client: PublicClient,
  id: bigint | number,
): Promise<OfferRecord | null> {
  const offerId = BigInt(id)
  const result = await client.readContract({
    ...auctionContract,
    functionName: 'offers',
    args: [offerId],
  })
  const [amountWei, offerer] = result as readonly [bigint, Address]
  if (offerer === '0x0000000000000000000000000000000000000000') {
    return null
  }

  const slots = await client.readContract({
    ...auctionContract,
    functionName: 'getOfferSlots',
    args: [offerId],
  })
  return {
    id: offerId,
    offerer,
    amountWei,
    slots: decodeSlots(slots as never),
  }
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
  return client.readContract({
    ...auctionContract,
    functionName: 'balances',
    args: [account],
  })
}
