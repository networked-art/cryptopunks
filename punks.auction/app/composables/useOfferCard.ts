import { formatSearchText } from '@networked-art/punks-sdk'
import {
  filterIsEmpty,
  offerSlotToQuery,
  standardLabel,
  TokenStandard,
  type OfferRecord,
  type OfferSlot,
  type TokenStandardValue,
} from '~/utils/auction'

export type OfferCardKind = 'specific' | 'criteria' | 'bundle'

export type OfferCardThumb = {
  punkId: number
  standard: TokenStandardValue
}

export type OfferCardTarget = {
  kind: OfferCardKind
  title: string
  detail: string
  thumbs: OfferCardThumb[]
  extraCount: number
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
          kind: 'specific',
          title: `Punk #${exact.punkId}`,
          detail: standardQualifier(slot.standard),
          thumbs: [exact],
          extraCount: 0,
        }
      }

      return {
        kind: 'criteria',
        title: slotTitle(slot, offline),
        detail: slotDetail(slot, countSlotMatches(slot)),
        thumbs: slot.includeIds.slice(0, 3).map((punkId) => ({
          punkId,
          standard: slot.standard,
        })),
        extraCount: Math.max(0, slot.includeIds.length - 3),
      }
    }

    return {
      kind: 'bundle',
      title: `${record.slots.length.toLocaleString()} Punks`,
      detail: slotStandardsLabel(record.slots),
      thumbs: exactItems.slice(0, 3),
      extraCount: Math.max(0, exactItems.length - 3),
    }
  })

  function countSlotMatches(slot: OfferSlot) {
    try {
      return offline.count(offerSlotToQuery(slot))
    } catch {
      return undefined
    }
  }

  return {
    detailHref,
    target,
  }
}

function exactOfferItems(offer: OfferRecord): OfferCardThumb[] {
  return offer.slots.flatMap((slot) => {
    if (!isSpecificPunkSlot(slot)) return []
    return [{ punkId: slot.includeIds[0]!, standard: slot.standard }]
  })
}

function isSpecificPunkSlot(slot: OfferSlot) {
  return filterIsEmpty(slot.criteria) && slot.includeIds.length === 1
}

function slotTitle(
  slot: OfferSlot,
  offline: ReturnType<typeof usePunksOffline>,
) {
  if (!filterIsEmpty(slot.criteria)) return criteriaTitle(slot, offline)
  if (slot.includeIds.length > 1) {
    return `${slot.includeIds.length.toLocaleString()} included Punks`
  }
  return 'Any Punk'
}

function criteriaTitle(
  slot: OfferSlot,
  offline: ReturnType<typeof usePunksOffline>,
) {
  try {
    const label = formatSearchText(offline.dataset.source, {
      criteria: slot.criteria,
    })
    const humanLabel = humanizeCriteriaLabel(label)
    return humanLabel ? `Trait criteria: ${humanLabel}` : 'Trait criteria'
  } catch {
    return 'Trait criteria'
  }
}

function humanizeCriteriaLabel(label: string) {
  const parts: string[] = []
  const rest = label
    .replace(/"([^"]+)"/g, (_match, term: string) => {
      parts.push(term)
      return ' '
    })
    .trim()

  if (rest) parts.push(rest)
  return parts.join(' · ')
}

function slotDetail(slot: OfferSlot, matchCount: number | undefined) {
  return [standardQualifier(slot.standard), matchCountLabel(matchCount)]
    .filter(Boolean)
    .join(' · ')
}

function slotStandardsLabel(slots: OfferSlot[]) {
  const standards = new Set(slots.map((slot) => slot.standard))
  if (standards.size > 1) return 'Mixed standards'

  const [standard] = standards
  return standard === undefined ? '' : standardQualifier(standard)
}

function standardQualifier(standard: TokenStandardValue) {
  return standard === TokenStandard.CryptoPunks ? '' : standardLabel(standard)
}

function matchCountLabel(count: number | undefined) {
  if (count === undefined) return ''
  return `${count.toLocaleString()} matching`
}
