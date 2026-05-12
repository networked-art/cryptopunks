import type { Hex } from 'viem'
import {
  BITMAP_WORD_COUNT,
  COLOR_COUNT_MAX,
  COLOR_COUNT_MIN,
  PALETTE_SIZE,
  PIXEL_COUNT_MAX,
  PIXEL_COUNT_MIN,
  PIXELS_PER_PUNK,
  PUNKS_DATA_DATASET_HASH,
  PUNK_COUNT,
  PUNK_HEIGHT,
  PUNK_WIDTH,
  TRAIT_COUNT,
  headVariantNames,
  punkTypeNames,
  traitKindNames,
  type HeadVariantName,
  type HeadVariantValue,
  type PunkTypeName,
  type PunkTypeValue,
  type TraitKindName,
  type TraitKindValue,
} from './constants'
import {
  bitmapToPunkIds,
  countPunkBitmap,
  emptyPunkBitmap,
  fullPunkBitmap,
  intersectPunkBitmaps,
  normalizePunkBitmap,
  punkBitmapFromIds,
  subtractPunkBitmaps,
  unionPunkBitmaps,
} from './bitmap'
import type {
  AttributeCriteriaInput,
  ColorCriteriaInput,
  ColorRef,
  NumericRange,
  PaletteColor,
  PunkBitmap,
  PunkSummary,
  PunkSummaryOptions,
  PunksDataReadOptions,
  PunksSearchQuery,
  ResolvedColorCriteria,
  ResolvedTraitCriteria,
  TraitCriteriaInput,
  TraitRecord,
  TraitRef,
} from './types'
import {
  PunksDataValidationError,
  assertIndexedPixels,
  assertIntegerInRange,
  bytesToHex,
  idsFromMask,
  maskFromIds,
  normalizeNumericRange,
  normalizeRgbaHex,
  rgbaHexToParts,
  validateBitmapWordIndex,
  validateColorCount,
  validateColorCriteriaMasks,
  validateColorId,
  validateCoordinate,
  validatePixelCount,
  validatePunkId,
  validateTraitCriteriaMasks,
  validateTraitId,
} from './utils'
import { bundledOfflinePunksData } from './offline-data'

export { PunksDataSdkError, PunksDataValidationError } from './utils'
export type {
  AttributeCriteriaInput,
  AttributeRef,
  ColorCriteriaInput,
  ColorRef,
  NumericRange,
  PaletteColor,
  PunkBitmap,
  PunkSummary,
  PunkSummaryOptions,
  PunksDataReadOptions,
  ResolvedColorCriteria,
  ResolvedTraitCriteria,
  TraitCriteriaInput,
  TraitRecord,
  TraitRef,
} from './types'

export type OfflinePunksDataFileKey =
  | 'traitBitmaps'
  | 'traitMeta'
  | 'palette'
  | 'pixelOffsets'
  | 'compressedPixels'
  | 'colorBitmaps'
  | 'pixelCountBitmaps'
  | 'colorCountBitmaps'
  | 'traitMaskPairs'
  | 'colorMasks'
  | 'packedScalars'
  | 'colorSupplies'

export type OfflinePunksDataBundle = {
  manifestJson: string
  files: Record<OfflinePunksDataFileKey, string>
}

export type OfflinePunksDataSource = {
  manifest: string | OfflinePunksDataManifest
  files: Record<OfflinePunksDataFileKey, Uint8Array | string>
}

export type OfflinePunksDataManifest = {
  generatedAt?: string
  source?: {
    address?: string
    chainId?: number
    blockNumber?: number
    blockHash?: string
    extcodehash?: string
  }
  counts: {
    punks: number
    traits: number
    colors: number
  }
  hashes: {
    traitCatalogHash?: Hex
    punkMaskHash?: Hex
    paletteHash?: Hex
    indexedPixelsHash?: Hex
    compressedPixelsHash?: Hex
    datasetHash: Hex
    [key: string]: string | undefined
  }
  files: Record<OfflinePunksDataFileKey, string>
  palette?: string[]
  traits?: Array<{
    id: number
    name: string
    kind: number
    supply: number
    nameHash?: Hex
  }>
}

export type OfflinePunksDataClientConfig = {
  dataset?: OfflinePunksDataSource | OfflinePunksDataBundle
  cache?: boolean
}

export type PunkTypeRef = PunkTypeValue | PunkTypeName | string
export type HeadVariantRef = HeadVariantValue | HeadVariantName | string

export type OfflinePunksSearchSort =
  | 'id'
  | 'id-desc'
  | 'rarity'
  | 'rarity-desc'
  | 'pixelCount'
  | 'pixelCount-desc'
  | 'colorCount'
  | 'colorCount-desc'
  | 'attributeCount'
  | 'attributeCount-desc'

export type OfflinePunksSearchQuery = PunksSearchQuery & {
  text?: string
  punkType?: PunkTypeRef | readonly PunkTypeRef[]
  headVariant?: HeadVariantRef | readonly HeadVariantRef[]
  attributeCount?: NumericRange
  sort?: OfflinePunksSearchSort
}

export type OfflinePunksFacetCount = {
  value: number
  count: number
}

export type OfflinePunksNamedFacetCount = OfflinePunksFacetCount & {
  name: string
}

export type OfflinePunksAttributeFacetCount = TraitRecord & {
  count: number
}

export type OfflinePunksColorFacetCount = PaletteColor & {
  count: number
}

export type OfflinePunksSearchFacets = {
  total: number
  attributes: OfflinePunksAttributeFacetCount[]
  colors: OfflinePunksColorFacetCount[]
  punkTypes: OfflinePunksNamedFacetCount[]
  headVariants: OfflinePunksNamedFacetCount[]
  pixelCounts: OfflinePunksFacetCount[]
  colorCounts: OfflinePunksFacetCount[]
  attributeCounts: OfflinePunksFacetCount[]
}

export type OfflinePunksTextSearchTerm = {
  text: string
  exact: boolean
}

type PackedScalar = {
  pixelCount: number
  colorCount: number
  attributeCount: number
  punkType: PunkTypeValue
  headVariant: HeadVariantValue
}

type OfflineTextIndexEntry = {
  key: string
  bitmap: PunkBitmap
}

type OfflineStore = {
  manifest: OfflinePunksDataManifest
  traits: TraitRecord[]
  paletteBytes: Uint8Array
  colorSupplies: number[]
  traitBitmaps: PunkBitmap[]
  colorBitmaps: PunkBitmap[]
  pixelCountBitmaps: PunkBitmap[]
  colorCountBitmaps: PunkBitmap[]
  traitMasks: bigint[]
  colorMasks: bigint[]
  scalars: PackedScalar[]
  textIndex: OfflineTextIndexEntry[]
  pixelOffsets: Uint8Array
  compressedPixels: Uint8Array
}

type NormalizedOfflineSource = {
  manifest: string | OfflinePunksDataManifest
  files: Record<OfflinePunksDataFileKey, Uint8Array>
}

const FILE_KEYS: readonly OfflinePunksDataFileKey[] = [
  'traitBitmaps',
  'traitMeta',
  'palette',
  'pixelOffsets',
  'compressedPixels',
  'colorBitmaps',
  'pixelCountBitmaps',
  'colorCountBitmaps',
  'traitMaskPairs',
  'colorMasks',
  'packedScalars',
  'colorSupplies',
]

const ATTRIBUTE_COUNT_MIN = 0
const ATTRIBUTE_COUNT_MAX = 7
const UINT128_MASK = (1n << 128n) - 1n
const SCALARS_PER_WORD = 5
const SCALAR_BITS = 48n
const SCALAR_MASK = (1n << SCALAR_BITS) - 1n
const COMPRESSED_PIXEL_HEADER_SIZE = 73
const VISIBLE_BITMAP_BYTES = 72

export class OfflinePunksDataClient {
  readonly manifest: OfflinePunksDataManifest

  private readonly store: OfflineStore
  private readonly indexedPixelsCache = new Map<number, Uint8Array>()

  constructor(config: OfflinePunksDataClientConfig = {}) {
    this.store = parseOfflineStore(config.dataset ?? bundledOfflinePunksData)
    this.manifest = this.store.manifest
  }

  clearCache(): void {
    this.indexedPixelsCache.clear()
  }

  getDatasetHashSync(options?: PunksDataReadOptions): Hex {
    validateOfflineReadOptions(options)
    return this.store.manifest.hashes.datasetHash
  }

  async getDatasetHash(options?: PunksDataReadOptions): Promise<Hex> {
    return this.getDatasetHashSync(options)
  }

