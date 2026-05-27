import {
  COLOR_COUNT_MAX,
  COLOR_COUNT_MIN,
  HeadVariant,
  PIXEL_COUNT_MAX,
  PIXEL_COUNT_MIN,
  PunkStandard,
  PunkType,
  SkinTone,
  headVariantNames,
  punkTypeNames,
  skinToneHeadVariants,
  skinToneNames,
  type HeadVariantValue,
  type PunkStandardValue,
  type PunkTypeValue,
  type SkinToneValue,
} from './constants'
import {
  normalizeSearchText,
  type OfflinePunksDataClient,
  type OfflinePunksSearchQuery,
} from './offline'
import {
  parseSearchTextWithExactTraitsSync,
  type ParsedNumericConstraint,
  type SearchTextTerm,
} from './text-parse'
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
  const { type, punkType, head, headVariant, skinTone, ...rest } = query
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
  const mergedHead = mergeHeadVariantsWithSkinTone(
    head ?? headVariant,
    skinTone,
  )
  if (normalizedType !== undefined) normalized.punkType = normalizedType
  if (
    skinTone !== undefined ||
    head !== undefined ||
    headVariant !== undefined
  ) {
    normalized.headVariant = mergedHead
  }
  return normalized
}

/// Combines an optional `head` / `headVariant` constraint with an optional
/// skin-tone constraint into a single list of head variants. When both are
/// specified the result is the intersection (the user is narrowing to a
/// specific gender × tone); when only one is specified that one wins.
function mergeHeadVariantsWithSkinTone(
  head: PunkQuery['head'] | PunkQuery['headVariant'],
  skinTone: PunkQuery['skinTone'],
): HeadVariantValue[] {
  if (skinTone === undefined) {
    return normalizeHeadVariantRefs(head)
  }
  const expanded = headVariantsFromSkinToneRefs(skinTone)
  if (head === undefined) return expanded
  const existing = normalizeHeadVariantRefs(head)
  const intersection = existing.filter((h) => expanded.includes(h))
  if (intersection.length === 0) {
    throw new PunksDataValidationError(
      'skinTone has no overlap with head/headVariant',
    )
  }
  return intersection
}

/// The all-zero `PunksFilter` — matches no constraints. Useful when placing a
/// PunksMarket bid that only restricts by `includeIds`.
export function emptyPunksFilter(): PunksFilter {
  return {
    requiredTraitMask: 0n,
    forbiddenTraitMask: 0n,
    anyOfTraitMask: 0n,
    requiredColorMask: 0n,
    forbiddenColorMask: 0n,
    anyOfColorMask: 0n,
    minPixelCount: 0,
    maxPixelCount: 0,
    minColorCount: 0,
    maxColorCount: 0,
  }
}

export function compilePunksFilter(
  data: OfflinePunksDataClient,
  query: PunkQuery = {},
): PunksFilter {
  assertQueryObject(query)
  rejectUnchainableQueryFields(query)

  const folded = foldTextIntoQuery(data, query)
  if (folded.includeIds.length > 0 || folded.excludeIds.length > 0) {
    throw new PunksDataValidationError(
      'ids in text cannot be represented as a PunksFilter; use compileOfferSlot or query.ids / query.excludeIds',
    )
  }
  return buildFilter(
    data,
    folded.query,
    folded.freeTermRequired,
    folded.freeTermAnyOfGroups,
  )
}

