import type { Address, Hex, PublicClient } from 'viem'
import { punksDataReadAbi } from './abi'
import {
  BITMAP_WORD_COUNT,
  COLOR_COUNT_MAX,
  COLOR_COUNT_MIN,
  PALETTE_SIZE,
  PIXEL_COUNT_MAX,
  PIXEL_COUNT_MIN,
  PUNKS_DATA_ADDRESS,
  TRAIT_COUNT,
  headVariantNames,
  punkTypeNames,
  traitKindNames,
  type HeadVariantValue,
  type PunkTypeValue,
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
  ColorCriteriaInput,
  ColorRef,
  PaletteColor,
  PunkBitmap,
  PunkSummary,
  PunkSummaryOptions,
  PunksDataBlockTag,
  PunksDataClientConfig,
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
  assertIntegerInRange,
  assertIndexedPixels,
  bytesToHex,
  hexToBytes,
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

type ReadFunctionName = Extract<
  (typeof punksDataReadAbi)[number],
  { type: 'function' }
>['name']

type ContractReadCall = {
  functionName: ReadFunctionName
  args?: readonly unknown[]
}

type BitmapFunctionName =
  | 'traitBitmapWord'
  | 'colorBitmapWord'
  | 'pixelCountBitmapWord'
  | 'colorCountBitmapWord'

type Cacheable<T> = Promise<T>

const READ_BLOCK_TAGS = new Set<PunksDataBlockTag>([
  'latest',
  'earliest',
  'pending',
  'safe',
  'finalized',
])

export class PunksDataClient {
  readonly publicClient: PublicClient
  readonly address: Address

  private readonly cacheEnabled: boolean
  private readonly multicallBatchSize: number
  private readonly cache = new Map<string, Cacheable<unknown>>()

  constructor(config: PunksDataClientConfig) {
    this.publicClient = config.publicClient
    this.address = PUNKS_DATA_ADDRESS
    this.cacheEnabled = config.cache ?? true
    this.multicallBatchSize = config.multicallBatchSize ?? 256
    if (!Number.isInteger(this.multicallBatchSize) || this.multicallBatchSize < 1) {
      throw new PunksDataValidationError('multicallBatchSize must be a positive integer')
    }
  }

  clearCache(): void {
    this.cache.clear()
  }

  async getDatasetHash(options?: PunksDataReadOptions): Promise<Hex> {
    return this.cached('datasetHash', options, () => this.read<Hex>('datasetHash', [], options))
  }

  async isSealed(options?: PunksDataReadOptions): Promise<boolean> {
    return this.cached('isSealed', options, () => this.read<boolean>('isSealed', [], options))
  }

  async getTraitCount(options?: PunksDataReadOptions): Promise<number> {
    return this.cached('traitCount', options, async () =>
      Number(await this.read<bigint | number>('traitCount', [], options)),
    )
  }

  async isValidTraitId(traitId: number, options?: PunksDataReadOptions): Promise<boolean> {
    assertIntegerLike('traitId', traitId)
    return this.read<boolean>('isValidTraitId', [traitId], options)
  }

  async getTraitName(traitId: number, options?: PunksDataReadOptions): Promise<string> {
    validateTraitId(traitId)
    return this.cached(`traitName:${traitId}`, options, () =>
      this.read<string>('traitName', [traitId], options),
    )
  }

  async getTraitKind(traitId: number, options?: PunksDataReadOptions): Promise<number> {
    validateTraitId(traitId)
    return this.cached(`traitKind:${traitId}`, options, async () =>
      Number(await this.read<bigint | number>('traitKind', [traitId], options)),
    )
  }

  async getTraitSupply(traitId: number, options?: PunksDataReadOptions): Promise<number> {
    validateTraitId(traitId)
    return this.cached(`traitSupply:${traitId}`, options, async () =>
      Number(await this.read<bigint | number>('traitSupply', [traitId], options)),
    )
  }

  async hasTrait(
    punkId: number,
    trait: TraitRef,
    options?: PunksDataReadOptions,
  ): Promise<boolean> {
    validatePunkId(punkId)
    const traitId = await this.resolveTraitId(trait, options)
    return this.read<boolean>('hasTrait', [punkId, traitId], options)
  }

  async getTraitMask(punkId: number, options?: PunksDataReadOptions): Promise<bigint> {
    validatePunkId(punkId)
    return this.read<bigint>('traitMaskOf', [punkId], options)
  }

  async hasTraits(
    punkId: number,
    requiredMask: bigint,
    forbiddenMask: bigint,
    anyOfMask: bigint,
    options?: PunksDataReadOptions,
  ): Promise<boolean> {
    validatePunkId(punkId)
    validateTraitCriteriaMasks(requiredMask, forbiddenMask, anyOfMask)
    return this.read<boolean>(
      'hasTraits',
      [punkId, requiredMask, forbiddenMask, anyOfMask],
      options,
    )
  }

  async matchesTraitCriteria(
    punkId: number,
    criteria: TraitCriteriaInput,
    options?: PunksDataReadOptions,
  ): Promise<boolean> {
    const masks = await this.resolveTraitCriteria(criteria, options)
    return this.hasTraits(
      punkId,
      masks.requiredMask,
      masks.forbiddenMask,
      masks.anyOfMask,
      options,
    )
  }

  async getTraitBitmapWord(
    trait: TraitRef,
    wordIndex: number,
    options?: PunksDataReadOptions,
  ): Promise<bigint> {
    const traitId = await this.resolveTraitId(trait, options)
    validateBitmapWordIndex(wordIndex)
    return this.read<bigint>('traitBitmapWord', [traitId, wordIndex], options)
  }

  async getTraitBitmap(trait: TraitRef, options?: PunksDataReadOptions): Promise<PunkBitmap> {
    const traitId = await this.resolveTraitId(trait, options)
    const rows = await this.readBitmapRows([traitId], 'traitBitmapWord', 'traitBitmap', options)
    return rows.get(traitId) ?? emptyPunkBitmap()
  }

  async getTraitBitmaps(
    traits: readonly TraitRef[],
    options?: PunksDataReadOptions,
  ): Promise<Map<number, PunkBitmap>> {
    const traitIds = await this.resolveTraitIds(traits, options)
    return this.readBitmapRows(traitIds, 'traitBitmapWord', 'traitBitmap', options)
  }

  async getPunkType(punkId: number, options?: PunksDataReadOptions): Promise<number> {
    validatePunkId(punkId)
    return Number(await this.read<bigint | number>('punkTypeOf', [punkId], options))
  }

  async getHeadVariant(punkId: number, options?: PunksDataReadOptions): Promise<number> {
    validatePunkId(punkId)
    return Number(await this.read<bigint | number>('headVariantOf', [punkId], options))
  }

  async getAttributeCount(punkId: number, options?: PunksDataReadOptions): Promise<number> {
    validatePunkId(punkId)
    return Number(await this.read<bigint | number>('attributeCountOf', [punkId], options))
  }

  async getPaletteSize(options?: PunksDataReadOptions): Promise<number> {
    return this.cached('paletteSize', options, async () =>
      Number(await this.read<bigint | number>('paletteSize', [], options)),
    )
  }

  async getColor(color: ColorRef, options?: PunksDataReadOptions): Promise<PaletteColor> {
    const colorId = await this.resolveColorId(color, options)
    const [rgba, supply] = await Promise.all([
      this.read<Hex>('colorOf', [colorId], options),
      this.getColorSupply(colorId, options),
    ])
    return colorRecord(colorId, rgba, supply)
  }

  async getColorSupply(color: ColorRef, options?: PunksDataReadOptions): Promise<number> {
    const colorId = await this.resolveColorId(color, options)
    return this.cached(`colorSupply:${colorId}`, options, async () =>
      Number(await this.read<bigint | number>('colorSupply', [colorId], options)),
    )
  }

  async getColorMask(punkId: number, options?: PunksDataReadOptions): Promise<bigint> {
    validatePunkId(punkId)
    return this.read<bigint>('colorMaskOf', [punkId], options)
  }

  async hasColor(
    punkId: number,
    color: ColorRef,
    options?: PunksDataReadOptions,
  ): Promise<boolean> {
    validatePunkId(punkId)
    const colorId = await this.resolveColorId(color, options)
    return this.read<boolean>('hasColor', [punkId, colorId], options)
  }

  async getPixelCount(punkId: number, options?: PunksDataReadOptions): Promise<number> {
    validatePunkId(punkId)
    return Number(await this.read<bigint | number>('pixelCountOf', [punkId], options))
  }

  async getColorCount(punkId: number, options?: PunksDataReadOptions): Promise<number> {
    validatePunkId(punkId)
    return Number(await this.read<bigint | number>('colorCountOf', [punkId], options))
  }

  async getColorBitmapWord(
    color: ColorRef,
    wordIndex: number,
    options?: PunksDataReadOptions,
  ): Promise<bigint> {
    const colorId = await this.resolveColorId(color, options)
    validateBitmapWordIndex(wordIndex)
    return this.read<bigint>('colorBitmapWord', [colorId, wordIndex], options)
  }

  async getColorBitmap(color: ColorRef, options?: PunksDataReadOptions): Promise<PunkBitmap> {
    const colorId = await this.resolveColorId(color, options)
    const rows = await this.readBitmapRows([colorId], 'colorBitmapWord', 'colorBitmap', options)
    return rows.get(colorId) ?? emptyPunkBitmap()
  }

  async getColorBitmaps(
    colors: readonly ColorRef[],
    options?: PunksDataReadOptions,
  ): Promise<Map<number, PunkBitmap>> {
    const colorIds = await this.resolveColorIds(colors, options)
    return this.readBitmapRows(colorIds, 'colorBitmapWord', 'colorBitmap', options)
  }

  async getPixelCountBitmapWord(
    pixelCount: number,
    wordIndex: number,
    options?: PunksDataReadOptions,
  ): Promise<bigint> {
    validatePixelCount(pixelCount)
    validateBitmapWordIndex(wordIndex)
    return this.read<bigint>('pixelCountBitmapWord', [pixelCount, wordIndex], options)
  }

  async getPixelCountBitmap(
    pixelCount: number,
    options?: PunksDataReadOptions,
  ): Promise<PunkBitmap> {
    validatePixelCount(pixelCount)
    const rows = await this.readBitmapRows(
      [pixelCount],
      'pixelCountBitmapWord',
      'pixelCountBitmap',
      options,
    )
    return rows.get(pixelCount) ?? emptyPunkBitmap()
  }

  async getColorCountBitmapWord(
    colorCount: number,
    wordIndex: number,
    options?: PunksDataReadOptions,
  ): Promise<bigint> {
    validateColorCount(colorCount)
    validateBitmapWordIndex(wordIndex)
    return this.read<bigint>('colorCountBitmapWord', [colorCount, wordIndex], options)
  }

  async getColorCountBitmap(
    colorCount: number,
    options?: PunksDataReadOptions,
  ): Promise<PunkBitmap> {
    validateColorCount(colorCount)
    const rows = await this.readBitmapRows(
      [colorCount],
      'colorCountBitmapWord',
      'colorCountBitmap',
      options,
    )
    return rows.get(colorCount) ?? emptyPunkBitmap()
  }

  async getIndexedPixels(punkId: number, options?: PunksDataReadOptions): Promise<Uint8Array> {
    validatePunkId(punkId)
    const pixels = hexToBytes(await this.read<Hex>('indexedPixelsOf', [punkId], options))
    assertIndexedPixels(pixels)
    return pixels
  }

  async getColorAt(
    punkId: number,
    x: number,
    y: number,
    options?: PunksDataReadOptions,
  ): Promise<number> {
    validatePunkId(punkId)
    validateCoordinate(x, y)
    return Number(await this.read<bigint | number>('colorAt', [punkId, x, y], options))
  }

  async getPaletteRgbaBytes(options?: PunksDataReadOptions): Promise<Uint8Array> {
    return this.cached('paletteRgbaBytes', options, async () => {
      const bytes = hexToBytes(await this.read<Hex>('paletteRgbaBytes', [], options))
      if (bytes.length !== PALETTE_SIZE * 4) {
        throw new PunksDataValidationError(`palette must contain ${PALETTE_SIZE} RGBA colors`)
      }
      return bytes
    })
  }

  async getPaletteRgbBytes(options?: PunksDataReadOptions): Promise<Uint8Array> {
    return this.cached('paletteRgbBytes', options, async () => {
      const bytes = hexToBytes(await this.read<Hex>('paletteRgbBytes', [], options))
      if (bytes.length !== PALETTE_SIZE * 3) {
        throw new PunksDataValidationError(`palette must contain ${PALETTE_SIZE} RGB colors`)
      }
      return bytes
    })
  }

  async getPaletteAlphaBytes(options?: PunksDataReadOptions): Promise<Uint8Array> {
    return this.cached('paletteAlphaBytes', options, async () => {
      const bytes = hexToBytes(await this.read<Hex>('paletteAlphaBytes', [], options))
      if (bytes.length !== PALETTE_SIZE) {
        throw new PunksDataValidationError(`palette must contain ${PALETTE_SIZE} alpha values`)
      }
      return bytes
    })
  }

  async getPalette(
    options?: PunksDataReadOptions & { includeSupplies?: boolean },
  ): Promise<PaletteColor[]> {
    const includeSupplies = options?.includeSupplies ?? false
    const cacheKey = includeSupplies ? 'palette:withSupplies' : 'palette'
    return this.cached(cacheKey, options, async () => {
      const rgba = await this.getPaletteRgbaBytes(options)
      if (rgba.length !== PALETTE_SIZE * 4) {
        throw new PunksDataValidationError(`palette must contain ${PALETTE_SIZE} RGBA colors`)
      }
      const supplies = includeSupplies
        ? await this.readMany<bigint | number>(
            Array.from({ length: PALETTE_SIZE }, (_, colorId) => ({
              functionName: 'colorSupply',
              args: [colorId],
            })),
            options,
          )
        : undefined
      return Array.from({ length: PALETTE_SIZE }, (_, colorId) => {
        const offset = colorId * 4
        const color = bytesToHex(rgba.slice(offset, offset + 4))
        return colorRecord(
          colorId,
          color,
          supplies === undefined ? undefined : Number(supplies[colorId]),
        )
      })
    })
  }

  async getRgbaPixels(punkId: number, options?: PunksDataReadOptions): Promise<Uint8Array> {
    const [indexedPixels, paletteBytes] = await Promise.all([
      this.getIndexedPixels(punkId, options),
      this.getPaletteRgbaBytes(options),
    ])
    return indexedPixelsToRgba(indexedPixels, paletteBytes)
  }

  async getTraitCatalog(options?: PunksDataReadOptions): Promise<TraitRecord[]> {
    return this.cached('traitCatalog', options, async () => {
      const calls: ContractReadCall[] = []
      for (let traitId = 0; traitId < TRAIT_COUNT; traitId++) {
        calls.push(
          { functionName: 'traitName', args: [traitId] },
          { functionName: 'traitKind', args: [traitId] },
          { functionName: 'traitSupply', args: [traitId] },
        )
      }
      const values = await this.readMany<string | bigint | number>(calls, options)
      const catalog: TraitRecord[] = []
      for (let traitId = 0; traitId < TRAIT_COUNT; traitId++) {
        const offset = traitId * 3
        const kind = Number(values[offset + 1])
        if (!traitKindNames[kind]) {
          throw new PunksDataValidationError(`unknown trait kind ${kind} for trait ${traitId}`)
        }
        catalog.push({
          id: traitId,
          name: String(values[offset]),
          kind: traitKindNames[kind] as TraitRecord['kind'],
          kindId: kind as TraitRecord['kindId'],
          supply: Number(values[offset + 2]),
        })
      }
      return catalog
    })
  }

  async resolveTrait(trait: TraitRef, options?: PunksDataReadOptions): Promise<TraitRecord> {
    const catalog = await this.getTraitCatalog(options)
    if (typeof trait === 'number') {
      validateTraitId(trait)
      return catalog[trait]
    }
    if (typeof trait === 'object' && trait !== null && trait.id !== undefined) {
      validateTraitId(trait.id)
      return catalog[trait.id]
    }

    if (typeof trait !== 'string' && (typeof trait !== 'object' || trait === null)) {
      throw new PunksDataValidationError('trait reference needs an id or name')
    }
    const rawName = typeof trait === 'string' ? trait : trait.name
    if (typeof rawName !== 'string' || rawName.trim() === '') {
      throw new PunksDataValidationError('trait reference needs an id or name')
    }
    const name = rawName.trim()
    const exact = catalog.find((record) => record.name === name)
    if (exact) return exact
    const lowerName = name.toLowerCase()
    const match = catalog.find((record) => record.name.toLowerCase() === lowerName)
    if (!match) throw new PunksDataValidationError(`unknown trait ${name}`)
    return match
  }

  async resolveTraitCriteria(
    criteria: TraitCriteriaInput = {},
    options?: PunksDataReadOptions,
  ): Promise<ResolvedTraitCriteria> {
    const [required, forbidden, anyOf] = await Promise.all([
      this.resolveTraitIds(criteria.required, options),
      this.resolveTraitIds(criteria.forbidden, options),
      this.resolveTraitIds(criteria.anyOf, options),
    ])
    const requiredMask =
      (criteria.requiredMask ?? 0n) | maskFromIds(required, validateTraitId)
    const forbiddenMask =
      (criteria.forbiddenMask ?? 0n) | maskFromIds(forbidden, validateTraitId)
    const anyOfMask = (criteria.anyOfMask ?? 0n) | maskFromIds(anyOf, validateTraitId)
    validateTraitCriteriaMasks(requiredMask, forbiddenMask, anyOfMask)
    return { requiredMask, forbiddenMask, anyOfMask }
  }

  private async resolveTraitId(trait: TraitRef, options?: PunksDataReadOptions): Promise<number> {
    return (await this.resolveTrait(trait, options)).id
  }

  private async resolveTraitIds(
    traits: readonly TraitRef[] = [],
    options?: PunksDataReadOptions,
  ): Promise<number[]> {
    const ids = await Promise.all(traits.map((trait) => this.resolveTraitId(trait, options)))
    return uniqueNumbers(ids)
  }

  async resolveColor(color: ColorRef, options?: PunksDataReadOptions): Promise<PaletteColor> {
    return this.getColor(color, options)
  }

  private async resolveColorId(color: ColorRef, options?: PunksDataReadOptions): Promise<number> {
    if (typeof color === 'number') {
      validateColorId(color)
      return color
    }
    if (typeof color !== 'string') {
      throw new PunksDataValidationError('color reference must be a color id or hex string')
    }
    const rgba = normalizeRgbaHex(color)
    const palette = await this.getPalette(options)
    const match = palette.find((entry) => entry.rgba.toLowerCase() === rgba.toLowerCase())
    if (!match) throw new PunksDataValidationError(`unknown palette color ${color}`)
    return match.id
  }

  private async resolveColorIds(
    colors: readonly ColorRef[] = [],
    options?: PunksDataReadOptions,
  ): Promise<number[]> {
    const ids = await Promise.all(colors.map((color) => this.resolveColorId(color, options)))
    return uniqueNumbers(ids)
  }

  async resolveColorCriteria(
    criteria: ColorCriteriaInput = {},
    options?: PunksDataReadOptions,
  ): Promise<ResolvedColorCriteria> {
    const [required, forbidden, anyOf] = await Promise.all([
      this.resolveColorIds(criteria.required, options),
      this.resolveColorIds(criteria.forbidden, options),
      this.resolveColorIds(criteria.anyOf, options),
    ])
    const requiredMask =
      (criteria.requiredMask ?? 0n) | maskFromIds(required, validateColorId)
    const forbiddenMask =
      (criteria.forbiddenMask ?? 0n) | maskFromIds(forbidden, validateColorId)
    const anyOfMask = (criteria.anyOfMask ?? 0n) | maskFromIds(anyOf, validateColorId)
    validateColorCriteriaMasks(requiredMask, forbiddenMask, anyOfMask)
    return { requiredMask, forbiddenMask, anyOfMask }
  }

  async searchBitmap(
    query: PunksSearchQuery = {},
    options?: PunksDataReadOptions,
  ): Promise<PunkBitmap> {
    validateSearchQuery(query)
    let bitmap = fullPunkBitmap()

    if (query.traits !== undefined) {
      bitmap = intersectPunkBitmaps([
        bitmap,
        await this.bitmapForTraitCriteria(query.traits, options),
      ])
    }

    if (query.colors !== undefined) {
      bitmap = intersectPunkBitmaps([
        bitmap,
        await this.bitmapForColorCriteria(query.colors, options),
      ])
    }

    const pixelCounts = normalizeNumericRange(
      'pixelCount',
      query.pixelCount,
      PIXEL_COUNT_MIN,
      PIXEL_COUNT_MAX,
    )
    if (pixelCounts !== undefined) {
      const rows = await this.readBitmapRows(
        pixelCounts,
        'pixelCountBitmapWord',
        'pixelCountBitmap',
        options,
      )
      bitmap = intersectPunkBitmaps([bitmap, unionPunkBitmaps(pixelCounts.map((id) => rows.get(id) ?? emptyPunkBitmap()))])
    }

    const colorCounts = normalizeNumericRange(
      'colorCount',
      query.colorCount,
      COLOR_COUNT_MIN,
      COLOR_COUNT_MAX,
    )
    if (colorCounts !== undefined) {
      const rows = await this.readBitmapRows(
        colorCounts,
        'colorCountBitmapWord',
        'colorCountBitmap',
        options,
      )
      bitmap = intersectPunkBitmaps([bitmap, unionPunkBitmaps(colorCounts.map((id) => rows.get(id) ?? emptyPunkBitmap()))])
    }

    if (query.ids !== undefined) {
      bitmap = intersectPunkBitmaps([bitmap, punkBitmapFromIds(query.ids)])
    }
    if (query.excludeIds !== undefined) {
      bitmap = subtractPunkBitmaps(bitmap, punkBitmapFromIds(query.excludeIds))
    }

    return bitmap
  }

  async search(query: PunksSearchQuery = {}, options?: PunksDataReadOptions): Promise<number[]> {
    validatePagination(query)
    const bitmap = await this.searchBitmap(query, options)
    return bitmapToPunkIds(bitmap, {
      offset: query.offset,
      limit: query.limit,
    })
  }

  async count(query: PunksSearchQuery = {}, options?: PunksDataReadOptions): Promise<number> {
    return countPunkBitmap(await this.searchBitmap(query, options))
  }

  async getPunk(
    punkId: number,
    summaryOptions: PunkSummaryOptions = {},
    options?: PunksDataReadOptions,
  ): Promise<PunkSummary> {
    const [punk] = await this.getPunks([punkId], summaryOptions, options)
    return punk
  }

  async getPunks(
    punkIds: readonly number[],
    summaryOptions: PunkSummaryOptions = {},
    options?: PunksDataReadOptions,
  ): Promise<PunkSummary[]> {
    for (const punkId of punkIds) validatePunkId(punkId)
    const calls: ContractReadCall[] = []
    for (const punkId of punkIds) {
      calls.push(
        { functionName: 'traitMaskOf', args: [punkId] },
        { functionName: 'colorMaskOf', args: [punkId] },
        { functionName: 'pixelCountOf', args: [punkId] },
        { functionName: 'colorCountOf', args: [punkId] },
        { functionName: 'attributeCountOf', args: [punkId] },
        { functionName: 'punkTypeOf', args: [punkId] },
        { functionName: 'headVariantOf', args: [punkId] },
      )
      if (summaryOptions.includePixels) calls.push({ functionName: 'indexedPixelsOf', args: [punkId] })
    }

    const [values, catalog, palette] = await Promise.all([
      this.readMany<bigint | number | Hex>(calls, options),
      summaryOptions.includeTraits ? this.getTraitCatalog(options) : undefined,
      summaryOptions.includeColors ? this.getPalette(options) : undefined,
    ])

    const summaries: PunkSummary[] = []
    let cursor = 0
    for (const punkId of punkIds) {
      const traitMask = values[cursor++] as bigint
      const colorMask = values[cursor++] as bigint
      const pixelCount = Number(values[cursor++])
      const colorCount = Number(values[cursor++])
      const attributeCount = Number(values[cursor++])
      const punkType = Number(values[cursor++]) as PunkTypeValue
      const headVariant = Number(values[cursor++]) as HeadVariantValue
      const punkTypeName = punkTypeNames[punkType]
      const headVariantName = headVariantNames[headVariant]
      if (punkTypeName === undefined) {
        throw new PunksDataValidationError(`unknown punk type ${punkType} for punk ${punkId}`)
      }
      if (headVariantName === undefined) {
        throw new PunksDataValidationError(
          `unknown head variant ${headVariant} for punk ${punkId}`,
        )
      }
      const traitIds = idsFromMask(traitMask, TRAIT_COUNT)
      const colorIds = idsFromMask(colorMask, PALETTE_SIZE)
      const indexedPixels = summaryOptions.includePixels
        ? hexToBytes(values[cursor++] as Hex)
        : undefined
      if (indexedPixels !== undefined) assertIndexedPixels(indexedPixels)

      summaries.push({
        id: punkId,
        traitMask,
        colorMask,
        traitIds,
        colorIds,
        pixelCount,
        colorCount,
        attributeCount,
        punkType,
        punkTypeName,
        headVariant,
        headVariantName,
        traits: catalog === undefined ? undefined : traitIds.map((id) => catalog[id]),
        colors: palette === undefined ? undefined : colorIds.map((id) => palette[id]),
        indexedPixels,
      })
    }
    return summaries
  }

  private async bitmapForTraitCriteria(
    criteria: TraitCriteriaInput,
    options?: PunksDataReadOptions,
  ): Promise<PunkBitmap> {
    const masks = await this.resolveTraitCriteria(criteria, options)
    const requiredIds = idsFromMask(masks.requiredMask, TRAIT_COUNT)
    const forbiddenIds = idsFromMask(masks.forbiddenMask, TRAIT_COUNT)
    const anyOfIds = idsFromMask(masks.anyOfMask, TRAIT_COUNT)
    const rows = await this.readBitmapRows(
      uniqueNumbers([...requiredIds, ...forbiddenIds, ...anyOfIds]),
      'traitBitmapWord',
      'traitBitmap',
      options,
    )
    return applyCriteriaRows(requiredIds, forbiddenIds, anyOfIds, rows)
  }

  private async bitmapForColorCriteria(
    criteria: ColorCriteriaInput,
    options?: PunksDataReadOptions,
  ): Promise<PunkBitmap> {
    const masks = await this.resolveColorCriteria(criteria, options)
    const requiredIds = idsFromMask(masks.requiredMask, PALETTE_SIZE)
    const forbiddenIds = idsFromMask(masks.forbiddenMask, PALETTE_SIZE)
    const anyOfIds = idsFromMask(masks.anyOfMask, PALETTE_SIZE)
    const rows = await this.readBitmapRows(
      uniqueNumbers([...requiredIds, ...forbiddenIds, ...anyOfIds]),
      'colorBitmapWord',
      'colorBitmap',
      options,
    )
    return applyCriteriaRows(requiredIds, forbiddenIds, anyOfIds, rows)
  }

  private async readBitmapRows(
    rowIds: readonly number[],
    functionName: BitmapFunctionName,
    cachePrefix: string,
    options?: PunksDataReadOptions,
  ): Promise<Map<number, PunkBitmap>> {
    const uniqueRowIds = uniqueNumbers(rowIds)
    const rows = new Map<number, PunkBitmap>()
    const missing: number[] = []
    for (const rowId of uniqueRowIds) {
      validateBitmapRowId(cachePrefix, rowId)
      const cached = this.getCached<PunkBitmap>(`${cachePrefix}:${rowId}`, options)
      if (cached) rows.set(rowId, await cached)
      else missing.push(rowId)
    }

    if (missing.length > 0) {
      const calls: ContractReadCall[] = []
      for (const rowId of missing) {
        for (let wordIndex = 0; wordIndex < BITMAP_WORD_COUNT; wordIndex++) {
          calls.push({ functionName, args: [rowId, wordIndex] })
        }
      }
      const words = await this.readMany<bigint>(calls, options)
      let cursor = 0
      for (const rowId of missing) {
        const row = normalizePunkBitmap(words.slice(cursor, cursor + BITMAP_WORD_COUNT))
        cursor += BITMAP_WORD_COUNT
        rows.set(rowId, row)
        this.setCached(`${cachePrefix}:${rowId}`, options, Promise.resolve(row))
      }
    }

    return rows
  }

  private async read<T>(
    functionName: ReadFunctionName,
    args: readonly unknown[] = [],
    options?: PunksDataReadOptions,
  ): Promise<T> {
    const params = {
      address: this.address,
      abi: punksDataReadAbi,
      functionName,
      args,
      ...blockParams(options),
    }
    return (this.publicClient.readContract as unknown as (value: typeof params) => Promise<T>)(
      params,
    )
  }

  private async readMany<T>(
    calls: readonly ContractReadCall[],
    options?: PunksDataReadOptions,
  ): Promise<T[]> {
    if (calls.length === 0) return []
    const multicall = (this.publicClient as unknown as { multicall?: (args: unknown) => Promise<unknown[]> }).multicall
    if (!multicall) {
      return Promise.all(calls.map((call) => this.read<T>(call.functionName, call.args ?? [], options)))
    }

    const out: T[] = []
    for (let offset = 0; offset < calls.length; offset += this.multicallBatchSize) {
      const batch = calls.slice(offset, offset + this.multicallBatchSize)
      const values = await multicall({
        contracts: batch.map((call) => ({
          address: this.address,
          abi: punksDataReadAbi,
          functionName: call.functionName,
          args: call.args ?? [],
        })),
        allowFailure: false,
        ...blockParams(options),
      })
      out.push(...(values as T[]))
    }
    return out
  }

  private cached<T>(
    key: string,
    options: PunksDataReadOptions | undefined,
    load: () => Promise<T>,
  ): Promise<T> {
    const cached = this.getCached<T>(key, options)
    if (cached) return cached
    const promise = load()
    this.setCached(key, options, promise)
    return promise
  }

  private getCached<T>(key: string, options?: PunksDataReadOptions): Promise<T> | undefined {
    if (!this.shouldCache(options)) return undefined
    return this.cache.get(cacheKey(key, options)) as Promise<T> | undefined
  }

  private setCached<T>(key: string, options: PunksDataReadOptions | undefined, promise: Promise<T>): void {
    if (!this.shouldCache(options)) return
    const resolvedKey = cacheKey(key, options)
    this.cache.set(resolvedKey, promise)
    promise.catch(() => {
      if (this.cache.get(resolvedKey) === promise) this.cache.delete(resolvedKey)
    })
  }

  private shouldCache(options?: PunksDataReadOptions): boolean {
    return this.cacheEnabled && options?.cache !== false
  }
}

export function createPunksDataClient(config: PunksDataClientConfig): PunksDataClient {
  return new PunksDataClient(config)
}

export function indexedPixelsToRgba(
  indexedPixels: Uint8Array,
  paletteRgbaBytes: Uint8Array,
): Uint8Array {
  assertIndexedPixels(indexedPixels)
  if (paletteRgbaBytes.length < PALETTE_SIZE * 4) {
    throw new PunksDataValidationError(`palette must contain at least ${PALETTE_SIZE} RGBA colors`)
  }
  const out = new Uint8Array(indexedPixels.length * 4)
  for (let i = 0; i < indexedPixels.length; i++) {
    const colorId = indexedPixels[i]
    validateColorId(colorId)
    const paletteOffset = colorId * 4
    const outputOffset = i * 4
    out[outputOffset] = paletteRgbaBytes[paletteOffset]
    out[outputOffset + 1] = paletteRgbaBytes[paletteOffset + 1]
    out[outputOffset + 2] = paletteRgbaBytes[paletteOffset + 2]
    out[outputOffset + 3] = paletteRgbaBytes[paletteOffset + 3]
  }
  return out
}

function applyCriteriaRows(
  requiredIds: readonly number[],
  forbiddenIds: readonly number[],
  anyOfIds: readonly number[],
  rows: Map<number, PunkBitmap>,
): PunkBitmap {
  let bitmap = fullPunkBitmap()
  if (requiredIds.length > 0) {
    bitmap = intersectPunkBitmaps([
      bitmap,
      ...requiredIds.map((id) => rows.get(id) ?? emptyPunkBitmap()),
    ])
  }
  if (anyOfIds.length > 0) {
    bitmap = intersectPunkBitmaps([
      bitmap,
      unionPunkBitmaps(anyOfIds.map((id) => rows.get(id) ?? emptyPunkBitmap())),
    ])
  }
  if (forbiddenIds.length > 0) {
    bitmap = subtractPunkBitmaps(
      bitmap,
      unionPunkBitmaps(forbiddenIds.map((id) => rows.get(id) ?? emptyPunkBitmap())),
    )
  }
  return bitmap
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

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

function blockParams(options?: PunksDataReadOptions): {
  blockNumber?: bigint
  blockTag?: PunksDataReadOptions['blockTag']
} {
  validateReadOptions(options)
  if (options?.blockNumber !== undefined) return { blockNumber: options.blockNumber }
  if (options?.blockTag !== undefined) return { blockTag: options.blockTag }
  return {}
}

function cacheKey(key: string, options?: PunksDataReadOptions): string {
  validateReadOptions(options)
  if (options?.blockNumber !== undefined) return `${key}@${options.blockNumber.toString()}`
  if (options?.blockTag !== undefined) return `${key}@${options.blockTag}`
  return `${key}@default`
}

function validateReadOptions(options?: PunksDataReadOptions): void {
  if (options === undefined) return
  if (typeof options !== 'object' || options === null) {
    throw new PunksDataValidationError('read options must be an object')
  }
  if (options.blockNumber !== undefined && options.blockTag !== undefined) {
    throw new PunksDataValidationError('use blockNumber or blockTag, not both')
  }
  if (options.blockNumber !== undefined) {
    if (typeof options.blockNumber !== 'bigint' || options.blockNumber < 0n) {
      throw new PunksDataValidationError('blockNumber must be a non-negative bigint')
    }
  }
  if (options.blockTag !== undefined && !READ_BLOCK_TAGS.has(options.blockTag)) {
    throw new PunksDataValidationError(
      'blockTag must be latest, earliest, pending, safe, or finalized',
    )
  }
}

function validatePagination(query: PunksSearchQuery): void {
  validateSearchQuery(query)
  if (query.offset !== undefined) {
    assertIntegerInRange('offset', query.offset, 0, Number.MAX_SAFE_INTEGER)
  }
  if (query.limit === undefined || query.limit === Number.POSITIVE_INFINITY) return
  assertIntegerInRange('limit', query.limit, 0, Number.MAX_SAFE_INTEGER)
}

function validateSearchQuery(query: PunksSearchQuery): void {
  if (typeof query !== 'object' || query === null) {
    throw new PunksDataValidationError('search query must be an object')
  }
}

function validateBitmapRowId(cachePrefix: string, rowId: number): void {
  if (cachePrefix === 'traitBitmap') validateTraitId(rowId)
  else if (cachePrefix === 'colorBitmap') validateColorId(rowId)
  else if (cachePrefix === 'pixelCountBitmap') validatePixelCount(rowId)
  else if (cachePrefix === 'colorCountBitmap') validateColorCount(rowId)
  else throw new PunksDataValidationError(`unknown bitmap cache prefix ${cachePrefix}`)
}

function assertIntegerLike(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new PunksDataValidationError(`${label} must be a non-negative integer`)
  }
}
