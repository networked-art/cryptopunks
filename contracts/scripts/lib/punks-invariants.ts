import {
  HEAD_VARIANTS,
  HEAD_VARIANT_TO_TYPE,
  NORMALIZED_TYPES,
  PIXELS_PER_PUNK,
  PUNK_COUNT,
  RGBA_BYTES_PER_PUNK,
  type BuiltDataset,
  type SourceRow,
  decodeSparseIndexed,
  indexedToRgba,
  parseAttributes,
  popcount,
} from './punks-builder.js'

const SCALAR_BITS = 48n
const SCALARS_PER_WORD = 5

function unpackScalar(packedScalars: bigint[], punkId: number) {
  const wordIndex = Math.floor(punkId / SCALARS_PER_WORD)
  const slot = punkId % SCALARS_PER_WORD
  const word = packedScalars[wordIndex]
  const scalar =
    (word >> (BigInt(slot) * SCALAR_BITS)) & ((1n << SCALAR_BITS) - 1n)
  return {
    pixelCount: Number(scalar & 0xffffn),
    colorCount: Number((scalar >> 16n) & 0xffn),
    attributeCount: Number((scalar >> 24n) & 0xffn),
    punkType: Number((scalar >> 32n) & 0xffn),
    headVariant: Number((scalar >> 40n) & 0xffn),
  }
}

export function assertPopcountMatchesAttributeCount(
  dataset: BuiltDataset,
  ids?: number[],
): void {
  const targets = ids ?? Array.from({ length: PUNK_COUNT }, (_, i) => i)
  for (const punkId of targets) {
    const mask = dataset.traitMasks[punkId]
    const scalar = unpackScalar(dataset.packedScalars, punkId)
    const expected = 3 + scalar.attributeCount
    const actual = popcount(mask)
    if (actual !== expected) {
      throw new Error(
        `Punk ${punkId}: popcount(mask)=${actual}, expected ${expected} (3 + attributeCount ${scalar.attributeCount})`,
      )
    }
  }
}

export function assertHeadTypeConsistency(
  dataset: BuiltDataset,
  rows: SourceRow[],
  ids?: number[],
): void {
  const targets = ids ?? Array.from({ length: PUNK_COUNT }, (_, i) => i)
  const rowById = new Map(rows.map((r) => [r.id, r]))
  for (const punkId of targets) {
    const row = rowById.get(punkId)
    if (!row) continue
    const parsed = parseAttributes(row.attributes)
    const expectedType =
      HEAD_VARIANT_TO_TYPE[parsed.headVariant as (typeof HEAD_VARIANTS)[number]]
    if (expectedType === undefined) {
      throw new Error(
        `Punk ${punkId}: unknown head variant ${parsed.headVariant}`,
      )
    }
    const scalar = unpackScalar(dataset.packedScalars, punkId)
    const actualType = NORMALIZED_TYPES[scalar.punkType]
    const actualHead = HEAD_VARIANTS[scalar.headVariant]
    if (actualType !== expectedType) {
      throw new Error(
        `Punk ${punkId}: scalar punkType=${actualType}, expected ${expectedType}`,
      )
    }
    if (actualHead !== parsed.headVariant) {
      throw new Error(
        `Punk ${punkId}: scalar headVariant=${actualHead}, expected ${parsed.headVariant}`,
      )
    }
  }
}

export function assertTraitSupplySumsMatch(dataset: BuiltDataset): void {
  let maskPopSum = 0
  for (const mask of dataset.traitMasks) maskPopSum += popcount(mask)
  let supplySum = 0
  for (const trait of dataset.traits) supplySum += trait.supply
  if (maskPopSum !== supplySum) {
    throw new Error(
      `Σ popcount(traitMasks)=${maskPopSum} != Σ traitSupply=${supplySum}`,
    )
  }
}

export function assertPaletteAlphas(dataset: BuiltDataset): void {
  let transparentCount = 0
  for (let i = 0; i < dataset.palette.length; i++) {
    const alphaHex = dataset.palette[i].slice(6, 8)
    const alpha = Number.parseInt(alphaHex, 16)
    if (alpha !== 0x00 && alpha !== 0x80 && alpha !== 0xff) {
      throw new Error(
        `palette[${i}] alpha=0x${alphaHex} not in {0x00, 0x80, 0xff}`,
      )
    }
    if (alpha === 0x00) transparentCount += 1
  }
  if (transparentCount !== 1) {
    throw new Error(
      `Expected exactly one transparent palette entry, got ${transparentCount}`,
    )
  }
}

