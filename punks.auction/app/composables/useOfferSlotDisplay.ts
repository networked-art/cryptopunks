import { formatSearchText, type PunksSdk } from '@networked-art/punks-sdk'
import {
  filterIsEmpty,
  offerSlotCriteriaToQuery,
  offerSlotMatchingIds,
  punkHref,
  standardLabel,
  TokenStandard,
  type OfferSlot,
  type TokenStandardValue,
} from '~/utils/auction'
import { punkSearchHref } from '~/utils/punkSearch'

export type OfferSlotPreviewItem = {
  punkId: number
  standard: TokenStandardValue
}

type OfferSlotHref = string | ReturnType<typeof punkSearchHref>

export type OfferSlotDetailPart = {
  text: string
  href?: OfferSlotHref
}

export type OfferSlotDisplay = {
  label: string
  title: string
  titleStandard?: string
  detail: string
  detailParts: OfferSlotDetailPart[]
  href?: string
  icon: string
  previewItems: OfferSlotPreviewItem[]
}

type OfferSlotDisplayOptions = {
  previewLimit?: number
}

export const OFFER_SLOT_COLLECTION_ICON = 'lucide:grid-3x3'
export const OFFER_SLOT_TRAIT_ICON = 'lucide:list-filter'
export const OFFER_SLOT_SET_ICON = OFFER_SLOT_TRAIT_ICON

export function offerSlotDisplay(
  slot: OfferSlot,
  offline: PunksSdk,
  index: number,
  options: OfferSlotDisplayOptions = {},
): OfferSlotDisplay {
  const matches = searchOfferSlot(slot, offline)
  const matchCount = matches?.length
  return {
    label: `Item ${index + 1}`,
    title: offerSlotTitle(slot, offline),
    titleStandard: offerSlotTitleStandard(slot),
    detail: offerSlotDetail(slot, matchCount),
    detailParts: offerSlotDetailParts(slot, matchCount, offline),
    href: offerSlotHref(slot),
    icon: offerSlotFallbackIcon(slot),
    previewItems: offerSlotPreviewItems(slot, options.previewLimit ?? 4),
  }
}

function offerSlotHref(slot: OfferSlot) {
  const exact = offerSlotExactItem(slot)
  return exact ? punkHref(exact.standard, exact.punkId) : undefined
}

export function offerSlotExactItem(
  slot: OfferSlot,
): OfferSlotPreviewItem | null {
  if (!isExactOfferSlot(slot)) return null
  return { punkId: slot.includeIds[0]!, standard: slot.standard }
}

export function isOfferSlotSet(slot: OfferSlot) {
  return filterIsEmpty(slot.criteria) && offerSlotSetIds(slot).length > 1
}

export function offerSlotIncludedItems(
  slot: OfferSlot,
): OfferSlotPreviewItem[] {
  return slot.includeIds.map((punkId) => ({
    punkId,
    standard: slot.standard,
  }))
}

export function countOfferSlotMatches(
  slot: OfferSlot,
  offline: PunksSdk,
): number | undefined {
  return searchOfferSlot(slot, offline)?.length
}

export function offerSlotFallbackIcon(
  slot: Pick<OfferSlot, 'criteria'> & { includeIds?: readonly number[] },
): string {
  if (!filterIsEmpty(slot.criteria)) return OFFER_SLOT_TRAIT_ICON
  return (slot.includeIds?.length ?? 0) > 1
    ? OFFER_SLOT_SET_ICON
    : OFFER_SLOT_COLLECTION_ICON
}

export function offerSlotTitle(slot: OfferSlot, offline: PunksSdk) {
  const exact = offerSlotExactItem(slot)
  if (exact) return `Punk #${exact.punkId}`
  if (isOfferSlotSet(slot)) return `Selection Offer: ${punkCountLabel(slot)}`

  const hasCriteria = !filterIsEmpty(slot.criteria)
  const parts = [
    hasCriteria
      ? criteriaTitle(slot, offline)
      : slot.includeIds.length > 1
        ? `${slot.includeIds.length.toLocaleString()} included Punks`
        : 'Collection offer',
  ]

  if (hasCriteria) {
    parts.push(...slotIdListTitleParts(slot))
  } else if (slot.excludeIds.length) {
    parts.push(countLabel(slot.excludeIds.length, 'excluded'))
  }

  return parts.filter(Boolean).join(' · ')
}

export function offerSlotHeading(
  slot: OfferSlot,
  offline: PunksSdk,
): { title: string; subtitleParts: OfferSlotDetailPart[] } {
  const exact = offerSlotExactItem(slot)
  if (exact) return { title: `Punk #${exact.punkId}`, subtitleParts: [] }

  const matching = matchCountLabel(slot, countOfferSlotMatches(slot, offline))
  const matchingPart: OfferSlotDetailPart | null = matching
    ? { text: matching, href: offerSlotSearchHref(slot, offline) }
    : null
  const hasCriteria = !filterIsEmpty(slot.criteria)

  if (hasCriteria) {
    const description = criteriaDescription(slot, offline)
    const parts: OfferSlotDetailPart[] = []
    if (description) parts.push({ text: description })
    for (const text of slotIdListTitleParts(slot)) parts.push({ text })
    if (matchingPart) parts.push(matchingPart)
    return { title: 'Trait offer', subtitleParts: parts }
  }

  if (isOfferSlotSet(slot)) {
    return {
      title: 'Selection offer',
      subtitleParts: offerSlotSetIds(slot).map((punkId) => ({
        text: `Punk #${punkId}`,
        href: punkHref(slot.standard, punkId),
      })),
    }
  }

  const title =
    slot.includeIds.length > 1
      ? `${slot.includeIds.length.toLocaleString()} included Punks`
      : 'Collection offer'
  const parts: OfferSlotDetailPart[] = []
  const excluded = countLabel(slot.excludeIds.length, 'excluded')
  if (excluded) parts.push({ text: excluded })
  if (matchingPart) parts.push(matchingPart)
  return { title, subtitleParts: parts }
}

