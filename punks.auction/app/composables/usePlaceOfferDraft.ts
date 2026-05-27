import {
  PUNKS_AUCTION_MAX_OFFER_SLOTS,
  PUNKS_AUCTION_MAX_SLOT_IDS,
  type OfferSlotInput,
  type PunkQuery,
} from '@networked-art/punks-sdk'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'
import { OFFER_SLOT_TEXT } from '~/utils/offerSlotText'

export type PlaceOfferQuantityMode = 'one' | 'multiple'
export type PlaceOfferTargetMode = 'exact' | 'traits' | 'any'
export type PlaceOfferSlotDisplayKind =
  | 'exact'
  | 'selection'
  | 'criteria'
  | 'collection'

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
  displayKind: PlaceOfferSlotDisplayKind
  targetMode: PlaceOfferTargetMode
  standard: TokenStandardValue
  previewIds: number[]
}

export type PlaceOfferDraft = {
  quantityMode: PlaceOfferQuantityMode | null
  canPlaceOffer: boolean
  slots: OfferSlotInput[]
  standard: TokenStandardValue
  title: string
  slotSummaries: PlaceOfferSlotSummary[]
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
export const PLACE_OFFER_DIFFERENT_TARGET_ERROR =
  'Choose a different item target.'
export const PLACE_OFFER_SLOT_ID_LIMIT_ERROR =
  `Select ${PLACE_OFFER_MAX_SLOT_IDS} or fewer Punks.`

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

  const built = slots.map((slot, index) => buildSlot(slot, itemLabel(index)))
  const firstInvalid = built.find((slot) => slot.error)
  if (firstInvalid) {
    return invalidDraft(firstInvalid.error!, {
      quantityMode: input.quantityMode,
      count,
    })
  }

  if (!hasDistinctFiniteFulfillment(built)) {
    return invalidDraft(PLACE_OFFER_DIFFERENT_TARGET_ERROR, {
      quantityMode: input.quantityMode,
      count,
    })
  }

  const slotSummaries = built.map((slot) => slot.summary)
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
    slotSummaries,
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
      displayKind: 'exact',
      targetMode: 'exact',
      standard: slot.standard,
      previewIds: [punkId],
    },
  }
}

function traitSlot(slot: PlaceOfferSlotDraft, label: string): BuiltSlot {
  const text = slot.traitText.trim()
  const includeIds = uniqueSortedIds(slot.traitIncludeIds)
  const excludeIds = uniqueSortedIds(slot.traitExcludeIds)
  const matchIds = uniqueSortedIds(slot.traitMatchIds)
  const hasCriteria = !!text && !!slot.traitQuery
  const matchSet = new Set(matchIds)
  const activeMatchIds = matchIds.filter((id) => !excludeIds.includes(id))
  const extraIncludeIds = includeIds.filter(
    (id) => !matchSet.has(id) && !excludeIds.includes(id),
  )
  const previewIds = uniqueSortedIds([...activeMatchIds, ...extraIncludeIds])
  const activeCount = previewIds.length

  if (includeIds.length > PLACE_OFFER_MAX_SLOT_IDS) {
    return invalidSlot(label, PLACE_OFFER_SLOT_ID_LIMIT_ERROR)
  }
  if (excludeIds.length > PLACE_OFFER_MAX_SLOT_IDS) {
    return invalidSlot(
      label,
      `Exclude ${PLACE_OFFER_MAX_SLOT_IDS} or fewer Punks.`,
    )
  }

  if (!hasCriteria) {
    if (includeIds.length === 0) {
      return invalidSlot(label, 'Select Punks or criteria.')
    }

    return {
      input: {
        standard: slot.standard,
        includeIds,
      },
      summary: {
        label,
        title:
          includeIds.length === 1
            ? `Punk #${includeIds[0]}`
            : OFFER_SLOT_TEXT.selectionOffer,
        detail:
          includeIds.length === 1
            ? ''
            : `${includeIds.length.toLocaleString()} Punks`,
        displayKind: 'selection',
        targetMode: 'traits',
        standard: slot.standard,
        previewIds: includeIds,
      },
    }
  }

  if (activeCount <= 0) return invalidSlot(label, 'No Punks match this item.')

  return {
    input: {
      standard: slot.standard,
      query: slot.traitQuery!,
      includeIds: includeIds.length ? includeIds : undefined,
      excludeIds: excludeIds.length ? excludeIds : undefined,
    },
    summary: {
      label,
      title: text,
      detail: traitDetail(activeCount, includeIds.length, excludeIds.length),
      displayKind: 'criteria',
      targetMode: 'traits',
      standard: slot.standard,
      previewIds,
    },
  }
}

function anySlot(slot: PlaceOfferSlotDraft, label: string): BuiltSlot {
  return {
    input: { standard: slot.standard },
    summary: {
      label,
      title: OFFER_SLOT_TEXT.collectionOffer,
      detail: '',
      displayKind: 'collection',
      targetMode: 'any',
      standard: slot.standard,
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
      displayKind: 'collection',
      targetMode: 'any',
      standard: DEFAULT_PLACE_OFFER_STANDARD,
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
    slotSummaries: [],
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

function hasDistinctFiniteFulfillment(slots: readonly BuiltSlot[]) {
  const finiteSlots = slots
    .map((slot) => finiteSlotCandidateKeys(slot))
    .filter((candidates) => candidates.length > 0)
  const assignments = new Map<string, number>()

  for (let i = 0; i < finiteSlots.length; i++) {
    if (!assignFiniteSlot(i, finiteSlots, assignments, new Set())) {
      return false
    }
  }

  return true
}

function assignFiniteSlot(
  slotIndex: number,
  slots: readonly string[][],
  assignments: Map<string, number>,
  seen: Set<string>,
) {
  for (const candidate of slots[slotIndex] ?? []) {
    if (seen.has(candidate)) continue
    seen.add(candidate)

    const assignedSlot = assignments.get(candidate)
    if (
      assignedSlot === undefined ||
      assignFiniteSlot(assignedSlot, slots, assignments, seen)
    ) {
      assignments.set(candidate, slotIndex)
      return true
    }
  }

  return false
}

function finiteSlotCandidateKeys(slot: BuiltSlot) {
  const ids = uniqueSortedIds(slot.summary.previewIds)
  if (!ids.length) return []

  const standard =
    slot.input.standard ?? slot.summary.standard ?? DEFAULT_PLACE_OFFER_STANDARD
  return ids.map((id) => `${standard}-${id}`)
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

export function itemLabel(index: number) {
  return `Item ${index + 1}`
}

export function uniqueSortedIds(ids: readonly number[]) {
  return [...new Set(ids)].filter((id) => isPunkId(id)).sort((a, b) => a - b)
}

export function isPunkId(id: unknown): id is number {
  return Number.isInteger(id) && Number(id) >= 0 && Number(id) <= 9999
}
