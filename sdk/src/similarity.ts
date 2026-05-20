import {
  COLOR_COUNT_MAX,
  COLOR_COUNT_MIN,
  HeadVariant,
  PIXELS_PER_PUNK,
  PIXEL_COUNT_MAX,
  PIXEL_COUNT_MIN,
  PUNK_COUNT,
  type HeadVariantName,
  type HeadVariantValue,
  type PunkTypeName,
  type PunkTypeValue,
} from './constants'
import { PunksDataset, type PunksDatasetConfig } from './dataset'
import { bitmapToPunkIds } from './bitmap'
import type { OfflinePunksDataBundle, OfflinePunksDataSource } from './offline'
import type { PaletteColor, PunkQuery, PunkSummary, TraitRecord } from './types'
import {
  PunksDataValidationError,
  assertIntegerInRange,
  validatePunkId,
} from './utils'

export type PunkSimilarityProfile = 'balanced' | 'traits' | 'visual' | 'colors'

export type PunkSimilarityComponents = {
  type: number
  head: number
  accessories: number
  colors: number
  scalars: number
  pixels?: number
}

export type PunkSimilarityWeights = {
  type: number
  head: number
  accessories: number
  colors: number
  scalars: number
  pixels: number
}

export type PunkSimilarityOptions = {
  profile?: PunkSimilarityProfile
  weights?: Partial<PunkSimilarityWeights>
  filter?: PunkQuery
  excludeIds?: Iterable<number>
  includeSelf?: boolean
  limit?: number
  minScore?: number
  diversify?: boolean
}

export type PunkSimilarityRecommendOptions = PunkSimilarityOptions & {
  liked: readonly number[]
  disliked?: readonly number[]
  dislikedPenalty?: number
  diversityPenalty?: number
}

export type PunkSimilarityResult = {
  punkId: number
  score: number
  components: PunkSimilarityComponents
}

export type PunkSimilarityScalarDelta = {
  a: number
  b: number
  delta: number
  score: number
}

export type PunkSimilarityExplanation = {
  punkId: number
  otherPunkId: number
  score: number
  components: PunkSimilarityComponents
  profile: PunkSimilarityProfile
  weights: PunkSimilarityWeights
  normalizedWeights: PunkSimilarityWeights
  pixelsAvailable: boolean
  type: {
    a: { value: PunkTypeValue; name: PunkTypeName }
    b: { value: PunkTypeValue; name: PunkTypeName }
    same: boolean
  }
  head: {
    a: { value: HeadVariantValue; name: HeadVariantName }
    b: { value: HeadVariantValue; name: HeadVariantName }
    same: boolean
  }
  accessories: {
    shared: TraitRecord[]
    onlyA: TraitRecord[]
    onlyB: TraitRecord[]
  }
  colors: {
    shared: PaletteColor[]
    onlyA: PaletteColor[]
    onlyB: PaletteColor[]
  }
  scalars: {
    pixelCount: PunkSimilarityScalarDelta
    colorCount: PunkSimilarityScalarDelta
    attributeCount: PunkSimilarityScalarDelta
  }
}

export type PunksSimilarityConfig = {
  dataset?: OfflinePunksDataSource | OfflinePunksDataBundle | PunksDataset
  includePixels?: boolean
}

type ComponentKey = keyof PunkSimilarityWeights

type ScoringContext = {
  profile: PunkSimilarityProfile
  weights: PunkSimilarityWeights
}

type IndexedPunk = {
  id: number
  punkType: PunkTypeValue
  punkTypeName: PunkTypeName
  headVariant: HeadVariantValue
  headVariantName: HeadVariantName
  traitIds: number[]
  colorIds: number[]
  accessoryIds: number[]
  pixelCount: number
  colorCount: number
  attributeCount: number
  indexedPixels?: Uint8Array
}

const COMPONENT_KEYS = [
  'type',
  'head',
  'accessories',
  'colors',
  'scalars',
  'pixels',
] as const satisfies readonly ComponentKey[]