export function assertColorMaskPopcountMatches(
  dataset: BuiltDataset,
  ids?: number[],
): void {
  const targets = ids ?? Array.from({ length: PUNK_COUNT }, (_, i) => i)
  for (const punkId of targets) {
    const mask = dataset.colorMasks[punkId]
    const scalar = unpackScalar(dataset.packedScalars, punkId)
    const actual = popcount(mask)
    if (actual !== scalar.colorCount) {
      throw new Error(
        `Punk ${punkId}: popcount(colorMask)=${actual}, expected colorCount=${scalar.colorCount}`,
      )
    }
    if ((mask & 1n) !== 0n) {
      throw new Error(`Punk ${punkId}: colorMask has transparent bit set`)
    }
  }
}

export function assertCompressedPixelsRoundTripToSource(
  dataset: BuiltDataset,
  rows: SourceRow[],
  ids?: number[],
): void {
  const rowById = new Map(rows.map((r) => [r.id, r]))
  const targets = ids ?? Array.from({ length: PUNK_COUNT }, (_, i) => i)
  for (const punkId of targets) {
    const row = rowById.get(punkId)
    if (!row) continue
    const start = readUint24(dataset.pixelOffsets, punkId * 3)
    const end = readUint24(dataset.pixelOffsets, (punkId + 1) * 3)
    if (end <= start) {
      throw new Error(`Punk ${punkId}: empty compressed entry`)
    }
    const entry = dataset.compressedPixels.slice(start, end)
    const decoded = decodeSparseIndexed(entry, dataset.palette.length)
    if (decoded.length !== PIXELS_PER_PUNK) {
      throw new Error(`Punk ${punkId}: decoded length ${decoded.length}`)
    }
    const decodedFromIndexedPixels = dataset.indexedPixels.subarray(
      punkId * PIXELS_PER_PUNK,
      (punkId + 1) * PIXELS_PER_PUNK,
    )
    if (!bytesEqual(decoded, decodedFromIndexedPixels)) {
      throw new Error(
        `Punk ${punkId}: decoded sparse pixels != stored indexedPixels`,
      )
    }
    const reconstructedRgba = indexedToRgba(decoded, dataset.palette)
    if (reconstructedRgba.length !== RGBA_BYTES_PER_PUNK) {
      throw new Error(
        `Punk ${punkId}: reconstructed rgba length ${reconstructedRgba.length}`,
      )
    }
    if (!bytesEqual(reconstructedRgba, row.image)) {
      throw new Error(`Punk ${punkId}: reconstructed rgba != source punkImage`)
    }
  }
}

export function assertVisiblePixelCountMatchesScalar(
  dataset: BuiltDataset,
  ids?: number[],
): void {
  const targets = ids ?? Array.from({ length: PUNK_COUNT }, (_, i) => i)
  for (const punkId of targets) {
    const slice = dataset.indexedPixels.subarray(
      punkId * PIXELS_PER_PUNK,
      (punkId + 1) * PIXELS_PER_PUNK,
    )
    let visible = 0
    for (const colorId of slice) if (colorId !== 0) visible += 1
    const scalar = unpackScalar(dataset.packedScalars, punkId)
    if (visible !== scalar.pixelCount) {
      throw new Error(
        `Punk ${punkId}: visible pixels=${visible} != scalar.pixelCount=${scalar.pixelCount}`,
      )
    }
  }
}

export function assertAllInvariants(
  dataset: BuiltDataset,
  rows: SourceRow[],
  ids?: number[],
): void {
  assertPopcountMatchesAttributeCount(dataset, ids)
  assertHeadTypeConsistency(dataset, rows, ids)
  assertTraitSupplySumsMatch(dataset)
  assertPaletteAlphas(dataset)
  assertColorMaskPopcountMatches(dataset, ids)
  assertVisiblePixelCountMatchesScalar(dataset, ids)
  assertCompressedPixelsRoundTripToSource(dataset, rows, ids)
}

function readUint24(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2]
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
