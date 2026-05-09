import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  HEAD_VARIANTS,
  NORMALIZED_TYPES,
  PIXELS_PER_PUNK,
  PUNK_COUNT,
  TRANSPARENT_RGBA,
  countVisiblePixels,
  encodeSparseIndexed,
  parseAttributes,
  rgbaToIndexed,
  rgbaKey,
  sortedVisibleColors,
  type BuiltDataset,
  type SourceRow,
} from '../scripts/lib/punks-builder.js'
import {
  assertColorMaskPopcountMatches,
  assertCompressedPixelsRoundTripToSource,
  assertHeadTypeConsistency,
  assertVisiblePixelCountMatchesScalar,
} from '../scripts/lib/punks-invariants.js'

const SCALARS_PER_WORD = 5
const PLACEHOLDER_PIXEL_COUNT = 148
const PLACEHOLDER_COLOR_COUNT = 2
const SNAPSHOT_DIR = 'test/fixtures'
const SNAPSHOT_JSON = join(SNAPSHOT_DIR, 'source-snapshot.json')
const SNAPSHOT_BIN = join(SNAPSHOT_DIR, 'source-snapshot.bin')
const SNAPSHOT_PRESENT = existsSync(SNAPSHOT_JSON) && existsSync(SNAPSHOT_BIN)

type Snapshot = {
  bytesPerImage: number
  snapshotIds: number[]
  attributes: string[]
  images: Uint8Array[]
}

describe('PunksData generator invariants', () => {
  if (!SNAPSHOT_PRESENT) {
    it('snapshot fixture missing — run `npm run snapshot:source`', () => {
      assert.ok(false, `${SNAPSHOT_JSON} not found`)
    })
    return
  }

  it('decoded compressed pixels round-trip to source punkImage bytes', async () => {
    const { dataset, rows, ids } = await buildPartialDatasetFromSnapshot()
    assertCompressedPixelsRoundTripToSource(dataset, rows, ids)
  })

  it('visible pixel count matches scalar.pixelCount', async () => {
    const { dataset, ids } = await buildPartialDatasetFromSnapshot()
    assertVisiblePixelCountMatchesScalar(dataset, ids)
  })

  it('color mask popcount matches scalar.colorCount and excludes transparent', async () => {
    const { dataset, ids } = await buildPartialDatasetFromSnapshot()
    assertColorMaskPopcountMatches(dataset, ids)
  })

  it('scalar head variant maps to the matching normalized type', async () => {
    const { dataset, rows, ids } = await buildPartialDatasetFromSnapshot()
    assertHeadTypeConsistency(dataset, rows, ids)
  })
})

async function loadSnapshot(): Promise<Snapshot> {
  const json = JSON.parse(await readFile(SNAPSHOT_JSON, 'utf8')) as {
    bytesPerImage: number
    snapshotIds: number[]
    attributes: string[]
  }
  const bin = new Uint8Array(await readFile(SNAPSHOT_BIN))
  const images: Uint8Array[] = []
  for (let i = 0; i < json.snapshotIds.length; i++) {
    images.push(bin.subarray(i * json.bytesPerImage, (i + 1) * json.bytesPerImage))
  }
  return { ...json, images }
}

async function buildPartialDatasetFromSnapshot(): Promise<{
  dataset: BuiltDataset
  rows: SourceRow[]
  ids: number[]
}> {
  const snapshot = await loadSnapshot()
  const palette = buildSnapshotPalette(snapshot)
  const colorIdByRgba = new Map<string, number>()
  palette.forEach((rgba, index) => colorIdByRgba.set(rgba, index))

  const indexedPixels = new Uint8Array(PUNK_COUNT * PIXELS_PER_PUNK)
  const colorMasks = new Array<bigint>(PUNK_COUNT).fill(0n)
  const packedScalars = new Array<bigint>(Math.ceil(PUNK_COUNT / SCALARS_PER_WORD)).fill(0n)
  const pixelOffsets = new Uint8Array((PUNK_COUNT + 1) * 3)
  const compressedEntries: Uint8Array[] = []
  const offsets = new Map<number, { start: number; end: number }>()
  let cursor = 0

  const rows: SourceRow[] = snapshot.snapshotIds.map((id, i) => ({
    id,
    attributes: snapshot.attributes[i],
    image: snapshot.images[i],
  }))

  for (const row of rows) {
    const indexed = rgbaToIndexed(row.image, colorIdByRgba)
    indexedPixels.set(indexed, row.id * PIXELS_PER_PUNK)

    const visibleColors = sortedVisibleColors(indexed)
    const visibleColorCount = visibleColors.length
    const visiblePixelCount = countVisiblePixels(indexed)
    const parsed = parseAttributes(row.attributes)
    const headIndex = HEAD_VARIANTS.indexOf(parsed.headVariant as (typeof HEAD_VARIANTS)[number])
    const typeIndex = NORMALIZED_TYPES.indexOf(
      parsed.normalizedType as (typeof NORMALIZED_TYPES)[number],
    )
    if (headIndex < 0 || typeIndex < 0) {
      throw new Error(`Punk ${row.id}: unknown head/type ${parsed.headVariant}`)
    }

    let colorMask = 0n
    for (const colorId of visibleColors) colorMask |= 1n << BigInt(colorId)
    colorMasks[row.id] = colorMask

    setScalarSlot(packedScalars, row.id, {
      pixelCount: visiblePixelCount,
      colorCount: visibleColorCount,
      attributeCount: parsed.accessories.length,
      punkType: typeIndex,
      headVariant: headIndex,
    })

    const entry = encodeSparseIndexed(indexed, visibleColors)
    offsets.set(row.id, { start: cursor, end: cursor + entry.length })
    compressedEntries.push(entry)
    cursor += entry.length
  }

  let running = 0
  for (let i = 0; i <= PUNK_COUNT; i++) {
    if (i < PUNK_COUNT && offsets.has(i)) {
      const { start, end } = offsets.get(i)!
      writeUint24(pixelOffsets, i * 3, start)
      running = end
    } else {
      writeUint24(pixelOffsets, i * 3, running)
    }
  }

  const dataset = makePartialDataset({
    palette,
    indexedPixels,
    colorMasks,
    packedScalars,
    pixelOffsets,
    compressedPixels: concat(compressedEntries),
  })

  return { dataset, rows, ids: [...snapshot.snapshotIds] }
}