const ALL_PUNK_IDS = Array.from({ length: PUNK_COUNT }, (_, id) => id)
const ATTRIBUTE_COUNT_MIN = 0
const ATTRIBUTE_COUNT_MAX = 7
const DEFAULT_LIMIT = 20
const DEFAULT_DISLIKED_PENALTY = 0.35
const DEFAULT_DIVERSITY_PENALTY = 0.25

const PROFILE_WEIGHTS: Record<PunkSimilarityProfile, PunkSimilarityWeights> = {
  balanced: {
    type: 0.18,
    head: 0.12,
    accessories: 0.38,
    colors: 0.18,
    scalars: 0.14,
    pixels: 0,
  },
  traits: {
    type: 0.22,
    head: 0.18,
    accessories: 0.48,
    colors: 0.06,
    scalars: 0.06,
    pixels: 0,
  },
  visual: {
    type: 0.12,
    head: 0.1,
    accessories: 0.24,
    colors: 0.18,
    scalars: 0.16,
    pixels: 0.2,
  },
  colors: {
    type: 0.08,
    head: 0.06,
    accessories: 0.14,
    colors: 0.5,
    scalars: 0.22,
    pixels: 0,
  },
}

const ZERO_WEIGHTS: PunkSimilarityWeights = {
  type: 0,
  head: 0,
  accessories: 0,
  colors: 0,
  scalars: 0,
  pixels: 0,
}

export class PunkSimilarityIndex {
  readonly dataset: PunksDataset
  readonly hasPixels: boolean

  private readonly punks: IndexedPunk[]
  private readonly traits: TraitRecord[]
  private readonly palette: PaletteColor[]
  private readonly traitWeights: Float64Array
  private readonly colorWeights: Float64Array

  constructor(config: PunksSimilarityConfig = {}) {
    this.dataset =
      config.dataset instanceof PunksDataset
        ? config.dataset
        : new PunksDataset({
            dataset: config.dataset as PunksDatasetConfig['dataset'],
          })

    this.traits = this.dataset.traits()
    this.palette = this.dataset.palette({ includeSupplies: true })
    this.traitWeights = traitRarityWeights(this.traits)
    this.colorWeights = colorRarityWeights(this.palette)

    const summaries = this.dataset.getMany(ALL_PUNK_IDS)
    this.punks = summaries.map((summary) => this.indexPunk(summary))
    this.hasPixels = this.loadPixels(config.includePixels)
  }

  score(
    punkId: number,
    otherPunkId: number,
    options: PunkSimilarityOptions = {},
  ): number {
    validatePunkId(punkId)
    validatePunkId(otherPunkId)
    const context = this.scoringContext(options)
    return this.scoreIndexed(
      this.punks[punkId],
      this.punks[otherPunkId],
      context,
    ).score
  }

  components(
    punkId: number,
    otherPunkId: number,
    options: PunkSimilarityOptions = {},
  ): PunkSimilarityComponents {
    validatePunkId(punkId)
    validatePunkId(otherPunkId)
    const context = this.scoringContext(options)
    return this.componentsFor(
      this.punks[punkId],
      this.punks[otherPunkId],
      context,
    )
  }

  explain(
    punkId: number,
    otherPunkId: number,
    options: PunkSimilarityOptions = {},
  ): PunkSimilarityExplanation {
    validatePunkId(punkId)
    validatePunkId(otherPunkId)

    const context = this.scoringContext(options)
    const a = this.punks[punkId]
    const b = this.punks[otherPunkId]
    const { score, components, normalizedWeights } = this.scoreIndexed(
      a,
      b,
      context,
    )
    const scalarBreakdown = scalarsFor(a, b)

    return {
      punkId,
      otherPunkId,
      score,
      components,
      profile: context.profile,
      weights: { ...context.weights },
      normalizedWeights,
      pixelsAvailable: this.hasPixels,
      type: {
        a: { value: a.punkType, name: a.punkTypeName },
        b: { value: b.punkType, name: b.punkTypeName },
        same: a.punkType === b.punkType,
      },
      head: {
        a: { value: a.headVariant, name: a.headVariantName },
        b: { value: b.headVariant, name: b.headVariantName },
        same: a.headVariant === b.headVariant,
      },
      accessories: {
        shared: this.traitRecords(intersection(a.accessoryIds, b.accessoryIds)),
        onlyA: this.traitRecords(difference(a.accessoryIds, b.accessoryIds)),
        onlyB: this.traitRecords(difference(b.accessoryIds, a.accessoryIds)),
      },
      colors: {
        shared: this.colorRecords(intersection(a.colorIds, b.colorIds)),
        onlyA: this.colorRecords(difference(a.colorIds, b.colorIds)),
        onlyB: this.colorRecords(difference(b.colorIds, a.colorIds)),
      },
      scalars: scalarBreakdown,
    }
  }