  assertCanonicalDatasetSync(options?: PunksDataReadOptions): void {
    validateOfflineReadOptions(options)
    if (this.getDatasetHashSync().toLowerCase() !== PUNKS_DATA_DATASET_HASH.toLowerCase()) {
      throw new PunksDataValidationError('offline data does not match the canonical dataset')
    }
  }

  async assertCanonicalDataset(options?: PunksDataReadOptions): Promise<void> {
    this.assertCanonicalDatasetSync(options)
  }

  getTraitCountSync(options?: PunksDataReadOptions): number {
    validateOfflineReadOptions(options)
    return TRAIT_COUNT
  }

  async getTraitCount(options?: PunksDataReadOptions): Promise<number> {
    return this.getTraitCountSync(options)
  }

  isValidTraitIdSync(traitId: number, options?: PunksDataReadOptions): boolean {
    validateOfflineReadOptions(options)
    assertIntegerLike('traitId', traitId)
    return traitId < TRAIT_COUNT
  }

  async isValidTraitId(traitId: number, options?: PunksDataReadOptions): Promise<boolean> {
    return this.isValidTraitIdSync(traitId, options)
  }

  getTraitNameSync(traitId: number, options?: PunksDataReadOptions): string {
    validateOfflineReadOptions(options)
    validateTraitId(traitId)
    return this.store.traits[traitId].name
  }

  async getTraitName(traitId: number, options?: PunksDataReadOptions): Promise<string> {
    return this.getTraitNameSync(traitId, options)
  }

  getTraitKindSync(traitId: number, options?: PunksDataReadOptions): number {
    validateOfflineReadOptions(options)
    validateTraitId(traitId)
    return this.store.traits[traitId].kindId
  }

  async getTraitKind(traitId: number, options?: PunksDataReadOptions): Promise<number> {
    return this.getTraitKindSync(traitId, options)
  }

  getTraitSupplySync(traitId: number, options?: PunksDataReadOptions): number {
    validateOfflineReadOptions(options)
    validateTraitId(traitId)
    return this.store.traits[traitId].supply
  }

  async getTraitSupply(traitId: number, options?: PunksDataReadOptions): Promise<number> {
    return this.getTraitSupplySync(traitId, options)
  }

  hasTraitSync(punkId: number, trait: TraitRef, options?: PunksDataReadOptions): boolean {
    validateOfflineReadOptions(options)
    validatePunkId(punkId)
    const traitId = this.resolveTraitIdSync(trait)
    return ((this.store.traitMasks[punkId] >> BigInt(traitId)) & 1n) === 1n
  }

  async hasTrait(
    punkId: number,
    trait: TraitRef,
    options?: PunksDataReadOptions,
  ): Promise<boolean> {
    return this.hasTraitSync(punkId, trait, options)
  }

  getTraitMaskSync(punkId: number, options?: PunksDataReadOptions): bigint {
    validateOfflineReadOptions(options)
    validatePunkId(punkId)
    return this.store.traitMasks[punkId]
  }

  async getTraitMask(punkId: number, options?: PunksDataReadOptions): Promise<bigint> {
    return this.getTraitMaskSync(punkId, options)
  }

  hasTraitsSync(
    punkId: number,
    requiredMask: bigint,
    forbiddenMask: bigint,
    anyOfMask: bigint,
    options?: PunksDataReadOptions,
  ): boolean {
    validateOfflineReadOptions(options)
    validatePunkId(punkId)
    validateTraitCriteriaMasks(requiredMask, forbiddenMask, anyOfMask)
    const mask = this.store.traitMasks[punkId]
    return (
      (mask & requiredMask) === requiredMask &&
      (mask & forbiddenMask) === 0n &&
      (anyOfMask === 0n || (mask & anyOfMask) !== 0n)
    )
  }

  async hasTraits(
    punkId: number,
    requiredMask: bigint,
    forbiddenMask: bigint,
    anyOfMask: bigint,
    options?: PunksDataReadOptions,
  ): Promise<boolean> {
    return this.hasTraitsSync(punkId, requiredMask, forbiddenMask, anyOfMask, options)
  }

  matchesTraitCriteriaSync(
    punkId: number,
    criteria: TraitCriteriaInput,
    options?: PunksDataReadOptions,
  ): boolean {
    const masks = this.resolveTraitCriteriaSync(criteria, options)
    return this.hasTraitsSync(
      punkId,
      masks.requiredMask,
      masks.forbiddenMask,
      masks.anyOfMask,
      options,
    )
  }

  async matchesTraitCriteria(
    punkId: number,
    criteria: TraitCriteriaInput,
    options?: PunksDataReadOptions,
  ): Promise<boolean> {
    return this.matchesTraitCriteriaSync(punkId, criteria, options)
  }

  getTraitBitmapWordSync(
    trait: TraitRef,
    wordIndex: number,
    options?: PunksDataReadOptions,
  ): bigint {
    validateOfflineReadOptions(options)
    const traitId = this.resolveTraitIdSync(trait)
    validateBitmapWordIndex(wordIndex)
    return this.store.traitBitmaps[traitId][wordIndex]
  }

  async getTraitBitmapWord(
    trait: TraitRef,
    wordIndex: number,
    options?: PunksDataReadOptions,
  ): Promise<bigint> {
    return this.getTraitBitmapWordSync(trait, wordIndex, options)
  }

  getTraitBitmapSync(trait: TraitRef, options?: PunksDataReadOptions): PunkBitmap {
    validateOfflineReadOptions(options)
    return normalizePunkBitmap(this.store.traitBitmaps[this.resolveTraitIdSync(trait)])
  }

  async getTraitBitmap(trait: TraitRef, options?: PunksDataReadOptions): Promise<PunkBitmap> {
    return this.getTraitBitmapSync(trait, options)
  }

  getTraitBitmapsSync(
    traits: readonly TraitRef[],
    options?: PunksDataReadOptions,
  ): Map<number, PunkBitmap> {
    validateOfflineReadOptions(options)
    const ids = this.resolveTraitIdsSync(traits)
    return new Map(ids.map((id) => [id, normalizePunkBitmap(this.store.traitBitmaps[id])]))
  }

  async getTraitBitmaps(
    traits: readonly TraitRef[],
    options?: PunksDataReadOptions,
  ): Promise<Map<number, PunkBitmap>> {
    return this.getTraitBitmapsSync(traits, options)
  }

  getPunkTypeSync(punkId: number, options?: PunksDataReadOptions): number {
    validateOfflineReadOptions(options)
    validatePunkId(punkId)
    return this.store.scalars[punkId].punkType
  }

  async getPunkType(punkId: number, options?: PunksDataReadOptions): Promise<number> {
    return this.getPunkTypeSync(punkId, options)
  }

  getHeadVariantSync(punkId: number, options?: PunksDataReadOptions): number {
    validateOfflineReadOptions(options)
    validatePunkId(punkId)
    return this.store.scalars[punkId].headVariant
  }

  async getHeadVariant(punkId: number, options?: PunksDataReadOptions): Promise<number> {
    return this.getHeadVariantSync(punkId, options)
  }

  getAttributeCountSync(punkId: number, options?: PunksDataReadOptions): number {
    validateOfflineReadOptions(options)
    validatePunkId(punkId)
    return this.store.scalars[punkId].attributeCount
  }

  async getAttributeCount(punkId: number, options?: PunksDataReadOptions): Promise<number> {
    return this.getAttributeCountSync(punkId, options)
  }

  getPaletteSizeSync(options?: PunksDataReadOptions): number {
    validateOfflineReadOptions(options)
    return PALETTE_SIZE
  }

  async getPaletteSize(options?: PunksDataReadOptions): Promise<number> {
    return this.getPaletteSizeSync(options)
  }

  getColorSync(color: ColorRef, options?: PunksDataReadOptions): PaletteColor {
    validateOfflineReadOptions(options)
    const colorId = this.resolveColorIdSync(color)
    const rgba = bytesToHex(this.store.paletteBytes.slice(colorId * 4, colorId * 4 + 4))
    return colorRecord(colorId, rgba, this.store.colorSupplies[colorId])
  }

  async getColor(color: ColorRef, options?: PunksDataReadOptions): Promise<PaletteColor> {
    return this.getColorSync(color, options)
  }

  getColorSupplySync(color: ColorRef, options?: PunksDataReadOptions): number {
    validateOfflineReadOptions(options)
    return this.store.colorSupplies[this.resolveColorIdSync(color)]
  }

  async getColorSupply(color: ColorRef, options?: PunksDataReadOptions): Promise<number> {
    return this.getColorSupplySync(color, options)
  }

