import type { PunksSdk } from '@networked-art/punks-sdk'
import {
  filterIsEmpty,
  offerSlotCriteriaToQuery,
  offerSlotMatchingIds,
  type OfferRecord,
  type OfferSlot,
} from '~/utils/auction'
import {
  countOfferSlotMatches,
  isOfferSlotSet,
  offerSlotDetail,
  offerSlotExactItem,
  offerSlotFallbackIcon,
  offerSlotTitle,
  standardQualifier,
  type OfferSlotDisplay,
  type OfferSlotPreviewItem,
} from '~/composables/useOfferSlotDisplay'

export type OfferTargetThumb = OfferSlotPreviewItem
export type OfferTargetCoverItem =
  | ({ kind: 'punk' } & OfferTargetThumb)
  | { kind: 'icon'; icon: string }

export type OfferTargetDisplay = {
  title: string
  detail: string
  icon?: string
  thumbs: OfferTargetThumb[]
  coverItems?: OfferTargetCoverItem[]
}

export function offerRecordTarget(
  offer: OfferRecord,
  offline: PunksSdk,
): OfferTargetDisplay {
  if (offer.slots.length === 1) {
    return offerSlotTarget(offer.slots[0]!, offline)
  }

  return {
    title: `${offer.slots.length.toLocaleString()} Items`,
    detail: slotStandardsLabel(offer.slots),
    thumbs: [],
    coverItems: offerSlotCoverItems(offer.slots, offline),
  }
}

export function offerSlotTarget(
  slot: OfferSlot,
  offline: PunksSdk,
): OfferTargetDisplay {
  const exact = offerSlotExactItem(slot)

  if (exact) {
    return {
      title: `Punk #${exact.punkId}`,
      detail: standardQualifier(exact.standard),
      thumbs: [exact],
    }
  }

  return {
    title: offerSlotTitle(slot, offline),
    detail: offerSlotDetail(slot, countOfferSlotMatches(slot, offline)),
    icon: offerSlotFallbackIcon(slot),
    thumbs: [],
  }
}

export function offerSlotDisplayTarget(
  slot: OfferSlot,
  display: OfferSlotDisplay,
): OfferTargetDisplay {
  const exact = offerSlotExactItem(slot)

  if (exact) {
    return {
      title: `Punk #${exact.punkId}`,
      detail: standardQualifier(exact.standard),
      thumbs: [exact],
    }
  }

  return {
    title: display.title,
    detail: display.detail,
    icon: display.icon,
    thumbs: display.previewItems,
  }
}

function offerSlotCoverItems(
  slots: OfferRecord['slots'],
  offline: PunksSdk,
): OfferTargetCoverItem[] {
  return slots
    .map((slot) => offerSlotCoverItem(slot, offline))
    .filter((item): item is OfferTargetCoverItem => !!item)
}

function offerSlotCoverItem(
  slot: OfferSlot,
  offline: PunksSdk,
): OfferTargetCoverItem | null {
  if (!filterIsEmpty(slot.criteria) || isOfferSlotSet(slot)) {
    return {
      kind: 'icon',
      icon: offerSlotFallbackIcon(slot),
    }
  }

  const punkId = slot.includeIds[0] ?? searchSlotMatches(slot, offline)[0]
  return punkId === undefined
    ? null
    : {
        kind: 'punk',
        punkId,
        standard: slot.standard,
      }
}

function searchSlotMatches(slot: OfferSlot, offline: PunksSdk) {
  try {
    return offerSlotMatchingIds(
      slot,
      offline.search(offerSlotCriteriaToQuery(slot)),
    )
  } catch {
    return []
  }
}

function slotStandardsLabel(slots: OfferRecord['slots']) {
  const standards = new Set(slots.map((slot) => slot.standard))
  if (standards.size > 1) return 'Mixed standards'

  const [standard] = standards
  return standard === undefined ? '' : standardQualifier(standard)
}
