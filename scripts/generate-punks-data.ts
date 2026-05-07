import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  bytesToHex,
  createPublicClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  type Hex,
} from 'viem'

const SOURCE_DATA =
  '0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2' as const
const SOURCE_CHAIN_ID = 1
const SOURCE_BLOCK_NUMBER = 25_044_552n
const SOURCE_BLOCK_HASH =
  '0x2185f56dcb307a56cb8b90c1e61d4fd7898be906eb28d79e14c01d15f5cabb9f'
const SOURCE_EXTCODEHASH =
  '0x52ab51c14a3f26a80eca178374e21027492fd276c7365f9ab234b737d34c6b60'

const PUNK_COUNT = 10_000
const TRAIT_COUNT = 111
const WORDS_PER_BITMAP = 40
const PIXELS_PER_PUNK = 576
const RGBA_BYTES_PER_PUNK = PIXELS_PER_PUNK * 4
const TRANSPARENT_RGBA = '00000000'
const OUTPUT_DIR = process.env.PUNKS_DATA_OUTPUT ?? 'scripts/output/punks-data'
const RAW_CACHE_ENABLED = process.env.PUNKS_DATA_RAW_CACHE !== '0'
const RAW_CACHE_DIR = process.env.PUNKS_DATA_RAW_CACHE_DIR ?? join(OUTPUT_DIR, 'raw')
const CONCURRENCY = readPositiveIntEnv('PUNKS_DATA_CONCURRENCY', 4)
const RPC_RETRIES = readNonNegativeIntEnv('PUNKS_DATA_RPC_RETRIES', 8)
const RPC_RETRY_BASE_MS = readNonNegativeIntEnv('PUNKS_DATA_RPC_RETRY_BASE_MS', 750)
const RPC_RETRY_MAX_MS = readNonNegativeIntEnv('PUNKS_DATA_RPC_RETRY_MAX_MS', 30_000)
const REQUEST_DELAY_MS = readNonNegativeIntEnv('PUNKS_DATA_REQUEST_DELAY_MS', 0)
const RPC_URL =
  process.env.PUNKS_DATA_RPC_URL ??
  process.env.RPC_URL ??
  'https://ethereum-rpc.publicnode.com'

enum TraitKind {
  HeadVariant,
  NormalizedType,
  AttributeCount,
  Accessory,
}