  getColorMaskSync(punkId: number, options?: PunksDataReadOptions): bigint {
    validateOfflineReadOptions(options)
    validatePunkId(punkId)
    return this.store.colorMasks[punkId]
  }

  async getColorMask(punkId: number, options?: PunksDataReadOptions): Promise<bigint> {
    return this.getColorMaskSync(punkId, options)
  }

  hasColorSync(punkId: number, color: ColorRef, options?: PunksDataReadOptions): boolean {
    validateOfflineReadOptions(options)
    validatePunkId(punkId)
    const colorId = this.resolveColorIdSync(color)
    return colorId !== 0 && ((this.store.colorMasks[punkId] >> BigInt(colorId)) & 1n) === 1n
  }

  async hasColor(
    punkId: number,
    color: ColorRef,
    options?: PunksDataReadOptions,
  ): Promise<boolean> {
    return this.hasColorSync(punkId, color, options)
  }

  getPixelCountSync(punkId: number, options?: PunksDataReadOptions): number {
    validateOfflineReadOptions(options)
    validatePunkId(punkId)
    return this.store.scalars[punkId].pixelCount
  }

  async getPixelCount(punkId: number, options?: PunksDataReadOptions): Promise<number> {
    return this.getPixelCountSync(punkId, options)
  }

  getColorCountSync(punkId: number, options?: PunksDataReadOptions): number {
    validateOfflineReadOptions(options)
    validatePunkId(punkId)
    return this.store.scalars[punkId].colorCount
  }

  async getColorCount(punkId: number, options?: PunksDataReadOptions): Promise<number> {
    return this.getColorCountSync(punkId, options)
  }

  getColorBitmapWordSync(
    color: ColorRef,
    wordIndex: number,
    options?: PunksDataReadOptions,
  ): bigint {
    validateOfflineReadOptions(options)
    const colorId = this.resolveColorIdSync(color)
    validateBitmapWordIndex(wordIndex)
    return this.store.colorBitmaps[colorId][wordIndex]
  }

  async getColorBitmapWord(
    color: ColorRef,
    wordIndex: number,
    options?: PunksDataReadOptions,
  ): Promise<bigint> {
    return this.getColorBitmapWordSync(color, wordIndex, options)
  }

  getColorBitmapSync(color: ColorRef, options?: PunksDataReadOptions): PunkBitmap {
    validateOfflineReadOptions(options)
    return normalizePunkBitmap(this.store.colorBitmaps[this.resolveColorIdSync(color)])
  }

  async getColorBitmap(color: ColorRef, options?: PunksDataReadOptions): Promise<PunkBitmap> {
    return this.getColorBitmapSync(color, options)
  }

  getColorBitmapsSync(
    colors: readonly ColorRef[],
    options?: PunksDataReadOptions,
  ): Map<number, PunkBitmap> {
    validateOfflineReadOptions(options)
    const ids = this.resolveColorIdsSync(colors)
    return new Map(ids.map((id) => [id, normalizePunkBitmap(this.store.colorBitmaps[id])]))
  }

  async getColorBitmaps(
    colors: readonly ColorRef[],
    options?: PunksDataReadOptions,
  ): Promise<Map<number, PunkBitmap>> {
    return this.getColorBitmapsSync(colors, options)
  }

  getPixelCountBitmapWordSync(
    pixelCount: number,
    wordIndex: number,
    options?: PunksDataReadOptions,
  ): bigint {
    validateOfflineReadOptions(options)
    validatePixelCount(pixelCount)
    validateBitmapWordIndex(wordIndex)
    return this.store.pixelCountBitmaps[pixelCount - PIXEL_COUNT_MIN][wordIndex]
  }

  async getPixelCountBitmapWord(
    pixelCount: number,
    wordIndex: number,
    options?: PunksDataReadOptions,
  ): Promise<bigint> {
    return this.getPixelCountBitmapWordSync(pixelCount, wordIndex, options)
  }

  getPixelCountBitmapSync(
    pixelCount: number,
    options?: PunksDataReadOptions,
  ): PunkBitmap {
    validateOfflineReadOptions(options)
    validatePixelCount(pixelCount)
    return normalizePunkBitmap(this.store.pixelCountBitmaps[pixelCount - PIXEL_COUNT_MIN])
  }

  async getPixelCountBitmap(
    pixelCount: number,
    options?: PunksDataReadOptions,
  ): Promise<PunkBitmap> {
    return this.getPixelCountBitmapSync(pixelCount, options)
  }

  getColorCountBitmapWordSync(
    colorCount: number,
    wordIndex: number,
    options?: PunksDataReadOptions,
  ): bigint {
    validateOfflineReadOptions(options)
    validateColorCount(colorCount)
    validateBitmapWordIndex(wordIndex)
    return this.store.colorCountBitmaps[colorCount - COLOR_COUNT_MIN][wordIndex]
  }

  async getColorCountBitmapWord(
    colorCount: number,
    wordIndex: number,
    options?: PunksDataReadOptions,
  ): Promise<bigint> {
    return this.getColorCountBitmapWordSync(colorCount, wordIndex, options)
  }

  getColorCountBitmapSync(
    colorCount: number,
    options?: PunksDataReadOptions,
  ): PunkBitmap {
    validateOfflineReadOptions(options)
    validateColorCount(colorCount)
    return normalizePunkBitmap(this.store.colorCountBitmaps[colorCount - COLOR_COUNT_MIN])
  }

  async getColorCountBitmap(
    colorCount: number,
    options?: PunksDataReadOptions,
  ): Promise<PunkBitmap> {
    return this.getColorCountBitmapSync(colorCount, options)
  }

  getIndexedPixelsSync(punkId: number, options?: PunksDataReadOptions): Uint8Array {
    validateOfflineReadOptions(options)
    validatePunkId(punkId)
    let pixels = this.indexedPixelsCache.get(punkId)
    if (!pixels) {
      pixels = decodeIndexedPixels(this.store, punkId)
      this.indexedPixelsCache.set(punkId, pixels)
    }
    return pixels.slice()
  }

  async getIndexedPixels(
    punkId: number,
    options?: PunksDataReadOptions,
  ): Promise<Uint8Array> {
    return this.getIndexedPixelsSync(punkId, options)
  }

  getColorAtSync(
    punkId: number,
    x: number,
    y: number,
    options?: PunksDataReadOptions,
  ): number {
    validateOfflineReadOptions(options)
    validatePunkId(punkId)
    validateCoordinate(x, y)
    return this.getIndexedPixelsSync(punkId)[y * PUNK_WIDTH + x]
  }

  async getColorAt(
    punkId: number,
    x: number,
    y: number,
    options?: PunksDataReadOptions,
  ): Promise<number> {
    return this.getColorAtSync(punkId, x, y, options)
  }

  getPaletteRgbaBytesSync(options?: PunksDataReadOptions): Uint8Array {
    validateOfflineReadOptions(options)
    return this.store.paletteBytes.slice()
  }

  async getPaletteRgbaBytes(options?: PunksDataReadOptions): Promise<Uint8Array> {
    return this.getPaletteRgbaBytesSync(options)
  }

  getPaletteRgbBytesSync(options?: PunksDataReadOptions): Uint8Array {
    validateOfflineReadOptions(options)
    const out = new Uint8Array(PALETTE_SIZE * 3)
    for (let colorId = 0; colorId < PALETTE_SIZE; colorId++) {
      out[colorId * 3] = this.store.paletteBytes[colorId * 4]
      out[colorId * 3 + 1] = this.store.paletteBytes[colorId * 4 + 1]
      out[colorId * 3 + 2] = this.store.paletteBytes[colorId * 4 + 2]
    }
    return out
  }

  async getPaletteRgbBytes(options?: PunksDataReadOptions): Promise<Uint8Array> {
    return this.getPaletteRgbBytesSync(options)
  }

  getPaletteAlphaBytesSync(options?: PunksDataReadOptions): Uint8Array {
    validateOfflineReadOptions(options)
    const out = new Uint8Array(PALETTE_SIZE)
    for (let colorId = 0; colorId < PALETTE_SIZE; colorId++) {
      out[colorId] = this.store.paletteBytes[colorId * 4 + 3]
    }
    return out
  }

  async getPaletteAlphaBytes(options?: PunksDataReadOptions): Promise<Uint8Array> {
    return this.getPaletteAlphaBytesSync(options)
  }

