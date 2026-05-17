import { bytesToHex, encodeAbiParameters, keccak256, type Hex } from 'viem'

export const PUNK_COUNT = 10_000
export const TRAIT_COUNT = 111
export const WORDS_PER_BITMAP = 40
export const PIXELS_PER_PUNK = 576
export const RGBA_BYTES_PER_PUNK = PIXELS_PER_PUNK * 4
export const PIXEL_COUNT_MIN = 148
export const PIXEL_COUNT_MAX = 332
export const COLOR_COUNT_MIN = 2
export const COLOR_COUNT_MAX = 14
export const ACCESSORY_COUNT = 87
export const PALETTE_COUNT = 222
export const TRANSPARENT_RGBA = '00000000'

export const KIND_HEAD_VARIANT = 0
export const KIND_NORMALIZED_TYPE = 1
export const KIND_ATTRIBUTE_COUNT = 2
export const KIND_ACCESSORY = 3

export const NORMALIZED_TYPES = [
  'Alien',
  'Ape',
  'Female',
  'Male',
  'Zombie',
] as const
export const HEAD_VARIANTS = [
  'Alien',
  'Ape',
  'Female 1',
  'Female 2',
  'Female 3',
  'Female 4',
  'Male 1',
  'Male 2',
  'Male 3',
  'Male 4',
  'Zombie',
] as const

export const HEAD_VARIANT_TO_TYPE: Record<
  (typeof HEAD_VARIANTS)[number],
  (typeof NORMALIZED_TYPES)[number]
> = {
  Alien: 'Alien',
  Ape: 'Ape',
  'Female 1': 'Female',
  'Female 2': 'Female',
  'Female 3': 'Female',
  'Female 4': 'Female',
  'Male 1': 'Male',
  'Male 2': 'Male',
  'Male 3': 'Male',
  'Male 4': 'Male',
  Zombie: 'Zombie',
}

export type SourceRow = {
  id: number
  attributes: string
  image: Uint8Array
}

export type TraitRecord = {
  id: number
  name: string
  kind: number
  supply: number
  nameHash: Hex
}

export type Scalar = {
  pixelCount: number
  colorCount: number
  attributeCount: number
  punkType: number
  headVariant: number
}

export type ParsedAttributes = {
  headVariant: string
  accessories: string[]
  normalizedType: string
}

export type BuiltDataset = {
  traits: TraitRecord[]
  palette: string[]
  traitMasks: bigint[]
  traitMaskPairs: bigint[]
  packedScalars: bigint[]
  colorMasks: bigint[]
  colorSupplies: number[]
  indexedPixels: Uint8Array
  pixelOffsets: Uint8Array
  compressedPixels: Uint8Array
  traitBitmapsBytes: Uint8Array
  colorBitmapsBytes: Uint8Array
  pixelCountBitmapsBytes: Uint8Array
  colorCountBitmapsBytes: Uint8Array
  traitMeta: Uint8Array
  paletteBytes: Uint8Array
  traitMaskPairsBytes: Uint8Array
  colorMasksBytes: Uint8Array
  packedScalarsBytes: Uint8Array
  colorSuppliesBytes: Uint8Array
  traitCatalogHash: Hex
  punkMaskHash: Hex
  paletteHash: Hex
  indexedPixelsHash: Hex
  compressedPixelsHash: Hex
  datasetHash: Hex
}

export function writeUint16(
  out: Uint8Array,
  offset: number,
  value: number,
): void {
  out[offset] = (value >> 8) & 0xff
  out[offset + 1] = value & 0xff
}

export function writeUint24(
  out: Uint8Array,
  offset: number,
  value: number,
): void {
  if (value > 0xffffff) throw new Error(`uint24 overflow ${value}`)
  out[offset] = (value >> 16) & 0xff
  out[offset + 1] = (value >> 8) & 0xff
  out[offset + 2] = value & 0xff
}

export function writeUint32(
  out: Uint8Array,
  offset: number,
  value: number,
): void {
  out[offset] = (value >>> 24) & 0xff
  out[offset + 1] = (value >>> 16) & 0xff
  out[offset + 2] = (value >>> 8) & 0xff
  out[offset + 3] = value & 0xff
}

