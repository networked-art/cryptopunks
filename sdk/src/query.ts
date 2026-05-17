import {
  COLOR_COUNT_MAX,
  COLOR_COUNT_MIN,
  HeadVariant,
  PIXEL_COUNT_MAX,
  PIXEL_COUNT_MIN,
  PunkStandard,
  PunkType,
  headVariantNames,
  punkTypeNames,
  type HeadVariantValue,
  type PunkStandardValue,
  type PunkTypeValue,
} from './constants'
import type { OfflinePunksDataClient, OfflinePunksSearchQuery } from './offline'
import type {
  NumericRange,
  PunkQuery,
  PunkQuerySort,
  PunksSearchQuery,
} from './types'
import {
  PunksDataValidationError,
  maskFromIds,
  normalizeNumericRange,
  validateColorCount,
  validateColorCriteriaMasks,
  validatePixelCount,
  validatePunkId,
  validateTraitCriteriaMasks,
  validateTraitId,
} from './utils'

const HEAD_VARIANT_TRAIT_OFFSET = 5
const ATTRIBUTE_COUNT_TRAIT_OFFSET = 16
const ATTRIBUTE_COUNT_MIN = 0
const ATTRIBUTE_COUNT_MAX = 7

export type PunkStandardRef =
  | PunkStandardValue
  | 'cryptopunks'
  | 'punks'
  | 'v2'
  | 'cryptopunks-v2'
  | 'cryptopunks-v1'
  | 'v1'

export type PunksFilter = {
  requiredTraitMask: bigint
  forbiddenTraitMask: bigint
  anyOfTraitMask: bigint
  requiredColorMask: bigint
  forbiddenColorMask: bigint
  anyOfColorMask: bigint
  minPixelCount: number
  maxPixelCount: number
  minColorCount: number
  maxColorCount: number
}

export type CompiledOfferSlot = {
  criteria: PunksFilter
  standard: PunkStandardValue
  includeIds: number[]
  excludeIds: number[]
}

export type CompileOfferSlotInput = {
  query?: PunkQuery
  standard?: PunkStandardRef
  includeIds?: Iterable<number>
  excludeIds?: Iterable<number>
}

export function toOfflineSearchQuery(
  query: PunkQuery = {},
): OfflinePunksSearchQuery {
  assertQueryObject(query)
  const { type, punkType, head, headVariant, ...rest } = query
  const normalized: OfflinePunksSearchQuery = { ...(rest as PunksSearchQuery) }

  if (type !== undefined && punkType !== undefined) {
    throw new PunksDataValidationError(
      'use query.type or query.punkType, not both',
    )
  }
  if (head !== undefined && headVariant !== undefined) {
    throw new PunksDataValidationError(
      'use query.head or query.headVariant, not both',
    )
  }

  const normalizedType = type ?? punkType
  const normalizedHead = head ?? headVariant
  if (normalizedType !== undefined) normalized.punkType = normalizedType
  if (normalizedHead !== undefined) normalized.headVariant = normalizedHead
  return normalized
}