  getPaletteSync(
    options?: PunksDataReadOptions & { includeSupplies?: boolean },
  ): PaletteColor[] {
    validateOfflineReadOptions(options)
    const includeSupplies = options?.includeSupplies ?? false
    return Array.from({ length: PALETTE_SIZE }, (_, colorId) => {
      const rgba = bytesToHex(this.store.paletteBytes.slice(colorId * 4, colorId * 4 + 4))
      return colorRecord(
        colorId,
        rgba,
        includeSupplies ? this.store.colorSupplies[colorId] : undefined,
      )
    })
  }

  async getPalette(
    options?: PunksDataReadOptions & { includeSupplies?: boolean },
  ): Promise<PaletteColor[]> {
    return this.getPaletteSync(options)
  }

  getRgbaPixelsSync(punkId: number, options?: PunksDataReadOptions): Uint8Array {
    return indexedPixelsToRgbaOffline(
      this.getIndexedPixelsSync(punkId, options),
      this.store.paletteBytes,
    )
  }

  async getRgbaPixels(punkId: number, options?: PunksDataReadOptions): Promise<Uint8Array> {
    return this.getRgbaPixelsSync(punkId, options)
  }

  getTraitCatalogSync(options?: PunksDataReadOptions): TraitRecord[] {
    validateOfflineReadOptions(options)
    return this.store.traits.map((record) => ({ ...record }))
  }

  async getTraitCatalog(options?: PunksDataReadOptions): Promise<TraitRecord[]> {
    return this.getTraitCatalogSync(options)
  }

  resolveTraitSync(trait: TraitRef, options?: PunksDataReadOptions): TraitRecord {
    validateOfflineReadOptions(options)
    if (typeof trait === 'number') {
      validateTraitId(trait)
      return { ...this.store.traits[trait] }
    }
    if (typeof trait === 'object' && trait !== null && trait.id !== undefined) {
      validateTraitId(trait.id)
      return { ...this.store.traits[trait.id] }
    }
    if (typeof trait !== 'string' && (typeof trait !== 'object' || trait === null)) {
      throw new PunksDataValidationError('trait reference needs an id or name')
    }

    const rawName = typeof trait === 'string' ? trait : trait.name
    if (typeof rawName !== 'string' || rawName.trim() === '') {
      throw new PunksDataValidationError('trait reference needs an id or name')
    }
    const name = rawName.trim()
    const exact = this.store.traits.find((record) => record.name === name)
    if (exact) return { ...exact }
    const lowerName = name.toLowerCase()
    const match = this.store.traits.find((record) => record.name.toLowerCase() === lowerName)
    if (!match) throw new PunksDataValidationError(`unknown trait ${name}`)
    return { ...match }
  }

  async resolveTrait(trait: TraitRef, options?: PunksDataReadOptions): Promise<TraitRecord> {
    return this.resolveTraitSync(trait, options)
  }

  resolveTraitCriteriaSync(
    criteria: TraitCriteriaInput = {},
    options?: PunksDataReadOptions,
  ): ResolvedTraitCriteria {
    validateOfflineReadOptions(options)
    const required = this.resolveTraitIdsSync(criteria.required)
    const forbidden = this.resolveTraitIdsSync(criteria.forbidden)
    const anyOf = this.resolveTraitIdsSync(criteria.anyOf)
    const requiredMask = (criteria.requiredMask ?? 0n) | maskFromIds(required, validateTraitId)
    const forbiddenMask = (criteria.forbiddenMask ?? 0n) | maskFromIds(forbidden, validateTraitId)
    const anyOfMask = (criteria.anyOfMask ?? 0n) | maskFromIds(anyOf, validateTraitId)
    validateTraitCriteriaMasks(requiredMask, forbiddenMask, anyOfMask)
    return { requiredMask, forbiddenMask, anyOfMask }
  }

  async resolveTraitCriteria(
    criteria: TraitCriteriaInput = {},
    options?: PunksDataReadOptions,
  ): Promise<ResolvedTraitCriteria> {
    return this.resolveTraitCriteriaSync(criteria, options)
  }

  resolveColorSync(color: ColorRef, options?: PunksDataReadOptions): PaletteColor {
    validateOfflineReadOptions(options)
    return this.getColorSync(color)
  }

  async resolveColor(color: ColorRef, options?: PunksDataReadOptions): Promise<PaletteColor> {
    return this.resolveColorSync(color, options)
  }

  resolveColorCriteriaSync(
    criteria: ColorCriteriaInput = {},
    options?: PunksDataReadOptions,
  ): ResolvedColorCriteria {
    validateOfflineReadOptions(options)
    const required = this.resolveColorIdsSync(criteria.required)
    const forbidden = this.resolveColorIdsSync(criteria.forbidden)
    const anyOf = this.resolveColorIdsSync(criteria.anyOf)
    const requiredMask = (criteria.requiredMask ?? 0n) | maskFromIds(required, validateColorId)
    const forbiddenMask = (criteria.forbiddenMask ?? 0n) | maskFromIds(forbidden, validateColorId)
    const anyOfMask = (criteria.anyOfMask ?? 0n) | maskFromIds(anyOf, validateColorId)
    validateColorCriteriaMasks(requiredMask, forbiddenMask, anyOfMask)
    return { requiredMask, forbiddenMask, anyOfMask }
  }

  async resolveColorCriteria(
    criteria: ColorCriteriaInput = {},
    options?: PunksDataReadOptions,
  ): Promise<ResolvedColorCriteria> {
    return this.resolveColorCriteriaSync(criteria, options)
  }

  searchBitmapSync(
    query: OfflinePunksSearchQuery = {},
    options?: PunksDataReadOptions,
  ): PunkBitmap {
    validateOfflineReadOptions(options)
    validateOfflineSearchQuery(query)
    let bitmap = fullPunkBitmap()

    if (query.text !== undefined) {
      bitmap = intersectPunkBitmaps([bitmap, this.bitmapForTextSync(query.text)])
    }
    if (query.attributes !== undefined) {
      bitmap = intersectPunkBitmaps([
        bitmap,
        this.bitmapForAttributeCriteriaSync(query.attributes),
      ])
    }
    if (query.colors !== undefined) {
      bitmap = intersectPunkBitmaps([bitmap, this.bitmapForColorCriteriaSync(query.colors)])
    }
    const pixelCounts = normalizeNumericRange(
      'pixelCount',
      query.pixelCount,
      PIXEL_COUNT_MIN,
      PIXEL_COUNT_MAX,
    )
    if (pixelCounts !== undefined) {
      bitmap = intersectPunkBitmaps([
        bitmap,
        unionPunkBitmaps(
          pixelCounts.map((count) => this.store.pixelCountBitmaps[count - PIXEL_COUNT_MIN]),
        ),
      ])
    }
    const colorCounts = normalizeNumericRange(
      'colorCount',
      query.colorCount,
      COLOR_COUNT_MIN,
      COLOR_COUNT_MAX,
    )
    if (colorCounts !== undefined) {
      bitmap = intersectPunkBitmaps([
        bitmap,
        unionPunkBitmaps(
          colorCounts.map((count) => this.store.colorCountBitmaps[count - COLOR_COUNT_MIN]),
        ),
      ])
    }
    const attributeCounts = normalizeNumericRange(
      'attributeCount',
      query.attributeCount,
      ATTRIBUTE_COUNT_MIN,
      ATTRIBUTE_COUNT_MAX,
    )
    if (attributeCounts !== undefined) {
      bitmap = intersectPunkBitmaps([
        bitmap,
        unionPunkBitmaps(attributeCounts.map((count) => this.bitmapForAttributeCount(count))),
      ])
    }
    if (query.punkType !== undefined) {
      bitmap = intersectPunkBitmaps([bitmap, this.bitmapForPunkTypes(query.punkType)])
    }
    if (query.headVariant !== undefined) {
      bitmap = intersectPunkBitmaps([bitmap, this.bitmapForHeadVariants(query.headVariant)])
    }
    if (query.ids !== undefined) {
      bitmap = intersectPunkBitmaps([bitmap, punkBitmapFromIds(query.ids)])
    }
    if (query.excludeIds !== undefined) {
      bitmap = subtractPunkBitmaps(bitmap, punkBitmapFromIds(query.excludeIds))
    }

    return bitmap
  }

  async searchBitmap(
    query: OfflinePunksSearchQuery = {},
    options?: PunksDataReadOptions,
  ): Promise<PunkBitmap> {
    return this.searchBitmapSync(query, options)
  }

  searchSync(query: OfflinePunksSearchQuery = {}, options?: PunksDataReadOptions): number[] {
    validateOfflinePagination(query)
    const ids = bitmapToPunkIds(this.searchBitmapSync(query, options))
    const sorted = this.sortPunkIds(ids, query.sort ?? 'id')
    return paginateIds(sorted, query.offset, query.limit)
  }