function buildSnapshotPalette(snapshot: Snapshot): string[] {
  const colors = new Set<string>()
  for (const image of snapshot.images) {
    for (let offset = 0; offset < image.length; offset += 4) {
      colors.add(rgbaKey(image, offset))
    }
  }
  const sorted = [...colors]
    .filter((c) => c !== TRANSPARENT_RGBA)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return [TRANSPARENT_RGBA, ...sorted]
}

function setScalarSlot(
  packedScalars: bigint[],
  punkId: number,
  scalar: {
    pixelCount: number
    colorCount: number
    attributeCount: number
    punkType: number
    headVariant: number
  },
): void {
  const wordIndex = Math.floor(punkId / SCALARS_PER_WORD)
  const slot = punkId % SCALARS_PER_WORD
  const value =
    BigInt(scalar.pixelCount) |
    (BigInt(scalar.colorCount) << 16n) |
    (BigInt(scalar.attributeCount) << 24n) |
    (BigInt(scalar.punkType) << 32n) |
    (BigInt(scalar.headVariant) << 40n)
  // Initialize the word with placeholder slots if it's still 0 (so the popcount /
  // visiblePixelCount invariants don't blow up on adjacent slots if they were
  // ever asserted).
  if (packedScalars[wordIndex] === 0n) {
    const placeholder =
      BigInt(PLACEHOLDER_PIXEL_COUNT) | (BigInt(PLACEHOLDER_COLOR_COUNT) << 16n)
    let word = 0n
    for (let s = 0; s < SCALARS_PER_WORD; s++) word |= placeholder << BigInt(s * 48)
    packedScalars[wordIndex] = word
  }
  // Clear the slot then write the real scalar.
  const slotMask = (1n << 48n) - 1n
  const shift = BigInt(slot * 48)
  packedScalars[wordIndex] = (packedScalars[wordIndex] & ~(slotMask << shift)) | (value << shift)
}

function makePartialDataset(parts: {
  palette: string[]
  indexedPixels: Uint8Array
  colorMasks: bigint[]
  packedScalars: bigint[]
  pixelOffsets: Uint8Array
  compressedPixels: Uint8Array
}): BuiltDataset {
  // Most fields aren't read by the per-Punk invariants we're asserting; fill
  // them with empties to satisfy the BuiltDataset shape.
  const empty = new Uint8Array(0)
  return {
    traits: [],
    palette: parts.palette,
    traitMasks: [],
    traitMaskPairs: [],
    packedScalars: parts.packedScalars,
    colorMasks: parts.colorMasks,
    colorSupplies: [],
    indexedPixels: parts.indexedPixels,
    pixelOffsets: parts.pixelOffsets,
    compressedPixels: parts.compressedPixels,
    traitBitmapsBytes: empty,
    colorBitmapsBytes: empty,
    pixelCountBitmapsBytes: empty,
    colorCountBitmapsBytes: empty,
    traitMeta: empty,
    paletteBytes: empty,
    traitMaskPairsBytes: empty,
    colorMasksBytes: empty,
    packedScalarsBytes: empty,
    colorSuppliesBytes: empty,
    traitCatalogHash: '0x0',
    punkMaskHash: '0x0',
    paletteHash: '0x0',
    indexedPixelsHash: '0x0',
    compressedPixelsHash: '0x0',
    datasetHash: '0x0',
  } as BuiltDataset
}

function writeUint24(out: Uint8Array, offset: number, value: number) {
  out[offset] = (value >> 16) & 0xff
  out[offset + 1] = (value >> 8) & 0xff
  out[offset + 2] = value & 0xff
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