function buildFilter(
  data: OfflinePunksDataClient,
  foldedQuery: PunkQuery,
  freeTermRequired: readonly number[],
  freeTermAnyOfGroups: readonly number[][],
): PunksFilter {
  const traitCriteria = data.resolveTraitCriteriaSync(foldedQuery.attributes)
  const colorCriteria = data.resolveColorCriteriaSync(foldedQuery.colors)
  let requiredTraitMask = traitCriteria.requiredMask
  let forbiddenTraitMask = traitCriteria.forbiddenMask
  /// Defer any-of resolution until every required trait is known: an any-of
  /// candidate that contains a required trait is automatically satisfied and
  /// can be dropped, freeing the filter's only any-of slot for a non-redundant
  /// group. This keeps queries like `wild white albino` representable —
  /// `wild` produces a {Wild Hair, Wild Blonde, Wild White Hair} any-of, but
  /// `white` already requires Wild White Hair, so the `wild` group is dropped
  /// and the skin-tone any-of [Female 4, Male 4] survives unchallenged.
  const anyOfCandidates: { mask: bigint; label: string }[] = []
  if (traitCriteria.anyOfMask !== 0n) {
    anyOfCandidates.push({
      mask: traitCriteria.anyOfMask,
      label: 'query.attributes.anyOf',
    })
  }

  const addRequiredTrait = (traitId: number): void => {
    validateTraitId(traitId)
    requiredTraitMask |= 1n << BigInt(traitId)
  }
  const addAnyOfTraitGroup = (
    traitIds: readonly number[],
    label: string,
  ): void => {
    if (traitIds.length === 0) return
    anyOfCandidates.push({
      mask: maskFromIds(traitIds, validateTraitId),
      label,
    })
  }

  for (const traitId of freeTermRequired) addRequiredTrait(traitId)
  for (let i = 0; i < freeTermAnyOfGroups.length; i++) {
    addAnyOfTraitGroup(freeTermAnyOfGroups[i], `text term #${i + 1}`)
  }

  const typeIds = normalizePunkTypeRefs(
    foldedQuery.type ?? foldedQuery.punkType,
  )
  if (typeIds.length === 1) addRequiredTrait(typeIds[0])
  else addAnyOfTraitGroup(typeIds, 'type')

  const headVariants = mergeHeadVariantsWithSkinTone(
    foldedQuery.head ?? foldedQuery.headVariant,
    foldedQuery.skinTone,
  )
  const headVariantIds = headVariants.map(
    (id) => HEAD_VARIANT_TRAIT_OFFSET + id,
  )
  if (headVariantIds.length === 1) addRequiredTrait(headVariantIds[0])
  else addAnyOfTraitGroup(headVariantIds, 'head')

  const attributeCounts = normalizeNumericRange(
    'attributeCount',
    foldedQuery.attributeCount,
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

  let anyOfTraitMask = 0n
  for (const { mask, label } of anyOfCandidates) {
    /// Group is automatically satisfied — every punk matching `requiredTraitMask`
    /// already has at least one of these traits, so the group adds no
    /// information.
    if ((requiredTraitMask & mask) !== 0n) continue
    if (anyOfTraitMask === 0n) {
      anyOfTraitMask = mask
      continue
    }
    if (anyOfTraitMask === mask) continue
    throw new PunksDataValidationError(
      `${label} cannot be combined with another any-of trait group in one onchain filter`,
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
    foldedQuery.pixelCount,
    PIXEL_COUNT_MIN,
    PIXEL_COUNT_MAX,
  )
  const colorRange = toContractRange(
    'colorCount',
    foldedQuery.colorCount,
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

/// Resolves any `query.text` into structured query fields, merging the text's
/// numeric, skin-tone, and id constraints with the existing structured query
/// and returning the trait ids the free terms resolve to (using the same
/// substring rules as offline search). Throws when:
///   - the text contains OR groups (onchain filter cannot express that);
///   - a free term doesn't match any trait name;
///   - a numeric / skin-tone constraint conflicts with the existing query.
///
/// `freeTermRequired` holds trait ids that must be ANDed into
/// `requiredTraitMask` — one per term that resolved unambiguously to a single
/// trait (or whose match set has a canonical member subsuming the others).
/// `freeTermAnyOfGroups` holds OR-groups of trait ids — one per term that
/// matched multiple traits with no canonical member. The onchain filter only
/// has one `anyOfTraitMask` slot, so at most one group survives; additional
/// groups (or conflicts with type / head / attributeCount any-of groups) are
/// rejected by `buildFilter`.
type FoldedText = {
  query: PunkQuery
  freeTermRequired: number[]
  freeTermAnyOfGroups: number[][]
  includeIds: number[]
  excludeIds: number[]
}

function foldTextIntoQuery(
  data: OfflinePunksDataClient,
  query: PunkQuery,
): FoldedText {
  const empty = {
    freeTermRequired: [] as number[],
    freeTermAnyOfGroups: [] as number[][],
    includeIds: [] as number[],
    excludeIds: [] as number[],
  }
  if (query.text === undefined || query.text.trim() === '') {
    return { query, ...empty }
  }
  const parsed = parseSearchTextWithExactTraitsSync(query.text, data)
  const nonEmpty = parsed.orGroups.filter(
    (group) =>
      group.freeTerms.length > 0 ||
      group.attributeCount !== undefined ||
      group.colorCount !== undefined ||
      group.pixelCount !== undefined ||
      group.skinTones !== undefined ||
      group.includeIds !== undefined ||
      group.excludeIds !== undefined,
  )
  if (nonEmpty.length === 0) {
    const { text: _omitted, ...rest } = query
    return { query: rest, ...empty }
  }
  if (nonEmpty.length > 1) {
    throw new PunksDataValidationError(
      'OR groups in text cannot be represented as a single onchain filter; place them in separate offer slots',
    )
  }
  const group = nonEmpty[0]
  const { freeTermRequired, freeTermAnyOfGroups } = resolveFreeTerms(
    data,
    group.freeTerms,
  )

  const { text: _omitted, ...rest } = query
  const folded: PunkQuery = { ...rest }
  if (group.attributeCount !== undefined) {
    folded.attributeCount = mergeQueryNumeric(
      'attributeCount',
      folded.attributeCount,
      group.attributeCount,
    )
  }
  if (group.colorCount !== undefined) {
    folded.colorCount = mergeQueryNumeric(
      'colorCount',
      folded.colorCount,
      group.colorCount,
    )
  }
  if (group.pixelCount !== undefined) {
    folded.pixelCount = mergeQueryNumeric(
      'pixelCount',
      folded.pixelCount,
      group.pixelCount,
    )
  }
  if (group.skinTones !== undefined && group.skinTones.length > 0) {
    folded.skinTone = mergeSkinTones(folded.skinTone, group.skinTones)
  }
  return {
    query: folded,
    freeTermRequired,
    freeTermAnyOfGroups,
    includeIds: group.includeIds ?? [],
    excludeIds: group.excludeIds ?? [],
  }
}

function resolveFreeTerms(
  data: OfflinePunksDataClient,
  terms: readonly SearchTextTerm[],
): { freeTermRequired: number[]; freeTermAnyOfGroups: number[][] } {
  const required: number[] = []
  const anyOfGroups: number[][] = []
  for (const term of terms) {
    const matches = data.findTraitsByTextSync(term.text, { exact: term.exact })
    if (matches.length === 0) {
      throw new PunksDataValidationError(
        `cannot represent text term "${term.text}" as an onchain filter: no trait name matches`,
      )
    }
    /// Prefer a canonical match — a trait whose normalized name *equals* the
    /// normalized term. When one exists, every other match is a strict
    /// trait-mask subset of it (e.g. `male` → NormalizedType.Male covers
    /// HeadVariant Male 1..4), so we can encode the term as a single
    /// required trait without burning the filter's only any-of slot.
    const normalized = normalizeSearchText(term.text)
    const canonical = matches.find(
      (m) => normalizeSearchText(m.name) === normalized,
    )
    if (canonical !== undefined) {
      if (!required.includes(canonical.id)) required.push(canonical.id)
      continue
    }
    if (matches.length === 1) {
      const id = matches[0].id
      if (!required.includes(id)) required.push(id)
      continue
    }
    anyOfGroups.push(matches.map((m) => m.id))
  }
  return { freeTermRequired: required, freeTermAnyOfGroups: anyOfGroups }
}

function mergeQueryNumeric(
  label: string,
  existing: NumericRange | undefined,
  next: ParsedNumericConstraint,
): NumericRange {
  if (existing === undefined) return next
  if (typeof existing === 'number') {
    return mergeQueryNumeric(label, { eq: existing }, next)
  }
  if ('eq' in next) {
    if (existing.eq !== undefined && existing.eq !== next.eq) {
      throw new PunksDataValidationError(
        `${label} from text (${next.eq}) conflicts with query.${label}`,
      )
    }
    if (existing.min !== undefined && next.eq < existing.min) {
      throw new PunksDataValidationError(
        `${label} from text (${next.eq}) conflicts with query.${label}.min`,
      )
    }
    if (existing.max !== undefined && next.eq > existing.max) {
      throw new PunksDataValidationError(
        `${label} from text (${next.eq}) conflicts with query.${label}.max`,
      )
    }
    return { eq: next.eq }
  }
  if (existing.eq !== undefined) {
    if (next.min !== undefined && existing.eq < next.min) {
      throw new PunksDataValidationError(
        `${label} from text (>=${next.min}) conflicts with query.${label}.eq`,
      )
    }
    if (next.max !== undefined && existing.eq > next.max) {
      throw new PunksDataValidationError(
        `${label} from text (<=${next.max}) conflicts with query.${label}.eq`,
      )
    }
    return { eq: existing.eq }
  }
  const min =
    next.min !== undefined
      ? existing.min !== undefined
        ? Math.max(existing.min, next.min)
        : next.min
      : existing.min
  const max =
    next.max !== undefined
      ? existing.max !== undefined
        ? Math.min(existing.max, next.max)
        : next.max
      : existing.max
  if (min !== undefined && max !== undefined && min > max) {
    throw new PunksDataValidationError(
      `${label} from text yields empty range [${min}, ${max}]`,
    )
  }
  const merged: { min?: number; max?: number } = {}
  if (min !== undefined) merged.min = min
  if (max !== undefined) merged.max = max
  return merged
}

function mergeSkinTones(
  existing: PunkQuery['skinTone'],
  next: readonly SkinToneValue[],
): SkinToneValue[] {
  const out = new Set<SkinToneValue>()
  if (existing !== undefined) {
    for (const tone of normalizeSkinToneRefs(existing)) out.add(tone)
  }
  for (const tone of next) out.add(tone)
  return [...out].sort((a, b) => a - b) as SkinToneValue[]
}

export function compileOfferSlot(
  data: OfflinePunksDataClient,
  input: CompileOfferSlotInput = {},
): CompiledOfferSlot {
  const query = input.query ?? {}
  assertQueryObject(query)
  rejectUnchainableQueryFields(query, { allowIds: true })
  const folded = foldTextIntoQuery(data, query)

  const includeIds = uniqueIds(
    [...(query.ids ?? []), ...(input.includeIds ?? []), ...folded.includeIds],
    'includeIds',
  )
  const excludeIds = uniqueIds(
    [
      ...(query.excludeIds ?? []),
      ...(input.excludeIds ?? []),
      ...folded.excludeIds,
    ],
    'excludeIds',
  )
  const standard = normalizePunkStandard(input.standard ?? 'cryptopunks')
  try {
    return {
      criteria: buildFilter(
        data,
        folded.query,
        folded.freeTermRequired,
        folded.freeTermAnyOfGroups,
      ),
      standard,
      includeIds,
      excludeIds,
    }
  } catch (filterError) {
    /// Last-resort fallback for queries that can't compress into one onchain
    /// filter (e.g. multiple non-redundant any-of groups). Run the same
    /// search the user sees and pin those ids as `includeIds[]` with an
    /// empty criteria — the contract matches a punk if it appears in
    /// `includeIds`, so the bid covers exactly the searched set. Capped at
    /// 64 by `PunksMarket.MAX_INCLUDE_IDS`; broader searches must refine.
    if (!(filterError instanceof PunksDataValidationError)) throw filterError
    /// Run the search against the *original* query so user-visible text terms
    /// (`hair`, `earring`, …) still contribute — `folded.query` already had
    /// its text stripped into structured fields for the filter compile path.
    const matched = data.searchSync(toOfflineSearchQuery(query))
    const merged = uniqueIds([...includeIds, ...matched], 'includeIds')
    if (merged.length === 0 || merged.length > 64) throw filterError
    return {
      criteria: emptyPunksFilter(),
      standard,
      includeIds: merged,
      excludeIds,
    }
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

/// Normalizes one or more skin-tone references (names, ids, or
/// {@link SkinToneValue} enum members) into canonical {@link SkinToneValue}
/// ids.
export function normalizeSkinToneRefs(
  value: PunkQuery['skinTone'],
): SkinToneValue[] {
  const refs = value === undefined ? [] : Array.isArray(value) ? value : [value]
  return uniqueNumbers(refs.map((ref) => normalizeSkinToneRef(ref))).map(
    (id) => id as SkinToneValue,
  )
}

/// Expands skin-tone references into the corresponding human head variants
/// ([Female, Male] for each tone). Aliens, Apes, and Zombies have no skin
/// tone — they are never selected by these head variants.
export function headVariantsFromSkinToneRefs(
  value: PunkQuery['skinTone'],
): HeadVariantValue[] {
  const tones = normalizeSkinToneRefs(value)
  const out: HeadVariantValue[] = []
  for (const tone of tones) {
    const [female, male] = skinToneHeadVariants[tone]
    if (!out.includes(female)) out.push(female)
    if (!out.includes(male)) out.push(male)
  }
  return out
}

function normalizeSkinToneRef(ref: unknown): SkinToneValue {
  if (typeof ref === 'number') {
    if (!Number.isInteger(ref) || ref < 0 || ref >= skinToneNames.length) {
      throw new PunksDataValidationError('skin tone must be a valid skin tone')
    }
    return ref as SkinToneValue
  }
  if (typeof ref !== 'string') {
    throw new PunksDataValidationError('skin tone must be a name or id')
  }
  const key = normalizeName(ref)
  for (const [name, value] of Object.entries(SkinTone)) {
    if (normalizeName(name) === key) return value
  }
  const index = skinToneNames.findIndex((name) => normalizeName(name) === key)
  if (index >= 0) return index as SkinToneValue
  throw new PunksDataValidationError(`unknown skin tone ${ref}`)
}

function rejectUnchainableQueryFields(
  query: PunkQuery,
  options: { allowIds?: boolean } = {},
): void {
  if (query.text !== undefined && typeof query.text !== 'string') {
    throw new PunksDataValidationError('text search must be a string')
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
  if (
    !options.allowIds &&
    (query.ids !== undefined || query.excludeIds !== undefined)
  ) {
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