  async search(
    query: OfflinePunksSearchQuery = {},
    options?: PunksDataReadOptions,
  ): Promise<number[]> {
    return this.searchSync(query, options)
  }

  countSync(query: OfflinePunksSearchQuery = {}, options?: PunksDataReadOptions): number {
    return countPunkBitmap(this.searchBitmapSync(query, options))
  }

  async count(
    query: OfflinePunksSearchQuery = {},
    options?: PunksDataReadOptions,
  ): Promise<number> {
    return this.countSync(query, options)
  }

  facetsSync(
    query: OfflinePunksSearchQuery = {},
    options?: PunksDataReadOptions,
  ): OfflinePunksSearchFacets {
    const bitmap = this.searchBitmapSync(query, options)
    const palette = this.getPaletteSync({ includeSupplies: true })
    return {
      total: countPunkBitmap(bitmap),
      attributes: this.store.traits.map((trait) => ({
        ...trait,
        count: countIntersection(bitmap, this.store.traitBitmaps[trait.id]),
      })),
      colors: palette.map((color) => ({
        ...color,
        count: countIntersection(bitmap, this.store.colorBitmaps[color.id]),
      })),
      punkTypes: punkTypeNames.map((name, value) => ({
        value,
        name,
        count: countIntersection(bitmap, this.bitmapForPunkTypes(value as PunkTypeValue)),
      })),
      headVariants: headVariantNames.map((name, value) => ({
        value,
        name,
        count: countIntersection(bitmap, this.bitmapForHeadVariants(value as HeadVariantValue)),
      })),
      pixelCounts: range(PIXEL_COUNT_MIN, PIXEL_COUNT_MAX).map((value) => ({
        value,
        count: countIntersection(bitmap, this.store.pixelCountBitmaps[value - PIXEL_COUNT_MIN]),
      })),
      colorCounts: range(COLOR_COUNT_MIN, COLOR_COUNT_MAX).map((value) => ({
        value,
        count: countIntersection(bitmap, this.store.colorCountBitmaps[value - COLOR_COUNT_MIN]),
      })),
      attributeCounts: range(ATTRIBUTE_COUNT_MIN, ATTRIBUTE_COUNT_MAX).map((value) => ({
        value,
        count: countIntersection(bitmap, this.bitmapForAttributeCount(value)),
      })),
    }
  }

  async facets(
    query: OfflinePunksSearchQuery = {},
    options?: PunksDataReadOptions,
  ): Promise<OfflinePunksSearchFacets> {
    return this.facetsSync(query, options)
  }

  getPunkSync(
    punkId: number,
    summaryOptions: PunkSummaryOptions = {},
    options?: PunksDataReadOptions,
  ): PunkSummary {
    const [punk] = this.getPunksSync([punkId], summaryOptions, options)
    return punk
  }

  async getPunk(
    punkId: number,
    summaryOptions: PunkSummaryOptions = {},
    options?: PunksDataReadOptions,
  ): Promise<PunkSummary> {
    return this.getPunkSync(punkId, summaryOptions, options)
  }

  getPunksSync(
    punkIds: readonly number[],
    summaryOptions: PunkSummaryOptions = {},
    options?: PunksDataReadOptions,
  ): PunkSummary[] {
    validateOfflineReadOptions(options)
    const catalog = summaryOptions.includeTraits ? this.store.traits : undefined
    const palette = summaryOptions.includeColors
      ? this.getPaletteSync({ includeSupplies: true })
      : undefined

    return punkIds.map((punkId) => {
      validatePunkId(punkId)
      const traitMask = this.store.traitMasks[punkId]
      const colorMask = this.store.colorMasks[punkId]
      const scalar = this.store.scalars[punkId]
      const punkTypeName = punkTypeNames[scalar.punkType]
      const headVariantName = headVariantNames[scalar.headVariant]
      if (punkTypeName === undefined) {
        throw new PunksDataValidationError(`unknown punk type ${scalar.punkType} for punk ${punkId}`)
      }
      if (headVariantName === undefined) {
        throw new PunksDataValidationError(
          `unknown head variant ${scalar.headVariant} for punk ${punkId}`,
        )
      }
      const traitIds = idsFromMask(traitMask, TRAIT_COUNT)
      const colorIds = idsFromMask(colorMask, PALETTE_SIZE)
      return {
        id: punkId,
        traitMask,
        colorMask,
        traitIds,
        colorIds,
        pixelCount: scalar.pixelCount,
        colorCount: scalar.colorCount,
        attributeCount: scalar.attributeCount,
        punkType: scalar.punkType,
        punkTypeName,
        headVariant: scalar.headVariant,
        headVariantName,
        traits: catalog === undefined ? undefined : traitIds.map((id) => ({ ...catalog[id] })),
        colors: palette === undefined ? undefined : colorIds.map((id) => palette[id]),
        indexedPixels: summaryOptions.includePixels
          ? this.getIndexedPixelsSync(punkId)
          : undefined,
      }
    })
  }

  async getPunks(
    punkIds: readonly number[],
    summaryOptions: PunkSummaryOptions = {},
    options?: PunksDataReadOptions,
  ): Promise<PunkSummary[]> {
    return this.getPunksSync(punkIds, summaryOptions, options)
  }

  private resolveTraitIdSync(trait: TraitRef): number {
    return this.resolveTraitSync(trait).id
  }

  private resolveTraitIdsSync(traits: readonly TraitRef[] = []): number[] {
    return uniqueNumbers(traits.map((trait) => this.resolveTraitIdSync(trait)))
  }

  private resolveColorIdSync(color: ColorRef): number {
    if (typeof color === 'number') {
      validateColorId(color)
      return color
    }
    if (typeof color !== 'string') {
      throw new PunksDataValidationError('color reference must be a color id or hex string')
    }
    const rgba = normalizeRgbaHex(color)
    for (let colorId = 0; colorId < PALETTE_SIZE; colorId++) {
      const offset = colorId * 4
      const candidate = bytesToHex(this.store.paletteBytes.slice(offset, offset + 4))
      if (candidate.toLowerCase() === rgba.toLowerCase()) return colorId
    }
    throw new PunksDataValidationError(`unknown palette color ${color}`)
  }

  private resolveColorIdsSync(colors: readonly ColorRef[] = []): number[] {
    return uniqueNumbers(colors.map((color) => this.resolveColorIdSync(color)))
  }

  private bitmapForAttributeCriteriaSync(criteria: AttributeCriteriaInput): PunkBitmap {
    const masks = this.resolveTraitCriteriaSync(criteria)
    const requiredIds = idsFromMask(masks.requiredMask, TRAIT_COUNT)
    const forbiddenIds = idsFromMask(masks.forbiddenMask, TRAIT_COUNT)
    const anyOfIds = idsFromMask(masks.anyOfMask, TRAIT_COUNT)
    return applyCriteriaRows(requiredIds, forbiddenIds, anyOfIds, this.store.traitBitmaps)
  }

  private bitmapForColorCriteriaSync(criteria: ColorCriteriaInput): PunkBitmap {
    const masks = this.resolveColorCriteriaSync(criteria)
    const requiredIds = idsFromMask(masks.requiredMask, PALETTE_SIZE)
    const forbiddenIds = idsFromMask(masks.forbiddenMask, PALETTE_SIZE)
    const anyOfIds = idsFromMask(masks.anyOfMask, PALETTE_SIZE)
    return applyCriteriaRows(requiredIds, forbiddenIds, anyOfIds, this.store.colorBitmaps)
  }

  private bitmapForTextSync(text: string): PunkBitmap {
    if (typeof text !== 'string') {
      throw new PunksDataValidationError('text search must be a string')
    }
    const groups = parseOfflinePunksSearchText(text)
    if (groups.length === 0) return fullPunkBitmap()

    return unionPunkBitmaps(groups.map((terms) => this.bitmapForTextGroupSync(terms)))
  }

  private bitmapForTextGroupSync(terms: readonly OfflinePunksTextSearchTerm[]): PunkBitmap {
    let bitmap = fullPunkBitmap()
    for (const term of terms) {
      bitmap = intersectPunkBitmaps([bitmap, this.bitmapForTextTermSync(term)])
    }
    return bitmap
  }