  similar(
    punkId: number,
    options: PunkSimilarityOptions = {},
  ): PunkSimilarityResult[] {
    validatePunkId(punkId)
    const limit = normalizeLimit(options.limit, DEFAULT_LIMIT)
    if (limit === 0) return []

    const minScore = normalizeMinScore(options.minScore)
    const excluded = idSet(options.excludeIds)
    const includeSelf = options.includeSelf ?? false
    const context = this.scoringContext(options)
    const source = this.punks[punkId]
    const results: PunkSimilarityResult[] = []

    for (const candidateId of this.candidateIds(options.filter)) {
      if (!includeSelf && candidateId === punkId) continue
      if (excluded.has(candidateId)) continue
      const result = this.scoreIndexed(source, this.punks[candidateId], context)
      if (result.score < minScore) continue
      results.push({
        punkId: candidateId,
        score: result.score,
        components: result.components,
      })
    }

    return sortResults(results).slice(0, limit)
  }

  recommend(options: PunkSimilarityRecommendOptions): PunkSimilarityResult[] {
    const limit = normalizeLimit(options.limit, DEFAULT_LIMIT)
    if (limit === 0) return []

    const liked = normalizePunkIds('liked', options.liked)
    if (liked.length === 0) {
      throw new PunksDataValidationError('liked must include at least one punk')
    }
    const disliked = normalizePunkIds('disliked', options.disliked ?? [])
    const dislikedPenalty = normalizePenalty(
      'dislikedPenalty',
      options.dislikedPenalty,
      DEFAULT_DISLIKED_PENALTY,
    )
    const diversityPenalty = normalizePenalty(
      'diversityPenalty',
      options.diversityPenalty,
      DEFAULT_DIVERSITY_PENALTY,
    )
    const minScore = normalizeMinScore(options.minScore)
    const excluded = idSet(options.excludeIds)
    if (!(options.includeSelf ?? false)) {
      for (const id of liked) excluded.add(id)
      for (const id of disliked) excluded.add(id)
    }

    const context = this.scoringContext(options)
    const results: PunkSimilarityResult[] = []
    for (const candidateId of this.candidateIds(options.filter)) {
      if (excluded.has(candidateId)) continue
      const result = this.recommendationScore(
        candidateId,
        liked,
        disliked,
        dislikedPenalty,
        context,
      )
      if (result.score < minScore) continue
      results.push(result)
    }

    const sorted = sortResults(results)
    return options.diversify
      ? this.diversify(sorted, limit, diversityPenalty, context)
      : sorted.slice(0, limit)
  }

  private indexPunk(summary: PunkSummary): IndexedPunk {
    const accessoryIds = summary.traitIds.filter(
      (traitId) => this.traits[traitId]?.kind === 'Accessory',
    )
    const colorIds = summary.colorIds.filter(
      (colorId) => (this.palette[colorId]?.alpha ?? 0) > 0,
    )
    return {
      id: summary.id,
      punkType: summary.punkType,
      punkTypeName: summary.punkTypeName,
      headVariant: summary.headVariant,
      headVariantName: summary.headVariantName,
      traitIds: summary.traitIds,
      colorIds,
      accessoryIds,
      pixelCount: summary.pixelCount,
      colorCount: summary.colorCount,
      attributeCount: summary.attributeCount,
    }
  }

  private loadPixels(includePixels: boolean | undefined): boolean {
    if (includePixels === false) return false

    try {
      for (const id of ALL_PUNK_IDS) {
        this.punks[id].indexedPixels = this.dataset.indexedPixels(id)
      }
      return true
    } catch (error) {
      if (includePixels === true || !isMissingPixelDataError(error)) {
        throw error
      }
      return false
    }
  }

