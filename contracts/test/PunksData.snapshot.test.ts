import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { network } from 'hardhat'
import { bytesToHex } from 'viem'

import {
  PIXELS_PER_PUNK,
  PUNK_COUNT,
  TRANSPARENT_RGBA,
  countVisiblePixels,
  encodeSparseIndexed,
  hexToBytes,
  parseAttributes,
  rgbaToIndexed,
  rgbaKey,
  sortedVisibleColors,
  HEAD_VARIANTS,
  NORMALIZED_TYPES,
} from '../scripts/lib/punks-builder.js'

const PALETTE_BYTES = 222 * 4
const PIXEL_OFFSETS_BYTES = (PUNK_COUNT + 1) * 3
const SCALARS_PER_WORD = 5
const PLACEHOLDER_PIXEL_COUNT = 148
const PLACEHOLDER_COLOR_COUNT = 2
const SNAPSHOT_DIR = 'test/fixtures'
const SNAPSHOT_JSON = join(SNAPSHOT_DIR, 'source-snapshot.json')
const SNAPSHOT_BIN = join(SNAPSHOT_DIR, 'source-snapshot.bin')

enum BlobId {
  TraitBitmaps,
  TraitMeta,
  Palette,
  PixelOffsets,
  CompressedPixels,
  ColorBitmaps,
  PixelCountBitmaps,
  ColorCountBitmaps,
}

type Snapshot = {
  source: { blockNumber: number; blockHash: string; extcodehash: string }
  bytesPerImage: number
  snapshotIds: number[]
  attributes: string[]
  images: Uint8Array[]
}

const SNAPSHOT_PRESENT = existsSync(SNAPSHOT_JSON) && existsSync(SNAPSHOT_BIN)

describe('PunksData snapshot', () => {
  if (!SNAPSHOT_PRESENT) {
    it('snapshot fixture missing — run `npm run snapshot:source`', () => {
      assert.ok(
        false,
        `${SNAPSHOT_JSON} / ${SNAPSHOT_BIN} not found. Run \`npm run snapshot:source\` to fetch them.`,
      )
    })
    return
  }

  it('decodes indexed pixels that palette-expand to source punkImage bytes', async () => {
    const snapshot = await loadSnapshot()
    const ctx = await deployWithSnapshot(snapshot)

    for (let i = 0; i < snapshot.snapshotIds.length; i++) {
      const id = snapshot.snapshotIds[i]
      const expectedIndexed = rgbaToIndexed(
        snapshot.images[i],
        ctx.colorIdByRgba,
      )

      const onchainHex = await ctx.data.read.indexedPixelsOf([id])
      const onchain = hexToBytes(onchainHex)

      assert.equal(
        onchain.length,
        PIXELS_PER_PUNK,
        `Punk ${id}: indexed length`,
      )
      assert.deepEqual(onchain, expectedIndexed, `Punk ${id}: indexed pixels`)

      const expandedRgba = expandPalette(onchain, ctx.palette)
      assert.deepEqual(
        expandedRgba,
        snapshot.images[i],
        `Punk ${id}: palette-expanded RGBA != source punkImage`,
      )
    }
  })

  it('reports correct visual scalars for snapshot Punks', async () => {
    const snapshot = await loadSnapshot()
    const ctx = await deployWithSnapshot(snapshot)

    for (let i = 0; i < snapshot.snapshotIds.length; i++) {
      const id = snapshot.snapshotIds[i]
      const indexed = rgbaToIndexed(snapshot.images[i], ctx.colorIdByRgba)
      const expectedPixels = countVisiblePixels(indexed)
      const expectedColors = sortedVisibleColors(indexed).length
      const parsed = parseAttributes(snapshot.attributes[i])
      const expectedHead = HEAD_VARIANTS.indexOf(
        parsed.headVariant as (typeof HEAD_VARIANTS)[number],
      )
      const expectedType = NORMALIZED_TYPES.indexOf(
        parsed.normalizedType as (typeof NORMALIZED_TYPES)[number],
      )

      assert.equal(
        await ctx.data.read.pixelCountOf([id]),
        expectedPixels,
        `Punk ${id}: pixelCount`,
      )
      assert.equal(
        await ctx.data.read.colorCountOf([id]),
        expectedColors,
        `Punk ${id}: colorCount`,
      )
      assert.equal(
        await ctx.data.read.attributeCountOf([id]),
        parsed.accessories.length,
        `Punk ${id}: attributeCount`,
      )
      assert.equal(
        await ctx.data.read.headVariantOf([id]),
        expectedHead,
        `Punk ${id}: headVariant`,
      )
      assert.equal(
        await ctx.data.read.punkTypeOf([id]),
        expectedType,
        `Punk ${id}: punkType`,
      )
    }
  })

  it('reports correct color masks for snapshot Punks', async () => {
    const snapshot = await loadSnapshot()
    const ctx = await deployWithSnapshot(snapshot)

    for (let i = 0; i < snapshot.snapshotIds.length; i++) {
      const id = snapshot.snapshotIds[i]
      const indexed = rgbaToIndexed(snapshot.images[i], ctx.colorIdByRgba)
      const visibleColors = sortedVisibleColors(indexed)
      let expectedMask = 0n
      for (const colorId of visibleColors) expectedMask |= 1n << BigInt(colorId)

      assert.equal(
        await ctx.data.read.colorMaskOf([id]),
        expectedMask,
        `Punk ${id}: colorMask`,
      )

      assert.equal(
        await ctx.data.read.hasColor([id, 0]),
        false,
        `Punk ${id}: transparent excluded`,
      )
      for (const colorId of visibleColors) {
        assert.equal(
          await ctx.data.read.hasColor([id, colorId]),
          true,
          `Punk ${id}: hasColor(${colorId})`,
        )
      }
    }
  })
})