  private bitmapForTextTermSync(term: OfflinePunksTextSearchTerm): PunkBitmap {
    const normalized = normalizeSearchText(term.text)
    if (!normalized) return fullPunkBitmap()

    const matches: PunkBitmap[] = []
    const punkId = parsePunkIdText(normalized)
    if (punkId !== undefined) matches.push(punkBitmapFromIds([punkId]))

    for (const entry of this.store.textIndex) {
      if (matchesTextIndexKey(entry.key, normalized, term.exact)) {
        matches.push(entry.bitmap)
      }
    }

    const colorId = this.tryResolveTextColorId(normalized)
    if (colorId !== undefined) matches.push(this.store.colorBitmaps[colorId])

    return matches.length === 0 ? emptyPunkBitmap() : unionPunkBitmaps(matches)
  }

  private tryResolveTextColorId(term: string): number | undefined {
    if (/^\d+$/.test(term)) {
      const colorId = Number(term)
      if (colorId >= 0 && colorId < PALETTE_SIZE) return colorId
      return undefined
    }
    if (!/^#?[0-9a-f]{6}([0-9a-f]{2})?$/.test(term)) return undefined
    try {
      return this.resolveColorIdSync(term.startsWith('#') ? term : `#${term}`)
    } catch {
      return undefined
    }
  }

  private bitmapForPunkTypes(input: PunkTypeRef | readonly PunkTypeRef[]): PunkBitmap {
    const values = normalizeArray(input).map((ref) => resolvePunkTypeRef(ref))
    return unionPunkBitmaps(values.map((value) => this.bitmapForTraitKindName('NormalizedType', punkTypeNames[value])))
  }

  private bitmapForHeadVariants(input: HeadVariantRef | readonly HeadVariantRef[]): PunkBitmap {
    const values = normalizeArray(input).map((ref) => resolveHeadVariantRef(ref))
    return unionPunkBitmaps(values.map((value) => this.bitmapForTraitKindName('HeadVariant', headVariantNames[value])))
  }

  private bitmapForAttributeCount(count: number): PunkBitmap {
    assertIntegerInRange('attributeCount', count, ATTRIBUTE_COUNT_MIN, ATTRIBUTE_COUNT_MAX)
    const trait = this.store.traits.find(
      (record) => record.kind === 'AttributeCount' && record.name === `${count} Attributes`,
    )
    if (trait) return this.store.traitBitmaps[trait.id]

    const ids: number[] = []
    for (let punkId = 0; punkId < PUNK_COUNT; punkId++) {
      if (this.store.scalars[punkId].attributeCount === count) ids.push(punkId)
    }
    return punkBitmapFromIds(ids)
  }

  private bitmapForTraitKindName(kind: TraitKindName, name: string): PunkBitmap {
    const trait = this.store.traits.find((record) => record.kind === kind && record.name === name)
    return trait ? this.store.traitBitmaps[trait.id] : emptyPunkBitmap()
  }

  private sortPunkIds(ids: number[], sort: OfflinePunksSearchSort): number[] {
    const sorted = [...ids]
    const compareById = (a: number, b: number) => a - b
    const compareMetric = (metric: (id: number) => number, desc = false) => (a: number, b: number) => {
      const diff = metric(a) - metric(b)
      return (desc ? -diff : diff) || compareById(a, b)
    }

    if (sort === 'id') return sorted
    if (sort === 'id-desc') return sorted.reverse()
    if (sort === 'rarity') return sorted.sort(compareMetric((id) => this.rarityScore(id)))
    if (sort === 'rarity-desc') {
      return sorted.sort(compareMetric((id) => this.rarityScore(id), true))
    }
    if (sort === 'pixelCount') {
      return sorted.sort(compareMetric((id) => this.store.scalars[id].pixelCount))
    }
    if (sort === 'pixelCount-desc') {
      return sorted.sort(compareMetric((id) => this.store.scalars[id].pixelCount, true))
    }
    if (sort === 'colorCount') {
      return sorted.sort(compareMetric((id) => this.store.scalars[id].colorCount))
    }
    if (sort === 'colorCount-desc') {
      return sorted.sort(compareMetric((id) => this.store.scalars[id].colorCount, true))
    }
    if (sort === 'attributeCount') {
      return sorted.sort(compareMetric((id) => this.store.scalars[id].attributeCount))
    }
    if (sort === 'attributeCount-desc') {
      return sorted.sort(compareMetric((id) => this.store.scalars[id].attributeCount, true))
    }
    throw new PunksDataValidationError(`unknown offline search sort ${String(sort)}`)
  }

  private rarityScore(punkId: number): number {
    return idsFromMask(this.store.traitMasks[punkId], TRAIT_COUNT).reduce(
      (score, traitId) => score + Math.log(this.store.traits[traitId].supply || 1),
      0,
    )
  }
}

export function createOfflinePunksDataClient(
  config: OfflinePunksDataClientConfig = {},
): OfflinePunksDataClient {
  return new OfflinePunksDataClient(config)
}

export function createOfflinePunksDataClientFromDataset(
  dataset: OfflinePunksDataSource | OfflinePunksDataBundle,
  config: Omit<OfflinePunksDataClientConfig, 'dataset'> = {},
): OfflinePunksDataClient {
  return new OfflinePunksDataClient({ ...config, dataset })
}

export async function loadOfflinePunksDataFromDirectory(
  directory: string,
): Promise<OfflinePunksDataSource> {
  const [{ readFile }, { join }] = await Promise.all([
    import('node:fs/promises'),
    import('node:path'),
  ])
  const manifestText = await readFile(join(directory, 'manifest.json'), 'utf8')
  const manifest = parseManifest(manifestText)
  const files = {} as Record<OfflinePunksDataFileKey, Uint8Array>
  await Promise.all(
    FILE_KEYS.map(async (key) => {
      files[key] = new Uint8Array(await readFile(join(directory, manifest.files[key])))
    }),
  )
  return { manifest, files }
}

export async function loadOfflinePunksDataFromUrl(
  baseUrl: string | URL,
): Promise<OfflinePunksDataSource> {
  if (typeof fetch !== 'function') {
    throw new PunksDataValidationError('fetch is not available in this runtime')
  }
  const base = ensureBaseUrl(baseUrl)
  const manifestText = await fetchText(new URL('manifest.json', base))
  const manifest = parseManifest(manifestText)
  const files = {} as Record<OfflinePunksDataFileKey, Uint8Array>
  await Promise.all(
    FILE_KEYS.map(async (key) => {
      files[key] = await fetchBytes(new URL(manifest.files[key], base))
    }),
  )
  return { manifest, files }
}

function parseOfflineStore(source: OfflinePunksDataSource | OfflinePunksDataBundle): OfflineStore {
  const normalized = normalizeOfflineSource(source)
  const manifest = parseManifest(normalized.manifest)
  validateManifest(manifest)

  const traitBitmaps = parseBitmapTable(normalized.files.traitBitmaps, TRAIT_COUNT, 'traitBitmaps')
  const colorBitmaps = parseBitmapTable(normalized.files.colorBitmaps, PALETTE_SIZE, 'colorBitmaps')
  const pixelCountBitmaps = parseBitmapTable(
    normalized.files.pixelCountBitmaps,
    PIXEL_COUNT_MAX - PIXEL_COUNT_MIN + 1,
    'pixelCountBitmaps',
  )
  const colorCountBitmaps = parseBitmapTable(
    normalized.files.colorCountBitmaps,
    COLOR_COUNT_MAX - COLOR_COUNT_MIN + 1,
    'colorCountBitmaps',
  )
  const traits = parseTraitMeta(normalized.files.traitMeta)
  const paletteBytes = expectLength(normalized.files.palette, PALETTE_SIZE * 4, 'palette')
  const colorSupplies = parseUint32Array(
    normalized.files.colorSupplies,
    PALETTE_SIZE,
    'colorSupplies',
  )
  const traitMasks = parseTraitMaskPairs(normalized.files.traitMaskPairs)
  const colorMasks = parseWordArray(normalized.files.colorMasks, PUNK_COUNT, 'colorMasks')
  const scalars = parsePackedScalars(normalized.files.packedScalars)
  const textIndex = buildTextSearchIndex(traits, traitBitmaps)
  const pixelOffsets = expectLength(
    normalized.files.pixelOffsets,
    (PUNK_COUNT + 1) * 3,
    'pixelOffsets',
  )
  const compressedPixels = normalized.files.compressedPixels

  return {
    manifest,
    traits,
    paletteBytes,
    colorSupplies,
    traitBitmaps,
    colorBitmaps,
    pixelCountBitmaps,
    colorCountBitmaps,
    traitMasks,
    colorMasks,
    scalars,
    textIndex,
    pixelOffsets,
    compressedPixels,
  }
}

function normalizeOfflineSource(
  source: OfflinePunksDataSource | OfflinePunksDataBundle,
): NormalizedOfflineSource {
  if ('manifestJson' in source) {
    const files = {} as Record<OfflinePunksDataFileKey, Uint8Array>
    for (const key of FILE_KEYS) files[key] = decodeBase64(source.files[key])
    return {
      manifest: source.manifestJson,
      files,
    }
  }

  const files = {} as Record<OfflinePunksDataFileKey, Uint8Array>
  for (const key of FILE_KEYS) files[key] = normalizeFileBytes(source.files[key], key)
  return {
    manifest: source.manifest,
    files,
  }
}

function normalizeFileBytes(value: Uint8Array | string, key: string): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (typeof value === 'string') return decodeBase64(value)
  throw new PunksDataValidationError(`${key} must be bytes or a base64 string`)
}