export function compilePunksFilter(
  data: OfflinePunksDataClient,
  query: PunkQuery = {},
): PunksFilter {
  assertQueryObject(query)
  rejectUnchainableQueryFields(query)

  const traitCriteria = data.resolveTraitCriteriaSync(query.attributes)
  const colorCriteria = data.resolveColorCriteriaSync(query.colors)
  let requiredTraitMask = traitCriteria.requiredMask
  let forbiddenTraitMask = traitCriteria.forbiddenMask
  let anyOfTraitMask = traitCriteria.anyOfMask

  const addRequiredTrait = (traitId: number): void => {
    validateTraitId(traitId)
    requiredTraitMask |= 1n << BigInt(traitId)
  }
  const addAnyOfTraitGroup = (
    traitIds: readonly number[],
    label: string,
  ): void => {
    if (traitIds.length === 0) return
    const groupMask = maskFromIds(traitIds, validateTraitId)
    if (anyOfTraitMask !== 0n && anyOfTraitMask !== groupMask) {
      throw new PunksDataValidationError(
        `${label} cannot be combined with another any-of trait group in one onchain filter`,
      )
    }
    anyOfTraitMask |= groupMask
  }

  const typeIds = normalizePunkTypeRefs(query.type ?? query.punkType)
  if (typeIds.length === 1) addRequiredTrait(typeIds[0])
  else addAnyOfTraitGroup(typeIds, 'type')

  const headVariantIds = normalizeHeadVariantRefs(
    query.head ?? query.headVariant,
  ).map((id) => HEAD_VARIANT_TRAIT_OFFSET + id)
  if (headVariantIds.length === 1) addRequiredTrait(headVariantIds[0])
  else addAnyOfTraitGroup(headVariantIds, 'head')

  const attributeCounts = normalizeNumericRange(
    'attributeCount',
    query.attributeCount,
    ATTRIBUTE_COUNT_MIN,
    ATTRIBUTE_COUNT_MAX,
  )
  if (attributeCounts?.length === 1) {
    addRequiredTrait(ATTRIBUTE_COUNT_TRAIT_OFFSET + attributeCounts[0])
  } else if (attributeCounts !== undefined) {
    addAnyOfTraitGroup(
      attributeCounts.map((count) => ATTRIBUTE_COUNT_TRAIT_OFFSET + count),
      'attributeCount',
    )
  }

  validateTraitCriteriaMasks(
    requiredTraitMask,
    forbiddenTraitMask,
    anyOfTraitMask,
  )
  validateColorCriteriaMasks(
    colorCriteria.requiredMask,
    colorCriteria.forbiddenMask,
    colorCriteria.anyOfMask,
  )

  const pixelRange = toContractRange(
    'pixelCount',
    query.pixelCount,
    PIXEL_COUNT_MIN,
    PIXEL_COUNT_MAX,
  )
  const colorRange = toContractRange(
    'colorCount',
    query.colorCount,
    COLOR_COUNT_MIN,
    COLOR_COUNT_MAX,
  )

  return {
    requiredTraitMask,
    forbiddenTraitMask,
    anyOfTraitMask,
    requiredColorMask: colorCriteria.requiredMask,
    forbiddenColorMask: colorCriteria.forbiddenMask,
    anyOfColorMask: colorCriteria.anyOfMask,
    minPixelCount: pixelRange.min,
    maxPixelCount: pixelRange.max,
    minColorCount: colorRange.min,
    maxColorCount: colorRange.max,
  }
}

export function compileOfferSlot(
  data: OfflinePunksDataClient,
  input: CompileOfferSlotInput = {},
): CompiledOfferSlot {
  const query = input.query ?? {}
  const includeIds = uniqueIds(
    [...(query.ids ?? []), ...(input.includeIds ?? [])],
    'includeIds',
  )
  const excludeIds = uniqueIds(
    [...(query.excludeIds ?? []), ...(input.excludeIds ?? [])],
    'excludeIds',
  )
  return {
    criteria: compilePunksFilter(data, {
      ...query,
      ids: undefined,
      excludeIds: undefined,
    }),
    standard: normalizePunkStandard(input.standard ?? 'cryptopunks'),
    includeIds,
    excludeIds,
  }
}

export function normalizePunkStandard(
  standard: PunkStandardRef,
): PunkStandardValue {
  if (
    standard === PunkStandard.CryptoPunks ||
    standard === PunkStandard.CryptoPunksV1
  ) {
    return standard
  }
  if (typeof standard !== 'string') {
    throw new PunksDataValidationError(
      'standard must be cryptopunks or cryptopunks-v1',
    )
  }
  const key = normalizeName(standard)
  if (
    key === 'cryptopunks' ||
    key === 'punks' ||
    key === 'v2' ||
    key === 'cryptopunksv2'
  ) {
    return PunkStandard.CryptoPunks
  }
  if (key === 'cryptopunksv1' || key === 'v1') return PunkStandard.CryptoPunksV1
  throw new PunksDataValidationError(`unknown Punk standard ${standard}`)
}

export function normalizePunkTypeRefs(
  value: PunkQuery['type'] | PunkQuery['punkType'],
): PunkTypeValue[] {
  const refs = value === undefined ? [] : Array.isArray(value) ? value : [value]
  return uniqueNumbers(refs.map((ref) => normalizePunkTypeRef(ref))).map(
    (id) => id as PunkTypeValue,
  )
}