async function loadSnapshot(): Promise<Snapshot> {
  const json = JSON.parse(await readFile(SNAPSHOT_JSON, 'utf8')) as {
    source: { blockNumber: number; blockHash: string; extcodehash: string }
    bytesPerImage: number
    snapshotIds: number[]
    attributes: string[]
  }
  const bin = new Uint8Array(await readFile(SNAPSHOT_BIN))
  const images: Uint8Array[] = []
  for (let i = 0; i < json.snapshotIds.length; i++) {
    images.push(
      bin.subarray(i * json.bytesPerImage, (i + 1) * json.bytesPerImage),
    )
  }
  return { ...json, images }
}

type SnapshotCtx = {
  data: any
  palette: string[]
  colorIdByRgba: Map<string, number>
}

async function deployWithSnapshot(snapshot: Snapshot): Promise<SnapshotCtx> {
  const palette = buildSnapshotPalette(snapshot)
  const colorIdByRgba = new Map<string, number>()
  palette.forEach((rgba, index) => colorIdByRgba.set(rgba, index))

  const compressedEntries: Uint8Array[] = []
  const offsets = new Map<number, { start: number; end: number }>()
  let cursor = 0
  for (let i = 0; i < snapshot.snapshotIds.length; i++) {
    const id = snapshot.snapshotIds[i]
    const indexed = rgbaToIndexed(snapshot.images[i], colorIdByRgba)
    const visibleColors = sortedVisibleColors(indexed)
    const entry = encodeSparseIndexed(indexed, visibleColors)
    offsets.set(id, { start: cursor, end: cursor + entry.length })
    compressedEntries.push(entry)
    cursor += entry.length
  }
  const compressedPixels = concat(compressedEntries)

  const pixelOffsets = new Uint8Array(PIXEL_OFFSETS_BYTES)
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

  const paletteBytes = encodePalette(palette)
  const colorMaskGroups = buildColorMaskGroups(snapshot, colorIdByRgba)
  const packedScalarGroups = buildPackedScalarGroups(snapshot, colorIdByRgba)

  const connection: any = await network.create()
  const { viem } = connection
  const [deployer] = await viem.getWalletClients()
  const data = await viem.deployContract('PunksData', [
    deployer.account.address,
  ])

  await loadBlob(data, BlobId.Palette, paletteBytes)
  await loadBlob(data, BlobId.PixelOffsets, pixelOffsets)
  await loadBlob(data, BlobId.CompressedPixels, compressedPixels)

  for (const { start, values } of colorMaskGroups) {
    await data.write.loadColorMasks([start, values])
  }
  for (const { start, values } of packedScalarGroups) {
    await data.write.loadPackedScalars([start, values])
  }

  return { data, palette, colorIdByRgba }
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
  const palette = [TRANSPARENT_RGBA, ...sorted]
  // Pad to 222 entries with sentinel colors that no real Punk image uses.
  // The contract reads only IDs that snapshot Punks reference, so padding
  // is never indexed.
  let pad = 0
  while (palette.length < 222) {
    palette.push(`f${(pad++).toString(16).padStart(7, '0')}`)
  }
  if (palette.length !== 222) throw new Error(`palette size ${palette.length}`)
  return palette
}