function parseManifest(input: string | OfflinePunksDataManifest): OfflinePunksDataManifest {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input
  if (typeof parsed !== 'object' || parsed === null) {
    throw new PunksDataValidationError('offline manifest must be an object')
  }
  return parsed as OfflinePunksDataManifest
}

function validateManifest(manifest: OfflinePunksDataManifest): void {
  if (manifest.counts?.punks !== PUNK_COUNT) {
    throw new PunksDataValidationError(`offline manifest must contain ${PUNK_COUNT} punks`)
  }
  if (manifest.counts.traits !== TRAIT_COUNT) {
    throw new PunksDataValidationError(`offline manifest must contain ${TRAIT_COUNT} traits`)
  }
  if (manifest.counts.colors !== PALETTE_SIZE) {
    throw new PunksDataValidationError(`offline manifest must contain ${PALETTE_SIZE} colors`)
  }
  if (typeof manifest.hashes?.datasetHash !== 'string') {
    throw new PunksDataValidationError('offline manifest is missing hashes.datasetHash')
  }
  for (const key of FILE_KEYS) {
    if (typeof manifest.files?.[key] !== 'string') {
      throw new PunksDataValidationError(`offline manifest is missing files.${key}`)
    }
  }
}

function parseTraitMeta(bytes: Uint8Array): TraitRecord[] {
  const headerLength = TRAIT_COUNT * 6
  if (bytes.length < headerLength) {
    throw new PunksDataValidationError('traitMeta is shorter than its fixed record header')
  }
  const decoder = new TextDecoder()
  return Array.from({ length: TRAIT_COUNT }, (_, id) => {
    const offset = id * 6
    const kindId = bytes[offset] as TraitKindValue
    const supply = readUint16(bytes, offset + 1)
    const nameOffset = readUint16(bytes, offset + 3)
    const nameLength = bytes[offset + 5]
    const nameStart = headerLength + nameOffset
    const nameEnd = nameStart + nameLength
    if (nameEnd > bytes.length) {
      throw new PunksDataValidationError(`traitMeta name ${id} is out of bounds`)
    }
    const kind = traitKindNames[kindId]
    if (kind === undefined) {
      throw new PunksDataValidationError(`unknown trait kind ${kindId} for trait ${id}`)
    }
    return {
      id,
      name: decoder.decode(bytes.slice(nameStart, nameEnd)),
      kind,
      kindId,
      supply,
    }
  })
}

function parseBitmapTable(bytes: Uint8Array, rows: number, label: string): PunkBitmap[] {
  const words = parseWordArray(bytes, rows * BITMAP_WORD_COUNT, label)
  return Array.from({ length: rows }, (_, row) =>
    normalizePunkBitmap(words.slice(row * BITMAP_WORD_COUNT, (row + 1) * BITMAP_WORD_COUNT)),
  )
}

function parseTraitMaskPairs(bytes: Uint8Array): bigint[] {
  const pairs = parseWordArray(bytes, PUNK_COUNT / 2, 'traitMaskPairs')
  const masks: bigint[] = []
  for (const pair of pairs) {
    masks.push(pair & UINT128_MASK, pair >> 128n)
  }
  return masks
}

function parsePackedScalars(bytes: Uint8Array): PackedScalar[] {
  const words = parseWordArray(bytes, Math.ceil(PUNK_COUNT / SCALARS_PER_WORD), 'packedScalars')
  return Array.from({ length: PUNK_COUNT }, (_, punkId) => {
    const word = words[Math.floor(punkId / SCALARS_PER_WORD)]
    const shift = BigInt(punkId % SCALARS_PER_WORD) * SCALAR_BITS
    const raw = (word >> shift) & SCALAR_MASK
    return {
      pixelCount: Number(raw & 0xffffn),
      colorCount: Number((raw >> 16n) & 0xffn),
      attributeCount: Number((raw >> 24n) & 0xffn),
      punkType: Number((raw >> 32n) & 0xffn) as PunkTypeValue,
      headVariant: Number((raw >> 40n) & 0xffn) as HeadVariantValue,
    }
  })
}

function parseWordArray(bytes: Uint8Array, words: number, label: string): bigint[] {
  expectLength(bytes, words * 32, label)
  return Array.from({ length: words }, (_, wordIndex) => readUint256(bytes, wordIndex * 32))
}

function parseUint32Array(bytes: Uint8Array, length: number, label: string): number[] {
  expectLength(bytes, length * 4, label)
  return Array.from({ length }, (_, index) => readUint32(bytes, index * 4))
}

function decodeIndexedPixels(store: OfflineStore, punkId: number): Uint8Array {
  const start = readUint24(store.pixelOffsets, punkId * 3)
  const end = readUint24(store.pixelOffsets, (punkId + 1) * 3)
  if (end <= start || end > store.compressedPixels.length) {
    throw new PunksDataValidationError(`compressed pixel entry ${punkId} is malformed`)
  }
  const entry = store.compressedPixels.slice(start, end)
  if (entry.length < COMPRESSED_PIXEL_HEADER_SIZE) {
    throw new PunksDataValidationError(`compressed pixel entry ${punkId} is too short`)
  }

  const visibleColorCount = entry[0]
  if (
    visibleColorCount === 0 ||
    visibleColorCount >= PALETTE_SIZE ||
    entry.length < COMPRESSED_PIXEL_HEADER_SIZE + visibleColorCount
  ) {
    throw new PunksDataValidationError(`compressed pixel entry ${punkId} has invalid colors`)
  }

  const localPalette = entry.slice(COMPRESSED_PIXEL_HEADER_SIZE, COMPRESSED_PIXEL_HEADER_SIZE + visibleColorCount)
  for (const paletteId of localPalette) {
    if (paletteId === 0 || paletteId >= PALETTE_SIZE) {
      throw new PunksDataValidationError(`compressed pixel entry ${punkId} has invalid palette id`)
    }
  }

  const bitsPerIndex = bitsForPalette(visibleColorCount)
  const indexesOffset = COMPRESSED_PIXEL_HEADER_SIZE + visibleColorCount
  const pixels = new Uint8Array(PIXELS_PER_PUNK)
  let bitOffset = 0
  let visiblePixels = 0

  for (let byteIndex = 0; byteIndex < VISIBLE_BITMAP_BYTES; byteIndex++) {
    const bitmapByte = entry[1 + byteIndex]
    if (bitmapByte === 0) continue
    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
      if ((bitmapByte & (1 << (7 - bitIndex))) === 0) continue
      let localIndex = 0
      if (bitsPerIndex !== 0) {
        localIndex = readBits(entry, indexesOffset, bitOffset, bitsPerIndex)
        bitOffset += bitsPerIndex
      }
      if (localIndex >= visibleColorCount) {
        throw new PunksDataValidationError(`compressed pixel entry ${punkId} has invalid index`)
      }
      pixels[byteIndex * 8 + bitIndex] = localPalette[localIndex]
      visiblePixels++
    }
  }

  const expectedIndexBytes = Math.ceil(bitOffset / 8)
  if (entry.length !== indexesOffset + expectedIndexBytes || visiblePixels === 0) {
    throw new PunksDataValidationError(`compressed pixel entry ${punkId} length mismatch`)
  }
  assertIndexedPixels(pixels)
  return pixels
}

function indexedPixelsToRgbaOffline(
  indexedPixels: Uint8Array,
  paletteRgbaBytes: Uint8Array,
): Uint8Array {
  assertIndexedPixels(indexedPixels)
  const out = new Uint8Array(indexedPixels.length * 4)
  for (let i = 0; i < indexedPixels.length; i++) {
    const colorId = indexedPixels[i]
    validateColorId(colorId)
    out.set(paletteRgbaBytes.slice(colorId * 4, colorId * 4 + 4), i * 4)
  }
  return out
}

