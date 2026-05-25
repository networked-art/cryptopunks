import type { AccountPunkInventoryItem } from '~/composables/useAccountPunkInventory'
import type { OfferSlot } from '~/utils/auction'

export type OfferFulfillmentMode = 'accept' | 'start'

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