function buildColorMaskGroups(
  snapshot: Snapshot,
  colorIdByRgba: Map<string, number>,
): Array<{ start: number; values: bigint[] }> {
  return snapshot.snapshotIds.map((id, i) => {
    const indexed = rgbaToIndexed(snapshot.images[i], colorIdByRgba)
    let mask = 0n
    for (const colorId of sortedVisibleColors(indexed))
      mask |= 1n << BigInt(colorId)
    return { start: id, values: [mask] }
  })
}

function buildPackedScalarGroups(
  snapshot: Snapshot,
  colorIdByRgba: Map<string, number>,
): Array<{ start: number; values: bigint[] }> {
  const wordSlots = new Map<number, Map<number, bigint>>()
  for (let i = 0; i < snapshot.snapshotIds.length; i++) {
    const id = snapshot.snapshotIds[i]
    const wordIndex = Math.floor(id / SCALARS_PER_WORD)
    const slot = id % SCALARS_PER_WORD
    const indexed = rgbaToIndexed(snapshot.images[i], colorIdByRgba)
    const visiblePixelCount = countVisiblePixels(indexed)
    const visibleColorCount = sortedVisibleColors(indexed).length
    const parsed = parseAttributes(snapshot.attributes[i])
    const headIndex = HEAD_VARIANTS.indexOf(
      parsed.headVariant as (typeof HEAD_VARIANTS)[number],
    )
    const typeIndex = NORMALIZED_TYPES.indexOf(
      parsed.normalizedType as (typeof NORMALIZED_TYPES)[number],
    )
    if (headIndex < 0 || typeIndex < 0) {
      throw new Error(`Punk ${id}: unknown head/type ${parsed.headVariant}`)
    }
    const scalar =
      BigInt(visiblePixelCount) |
      (BigInt(visibleColorCount) << 16n) |
      (BigInt(parsed.accessories.length) << 24n) |
      (BigInt(typeIndex) << 32n) |
      (BigInt(headIndex) << 40n)
    if (!wordSlots.has(wordIndex)) wordSlots.set(wordIndex, new Map())
    wordSlots.get(wordIndex)!.set(slot, scalar)
  }

  const placeholder =
    BigInt(PLACEHOLDER_PIXEL_COUNT) | (BigInt(PLACEHOLDER_COLOR_COUNT) << 16n)

  const out: Array<{ start: number; values: bigint[] }> = []
  for (const [wordIndex, slots] of wordSlots) {
    let word = 0n
    for (let s = 0; s < SCALARS_PER_WORD; s++) {
      const value = slots.get(s) ?? placeholder
      word |= value << BigInt(s * 48)
    }
    out.push({ start: wordIndex, values: [word] })
  }
  return out
}

function encodePalette(palette: string[]): Uint8Array {
  const out = new Uint8Array(PALETTE_BYTES)
  palette.forEach((rgba, index) => {
    for (let i = 0; i < 4; i++) {
      out[index * 4 + i] = Number.parseInt(rgba.slice(i * 2, i * 2 + 2), 16)
    }
  })
  return out
}

async function loadBlob(data: any, blobId: BlobId, bytes: Uint8Array) {
  const CHUNK_SIZE = 24_575
  const count = Math.ceil(bytes.length / CHUNK_SIZE)
  for (let i = 0; i < count; i++) {
    const slice = bytes.slice(
      i * CHUNK_SIZE,
      Math.min(bytes.length, (i + 1) * CHUNK_SIZE),
    )
    await data.write.loadBlobChunk([blobId, i, bytesToHex(slice)])
  }
}

function expandPalette(indexed: Uint8Array, palette: string[]): Uint8Array {
  const out = new Uint8Array(indexed.length * 4)
  for (let i = 0; i < indexed.length; i++) {
    const rgba = palette[indexed[i]]
    for (let b = 0; b < 4; b++) {
      out[i * 4 + b] = Number.parseInt(rgba.slice(b * 2, b * 2 + 2), 16)
    }
  }
  return out
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