  private scoringContext(options: PunkSimilarityOptions): ScoringContext {
    const profile = options.profile ?? 'balanced'
    const base = PROFILE_WEIGHTS[profile]
    if (base === undefined) {
      throw new PunksDataValidationError(
        `unknown similarity profile ${String(profile)}`,
      )
    }
    const weights = { ...base, ...options.weights }
    validateWeights(weights)
    return { profile, weights }
  }

  private componentsFor(
    a: IndexedPunk,
    b: IndexedPunk,
    context: ScoringContext,
  ): PunkSimilarityComponents {
    const components: PunkSimilarityComponents = {
      type: a.punkType === b.punkType ? 1 : 0,
      head: headScore(a.headVariant, b.headVariant),
      accessories: weightedJaccard(
        a.accessoryIds,
        b.accessoryIds,
        this.traitWeights,
      ),
      colors: weightedJaccard(a.colorIds, b.colorIds, this.colorWeights),
      scalars: scalarScore(a, b),
    }
    if (
      context.weights.pixels > 0 &&
      a.indexedPixels !== undefined &&
      b.indexedPixels !== undefined
    ) {
      components.pixels = pixelScore(a.indexedPixels, b.indexedPixels)
    }
    return components
  }

  private scoreIndexed(
    a: IndexedPunk,
    b: IndexedPunk,
    context: ScoringContext,
  ): {
    score: number
    components: PunkSimilarityComponents
    normalizedWeights: PunkSimilarityWeights
  } {
    const components = this.componentsFor(a, b, context)
    const normalizedWeights = normalizeWeights(context.weights, components)
    let score = 0
    for (const key of COMPONENT_KEYS) {
      const component = components[key]
      if (component !== undefined) score += component * normalizedWeights[key]
    }
    return {
      score: clamp01(score),
      components,
      normalizedWeights,
    }
  }

  private candidateIds(filter: PunkQuery | undefined): readonly number[] {
    return filter === undefined
      ? ALL_PUNK_IDS
      : bitmapToPunkIds(this.dataset.bitmap(filter))
  }

  private recommendationScore(
    candidateId: number,
    liked: readonly number[],
    disliked: readonly number[],
    dislikedPenalty: number,
    context: ScoringContext,
  ): PunkSimilarityResult {
    const candidate = this.punks[candidateId]
    let likedScore = 0
    const componentSums: Partial<Record<ComponentKey, number>> = {}
    const componentCounts: Partial<Record<ComponentKey, number>> = {}

    for (const likedId of liked) {
      const result = this.scoreIndexed(candidate, this.punks[likedId], context)
      likedScore += result.score
      for (const key of COMPONENT_KEYS) {
        const value = result.components[key]
        if (value === undefined) continue
        componentSums[key] = (componentSums[key] ?? 0) + value
        componentCounts[key] = (componentCounts[key] ?? 0) + 1
      }
    }
    likedScore /= liked.length

    let dislikedScore = 0
    if (disliked.length > 0 && dislikedPenalty > 0) {
      for (const dislikedId of disliked) {
        dislikedScore += this.scoreIndexed(
          candidate,
          this.punks[dislikedId],
          context,
        ).score
      }
      dislikedScore /= disliked.length
    }

    return {
      punkId: candidateId,
      score: clamp01(likedScore - dislikedPenalty * dislikedScore),
      components: averageComponents(componentSums, componentCounts),
    }
  }

