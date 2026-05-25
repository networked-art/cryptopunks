import {
  formatSearchText,
  type PunksSdk,
} from '@networked-art/punks-sdk'
import {
  filterIsEmpty,
  offerSlotToQuery,
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
  detail: string
  detailParts: OfferSlotDetailPart[]
  href?: string
  previewItems: OfferSlotPreviewItem[]
}

type OfferSlotDisplayOptions = {
  previewLimit?: number
}

export function offerSlotDisplay(
  slot: OfferSlot,
  offline: PunksSdk,
  index: number,
  options: OfferSlotDisplayOptions = {},
): OfferSlotDisplay {
  const matches = searchOfferSlot(slot, offline)
  const matchCount = matches?.length
  return {
    label: `Slot ${index + 1}`,
    title: offerSlotTitle(slot, offline),
    detail: offerSlotDetail(slot, matchCount),
    detailParts: offerSlotDetailParts(slot, matchCount, offline),
    href: offerSlotHref(slot),
    previewItems: offerSlotPreviewItems(
      slot,
      matches ?? [],
      options.previewLimit ?? 4,
    ),
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
  try {
    return offline.count(offerSlotToQuery(slot))
  } catch {
    return undefined
  }
}

export function offerSlotTitle(slot: OfferSlot, offline: PunksSdk) {
  const exact = offerSlotExactItem(slot)
  if (exact) {
    return `Punk #${exact.punkId}${
      exact.standard === TokenStandard.CryptoPunksV1 ? ' (V1)' : ''
    }`
  }
  if (!filterIsEmpty(slot.criteria)) return criteriaTitle(slot, offline)
  if (slot.includeIds.length > 1) {
    return `${slot.includeIds.length.toLocaleString()} included Punks`
  }
  return 'Any Punk'
}

export function offerSlotDetail(
  slot: OfferSlot,
  matchCount: number | undefined,
) {
  return offerSlotPlainDetailParts(slot, matchCount)
    .map((part) => part.text)
    .join(' · ')
}

export function standardQualifier(standard: TokenStandardValue) {
  return standard === TokenStandard.CryptoPunks ? '' : standardLabel(standard)
}

function offerSlotPreviewItems(
  slot: OfferSlot,
  matches: readonly number[],
  limit: number,
): OfferSlotPreviewItem[] {
  const ids = slot.includeIds.length ? slot.includeIds : matches
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
    const text = formatSearchText(offline.dataset.source, {
      criteria: slot.criteria,
      includeIds: slot.includeIds,
      excludeIds: slot.excludeIds,
    })
    return text ? punkSearchHref(normalizeSearchText(text)) : undefined
  } catch {
    return undefined
  }
}

function normalizeSearchText(text: string) {
  const singleQuotedTerm = text.match(/^"([^"\s]+)"$/)
  return singleQuotedTerm?.[1]?.toLowerCase() ?? text
}

function isExactOfferSlot(slot: OfferSlot) {
  return filterIsEmpty(slot.criteria) && slot.includeIds.length === 1
}

function searchOfferSlot(
  slot: OfferSlot,
  offline: PunksSdk,
): number[] | undefined {
  try {
    return offline.search(offerSlotToQuery(slot))
  } catch {
    return undefined
  }
}

function criteriaTitle(slot: OfferSlot, offline: PunksSdk) {
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

function matchCountLabel(slot: OfferSlot, count: number | undefined) {
  if (filterIsEmpty(slot.criteria) && slot.includeIds.length > 0) return ''
  if (count === undefined) return ''
  return `${count.toLocaleString()} matching`
}