export function writeUint256(
  out: Uint8Array,
  offset: number,
  value: bigint,
): void {
  for (let i = 31; i >= 0; i--) {
    out[offset + i] = Number(value & 0xffn)
    value >>= 8n
  }
}

export function writeBits(
  target: Uint8Array,
  bitOffset: number,
  bitLength: number,
  value: number,
): void {
  for (let i = 0; i < bitLength; i++) {
    const bit = (value >> (bitLength - 1 - i)) & 1
    if (bit === 0) continue
    const absoluteBit = bitOffset + i
    target[absoluteBit >> 3] |= 1 << (7 - (absoluteBit & 7))
  }
}

export function readBits(
  data: Uint8Array,
  byteOffset: number,
  bitOffset: number,
  bitLength: number,
): number {
  let value = 0
  for (let i = 0; i < bitLength; i++) {
    const absoluteBit = bitOffset + i
    const byteIndex = byteOffset + (absoluteBit >> 3)
    if (byteIndex >= data.length) throw new Error('readBits out of bounds')
    const bit = (data[byteIndex] >> (7 - (absoluteBit & 7))) & 1
    value = (value << 1) | bit
  }
  return value
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function hexToBytes(hex: Hex): Uint8Array {
  const clean = hex.slice(2)
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function keccakBytes(bytes: Uint8Array): Hex {
  return keccak256(bytesToHex(bytes))
}

export function rgbaKey(bytes: Uint8Array, offset: number): string {
  return [...bytes.slice(offset, offset + 4)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export function asciiSort(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function popcount(value: bigint): number {
  let count = 0
  while (value !== 0n) {
    if ((value & 1n) === 1n) count++
    value >>= 1n
  }
  return count
}

export function normalizeType(headVariant: string): string {
  if (headVariant.startsWith('Female')) return 'Female'
  if (headVariant.startsWith('Male')) return 'Male'
  return headVariant
}

export function parseAttributes(csv: string): ParsedAttributes {
  const parts = csv.split(', ')
  const headVariant = parts[0]
  return {
    headVariant,
    accessories: parts.slice(1),
    normalizedType: normalizeType(headVariant),
  }
}

export function collectAccessories(rows: SourceRow[]): string[] {
  const accessories = new Set<string>()
  for (const row of rows) {
    const parts = row.attributes.split(', ')
    for (const accessory of parts.slice(1)) accessories.add(accessory)
  }
  return [...accessories].sort(asciiSort)
}

export function buildTraitCatalog(accessories: string[]): TraitRecord[] {
  const traits: TraitRecord[] = []
  const push = (name: string, kind: number) => {
    traits.push({
      id: traits.length,
      name,
      kind,
      supply: 0,
      nameHash: keccakBytes(new TextEncoder().encode(name)),
    })
  }
  for (const name of NORMALIZED_TYPES) push(name, KIND_NORMALIZED_TYPE)
  for (const name of HEAD_VARIANTS) push(name, KIND_HEAD_VARIANT)
  for (let i = 0; i <= 7; i++) push(`${i} Attributes`, KIND_ATTRIBUTE_COUNT)
  for (const name of accessories) push(name, KIND_ACCESSORY)
  if (traits.length !== TRAIT_COUNT) {
    throw new Error(`Expected ${TRAIT_COUNT} traits, got ${traits.length}`)
  }
  return traits
}

export function buildPalette(rows: SourceRow[]): string[] {
  const colors = new Set<string>()
  for (const row of rows) {
    for (let offset = 0; offset < row.image.length; offset += 4) {
      colors.add(rgbaKey(row.image, offset))
    }
  }
  if (!colors.has(TRANSPARENT_RGBA))
    throw new Error('Transparent color missing')
  return [
    TRANSPARENT_RGBA,
    ...[...colors].filter((c) => c !== TRANSPARENT_RGBA).sort(asciiSort),
  ]
}

export function rgbaToIndexed(
  image: Uint8Array,
  colorIdByRgba: Map<string, number>,
): Uint8Array {
  const indexed = new Uint8Array(PIXELS_PER_PUNK)
  for (let pixel = 0; pixel < PIXELS_PER_PUNK; pixel++) {
    const colorId = colorIdByRgba.get(rgbaKey(image, pixel * 4))
    if (colorId === undefined)
      throw new Error(`Unknown color at pixel ${pixel}`)
    indexed[pixel] = colorId
  }
  return indexed
}

export function indexedToRgba(
  indexed: Uint8Array,
  palette: string[],
): Uint8Array {
  const out = new Uint8Array(indexed.length * 4)
  for (let i = 0; i < indexed.length; i++) {
    const rgba = palette[indexed[i]]
    if (rgba === undefined) throw new Error(`Unknown colorId ${indexed[i]}`)
    for (let b = 0; b < 4; b++) {
      out[i * 4 + b] = Number.parseInt(rgba.slice(b * 2, b * 2 + 2), 16)
    }
  }
  return out
}

export function sortedVisibleColors(indexed: Uint8Array): number[] {
  const colors = new Set<number>()
  for (const colorId of indexed) {
    if (colorId !== 0) colors.add(colorId)
  }
  return [...colors].sort((a, b) => a - b)
}

export function countVisiblePixels(indexed: Uint8Array): number {
  let count = 0
  for (const colorId of indexed) {
    if (colorId !== 0) count++
  }
  return count
}

export function bitsForPalette(visibleColorCount: number): number {
  let maxIndex = visibleColorCount - 1
  let bits = 0
  while (maxIndex > 0) {
    bits++
    maxIndex >>= 1
  }
  return bits
}

export function encodeSparseIndexed(
  indexed: Uint8Array,
  visibleColors: number[],
): Uint8Array {
  const colorToLocal = new Map<number, number>()
  visibleColors.forEach((colorId, index) => colorToLocal.set(colorId, index))
  const visibleBitmap = new Uint8Array(72)
  const bitsPerIndex = bitsForPalette(visibleColors.length)
  const visiblePixelCount = countVisiblePixels(indexed)
  const indexBytes = new Uint8Array(
    Math.ceil((visiblePixelCount * bitsPerIndex) / 8),
  )

  let bitOffset = 0
  for (let pixel = 0; pixel < indexed.length; pixel++) {
    const colorId = indexed[pixel]
    if (colorId === 0) continue
    visibleBitmap[pixel >> 3] |= 1 << (7 - (pixel & 7))
    const localIndex = colorToLocal.get(colorId)
    if (localIndex === undefined)
      throw new Error(`Missing local color ${colorId}`)
    writeBits(indexBytes, bitOffset, bitsPerIndex, localIndex)
    bitOffset += bitsPerIndex
  }

  return concatBytes([
    Uint8Array.of(visibleColors.length),
    visibleBitmap,
    Uint8Array.from(visibleColors),
    indexBytes,
  ])
}

export function decodeSparseIndexed(
  entry: Uint8Array,
  paletteCount: number,
): Uint8Array {
  if (entry.length < 73) throw new Error('entry too short')
  const visibleColorCount = entry[0]
  if (visibleColorCount === 0 || entry.length < 73 + visibleColorCount) {
    throw new Error('malformed visibleColorCount')
  }
  if (visibleColorCount > paletteCount - 1) {
    throw new Error('visibleColorCount > paletteCount-1')
  }

  const localPalette = new Uint8Array(visibleColorCount)
  for (let i = 0; i < visibleColorCount; i++) {
    const paletteId = entry[73 + i]
    if (paletteId === 0 || paletteId >= paletteCount) {
      throw new Error(`invalid paletteId ${paletteId}`)
    }
    localPalette[i] = paletteId
  }

  const bitsPerIndex = bitsForPalette(visibleColorCount)
  const indexesOffset = 73 + visibleColorCount
  const pixels = new Uint8Array(PIXELS_PER_PUNK)
  let bitOffset = 0
  let visibleIndex = 0

  for (let byteIdx = 0; byteIdx < 72; byteIdx++) {
    const bitmapByte = entry[1 + byteIdx]
    if (bitmapByte === 0) continue
    for (let b = 0; b < 8; b++) {
      if ((bitmapByte & (1 << (7 - b))) === 0) continue
      let localIndex = 0
      if (bitsPerIndex !== 0) {
        localIndex = readBits(entry, indexesOffset, bitOffset, bitsPerIndex)
        bitOffset += bitsPerIndex
      }
      if (localIndex >= visibleColorCount)
        throw new Error('localIndex out of range')
      pixels[byteIdx * 8 + b] = localPalette[localIndex]
      visibleIndex++
    }
  }

  const expectedIndexBytes = Math.ceil(bitOffset / 8)
  if (entry.length !== indexesOffset + expectedIndexBytes) {
    throw new Error('entry length mismatch')
  }
  if (visibleIndex === 0) throw new Error('zero visible pixels')
  return pixels
}

export function encodeTraitMeta(traits: TraitRecord[]): Uint8Array {
  const nameBytes = traits.map((trait) => new TextEncoder().encode(trait.name))
  const nameLength = nameBytes.reduce((sum, bytes) => sum + bytes.length, 0)
  const out = new Uint8Array(traits.length * 6 + nameLength)
  let nameOffset = 0
  for (const trait of traits) {
    const recordOffset = trait.id * 6
    const name = nameBytes[trait.id]
    if (name.length > 255 || nameOffset > 0xffff || trait.supply > 0xffff) {
      throw new Error(`Trait metadata out of range for ${trait.name}`)
    }
    out[recordOffset] = trait.kind
    writeUint16(out, recordOffset + 1, trait.supply)
    writeUint16(out, recordOffset + 3, nameOffset)
    out[recordOffset + 5] = name.length
    out.set(name, traits.length * 6 + nameOffset)
    nameOffset += name.length
  }
  return out
}

export function encodeTraitCatalogForHash(traits: TraitRecord[]): Uint8Array {
  const parts: Uint8Array[] = []
  for (const trait of traits) {
    parts.push(new TextEncoder().encode(trait.name), Uint8Array.of(trait.kind))
  }
  return concatBytes(parts)
}

export function encodePalette(palette: string[]): Uint8Array {
  const out = new Uint8Array(palette.length * 4)
  palette.forEach((rgba, index) => {
    for (let i = 0; i < 4; i++) {
      out[index * 4 + i] = Number.parseInt(rgba.slice(i * 2, i * 2 + 2), 16)
    }
  })
  return out
}

export function encodeBitmapTable(table: bigint[][]): Uint8Array {
  return encodeWordArray(table.flat())
}

export function encodeWordArray(words: bigint[]): Uint8Array {
  const out = new Uint8Array(words.length * 32)
  words.forEach((word, index) => writeUint256(out, index * 32, word))
  return out
}

export function encodeUint32Array(values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4)
  values.forEach((value, index) => writeUint32(out, index * 4, value))
  return out
}

export function makeBitmapTable(rows: number): bigint[][] {
  return Array.from({ length: rows }, () =>
    new Array<bigint>(WORDS_PER_BITMAP).fill(0n),
  )
}

export function setBitmapBit(words: bigint[], punkId: number): void {
  const wordIndex = Math.floor(punkId / 256)
  const bitIndex = punkId % 256
  words[wordIndex] |= 1n << BigInt(bitIndex)
}

export function packScalarWord(scalars: Scalar[]): bigint {
  let word = 0n
  for (let i = 0; i < scalars.length; i++) {
    const scalar = scalars[i]
    const value =
      BigInt(scalar.pixelCount) |
      (BigInt(scalar.colorCount) << 16n) |
      (BigInt(scalar.attributeCount) << 24n) |
      (BigInt(scalar.punkType) << 32n) |
      (BigInt(scalar.headVariant) << 40n)
    word |= value << BigInt(i * 48)
  }
  return word
}

export function packScalarInto(
  packedScalars: bigint[],
  punkId: number,
  scalar: Scalar,
): void {
  const value =
    BigInt(scalar.pixelCount) |
    (BigInt(scalar.colorCount) << 16n) |
    (BigInt(scalar.attributeCount) << 24n) |
    (BigInt(scalar.punkType) << 32n) |
    (BigInt(scalar.headVariant) << 40n)
  const wordIndex = Math.floor(punkId / 5)
  const shift = BigInt((punkId % 5) * 48)
  packedScalars[wordIndex] |= value << shift
}

export function packMaskIntoPair(
  pairs: bigint[],
  punkId: number,
  mask: bigint,
): void {
  const pairIndex = Math.floor(punkId / 2)
  if (punkId % 2 === 0) {
    pairs[pairIndex] |= mask
  } else {
    pairs[pairIndex] |= mask << 128n
  }
}

export function buildDataset(rows: SourceRow[]): BuiltDataset {
  if (rows.length !== PUNK_COUNT) {
    throw new Error(`Expected ${PUNK_COUNT} source rows, got ${rows.length}`)
  }

  const sortedRows = [...rows].sort((a, b) => a.id - b.id)
  for (let i = 0; i < sortedRows.length; i++) {
    if (sortedRows[i].id !== i)
      throw new Error(`Missing or out-of-order row ${i}`)
  }
  for (const row of sortedRows) {
    if (row.image.length !== RGBA_BYTES_PER_PUNK) {
      throw new Error(`Punk ${row.id} image length ${row.image.length}`)
    }
  }

  const accessoryNames = collectAccessories(sortedRows)
  if (accessoryNames.length !== ACCESSORY_COUNT) {
    throw new Error(
      `Expected ${ACCESSORY_COUNT} accessories, got ${accessoryNames.length}`,
    )
  }

  const traits = buildTraitCatalog(accessoryNames)
  const traitIdByKindAndName = new Map<string, number>()
  for (const trait of traits) {
    traitIdByKindAndName.set(`${trait.kind}:${trait.name}`, trait.id)
  }

  const palette = buildPalette(sortedRows)
  if (palette.length !== PALETTE_COUNT) {
    throw new Error(
      `Expected ${PALETTE_COUNT} palette colors, got ${palette.length}`,
    )
  }
  const colorIdByRgba = new Map<string, number>()
  palette.forEach((rgba, index) => colorIdByRgba.set(rgba, index))

  const traitSupplies = new Array<number>(TRAIT_COUNT).fill(0)
  const traitBitmaps = makeBitmapTable(TRAIT_COUNT)
  const traitMasks = new Array<bigint>(PUNK_COUNT).fill(0n)
  const traitMaskPairs = new Array<bigint>(PUNK_COUNT / 2).fill(0n)
  const packedScalars = new Array<bigint>(Math.ceil(PUNK_COUNT / 5)).fill(0n)

  const colorSupplies = new Array<number>(palette.length).fill(0)
  const colorMasks = new Array<bigint>(PUNK_COUNT).fill(0n)
  const colorBitmaps = makeBitmapTable(palette.length)
  const pixelCountBitmaps = makeBitmapTable(
    PIXEL_COUNT_MAX - PIXEL_COUNT_MIN + 1,
  )
  const colorCountBitmaps = makeBitmapTable(
    COLOR_COUNT_MAX - COLOR_COUNT_MIN + 1,
  )

  const indexedPixels = new Uint8Array(PUNK_COUNT * PIXELS_PER_PUNK)
  const pixelOffsets = new Uint8Array((PUNK_COUNT + 1) * 3)
  const compressedEntries: Uint8Array[] = []
  let compressedOffset = 0

  for (const row of sortedRows) {
    const parsed = parseAttributes(row.attributes)
    let mask = 0n
    mask |=
      1n <<
      BigInt(
        mustGet(
          traitIdByKindAndName,
          `${KIND_NORMALIZED_TYPE}:${parsed.normalizedType}`,
        ),
      )
    mask |=
      1n <<
      BigInt(
        mustGet(
          traitIdByKindAndName,
          `${KIND_HEAD_VARIANT}:${parsed.headVariant}`,
        ),
      )
    mask |=
      1n <<
      BigInt(
        mustGet(
          traitIdByKindAndName,
          `${KIND_ATTRIBUTE_COUNT}:${parsed.accessories.length} Attributes`,
        ),
      )
    for (const accessory of parsed.accessories) {
      mask |=
        1n <<
        BigInt(mustGet(traitIdByKindAndName, `${KIND_ACCESSORY}:${accessory}`))
    }
    traitMasks[row.id] = mask
    packMaskIntoPair(traitMaskPairs, row.id, mask)
    for (let traitId = 0; traitId < TRAIT_COUNT; traitId++) {
      if (((mask >> BigInt(traitId)) & 1n) === 0n) continue
      traitSupplies[traitId] += 1
      setBitmapBit(traitBitmaps[traitId], row.id)
    }

    const indexed = rgbaToIndexed(row.image, colorIdByRgba)
    indexedPixels.set(indexed, row.id * PIXELS_PER_PUNK)
    for (const colorId of indexed) {
      colorSupplies[colorId] += 1
    }

    const visibleColors = sortedVisibleColors(indexed)
    const visiblePixelCount = countVisiblePixels(indexed)
    const visibleColorCount = visibleColors.length
    if (
      visiblePixelCount < PIXEL_COUNT_MIN ||
      visiblePixelCount > PIXEL_COUNT_MAX
    ) {
      throw new Error(`Punk ${row.id} visible pixel count ${visiblePixelCount}`)
    }
    if (
      visibleColorCount < COLOR_COUNT_MIN ||
      visibleColorCount > COLOR_COUNT_MAX
    ) {
      throw new Error(`Punk ${row.id} visible color count ${visibleColorCount}`)
    }

    let colorMask = 0n
    for (const colorId of visibleColors) {
      colorMask |= 1n << BigInt(colorId)
      setBitmapBit(colorBitmaps[colorId], row.id)
    }
    colorMasks[row.id] = colorMask
    setBitmapBit(pixelCountBitmaps[visiblePixelCount - PIXEL_COUNT_MIN], row.id)
    setBitmapBit(colorCountBitmaps[visibleColorCount - COLOR_COUNT_MIN], row.id)

    const typeIndex = NORMALIZED_TYPES.indexOf(
      parsed.normalizedType as (typeof NORMALIZED_TYPES)[number],
    )
    const headIndex = HEAD_VARIANTS.indexOf(
      parsed.headVariant as (typeof HEAD_VARIANTS)[number],
    )
    if (typeIndex < 0 || headIndex < 0) {
      throw new Error(`Unknown type/head for Punk ${row.id}`)
    }
    packScalarInto(packedScalars, row.id, {
      pixelCount: visiblePixelCount,
      colorCount: visibleColorCount,
      attributeCount: parsed.accessories.length,
      punkType: typeIndex,
      headVariant: headIndex,
    })

    writeUint24(pixelOffsets, row.id * 3, compressedOffset)
    const compressed = encodeSparseIndexed(indexed, visibleColors)
    compressedEntries.push(compressed)
    compressedOffset += compressed.length
  }
  writeUint24(pixelOffsets, PUNK_COUNT * 3, compressedOffset)

  for (const trait of traits) {
    trait.supply = traitSupplies[trait.id]
  }

  const compressedPixels = concatBytes(compressedEntries)
  const traitMeta = encodeTraitMeta(traits)
  const paletteBytes = encodePalette(palette)
  const traitBitmapsBytes = encodeBitmapTable(traitBitmaps)
  const colorBitmapsBytes = encodeBitmapTable(colorBitmaps)
  const pixelCountBitmapsBytes = encodeBitmapTable(pixelCountBitmaps)
  const colorCountBitmapsBytes = encodeBitmapTable(colorCountBitmaps)
  const traitMaskPairsBytes = encodeWordArray(traitMaskPairs)
  const colorMasksBytes = encodeWordArray(colorMasks)
  const packedScalarsBytes = encodeWordArray(packedScalars)
  const colorSuppliesBytes = encodeUint32Array(colorSupplies)

  const traitCatalogHash = keccakBytes(encodeTraitCatalogForHash(traits))
  const punkMaskHash = keccakBytes(encodeWordArray(traitMasks))
  const paletteHash = keccakBytes(paletteBytes)
  const indexedPixelsHash = keccakBytes(indexedPixels)
  const compressedPixelsHash = keccakBytes(
    concatBytes([pixelOffsets, compressedPixels]),
  )
  const datasetHash = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
      ],
      [
        traitCatalogHash,
        punkMaskHash,
        paletteHash,
        indexedPixelsHash,
        compressedPixelsHash,
      ],
    ),
  )

  return {
    traits,
    palette,
    traitMasks,
    traitMaskPairs,
    packedScalars,
    colorMasks,
    colorSupplies,
    indexedPixels,
    pixelOffsets,
    compressedPixels,
    traitBitmapsBytes,
    colorBitmapsBytes,
    pixelCountBitmapsBytes,
    colorCountBitmapsBytes,
    traitMeta,
    paletteBytes,
    traitMaskPairsBytes,
    colorMasksBytes,
    packedScalarsBytes,
    colorSuppliesBytes,
    traitCatalogHash,
    punkMaskHash,
    paletteHash,
    indexedPixelsHash,
    compressedPixelsHash,
    datasetHash,
  }
}

function mustGet<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key)
  if (value === undefined) throw new Error(`Missing key ${String(key)}`)
  return value
}
