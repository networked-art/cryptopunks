import {
  PUNKS_AUCTION_MAX_OFFER_SLOTS,
  PUNKS_AUCTION_MAX_SLOT_IDS,
  type OfferSlotInput,
  type PunkQuery,
} from '@networked-art/punks-sdk'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

export type PlaceOfferQuantityMode = 'one' | 'multiple'
export type PlaceOfferTargetMode = 'exact' | 'traits' | 'any'

export type PlaceOfferSlotDraft = {
  standard: TokenStandardValue
  targetMode: PlaceOfferTargetMode
  exactSearchText: string
  exactPunkId: number | null
  traitSearchText: string
  traitText: string
  traitQuery: PunkQuery | null
  traitMatchIds: number[]
  traitIncludeIds: number[]
  traitExcludeIds: number[]
}

export type PlaceOfferDraftInput = {
  quantityMode: PlaceOfferQuantityMode | null
  slots?: readonly PlaceOfferSlotDraft[]
}

export type PlaceOfferSlotSummary = {
  label: string
  title: string
  detail: string
  targetMode: PlaceOfferTargetMode
  previewIds: number[]
  singlePunkId?: number | null
}

export type PlaceOfferDraft = {
  quantityMode: PlaceOfferQuantityMode | null
  canPlaceOffer: boolean
  slots: OfferSlotInput[]
  standard: TokenStandardValue
  title: string
  summaryTitle: string
  summaryDetail: string
  slotSummaries: PlaceOfferSlotSummary[]
  previewIds: number[]
  singlePunkId?: number | null
  count: number
  error?: string
}

type BuiltSlot = {
  input: OfferSlotInput
  summary: PlaceOfferSlotSummary
  error?: string
}

export const PLACE_OFFER_MIN_MULTI_SLOTS = 2
export const PLACE_OFFER_MAX_SLOTS = PUNKS_AUCTION_MAX_OFFER_SLOTS
export const PLACE_OFFER_MAX_SLOT_IDS = PUNKS_AUCTION_MAX_SLOT_IDS
export const DEFAULT_PLACE_OFFER_STANDARD = TokenStandard.CryptoPunks

export function createPlaceOfferSlotDraft(
  standard: TokenStandardValue = DEFAULT_PLACE_OFFER_STANDARD,
): PlaceOfferSlotDraft {
  return {
    standard,
    targetMode: 'exact',
    exactSearchText: '',
    exactPunkId: null,
    traitSearchText: '',
    traitText: '',
    traitQuery: null,
    traitMatchIds: [],
    traitIncludeIds: [],
    traitExcludeIds: [],
  }
}

export function buildPlaceOfferDraft(
  input: PlaceOfferDraftInput,
): PlaceOfferDraft {
  if (!input.quantityMode) return emptyDraft('Choose one or multiple Punks.')

  const slots = input.slots ?? []
  const count = slots.length
  const min =
    input.quantityMode === 'multiple' ? PLACE_OFFER_MIN_MULTI_SLOTS : 1

  if (count < min) {
    return emptyDraft(`Choose at least ${min} Punks.`, {
      quantityMode: input.quantityMode,
      count,
    })
  }

  const countError = slotCountError(count)
  if (countError) {
    return invalidDraft(countError, {
      quantityMode: input.quantityMode,
      count,
    })
  }

  const built = slots.map((slot, index) => buildSlot(slot, slotLabel(index)))
  const firstInvalid = built.find((slot) => slot.error)
  if (firstInvalid) {
    return invalidDraft(firstInvalid.error!, {
      quantityMode: input.quantityMode,
      count,
    })
  }

  const duplicate = firstDuplicateSingletonSlot(built)
  if (duplicate) {
    return invalidDraft(`${duplicate} is selected more than once.`, {
      quantityMode: input.quantityMode,
      count,
    })
  }

  const slotSummaries = built.map((slot) => slot.summary)
  const previewIds = uniqueSortedIds(
    built.flatMap((slot) => slot.summary.previewIds),
  )
  const singleBuiltSlot = count === 1 ? built[0] : undefined
  const title =
    count === 1
      ? (singleBuiltSlot?.summary.title ?? 'Punk')
      : `${count.toLocaleString()} Punks`

  return validDraft({
    quantityMode: input.quantityMode,
    canPlaceOffer: true,
    slots: built.map((slot) => slot.input),
    standard: slots[0]?.standard ?? DEFAULT_PLACE_OFFER_STANDARD,
    title,
    summaryTitle: title,
    summaryDetail: count === 1 ? (singleBuiltSlot?.summary.detail ?? '') : '',
    slotSummaries,
    previewIds,
    singlePunkId:
      count === 1 ? (singleBuiltSlot?.summary.singlePunkId ?? null) : null,
    count,
  })
}

function buildSlot(slot: PlaceOfferSlotDraft, label: string): BuiltSlot {
  switch (slot.targetMode) {
    case 'exact':
      return exactSlot(slot, label)
    case 'traits':
      return traitSlot(slot, label)
    case 'any':
      return anySlot(slot, label)
    default:
      return invalidSlot(label, `Choose ${label}.`)
  }
}