  private diversify(
    results: readonly PunkSimilarityResult[],
    limit: number,
    diversityPenalty: number,
    context: ScoringContext,
  ): PunkSimilarityResult[] {
    const selected: PunkSimilarityResult[] = []
    const remaining = [...results]
    while (selected.length < limit && remaining.length > 0) {
      let bestIndex = 0
      let bestRank = Number.NEGATIVE_INFINITY
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i]
        const duplicateScore =
          diversityPenalty === 0 || selected.length === 0
            ? 0
            : Math.max(
                ...selected.map(
                  (existing) =>
                    this.scoreIndexed(
                      this.punks[candidate.punkId],
                      this.punks[existing.punkId],
                      context,
                    ).score,
                ),
              )
        const rankScore = candidate.score - diversityPenalty * duplicateScore
        const best = remaining[bestIndex]
        if (
          rankScore > bestRank ||
          (rankScore === bestRank &&
            (candidate.score > best.score ||
              (candidate.score === best.score &&
                candidate.punkId < best.punkId)))
        ) {
          bestIndex = i
          bestRank = rankScore
        }
      }
      const [candidate] = remaining.splice(bestIndex, 1)
      selected.push({ ...candidate, score: clamp01(bestRank) })
    }
    return selected
  }

  private traitRecords(ids: readonly number[]): TraitRecord[] {
    return ids.map((id) => ({ ...this.traits[id] }))
  }

  private colorRecords(ids: readonly number[]): PaletteColor[] {
    return ids.map((id) => ({ ...this.palette[id] }))
  }
}

export function createPunksSimilarity(
  config: PunksSimilarityConfig = {},
): PunkSimilarityIndex {
  return new PunkSimilarityIndex(config)
}

function traitRarityWeights(traits: readonly TraitRecord[]): Float64Array {
  const weights = new Float64Array(traits.length)
  for (const trait of traits) {
    weights[trait.id] = Math.log1p(PUNK_COUNT / Math.max(1, trait.supply))
  }
  return weights
}

function colorRarityWeights(palette: readonly PaletteColor[]): Float64Array {
  const weights = new Float64Array(palette.length)
  const totalSupply = palette.reduce(
    (total, color) => total + ((color.alpha > 0 && color.supply) || 0),
    0,
  )
  for (const color of palette) {
    if (color.alpha === 0) continue
    weights[color.id] = Math.log1p(totalSupply / Math.max(1, color.supply ?? 1))
  }
  return weights
}

function validateWeights(weights: PunkSimilarityWeights): void {
  for (const key of COMPONENT_KEYS) {
    const weight = weights[key]
    if (!Number.isFinite(weight) || weight < 0) {
      throw new PunksDataValidationError(
        `similarity weight ${key} must be a non-negative finite number`,
      )
    }
  }
}

function normalizeWeights(
  weights: PunkSimilarityWeights,
  components: PunkSimilarityComponents,
): PunkSimilarityWeights {
  const normalized = { ...ZERO_WEIGHTS }
  let total = 0
  for (const key of COMPONENT_KEYS) {
    if (components[key] === undefined) continue
    total += weights[key]
  }
  if (total <= 0) {
    throw new PunksDataValidationError(
      'similarity weights must include at least one available component',
    )
  }
  for (const key of COMPONENT_KEYS) {
    if (components[key] !== undefined) normalized[key] = weights[key] / total
  }
  return normalized
}

function weightedJaccard(
  a: readonly number[],
  b: readonly number[],
  weights: Float64Array,
): number {
  if (a.length === 0 && b.length === 0) return 1

  let intersectionWeight = 0
  let unionWeight = 0
  for (const id of a) {
    const weight = weights[id] || 1
    unionWeight += weight
    if (b.includes(id)) intersectionWeight += weight
  }
  for (const id of b) {
    if (!a.includes(id)) unionWeight += weights[id] || 1
  }
  return unionWeight === 0 ? 1 : clamp01(intersectionWeight / unionWeight)
}

function headScore(a: HeadVariantValue, b: HeadVariantValue): number {
  if (a === b) return 1

  const aHuman = humanHead(a)
  const bHuman = humanHead(b)
  if (aHuman === undefined || bHuman === undefined) return 0
  if (aHuman.gender === bHuman.gender) return 0.65
  if (aHuman.skinTone === bHuman.skinTone) return 0.4
  return 0.25
}

function humanHead(
  head: HeadVariantValue,
): { gender: 'female' | 'male'; skinTone: number } | undefined {
  if (head >= HeadVariant.Female1 && head <= HeadVariant.Female4) {
    return { gender: 'female', skinTone: head - HeadVariant.Female1 }
  }
  if (head >= HeadVariant.Male1 && head <= HeadVariant.Male4) {
    return { gender: 'male', skinTone: head - HeadVariant.Male1 }
  }
  return undefined
}

