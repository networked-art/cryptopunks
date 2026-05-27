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
  type OfferSlotPreviewItem,
} from '~/composables/useOfferSlotDisplay'

export type OfferCardThumb = OfferSlotPreviewItem
export type OfferCardCoverItem =
  | ({ kind: 'punk' } & OfferCardThumb)
  | { kind: 'icon'; icon: string }

export type OfferCardTarget = {
  title: string
  detail: string
  icon?: string
  thumbs: OfferCardThumb[]
  coverItems?: OfferCardCoverItem[]
}

export function useOfferCard(offer: MaybeRefOrGetter<OfferRecord>) {
  const offline = usePunksOffline()

  const detailHref = computed(() => `/purchase-offers/${toValue(offer).id}`)

  const target = computed<OfferCardTarget>(() => {
    const record = toValue(offer)
    const exactItems = exactOfferItems(record)

    if (record.slots.length === 1) {
      const slot = record.slots[0]!
      const exact = exactItems[0]

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

    return {
      title: `${record.slots.length.toLocaleString()} Items`,
      detail: slotStandardsLabel(record.slots),
      thumbs: [],
      coverItems: offerSlotCoverItems(record.slots, offline),
    }
  })

  return {
    detailHref,
    target,
  }
}

function exactOfferItems(offer: OfferRecord): OfferCardThumb[] {
  return offer.slots
    .map((slot) => offerSlotExactItem(slot))
    .filter((item): item is OfferCardThumb => !!item)
}

function offerSlotCoverItems(
  slots: OfferRecord['slots'],
  offline: ReturnType<typeof usePunksOffline>,
): OfferCardCoverItem[] {
  return slots
    .map((slot) => offerSlotCoverItem(slot, offline))
    .filter((item): item is OfferCardCoverItem => !!item)
}

function offerSlotCoverItem(
  slot: OfferSlot,
  offline: ReturnType<typeof usePunksOffline>,
): OfferCardCoverItem | null {
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

function searchSlotMatches(
  slot: OfferSlot,
  offline: ReturnType<typeof usePunksOffline>,
) {
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