function exactSlot(slot: PlaceOfferSlotDraft, label: string): BuiltSlot {
  const punkId = slot.exactPunkId
  if (!isPunkId(punkId)) return invalidSlot(label, `Choose ${label}.`)

  return {
    input: {
      standard: slot.standard,
      includeIds: [punkId],
    },
    summary: {
      label,
      title: `Punk #${punkId}`,
      detail: '',
      targetMode: 'exact',
      previewIds: [punkId],
      singlePunkId: punkId,
    },
  }
}

function traitSlot(slot: PlaceOfferSlotDraft, label: string): BuiltSlot {
  const text = slot.traitText.trim()
  const includeIds = uniqueSortedIds(slot.traitIncludeIds)
  const excludeIds = uniqueSortedIds(slot.traitExcludeIds)
  const matchIds = uniqueSortedIds(slot.traitMatchIds)
  const matchSet = new Set(matchIds)
  const activeMatchIds = matchIds.filter((id) => !excludeIds.includes(id))
  const extraIncludeIds = includeIds.filter(
    (id) => !matchSet.has(id) && !excludeIds.includes(id),
  )
  const previewIds = uniqueSortedIds([...activeMatchIds, ...extraIncludeIds])
  const activeCount = previewIds.length

  if (!text || !slot.traitQuery) {
    return invalidSlot(label, 'Select trait criteria.')
  }
  if (includeIds.length > PLACE_OFFER_MAX_SLOT_IDS) {
    return invalidSlot(
      label,
      `Include ${PLACE_OFFER_MAX_SLOT_IDS} or fewer Punks.`,
    )
  }
  if (excludeIds.length > PLACE_OFFER_MAX_SLOT_IDS) {
    return invalidSlot(
      label,
      `Exclude ${PLACE_OFFER_MAX_SLOT_IDS} or fewer Punks.`,
    )
  }
  if (activeCount <= 0) return invalidSlot(label, 'No Punks match this slot.')

  return {
    input: {
      standard: slot.standard,
      query: slot.traitQuery,
      includeIds: includeIds.length ? includeIds : undefined,
      excludeIds: excludeIds.length ? excludeIds : undefined,
    },
    summary: {
      label,
      title: text,
      detail: traitDetail(activeCount, includeIds.length, excludeIds.length),
      targetMode: 'traits',
      previewIds,
    },
  }
}

function anySlot(slot: PlaceOfferSlotDraft, label: string): BuiltSlot {
  return {
    input: { standard: slot.standard },
    summary: {
      label,
      title: 'Any Punk',
      detail: '',
      targetMode: 'any',
      previewIds: [],
    },
  }
}

function invalidSlot(label: string, error: string): BuiltSlot {
  return {
    input: {},
    summary: {
      label,
      title: '',
      detail: '',
      targetMode: 'any',
      previewIds: [],
    },
    error,
  }
}

function validDraft(draft: Omit<PlaceOfferDraft, 'error'>): PlaceOfferDraft {
  return {
    ...draft,
    error: undefined,
  }
}

function emptyDraft(
  error = '',
  context: {
    quantityMode?: PlaceOfferQuantityMode | null
    count?: number
  } = {},
): PlaceOfferDraft {
  return {
    quantityMode: context.quantityMode ?? null,
    canPlaceOffer: false,
    slots: [],
    standard: DEFAULT_PLACE_OFFER_STANDARD,
    title: '',
    summaryTitle: '',
    summaryDetail: '',
    slotSummaries: [],
    previewIds: [],
    singlePunkId: null,
    count: context.count ?? 0,
    error,
  }
}

function invalidDraft(
  error: string,
  context: {
    quantityMode?: PlaceOfferQuantityMode | null
    count?: number
  } = {},
): PlaceOfferDraft {
  return emptyDraft(error, context)
}

function firstDuplicateSingletonSlot(slots: readonly BuiltSlot[]) {
  const seen = new Set<string>()
  for (const slot of slots) {
    const ids = uniqueSortedIds(slot.summary.previewIds)
    if (ids.length !== 1) continue
    const id = ids[0]
    const key = `${slot.input.standard ?? DEFAULT_PLACE_OFFER_STANDARD}-${id}`
    if (seen.has(key)) return `Punk #${id}`
    seen.add(key)
  }
  return ''
}

function traitDetail(
  count: number,
  included: number,
  excluded: number,
): string {
  return [
    `${count.toLocaleString()} matching`,
    included ? `${included.toLocaleString()} included` : '',
    excluded ? `${excluded.toLocaleString()} excluded` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function slotCountError(count: number) {
  if (count > PLACE_OFFER_MAX_SLOTS) {
    return `Choose ${PLACE_OFFER_MAX_SLOTS} or fewer Punks.`
  }
  return ''
}

export function slotLabel(index: number) {
  return `Slot ${index + 1}`
}

export function uniqueSortedIds(ids: readonly number[]) {
  return [...new Set(ids)].filter((id) => isPunkId(id)).sort((a, b) => a - b)
}

export function isPunkId(id: unknown): id is number {
  return Number.isInteger(id) && Number(id) >= 0 && Number(id) <= 9999
}
