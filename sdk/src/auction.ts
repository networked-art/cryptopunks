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
