import {
  formatSearchText,
  type CompiledOfferSlot,
  type PunksFilter,
} from '@networked-art/punks-sdk'

export type OfferCriteriaDisplayKind = 'single' | 'group' | 'custom'

export type OfferCriteriaDisplay = {
  label: string
  searchText: string
  kind: OfferCriteriaDisplayKind
}

type OfferCriteriaClient = {
  dataset: {
    source: unknown
  }
}

export function offerSlotCriteriaDisplay(
  offline: OfferCriteriaClient,
  slot: Pick<CompiledOfferSlot, 'criteria' | 'includeIds' | 'excludeIds'>,
): OfferCriteriaDisplay {
  const criteria = offerCriteriaDisplay(offline, slot.criteria)
  if (criteria.label) return criteria

  try {
    const source = offline.dataset
      .source as Parameters<typeof formatSearchText>[0]
    const searchText = formatSearchText(source, {
      criteria: slot.criteria,
      includeIds: slot.includeIds,
      excludeIds: slot.excludeIds,
    })
    return {
      ...criteria,
      label: humanizeOfferCriteriaText(searchText),
      searchText,
    }
  } catch {
    return criteria
  }
}

export function offerCriteriaDisplay(
  offline: OfferCriteriaClient,
  criteria: PunksFilter,
): OfferCriteriaDisplay {
  try {
    const source = offline.dataset
      .source as Parameters<typeof formatSearchText>[0]
    const searchText = formatSearchText(source, { criteria })
    return {
      label: humanizeOfferCriteriaText(searchText),
      searchText,
      kind: hasCriteriaOrGroup(searchText) ? 'group' : 'single',
    }
  } catch {
    return {
      label: 'Custom criteria',
      searchText: '',
      kind: 'custom',
    }
  }
}

export function humanizeOfferCriteriaText(text: string) {
  return splitCriteriaOrGroups(text)
    .map((group) => humanizeCriteriaGroup(group))
    .filter(Boolean)
    .join(' or ')
}

function splitCriteriaOrGroups(text: string) {
  return text
    .trim()
    .split(/\s+OR\s+/)
    .map((group) => group.trim())
    .filter(Boolean)
}

function hasCriteriaOrGroup(text: string) {
  return splitCriteriaOrGroups(text).length > 1
}

function humanizeCriteriaGroup(text: string) {
  const parts: string[] = []
  const rest = text
    .replace(/"([^"]+)"/g, (_match, term: string) => {
      parts.push(term)
      return ' '
    })
    .trim()

  if (rest) parts.push(rest)
  return parts.join(' · ')
}