export function offerSlotDetail(
  slot: OfferSlot,
  matchCount: number | undefined,
) {
  return offerSlotPlainDetailParts(slot, matchCount)
    .map((part) => part.text)
    .join(' · ')
}

function offerSlotTitleStandard(slot: OfferSlot) {
  const exact = offerSlotExactItem(slot)
  if (!exact || exact.standard !== TokenStandard.CryptoPunksV1) return undefined
  return '(V1)'
}

export function standardQualifier(standard: TokenStandardValue) {
  return standard === TokenStandard.CryptoPunks ? '' : standardLabel(standard)
}

function offerSlotPreviewItems(
  slot: OfferSlot,
  limit: number,
): OfferSlotPreviewItem[] {
  if (isOfferSlotSet(slot)) return []
  const ids = filterIsEmpty(slot.criteria) ? slot.includeIds : []
  return ids.slice(0, limit).map((punkId) => ({
    punkId,
    standard: slot.standard,
  }))
}

function offerSlotDetailParts(
  slot: OfferSlot,
  matchCount: number | undefined,
  offline: PunksSdk,
): OfferSlotDetailPart[] {
  const matchingLabel = matchCountLabel(slot, matchCount)
  return offerSlotPlainDetailParts(slot, matchCount).map((part) =>
    part.text === matchingLabel
      ? { ...part, href: offerSlotSearchHref(slot, offline) }
      : part,
  )
}

function offerSlotPlainDetailParts(
  slot: OfferSlot,
  matchCount: number | undefined,
): OfferSlotDetailPart[] {
  if (offerSlotExactItem(slot)) return []

  const parts: OfferSlotDetailPart[] = []
  const standard = standardQualifier(slot.standard)
  const matching = matchCountLabel(slot, matchCount)
  if (standard) parts.push({ text: standard })
  if (matching) parts.push({ text: matching })
  return parts
}

function offerSlotSearchHref(slot: OfferSlot, offline: PunksSdk) {
  try {
    const text = offerSlotSearchText(slot, offline)
    return text ? punkSearchHref(normalizeSearchText(text)) : undefined
  } catch {
    return undefined
  }
}

function offerSlotSearchText(slot: OfferSlot, offline: PunksSdk) {
  const excludeTokens = slot.excludeIds.map((id) => `-#${id}`)
  const includeTokens = slot.includeIds.map((id) => `#${id}`)

  if (filterIsEmpty(slot.criteria)) {
    return [...includeTokens, ...excludeTokens].join(' ')
  }

  const criteriaText = formatSearchText(offline.dataset.source, {
    criteria: slot.criteria,
  })
  const criteriaGroup = [criteriaText, ...excludeTokens].filter(Boolean).join(' ')
  if (!includeTokens.length) return criteriaGroup

  const includeGroup = [...includeTokens, ...excludeTokens].join(' ')
  return [criteriaGroup, includeGroup].filter(Boolean).join(' OR ')
}

function normalizeSearchText(text: string) {
  const singleQuotedTerm = text.match(/^"([^"\s]+)"$/)
  return singleQuotedTerm?.[1]?.toLowerCase() ?? text
}

function isExactOfferSlot(slot: OfferSlot) {
  return (
    filterIsEmpty(slot.criteria) &&
    slot.includeIds.length === 1 &&
    slot.excludeIds.length === 0
  )
}

function searchOfferSlot(
  slot: OfferSlot,
  offline: PunksSdk,
): number[] | undefined {
  try {
    return offerSlotMatchingIds(
      slot,
      offline.search(offerSlotCriteriaToQuery(slot)),
    )
  } catch {
    return undefined
  }
}

function criteriaTitle(slot: OfferSlot, offline: PunksSdk) {
  const description = criteriaDescription(slot, offline)
  return description ? `Trait offer: ${description}` : 'Trait offer'
}

function criteriaDescription(slot: OfferSlot, offline: PunksSdk) {
  try {
    const label = formatSearchText(offline.dataset.source, {
      criteria: slot.criteria,
    })
    return humanizeCriteriaLabel(label)
  } catch {
    return ''
  }
}

function slotIdListTitleParts(slot: OfferSlot) {
  return [
    countLabel(slot.includeIds.length, 'included'),
    countLabel(slot.excludeIds.length, 'excluded'),
  ].filter((part): part is string => !!part)
}

function countLabel(count: number, label: string) {
  return count > 0 ? `${count.toLocaleString()} ${label}` : ''
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

function matchCountLabel(slot: OfferSlot, count: number | undefined) {
  if (isExactOfferSlot(slot)) return ''
  if (isOfferSlotSet(slot))
    return `${offerSlotSetIds(slot).length.toLocaleString()} matching`
  if (filterIsEmpty(slot.criteria) && slot.includeIds.length > 0) return ''
  if (count === undefined) return ''
  return `${count.toLocaleString()} matching`
}

function offerSlotSetIds(slot: OfferSlot) {
  if (!slot.excludeIds.length) return slot.includeIds
  const excluded = new Set(slot.excludeIds)
  return slot.includeIds.filter((punkId) => !excluded.has(punkId))
}

function punkCountLabel(slot: OfferSlot) {
  const count = offerSlotSetIds(slot).length
  return `${count.toLocaleString()} ${count === 1 ? 'Punk' : 'Punks'}`
}