function scalarScore(a: IndexedPunk, b: IndexedPunk): number {
  const scalars = scalarsFor(a, b)
  return (
    (scalars.pixelCount.score +
      scalars.colorCount.score +
      scalars.attributeCount.score) /
    3
  )
}

function scalarsFor(
  a: IndexedPunk,
  b: IndexedPunk,
): PunkSimilarityExplanation['scalars'] {
  return {
    pixelCount: scalarDelta(
      a.pixelCount,
      b.pixelCount,
      PIXEL_COUNT_MIN,
      PIXEL_COUNT_MAX,
    ),
    colorCount: scalarDelta(
      a.colorCount,
      b.colorCount,
      COLOR_COUNT_MIN,
      COLOR_COUNT_MAX,
    ),
    attributeCount: scalarDelta(
      a.attributeCount,
      b.attributeCount,
      ATTRIBUTE_COUNT_MIN,
      ATTRIBUTE_COUNT_MAX,
    ),
  }
}

function scalarDelta(
  a: number,
  b: number,
  min: number,
  max: number,
): PunkSimilarityScalarDelta {
  const delta = Math.abs(a - b)
  return {
    a,
    b,
    delta,
    score: clamp01(1 - delta / (max - min)),
  }
}

function pixelScore(a: Uint8Array, b: Uint8Array): number {
  let union = 0
  let matches = 0
  for (let i = 0; i < PIXELS_PER_PUNK; i++) {
    const ca = a[i]
    const cb = b[i]
    if (ca === 0 && cb === 0) continue
    union++
    if (ca === cb) matches++
  }
  return union === 0 ? 1 : matches / union
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  const value = limit ?? fallback
  assertIntegerInRange('limit', value, 0, PUNK_COUNT)
  return value
}

function normalizeMinScore(minScore: number | undefined): number {
  if (minScore === undefined) return 0
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
    throw new PunksDataValidationError(
      'minScore must be a finite number from 0 to 1',
    )
  }
  return minScore
}

function normalizePenalty(
  label: string,
  penalty: number | undefined,
  fallback: number,
): number {
  const value = penalty ?? fallback
  if (!Number.isFinite(value) || value < 0) {
    throw new PunksDataValidationError(
      `${label} must be a non-negative finite number`,
    )
  }
  return value
}

function normalizePunkIds(label: string, ids: Iterable<number>): number[] {
  if (typeof ids !== 'object' || ids === null) {
    throw new PunksDataValidationError(
      `${label} must be an iterable of punk ids`,
    )
  }
  const out: number[] = []
  const seen = new Set<number>()
  for (const id of ids) {
    validatePunkId(id)
    if (!seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

function idSet(ids: Iterable<number> | undefined): Set<number> {
  return new Set(normalizePunkIds('excludeIds', ids ?? []))
}

function averageComponents(
  sums: Partial<Record<ComponentKey, number>>,
  counts: Partial<Record<ComponentKey, number>>,
): PunkSimilarityComponents {
  return {
    type: averageComponent('type', sums, counts),
    head: averageComponent('head', sums, counts),
    accessories: averageComponent('accessories', sums, counts),
    colors: averageComponent('colors', sums, counts),
    scalars: averageComponent('scalars', sums, counts),
    pixels:
      counts.pixels === undefined
        ? undefined
        : averageComponent('pixels', sums, counts),
  }
}

function averageComponent(
  key: ComponentKey,
  sums: Partial<Record<ComponentKey, number>>,
  counts: Partial<Record<ComponentKey, number>>,
): number {
  const count = counts[key] ?? 0
  return count === 0 ? 0 : (sums[key] ?? 0) / count
}

function sortResults(results: PunkSimilarityResult[]): PunkSimilarityResult[] {
  return results.sort((a, b) => b.score - a.score || a.punkId - b.punkId)
}

function intersection(a: readonly number[], b: readonly number[]): number[] {
  return a.filter((id) => b.includes(id))
}

function difference(a: readonly number[], b: readonly number[]): number[] {
  return a.filter((id) => !b.includes(id))
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function isMissingPixelDataError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /offline pixel data is not loaded/i.test(error.message)
  )
}
