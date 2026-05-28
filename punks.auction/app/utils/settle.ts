import type { AccountPunkInventoryItem } from '~/composables/useAccountPunkInventory'
import type {
  LotRecord,
  OfferRecord,
  OfferSlot,
  TokenStandardValue,
} from '~/utils/auction'

/// 'open' opens a lot at its reserve with no offer involved.
/// 'start' seeds a 24-hour auction with an offer as the opening bid.
/// 'accept' settles instantly to the offerer (seller-gated by contract).
export type SettleMode = 'open' | 'start' | 'accept'

/// Legacy alias kept for the selection step components.
export type OfferFulfillmentMode = Exclude<SettleMode, 'open'>

export type OfferFulfillmentCandidate = AccountPunkInventoryItem & {
  activeLotId?: bigint
  unavailableReason?: string
}

export type OfferFulfillmentSlot = {
  index: number
  slot: OfferSlot
  title: string
  detail: string
  candidates: OfferFulfillmentCandidate[]
}

export type SelectedFulfillmentItem = AccountPunkInventoryItem & {
  slotIndex: number
  weightBps: number
}

export type SettleItemRef = {
  standard: TokenStandardValue
  punkId: number
}

/// Every shape the Settle dialog accepts. The dialog branches on which fields
/// are present:
///   - `mode === 'open'`           → openAuction(lot, reserve)
///   - `lot` + `offer`             → accept/start against an existing lot
///   - `items` + `offer`           → create lot + accept/start with those items
///   - `offer` only                → discover lot or run the inventory picker
export type SettleRequest =
  | { mode: 'open'; lot: LotRecord }
  | { mode: OfferFulfillmentMode; lot: LotRecord; offer: OfferRecord }
  | {
      mode: OfferFulfillmentMode
      offer: OfferRecord
      items: readonly SettleItemRef[]
    }
  | { mode: OfferFulfillmentMode; offer: OfferRecord }