export function normalizeHeadVariantRefs(
  value: PunkQuery['head'] | PunkQuery['headVariant'],
): HeadVariantValue[] {
  const refs = value === undefined ? [] : Array.isArray(value) ? value : [value]
  return uniqueNumbers(refs.map((ref) => normalizeHeadVariantRef(ref))).map(
    (id) => id as HeadVariantValue,
  )
}

function rejectUnchainableQueryFields(query: PunkQuery): void {
  if (query.text !== undefined) {
    if (typeof query.text !== 'string') {
      throw new PunksDataValidationError('text search must be a string')
    }
    if (query.text.trim() !== '') {
      throw new PunksDataValidationError(
        'text search cannot be represented as an onchain filter; use attributes, colors, counts, or explicit includeIds',
      )
    }
  }
  if (
    query.offset !== undefined ||
    query.limit !== undefined ||
    query.sort !== undefined
  ) {
    throw new PunksDataValidationError(
      'pagination and sorting cannot be represented as an onchain filter',
    )
  }
  if (query.ids !== undefined || query.excludeIds !== undefined) {
    throw new PunksDataValidationError(
      'ids and excludeIds are offer-slot include/exclude lists, not part of an onchain filter',
    )
  }
}

function toContractRange(
  label: string,
  range: NumericRange | undefined,
  minAllowed: number,
  maxAllowed: number,
): { min: number; max: number } {
  if (range === undefined) return { min: 0, max: 0 }
  const values = normalizeNumericRange(label, range, minAllowed, maxAllowed)
  if (values === undefined) return { min: 0, max: 0 }
  const min = values[0]
  const max = values[values.length - 1]
  if (label === 'pixelCount') {
    validatePixelCount(min)
    validatePixelCount(max)
  } else {
    validateColorCount(min)
    validateColorCount(max)
  }
  return { min, max }
}

function normalizePunkTypeRef(ref: unknown): PunkTypeValue {
  if (typeof ref === 'number') {
    if (!Number.isInteger(ref) || ref < 0 || ref >= punkTypeNames.length) {
      throw new PunksDataValidationError('type must be a valid Punk type')
    }
    return ref as PunkTypeValue
  }
  if (typeof ref !== 'string') {
    throw new PunksDataValidationError('type must be a Punk type name or id')
  }
  const key = normalizeName(ref)
  for (const [name, value] of Object.entries(PunkType)) {
    if (normalizeName(name) === key) return value
  }
  throw new PunksDataValidationError(`unknown Punk type ${ref}`)
}

function normalizeHeadVariantRef(ref: unknown): HeadVariantValue {
  if (typeof ref === 'number') {
    if (!Number.isInteger(ref) || ref < 0 || ref >= headVariantNames.length) {
      throw new PunksDataValidationError('head must be a valid head variant')
    }
    return ref as HeadVariantValue
  }
  if (typeof ref !== 'string') {
    throw new PunksDataValidationError('head must be a head variant name or id')
  }
  const key = normalizeName(ref)
  for (const [name, value] of Object.entries(HeadVariant)) {
    if (normalizeName(name) === key) return value
  }
  const index = headVariantNames.findIndex(
    (name) => normalizeName(name) === key,
  )
  if (index >= 0) return index as HeadVariantValue
  throw new PunksDataValidationError(`unknown head variant ${ref}`)
}

function uniqueIds(values: Iterable<number>, label: string): number[] {
  const ids = [...values]
  for (const id of ids) {
    validatePunkId(id)
  }
  return uniqueNumbers(ids)
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function assertQueryObject(query: PunkQuery): void {
  if (typeof query !== 'object' || query === null || Array.isArray(query)) {
    throw new PunksDataValidationError('query must be an object')
  }
}

export function isPunkQuerySort(value: unknown): value is PunkQuerySort {
  return (
    value === 'id' ||
    value === 'id-desc' ||
    value === 'rarity' ||
    value === 'rarity-desc' ||
    value === 'pixelCount' ||
    value === 'pixelCount-desc' ||
    value === 'colorCount' ||
    value === 'colorCount-desc' ||
    value === 'attributeCount' ||
    value === 'attributeCount-desc'
  )
}