const NORMALIZED_TYPES = ['Alien', 'Ape', 'Female', 'Male', 'Zombie'] as const
const HEAD_VARIANTS = [
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

const dataAbi = parseAbi([
  'function punkAttributes(uint16 punkId) view returns (string)',
  'function punkImage(uint16 punkId) view returns (bytes)',
])

type PunkRow = {
  id: number
  attributes: string
  image: Uint8Array
}

type TraitRecord = {
  id: number
  name: string
  kind: TraitKind
  supply: number
  nameHash: Hex
}

type RawPunkCache = {
  version: 1
  source: {
    address: string
    chainId: number
    blockNumber: number
  }
  id: number
  attributes: string
  image: Hex
  imageSha256: string
}

async function main() {
  const publicClient = createPublicClient({
    transport: http(RPC_URL),
  })

  const chainId = await publicClient.getChainId()
  if (chainId !== SOURCE_CHAIN_ID) {
    throw new Error(`Expected chain ${SOURCE_CHAIN_ID}, got ${chainId}`)
  }

  const block = await publicClient.getBlock({ blockNumber: SOURCE_BLOCK_NUMBER })
  if (block.hash.toLowerCase() !== SOURCE_BLOCK_HASH.toLowerCase()) {
    throw new Error(`Pinned block hash mismatch: ${block.hash}`)
  }

  const code = await publicClient.getCode({
    address: SOURCE_DATA,
    blockNumber: SOURCE_BLOCK_NUMBER,
  })
  const codeHash = keccak256(code ?? '0x')
  if (codeHash.toLowerCase() !== SOURCE_EXTCODEHASH.toLowerCase()) {
    throw new Error(`Pinned source extcodehash mismatch: ${codeHash}`)
  }

  console.log(`Using RPC ${redactRpcUrl(RPC_URL)}`)
  console.log(
    `RPC settings: concurrency=${CONCURRENCY}, retries=${RPC_RETRIES}, requestDelayMs=${REQUEST_DELAY_MS}`,
  )
  if (RAW_CACHE_ENABLED) {
    await mkdir(RAW_CACHE_DIR, { recursive: true })
    console.log(`Raw cache ${RAW_CACHE_DIR}`)
  }
  console.log(`Reading ${PUNK_COUNT} Punk attribute/image pairs`)
  const rows = await mapLimit(
    Array.from({ length: PUNK_COUNT }, (_, id) => id),
    CONCURRENCY,
    async (id): Promise<PunkRow> => {
      const cached = await readRawPunkCache(id)
      if (cached !== undefined) {
        if (id % 500 === 0) console.log(`  cached ${id}`)
        return cached
      }

      const attributes = await withRpcRetry(`punkAttributes(${id})`, async () => {
        await sleep(REQUEST_DELAY_MS)
        return publicClient.readContract({
          address: SOURCE_DATA,
          abi: dataAbi,
          functionName: 'punkAttributes',
          args: [id],
          blockNumber: SOURCE_BLOCK_NUMBER,
        })
      })
      const imageHex = await withRpcRetry(`punkImage(${id})`, async () => {
        await sleep(REQUEST_DELAY_MS)
        return publicClient.readContract({
          address: SOURCE_DATA,
          abi: dataAbi,
          functionName: 'punkImage',
          args: [id],
          blockNumber: SOURCE_BLOCK_NUMBER,
        })
      })
      const image = hexToBytes(imageHex)
      if (image.length !== RGBA_BYTES_PER_PUNK) {
        throw new Error(`Punk ${id} image length ${image.length}`)
      }
      await writeRawPunkCache({ id, attributes, image })
      if (id % 500 === 0) console.log(`  read ${id}`)
      return { id, attributes, image }
    },
  )

  rows.sort((a, b) => a.id - b.id)

  const accessoryNames = collectAccessories(rows)
  if (accessoryNames.length !== 87) {
    throw new Error(`Expected 87 accessories, got ${accessoryNames.length}`)
  }

  const traits = buildTraitCatalog(accessoryNames)
  const traitIdByKindAndName = new Map<string, number>()
  for (const trait of traits) {
    traitIdByKindAndName.set(`${trait.kind}:${trait.name}`, trait.id)
  }

  const palette = buildPalette(rows)
  if (palette.length !== 222) {
    throw new Error(`Expected 222 palette colors, got ${palette.length}`)
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
  const pixelCountBitmaps = makeBitmapTable(332 - 148 + 1)
  const colorCountBitmaps = makeBitmapTable(14 - 2 + 1)

  const indexedPixels = new Uint8Array(PUNK_COUNT * PIXELS_PER_PUNK)
  const pixelOffsets = new Uint8Array((PUNK_COUNT + 1) * 3)
  const compressedEntries: Uint8Array[] = []
  let compressedOffset = 0

  const attrHash = createHash('sha256')
  const imageHash = createHash('sha256')
  const visualMetricsHash = createHash('sha256')

  for (const row of rows) {
    const parts = row.attributes.split(', ')
    const headVariant = parts[0]
    const accessories = parts.slice(1)
    const normalizedType = normalizeType(headVariant)

    attrHash.update(`${row.id}:${row.attributes}\n`, 'utf8')
    imageHash.update(row.image)

    let mask = 0n
    mask = setBit(
      mask,
      mustGet(traitIdByKindAndName, `${TraitKind.NormalizedType}:${normalizedType}`),
    )
    mask = setBit(
      mask,
      mustGet(traitIdByKindAndName, `${TraitKind.HeadVariant}:${headVariant}`),
    )
    mask = setBit(
      mask,
      mustGet(
        traitIdByKindAndName,
        `${TraitKind.AttributeCount}:${accessories.length} Attributes`,
      ),
    )
    for (const accessory of accessories) {
      mask = setBit(
        mask,
        mustGet(traitIdByKindAndName, `${TraitKind.Accessory}:${accessory}`),
      )
    }
    traitMasks[row.id] = mask
    addMaskToPair(traitMaskPairs, row.id, mask)
    addTraitMemberships(traitBitmaps, traitSupplies, row.id, mask)

    const indexed = rgbaToIndexed(row.image, colorIdByRgba, colorSupplies)
    indexedPixels.set(indexed, row.id * PIXELS_PER_PUNK)

    const visibleColors = sortedVisibleColors(indexed)
    const visiblePixelCount = countVisiblePixels(indexed)
    const visibleColorCount = visibleColors.length
    if (visiblePixelCount < 148 || visiblePixelCount > 332) {
      throw new Error(`Punk ${row.id} visible pixel count ${visiblePixelCount}`)
    }
    if (visibleColorCount < 2 || visibleColorCount > 14) {
      throw new Error(`Punk ${row.id} visible color count ${visibleColorCount}`)
    }

    let colorMask = 0n
    for (const colorId of visibleColors) {
      colorMask = setBit(colorMask, colorId)
      setBitmapBit(colorBitmaps[colorId], row.id)
    }
    colorMasks[row.id] = colorMask
    setBitmapBit(pixelCountBitmaps[visiblePixelCount - 148], row.id)
    setBitmapBit(colorCountBitmaps[visibleColorCount - 2], row.id)

    const typeIndex = NORMALIZED_TYPES.indexOf(normalizedType as (typeof NORMALIZED_TYPES)[number])
    const headIndex = HEAD_VARIANTS.indexOf(headVariant as (typeof HEAD_VARIANTS)[number])
    if (typeIndex < 0 || headIndex < 0) {
      throw new Error(`Unknown type/head for Punk ${row.id}`)
    }
    packScalar(packedScalars, row.id, {
      pixelCount: visiblePixelCount,
      colorCount: visibleColorCount,
      attributeCount: accessories.length,
      punkType: typeIndex,
      headVariant: headIndex,
    })

    const metricLine = `${row.id}:${visiblePixelCount}:${visibleColorCount}:${visibleColors.join(',')}\n`
    visualMetricsHash.update(metricLine, 'utf8')

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
  const compressedPixelsHash = keccakBytes(concatBytes([pixelOffsets, compressedPixels]))
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

  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeBinary('trait-bitmaps.bin', traitBitmapsBytes)
  await writeBinary('trait-meta.bin', traitMeta)
  await writeBinary('palette.bin', paletteBytes)
  await writeBinary('pixel-offsets.bin', pixelOffsets)
  await writeBinary('compressed-pixels.bin', compressedPixels)
  await writeBinary('color-bitmaps.bin', colorBitmapsBytes)
  await writeBinary('pixel-count-bitmaps.bin', pixelCountBitmapsBytes)
  await writeBinary('color-count-bitmaps.bin', colorCountBitmapsBytes)
  await writeBinary('trait-mask-pairs.bin', traitMaskPairsBytes)
  await writeBinary('color-masks.bin', colorMasksBytes)
  await writeBinary('packed-scalars.bin', packedScalarsBytes)
  await writeBinary('color-supplies.bin', colorSuppliesBytes)

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: {
      address: SOURCE_DATA,
      chainId: SOURCE_CHAIN_ID,
      blockNumber: Number(SOURCE_BLOCK_NUMBER),
      blockHash: SOURCE_BLOCK_HASH,
      extcodehash: SOURCE_EXTCODEHASH,
    },
    counts: {
      punks: PUNK_COUNT,
      traits: TRAIT_COUNT,
      colors: palette.length,
    },
    hashes: {
      sourceAttributesSha256: attrHash.digest('hex'),
      sourceImagesSha256: imageHash.digest('hex'),
      visualMetricsSha256: visualMetricsHash.digest('hex'),
      traitCatalogHash,
      punkMaskHash,
      paletteHash,
      indexedPixelsHash,
      compressedPixelsHash,
      datasetHash,
    },
    files: {
      traitBitmaps: 'trait-bitmaps.bin',
      traitMeta: 'trait-meta.bin',
      palette: 'palette.bin',
      pixelOffsets: 'pixel-offsets.bin',
      compressedPixels: 'compressed-pixels.bin',
      colorBitmaps: 'color-bitmaps.bin',
      pixelCountBitmaps: 'pixel-count-bitmaps.bin',
      colorCountBitmaps: 'color-count-bitmaps.bin',
      traitMaskPairs: 'trait-mask-pairs.bin',
      colorMasks: 'color-masks.bin',
      packedScalars: 'packed-scalars.bin',
      colorSupplies: 'color-supplies.bin',
    },
    palette,
    traits,
  }
  await writeFile(join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  console.log(`Wrote ${OUTPUT_DIR}`)
  console.log(`datasetHash ${datasetHash}`)
}

function collectAccessories(rows: PunkRow[]): string[] {
  const accessories = new Set<string>()
  for (const row of rows) {
    const parts = row.attributes.split(', ')
    for (const accessory of parts.slice(1)) accessories.add(accessory)
  }
  return [...accessories].sort(asciiSort)
}

function buildTraitCatalog(accessories: string[]): TraitRecord[] {
  const traits: TraitRecord[] = []
  for (const name of NORMALIZED_TYPES) pushTrait(traits, name, TraitKind.NormalizedType)
  for (const name of HEAD_VARIANTS) pushTrait(traits, name, TraitKind.HeadVariant)
  for (let i = 0; i <= 7; i++) {
    pushTrait(traits, `${i} Attributes`, TraitKind.AttributeCount)
  }
  for (const name of accessories) pushTrait(traits, name, TraitKind.Accessory)
  if (traits.length !== TRAIT_COUNT) throw new Error(`Trait count ${traits.length}`)
  return traits
}

function pushTrait(traits: TraitRecord[], name: string, kind: TraitKind) {
  traits.push({
    id: traits.length,
    name,
    kind,
    supply: 0,
    nameHash: keccakBytes(new TextEncoder().encode(name)),
  })
}

function buildPalette(rows: PunkRow[]): string[] {
  const colors = new Set<string>()
  for (const row of rows) {
    for (let offset = 0; offset < row.image.length; offset += 4) {
      colors.add(rgbaKey(row.image, offset))
    }
  }
  if (!colors.has(TRANSPARENT_RGBA)) throw new Error('Transparent color missing')
  return [TRANSPARENT_RGBA, ...[...colors].filter((c) => c !== TRANSPARENT_RGBA).sort(asciiSort)]
}

function rgbaToIndexed(
  image: Uint8Array,
  colorIdByRgba: Map<string, number>,
  colorSupplies: number[],
): Uint8Array {
  const indexed = new Uint8Array(PIXELS_PER_PUNK)
  for (let pixel = 0; pixel < PIXELS_PER_PUNK; pixel++) {
    const colorId = colorIdByRgba.get(rgbaKey(image, pixel * 4))
    if (colorId === undefined) throw new Error(`Unknown color at pixel ${pixel}`)
    indexed[pixel] = colorId
    colorSupplies[colorId] += 1
  }
  return indexed
}

function encodeSparseIndexed(indexed: Uint8Array, visibleColors: number[]): Uint8Array {
  const colorToLocal = new Map<number, number>()
  visibleColors.forEach((colorId, index) => colorToLocal.set(colorId, index))
  const visibleBitmap = new Uint8Array(72)
  const bitsPerIndex = bitsForPalette(visibleColors.length)
  const visiblePixelCount = countVisiblePixels(indexed)
  const indexBytes = new Uint8Array(Math.ceil((visiblePixelCount * bitsPerIndex) / 8))

  let bitOffset = 0
  for (let pixel = 0; pixel < indexed.length; pixel++) {
    const colorId = indexed[pixel]
    if (colorId === 0) continue
    visibleBitmap[pixel >> 3] |= 1 << (7 - (pixel & 7))
    const localIndex = colorToLocal.get(colorId)
    if (localIndex === undefined) throw new Error(`Missing local color ${colorId}`)
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

function addTraitMemberships(
  bitmaps: bigint[][],
  supplies: number[],
  punkId: number,
  mask: bigint,
) {
  for (let traitId = 0; traitId < TRAIT_COUNT; traitId++) {
    if (((mask >> BigInt(traitId)) & 1n) === 0n) continue
    supplies[traitId] += 1
    setBitmapBit(bitmaps[traitId], punkId)
  }
}

function packScalar(
  packedScalars: bigint[],
  punkId: number,
  scalar: {
    pixelCount: number
    colorCount: number
    attributeCount: number
    punkType: number
    headVariant: number
  },
) {
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

function addMaskToPair(pairs: bigint[], punkId: number, mask: bigint) {
  const pairIndex = Math.floor(punkId / 2)
  if (punkId % 2 === 0) {
    pairs[pairIndex] |= mask
  } else {
    pairs[pairIndex] |= mask << 128n
  }
}

function normalizeType(headVariant: string): string {
  if (headVariant.startsWith('Female')) return 'Female'
  if (headVariant.startsWith('Male')) return 'Male'
  return headVariant
}

function sortedVisibleColors(indexed: Uint8Array): number[] {
  const colors = new Set<number>()
  for (const colorId of indexed) {
    if (colorId !== 0) colors.add(colorId)
  }
  return [...colors].sort((a, b) => a - b)
}

function countVisiblePixels(indexed: Uint8Array): number {
  let count = 0
  for (const colorId of indexed) {
    if (colorId !== 0) count++
  }
  return count
}

function makeBitmapTable(rows: number): bigint[][] {
  return Array.from({ length: rows }, () => new Array<bigint>(WORDS_PER_BITMAP).fill(0n))
}

function setBitmapBit(words: bigint[], punkId: number) {
  const wordIndex = Math.floor(punkId / 256)
  const bitIndex = punkId % 256
  words[wordIndex] |= 1n << BigInt(bitIndex)
}

function setBit(mask: bigint, bit: number): bigint {
  return mask | (1n << BigInt(bit))
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

function writeBits(target: Uint8Array, bitOffset: number, bitLength: number, value: number) {
  for (let i = 0; i < bitLength; i++) {
    const bit = (value >> (bitLength - 1 - i)) & 1
    if (bit === 0) continue
    const absoluteBit = bitOffset + i
    target[absoluteBit >> 3] |= 1 << (7 - (absoluteBit & 7))
  }
}

function encodeTraitMeta(traits: TraitRecord[]): Uint8Array {
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

function encodeTraitCatalogForHash(traits: TraitRecord[]): Uint8Array {
  const parts: Uint8Array[] = []
  for (const trait of traits) {
    parts.push(new TextEncoder().encode(trait.name), Uint8Array.of(trait.kind))
  }
  return concatBytes(parts)
}

function encodePalette(palette: string[]): Uint8Array {
  const out = new Uint8Array(palette.length * 4)
  palette.forEach((rgba, index) => {
    for (let i = 0; i < 4; i++) {
      out[index * 4 + i] = Number.parseInt(rgba.slice(i * 2, i * 2 + 2), 16)
    }
  })
  return out
}

function encodeBitmapTable(table: bigint[][]): Uint8Array {
  return encodeWordArray(table.flat())
}

function encodeWordArray(words: bigint[]): Uint8Array {
  const out = new Uint8Array(words.length * 32)
  words.forEach((word, index) => writeUint256(out, index * 32, word))
  return out
}

function encodeUint32Array(values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4)
  values.forEach((value, index) => writeUint32(out, index * 4, value))
  return out
}

function rgbaKey(bytes: Uint8Array, offset: number): string {
  return [...bytes.slice(offset, offset + 4)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function writeUint16(out: Uint8Array, offset: number, value: number) {
  out[offset] = (value >> 8) & 0xff
  out[offset + 1] = value & 0xff
}

function writeUint24(out: Uint8Array, offset: number, value: number) {
  if (value > 0xffffff) throw new Error(`uint24 overflow ${value}`)
  out[offset] = (value >> 16) & 0xff
  out[offset + 1] = (value >> 8) & 0xff
  out[offset + 2] = value & 0xff
}

function writeUint32(out: Uint8Array, offset: number, value: number) {
  out[offset] = (value >>> 24) & 0xff
  out[offset + 1] = (value >>> 16) & 0xff
  out[offset + 2] = (value >>> 8) & 0xff
  out[offset + 3] = value & 0xff
}

function writeUint256(out: Uint8Array, offset: number, value: bigint) {
  for (let i = 31; i >= 0; i--) {
    out[offset + i] = Number(value & 0xffn)
    value >>= 8n
  }
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function hexToBytes(hex: Hex): Uint8Array {
  const clean = hex.slice(2)
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function keccakBytes(bytes: Uint8Array): Hex {
  return keccak256(bytesToHex(bytes))
}

function asciiSort(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function mustGet<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key)
  if (value === undefined) throw new Error(`Missing key ${String(key)}`)
  return value
}

async function readRawPunkCache(id: number): Promise<PunkRow | undefined> {
  if (!RAW_CACHE_ENABLED) return undefined

  try {
    const parsed = JSON.parse(await readFile(rawPunkCachePath(id), 'utf8')) as unknown
    if (!isRawPunkCache(parsed, id)) return undefined

    const image = hexToBytes(parsed.image)
    if (image.length !== RGBA_BYTES_PER_PUNK) return undefined

    const imageSha256 = sha256Hex(image)
    if (parsed.imageSha256 !== imageSha256) return undefined

    return {
      id,
      attributes: parsed.attributes,
      image,
    }
  } catch (error) {
    if (isMissingFileError(error)) return undefined
    console.warn(`  ignoring invalid raw cache for Punk ${id}: ${shortError(error)}`)
    return undefined
  }
}

async function writeRawPunkCache(row: PunkRow): Promise<void> {
  if (!RAW_CACHE_ENABLED) return

  const payload: RawPunkCache = {
    version: 1,
    source: {
      address: SOURCE_DATA,
      chainId: SOURCE_CHAIN_ID,
      blockNumber: Number(SOURCE_BLOCK_NUMBER),
    },
    id: row.id,
    attributes: row.attributes,
    image: bytesToHex(row.image),
    imageSha256: sha256Hex(row.image),
  }

  const path = rawPunkCachePath(row.id)
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmpPath, `${JSON.stringify(payload)}\n`)
  await rename(tmpPath, path)
}

function isRawPunkCache(value: unknown, id: number): value is RawPunkCache {
  if (!isRecord(value)) return false
  if (value.version !== 1 || value.id !== id) return false
  if (typeof value.attributes !== 'string' || value.attributes.length === 0) return false
  if (typeof value.image !== 'string' || !/^0x[0-9a-fA-F]*$/.test(value.image)) {
    return false
  }
  if (typeof value.imageSha256 !== 'string') return false
  if (!isRecord(value.source)) return false
  if (
    typeof value.source.address !== 'string'
      || typeof value.source.chainId !== 'number'
      || typeof value.source.blockNumber !== 'number'
  ) return false

  return value.source.address.toLowerCase() === SOURCE_DATA.toLowerCase()
    && value.source.chainId === SOURCE_CHAIN_ID
    && value.source.blockNumber === Number(SOURCE_BLOCK_NUMBER)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function rawPunkCachePath(id: number): string {
  return join(RAW_CACHE_DIR, `${String(id).padStart(4, '0')}.json`)
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT'
}

async function withRpcRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= RPC_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === RPC_RETRIES) break

      const delayMs = retryDelayMs(attempt, isRateLimitError(error))
      console.warn(
        `  retry ${label} in ${delayMs}ms (attempt ${attempt + 1}/${RPC_RETRIES}): ${shortError(error)}`,
      )
      await sleep(delayMs)
    }
  }
  throw lastError
}

function retryDelayMs(attempt: number, rateLimited: boolean): number {
  const exponential = RPC_RETRY_BASE_MS * 2 ** attempt
  const capped = Math.min(exponential, RPC_RETRY_MAX_MS)
  const floor = rateLimited ? Math.max(capped, 2_500) : capped
  return floor + Math.floor(Math.random() * 250)
}

function shortError(error: unknown): string {
  const text = errorText(error)
  const status = statusCode(error)
  if (status !== undefined) return `status ${status}`
  return text.split('\n')[0].slice(0, 160)
}

function isRateLimitError(error: unknown): boolean {
  return statusCode(error) === 429 || /429|too many requests|rate limit/i.test(errorText(error))
}

function statusCode(error: unknown): number | undefined {
  let current: unknown = error
  while (current !== undefined && current !== null) {
    if (typeof current === 'object' && 'status' in current) {
      const status = Number((current as { status?: unknown }).status)
      if (Number.isInteger(status)) return status
    }
    current = typeof current === 'object' && 'cause' in current
      ? (current as { cause?: unknown }).cause
      : undefined
  }
  return undefined
}

function errorText(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  while (current !== undefined && current !== null) {
    if (current instanceof Error) parts.push(`${current.name}: ${current.message}`)
    else parts.push(String(current))

    if (typeof current === 'object' && 'details' in current) {
      const details = (current as { details?: unknown }).details
      if (typeof details === 'string') parts.push(details)
    }

    current = typeof current === 'object' && 'cause' in current
      ? (current as { cause?: unknown }).cause
      : undefined
  }
  return parts.join('\n')
}

function sleep(ms: number): Promise<void> {
  if (ms === 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = readNonNegativeIntEnv(name, fallback)
  if (value === 0) throw new Error(`${name} must be greater than zero`)
  return value
}

function readNonNegativeIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return value
}

function redactRpcUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.username !== '') parsed.username = '...'
    if (parsed.password !== '') parsed.password = '...'
    const pathSegments = parsed.pathname.split('/').filter(Boolean)
    if (pathSegments.length > 1) {
      parsed.pathname = `/${pathSegments[0]}/...`
    } else if (pathSegments.length === 1 && pathSegments[0].length > 12) {
      parsed.pathname = '/...'
    }
    for (const key of parsed.searchParams.keys()) {
      parsed.searchParams.set(key, '...')
    }
    return parsed.toString()
  } catch {
    return '<custom rpc>'
  }
}

async function writeBinary(fileName: string, bytes: Uint8Array) {
  await writeFile(join(OUTPUT_DIR, fileName), Buffer.from(bytes))
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let stopped = false
  async function worker() {
    while (!stopped) {
      const index = next++
      if (index >= items.length) return
      try {
        results[index] = await fn(items[index])
      } catch (error) {
        stopped = true
        throw error
      }
    }
  }
  const settled = await Promise.allSettled(Array.from({ length: limit }, worker))
  const failure = settled.find((result) => result.status === 'rejected')
  if (failure !== undefined && failure.status === 'rejected') throw failure.reason
  return results
}

await main()
