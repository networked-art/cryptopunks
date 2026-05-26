import {
  PUNKS_AUCTION_MAX_OFFER_SLOTS,
  PUNKS_AUCTION_MAX_SLOT_IDS,
  type OfferSlotInput,
  type PunkQuery,
} from '@networked-art/punks-sdk'

export type PlaceOfferKind = 'collection' | 'single' | 'trait' | 'multi'
export type PlaceOfferStandard = 'cryptopunks' | 'cryptopunks-v1'

export const PLACE_OFFER_KIND_TITLES: Record<PlaceOfferKind, string> = {
  collection: 'Collection offer',
  single: 'Single punk offer',
  trait: 'Trait offer',
  multi: 'Multi lot offer',
}

export type PlaceOfferDraftInput = {
  kind: PlaceOfferKind | null
  standard?: PlaceOfferStandard
  singlePunkId?: number | null
  traitQuery?: PunkQuery
  traitText?: string
  traitMatchIds?: readonly number[]
  traitIncludeIds?: readonly number[]
  traitExcludeIds?: readonly number[]
  multiPunkIds?: readonly number[]
}

export type PlaceOfferDraft = {
  kind: PlaceOfferKind | null
  canPlaceOffer: boolean
  slots: OfferSlotInput[]
  standard: PlaceOfferStandard
  title: string
  summaryTitle: string
  summaryDetail: string
  previewIds: number[]
  count: number
  error?: string
}

const DEFAULT_STANDARD: PlaceOfferStandard = 'cryptopunks'

export function buildPlaceOfferDraft(
  input: PlaceOfferDraftInput,
): PlaceOfferDraft {
  const standard = input.standard ?? DEFAULT_STANDARD
  switch (input.kind) {
    case 'collection':
      return collectionDraft(standard)
    case 'single':
      return singleDraft(input.singlePunkId, standard)
    case 'trait':
      return traitDraft(input, standard)
    case 'multi':
      return multiDraft(input.multiPunkIds ?? [], standard)
    default:
      return emptyDraft('Choose an offer type.')
  }
}

function collectionDraft(standard: PlaceOfferStandard): PlaceOfferDraft {
  return {
    kind: 'collection',
    canPlaceOffer: true,
    slots: [{ standard }],
    standard,
    title: PLACE_OFFER_KIND_TITLES.collection,
    summaryTitle: '',
    summaryDetail: '',
    count: 10000,
    previewIds: [],
  }
}

function singleDraft(
  punkId: number | null | undefined,
  standard: PlaceOfferStandard,
): PlaceOfferDraft {
  if (!isPunkId(punkId)) return emptyDraft('Choose one Punk.', 'single', standard)

  return {
    kind: 'single',
    canPlaceOffer: true,
    slots: [{ standard, includeIds: [punkId] }],
    standard,
    title: `Punk #${punkId}`,
    summaryTitle: `Punk #${punkId}`,
    summaryDetail: '',
    count: 1,
    previewIds: [punkId],
  }
}

function traitDraft(
  input: PlaceOfferDraftInput,
  standard: PlaceOfferStandard,
): PlaceOfferDraft {
  const text = input.traitText?.trim() ?? ''
  const includeIds = uniqueSortedIds(input.traitIncludeIds ?? [])
  const excludeIds = uniqueSortedIds(input.traitExcludeIds ?? [])
  const matchIds = uniqueSortedIds(input.traitMatchIds ?? [])
  const matchSet = new Set(matchIds)
  const activeMatchIds = matchIds.filter((id) => !excludeIds.includes(id))
  const extraIncludeIds = includeIds.filter(
    (id) => !matchSet.has(id) && !excludeIds.includes(id),
  )
  const activeCount = activeMatchIds.length + extraIncludeIds.length

  if (!text) return emptyDraft('Select trait criteria.', 'trait')
  if (includeIds.length > PUNKS_AUCTION_MAX_SLOT_IDS) {
    return invalidDraft(
      'trait',
      `Include ${PUNKS_AUCTION_MAX_SLOT_IDS} or fewer Punks.`,
      activeCount,
      standard,
    )
  }
  if (excludeIds.length > PUNKS_AUCTION_MAX_SLOT_IDS) {
    return invalidDraft(
      'trait',
      `Exclude ${PUNKS_AUCTION_MAX_SLOT_IDS} or fewer Punks.`,
      activeCount,
      standard,
    )
  }
  if (activeCount <= 0) {
    return emptyDraft('No Punks match this offer.', 'trait', standard)
  }

  const detail = [
    `${activeCount.toLocaleString()} matching`,
    includeIds.length ? `${includeIds.length.toLocaleString()} included` : '',
    excludeIds.length ? `${excludeIds.length.toLocaleString()} excluded` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    kind: 'trait',
    canPlaceOffer: true,
    slots: [
      {
        standard,
        query: input.traitQuery,
        includeIds: includeIds.length ? includeIds : undefined,
        excludeIds: excludeIds.length ? excludeIds : undefined,
      },
    ],
    standard,
    title: `Trait offer: ${text}`,
    summaryTitle: text,
    summaryDetail: detail,
    count: activeCount,
    previewIds: uniqueSortedIds([...activeMatchIds, ...extraIncludeIds]),
  }
}

function multiDraft(
  ids: readonly number[],
  standard: PlaceOfferStandard,
): PlaceOfferDraft {
  const selectedIds = uniqueSortedIds(ids)
  if (selectedIds.length < 2) {
    return emptyDraft('Select at least two Punks.', 'multi')
  }
  if (selectedIds.length > PUNKS_AUCTION_MAX_OFFER_SLOTS) {
    return invalidDraft(
      'multi',
      `Select ${PUNKS_AUCTION_MAX_OFFER_SLOTS} or fewer Punks.`,
      selectedIds.length,
      standard,
    )
  }

  return {
    kind: 'multi',
    canPlaceOffer: true,
    slots: selectedIds.map((id) => ({
      standard,
      includeIds: [id],
    })),
    standard,
    title: `${selectedIds.length.toLocaleString()} Punks`,
    summaryTitle: `${selectedIds.length.toLocaleString()} Punks`,
    summaryDetail: 'Every selected Punk is required',
    count: selectedIds.length,
    previewIds: selectedIds,
  }
}

function emptyDraft(
  error = '',
  kind: PlaceOfferKind | null = null,
  standard: PlaceOfferStandard = DEFAULT_STANDARD,
): PlaceOfferDraft {
  return {
    kind,
    canPlaceOffer: false,
    slots: [],
    standard,
    title: '',
    summaryTitle: '',
    summaryDetail: '',
    count: 0,
    previewIds: [],
    error,
  }
}

function invalidDraft(
  kind: PlaceOfferKind,
  error: string,
  count: number,
  standard: PlaceOfferStandard = DEFAULT_STANDARD,
): PlaceOfferDraft {
  return {
    ...emptyDraft(error, kind, standard),
    count,
  }
}

export function uniqueSortedIds(ids: readonly number[]) {
  return [...new Set(ids)]
    .filter((id) => isPunkId(id))
    .sort((a, b) => a - b)
}

export function isPunkId(id: unknown): id is number {
  return Number.isInteger(id) && Number(id) >= 0 && Number(id) <= 9999
}
