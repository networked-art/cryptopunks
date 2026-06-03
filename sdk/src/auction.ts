import type { Address } from 'viem'
import { ZERO_ADDRESS } from './constants'
import type { LotItem } from './actions'
import { isPunksFilterEmpty } from './query'
import type { CompiledOfferSlot } from './query'

export { isPunksFilterEmpty } from './query'

/// Mirrors `PunksAuction`'s bidding constants.
export const PUNKS_AUCTION_BID_INCREASE_BPS = 1_000n
export const PUNKS_AUCTION_BPS = 10_000n
export const PUNKS_AUCTION_DURATION_SECONDS = 24 * 60 * 60
export const PUNKS_AUCTION_BIDDING_GRACE_SECONDS = 15 * 60

/// Mirrors `PunksAuction`, `PunkLots`, and `PunkPurchaseOffers` bounds.
export const PUNKS_AUCTION_MAX_LOT_ITEMS = 80
export const PUNKS_AUCTION_MAX_INSTANT_ITEMS = 40
export const PUNKS_AUCTION_MAX_OFFER_SLOTS = 80
export const PUNKS_AUCTION_MAX_SLOT_IDS = 64
export const PUNKS_AUCTION_TOTAL_WEIGHT_BPS = 10_000

export type PunksAuctionLotLike = {
  reserveWei: bigint
  onlySellTo: Address
  items: readonly Pick<LotItem, 'standard' | 'punkId'>[]
}

export type PunksAuctionOfferLike = {
  offerer: Address
  amountWei: bigint
  slots: readonly CompiledOfferSlot[]
}

/// Minimum next bid: the previous bid raised by `BID_INCREASE_BPS`, rounded up
/// exactly like `PunksAuction._currentMinBidWei`.
export function minPunksAuctionBidWei(previousWei: bigint): bigint {
  return (
    (previousWei * (PUNKS_AUCTION_BPS + PUNKS_AUCTION_BID_INCREASE_BPS) +
      PUNKS_AUCTION_BPS -
      1n) /
    PUNKS_AUCTION_BPS
  )
}

export function splitPunksAuctionLotWeights(count: number): number[] {
  if (!Number.isInteger(count) || count <= 0) return []
  const base = Math.floor(PUNKS_AUCTION_TOTAL_WEIGHT_BPS / count)
  return Array.from({ length: count }, (_value, index) =>
    index === count - 1
      ? PUNKS_AUCTION_TOTAL_WEIGHT_BPS - base * (count - 1)
      : base,
  )
}

/// Apportions the full lot weight (`PUNKS_AUCTION_TOTAL_WEIGHT_BPS`) across a
/// lot's items in proportion to `values` — a per-item value magnitude such as
/// the market model's fair value in wei. Returns integer basis points that are
/// each at least 1 (every item must carry weight on-chain) and sum to exactly
/// the lot total, using the largest-remainder method so rounding never drifts.
/// Falls back to an even split when there is nothing to weigh by (empty, or all
/// values non-positive).
export function splitPunksAuctionLotWeightsByValue(
  values: readonly bigint[],
): number[] {
  const count = values.length
  if (count === 0) return []
  if (count === 1) return [PUNKS_AUCTION_TOTAL_WEIGHT_BPS]

  const magnitudes = values.map((value) => (value > 0n ? value : 0n))
  const total = magnitudes.reduce((sum, value) => sum + value, 0n)
  if (total === 0n) return splitPunksAuctionLotWeights(count)

  // Reserve one basis point per item so each clears the contract's
  // `weightBps >= 1` rule, then apportion the remaining pool by value. The
  // floor of `value * pool / total` never exceeds `pool` (< 2^53), so the
  // bigint quotient narrows to a safe integer.
  const pool = BigInt(PUNKS_AUCTION_TOTAL_WEIGHT_BPS - count)
  const weights = magnitudes.map(
    (value) => 1 + Number((value * pool) / total),
  )
  let leftover =
    PUNKS_AUCTION_TOTAL_WEIGHT_BPS -
    weights.reduce((sum, weight) => sum + weight, 0)

  // Hand the leftover basis points to the largest fractional remainders, ties
  // broken by original order, so the assignment is deterministic.
  const byRemainder = magnitudes
    .map((value, index) => ({ remainder: (value * pool) % total, index }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    )
  for (let i = 0; i < byRemainder.length && leftover > 0; i += 1, leftover -= 1) {
    weights[byRemainder[i]!.index]! += 1
  }
  return weights
}

export function punksAuctionOfferSlotMatchesPunk(
  slot: CompiledOfferSlot,
  item: Pick<LotItem, 'standard' | 'punkId'>,
  matchesCriteria: (slot: CompiledOfferSlot, punkId: number) => boolean,
): boolean {
  if (slot.standard !== item.standard) return false
  if (slot.excludeIds.includes(item.punkId)) return false
  if (slot.includeIds.includes(item.punkId)) return true
  if (slot.includeIds.length && isPunksFilterEmpty(slot.criteria)) return false
  if (isPunksFilterEmpty(slot.criteria)) return true
  return matchesCriteria(slot, item.punkId)
}

export function punksAuctionLotMatchesOffer(
  offer: PunksAuctionOfferLike,
  lot: PunksAuctionLotLike,
  matchesCriteria: (slot: CompiledOfferSlot, punkId: number) => boolean,
): boolean {
  if (offer.slots.length !== lot.items.length) return false
  if (offer.amountWei < lot.reserveWei) return false
  if (
    lot.onlySellTo.toLowerCase() !== ZERO_ADDRESS &&
    lot.onlySellTo.toLowerCase() !== offer.offerer.toLowerCase()
  ) {
    return false
  }

  return offer.slots.every((slot, index) => {
    const item = lot.items[index]
    return (
      !!item && punksAuctionOfferSlotMatchesPunk(slot, item, matchesCriteria)
    )
  })
}