function applyCriteriaRows(
  requiredIds: readonly number[],
  forbiddenIds: readonly number[],
  anyOfIds: readonly number[],
  rows: readonly PunkBitmap[],
): PunkBitmap {
  let bitmap = fullPunkBitmap()
  if (requiredIds.length > 0) {
    bitmap = intersectPunkBitmaps([bitmap, ...requiredIds.map((id) => rows[id])])
  }
  if (anyOfIds.length > 0) {
    bitmap = intersectPunkBitmaps([bitmap, unionPunkBitmaps(anyOfIds.map((id) => rows[id]))])
  }
  if (forbiddenIds.length > 0) {
    bitmap = subtractPunkBitmaps(bitmap, unionPunkBitmaps(forbiddenIds.map((id) => rows[id])))
  }
  return bitmap
}

function buildTextSearchIndex(
  traits: readonly TraitRecord[],
  traitBitmaps: readonly PunkBitmap[],
): OfflineTextIndexEntry[] {
  const rowsByKey = new Map<string, PunkBitmap[]>()
  for (const trait of traits) {
    const key = normalizeSearchText(trait.name)
    if (!key) continue
    const rows = rowsByKey.get(key)
    if (rows === undefined) rowsByKey.set(key, [traitBitmaps[trait.id]])
    else rows.push(traitBitmaps[trait.id])
  }
  return Array.from(rowsByKey, ([key, rows]) => ({
    key,
    bitmap: unionPunkBitmaps(rows),
  }))
}

function colorRecord(id: number, rgba: Hex, supply?: number): PaletteColor {
  const parts = rgbaHexToParts(rgba)
  return {
    id,
    rgba: normalizeRgbaHex(rgba),
    rgb: parts.rgb,
    alpha: parts.alpha,
    r: parts.r,
    g: parts.g,
    b: parts.b,
    a: parts.a,
    supply,
  }
}

function resolvePunkTypeRef(ref: PunkTypeRef): PunkTypeValue {
  if (typeof ref === 'number') {
    assertIntegerInRange('punkType', ref, 0, punkTypeNames.length - 1)
    return ref as PunkTypeValue
  }
  const normalized = normalizeSearchText(ref)
  const index = punkTypeNames.findIndex((name) => normalizeSearchText(name) === normalized)
  if (index < 0) throw new PunksDataValidationError(`unknown punk type ${String(ref)}`)
  return index as PunkTypeValue
}

function resolveHeadVariantRef(ref: HeadVariantRef): HeadVariantValue {
  if (typeof ref === 'number') {
    assertIntegerInRange('headVariant', ref, 0, headVariantNames.length - 1)
    return ref as HeadVariantValue
  }
  const normalized = normalizeSearchText(ref)
  const compact = normalized.replaceAll(' ', '')
  const index = headVariantNames.findIndex((name) => {
    const candidate = normalizeSearchText(name)
    return candidate === normalized || candidate.replaceAll(' ', '') === compact
  })
  if (index < 0) throw new PunksDataValidationError(`unknown head variant ${String(ref)}`)
  return index as HeadVariantValue
}

export function parseOfflinePunksSearchText(input: string): OfflinePunksTextSearchTerm[][] {
  if (typeof input !== 'string') {
    throw new PunksDataValidationError('text search must be a string')
  }
  const tokens = readTextSearchTokens(input)
  const groups: OfflinePunksTextSearchTerm[][] = []
  let group: OfflinePunksTextSearchTerm[] = []

  for (const token of tokens) {
    const operator = !token.exact && /^(or|\|\|)$/i.test(token.text)
    if (operator) {
      if (group.length > 0) {
        groups.push(group)
        group = []
      }
      continue
    }
    group.push(token)
  }

  if (group.length > 0) groups.push(group)
  return groups
}

function readTextSearchTokens(input: string): OfflinePunksTextSearchTerm[] {
  const tokens: OfflinePunksTextSearchTerm[] = []
  let cursor = 0

  while (cursor < input.length) {
    while (cursor < input.length && /\s/.test(input[cursor])) cursor++
    if (cursor >= input.length) break

    if (input[cursor] === '"') {
      cursor++
      const start = cursor
      while (cursor < input.length && input[cursor] !== '"') cursor++
      const text = input.slice(start, cursor).trim()
      if (cursor < input.length && input[cursor] === '"') cursor++
      if (text) tokens.push({ text, exact: true })
      continue
    }

    const start = cursor
    while (cursor < input.length && !/\s/.test(input[cursor])) cursor++
    const text = input.slice(start, cursor).replaceAll('"', '').trim()
    if (text) tokens.push({ text, exact: false })
  }

  return tokens
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/[^#a-z0-9]+/g, ' ')
    .trim()
}

function matchesTextIndexKey(key: string, term: string, exact: boolean): boolean {
  return exact ? key === term : key.startsWith(term) || key.includes(` ${term}`)
}

function parsePunkIdText(term: string): number | undefined {
  const clean = term.startsWith('#') ? term.slice(1) : term
  if (!/^\d+$/.test(clean)) return undefined
  const punkId = Number(clean)
  return Number.isInteger(punkId) && punkId >= 0 && punkId < PUNK_COUNT ? punkId : undefined
}

function paginateIds(ids: number[], offset = 0, limit = Number.POSITIVE_INFINITY): number[] {
  if (limit === Number.POSITIVE_INFINITY) return ids.slice(offset)
  return ids.slice(offset, offset + limit)
}

function countIntersection(a: readonly bigint[], b: readonly bigint[]): number {
  return countPunkBitmap(intersectPunkBitmaps([a, b]))
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

function normalizeArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [value as T]
}

function range(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, offset) => min + offset)
}

function validateOfflineReadOptions(options?: PunksDataReadOptions): void {
  if (options === undefined) return
  if (typeof options !== 'object' || options === null) {
    throw new PunksDataValidationError('read options must be an object')
  }
  if (options.blockNumber !== undefined || options.blockTag !== undefined) {
    throw new PunksDataValidationError('offline data is immutable and does not accept block options')
  }
}

function validateOfflinePagination(query: OfflinePunksSearchQuery): void {
  validateOfflineSearchQuery(query)
  if (query.offset !== undefined) {
    assertIntegerInRange('offset', query.offset, 0, Number.MAX_SAFE_INTEGER)
  }
  if (query.limit === undefined || query.limit === Number.POSITIVE_INFINITY) return
  assertIntegerInRange('limit', query.limit, 0, Number.MAX_SAFE_INTEGER)
}

function validateOfflineSearchQuery(query: OfflinePunksSearchQuery): void {
  if (typeof query !== 'object' || query === null) {
    throw new PunksDataValidationError('search query must be an object')
  }
  if (Object.prototype.hasOwnProperty.call(query, 'traits')) {
    throw new PunksDataValidationError('search query uses attributes, not traits')
  }
}

function assertIntegerLike(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new PunksDataValidationError(`${label} must be a non-negative integer`)
  }
}

function expectLength(bytes: Uint8Array, expected: number, label: string): Uint8Array {
  if (bytes.length !== expected) {
    throw new PunksDataValidationError(`${label} must be ${expected} bytes, got ${bytes.length}`)
  }
  return bytes
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function readUint24(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2]
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  )
}

function readUint256(bytes: Uint8Array, offset: number): bigint {
  let value = 0n
  for (let i = 0; i < 32; i++) {
    value = (value << 8n) | BigInt(bytes[offset + i])
  }
  return value
}

function readBits(data: Uint8Array, byteOffset: number, bitOffset: number, bitLength: number): number {
  let value = 0
  for (let i = 0; i < bitLength; i++) {
    const absoluteBit = bitOffset + i
    const byteIndex = byteOffset + (absoluteBit >> 3)
    if (byteIndex >= data.length) {
      throw new PunksDataValidationError('compressed pixel bits are out of bounds')
    }
    const bit = (data[byteIndex] >> (7 - (absoluteBit & 7))) & 1
    value = (value << 1) | bit
  }
  return value
}

function bitsForPalette(visibleColorCount: number): number {
  let maxIndex = visibleColorCount - 1
  let bits = 0
  while (maxIndex > 0) {
    bits++
    maxIndex >>= 1
  }
  return bits
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'))
  const binary = globalThis.atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function ensureBaseUrl(baseUrl: string | URL): URL {
  const value = baseUrl instanceof URL ? baseUrl.toString() : baseUrl
  return new URL(value.endsWith('/') ? value : `${value}/`)
}

async function fetchText(url: URL): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new PunksDataValidationError(`failed to fetch ${url}`)
  return response.text()
}

async function fetchBytes(url: URL): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new PunksDataValidationError(`failed to fetch ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}
