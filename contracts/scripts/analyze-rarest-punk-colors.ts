import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

import {
  PIXELS_PER_PUNK,
  PUNK_COUNT,
  decodeSparseIndexed,
} from './lib/punks-builder.js'

const GRID_SIZE = 100
const RGBA_BYTES_PER_PIXEL = 4
const SCANLINE_BYTES = 1 + GRID_SIZE * RGBA_BYTES_PER_PIXEL
const PNG_CHUNK_PAYLOAD_BYTES = 32_768

const INPUT_DIR =
  process.env.RAREST_PUNK_COLORS_INPUT
    ?? process.env.PUNKS_DATA_OUTPUT
    ?? 'scripts/output/punks-data'
const OUTPUT_DIR =
  process.env.RAREST_PUNK_COLORS_OUTPUT
    ?? 'scripts/output/rarest-punk-colors'
const NDJSON_FILE = process.env.RAREST_PUNK_COLORS_NDJSON ?? 'rarest-punk-colors.ndjson'
const PNG_FILE = process.env.RAREST_PUNK_COLORS_PNG ?? 'rarest-punk-colors.png'
const RARITY_RANK = readRarityRank()

type RarityRank = 'punk-count' | 'pixel-count' | 'local-count'

type Manifest = {
  counts?: {
    punks?: number
    colors?: number
  }
  files: {
    pixelOffsets: string
    compressedPixels: string
    colorSupplies?: string
  }
  palette: string[]
}

type Selection = {
  punkId: number
  x: number
  y: number
  colorId: number | null
  rgba: string | null
  localPixelCount: number
  globalPunkCount: number
  globalPixelCount: number
}

async function main() {
  const manifest = await readManifest(INPUT_DIR)
  validateManifest(manifest)

  const palette = manifest.palette.map(normalizeRgba)
  const ignoredColors = palette.map(isBlackOrTransparent)
  const pixelOffsets = await readBinary(join(INPUT_DIR, manifest.files.pixelOffsets))
  const compressedPixels = await readBinary(join(INPUT_DIR, manifest.files.compressedPixels))

  const globalPixelCounts = new Uint32Array(palette.length)
  const globalPunkCounts = new Uint32Array(palette.length)
  const perPunkColorCounts: Array<Map<number, number>> = []

  for (let punkId = 0; punkId < PUNK_COUNT; punkId++) {
    const indexed = decodePunkIndexedPixels(
      punkId,
      pixelOffsets,
      compressedPixels,
      palette.length,
    )
    const counts = countColors(indexed)
    perPunkColorCounts.push(counts)

    for (const [colorId, count] of counts) {
      globalPixelCounts[colorId] += count
      globalPunkCounts[colorId] += 1
    }
  }

  await assertColorSuppliesMatch(manifest, globalPixelCounts)

  const selections = perPunkColorCounts.map((counts, punkId) =>
    selectRarestColor({
      punkId,
      counts,
      palette,
      ignoredColors,
      globalPunkCounts,
      globalPixelCounts,
      rarityRank: RARITY_RANK,
    }))

  await mkdir(OUTPUT_DIR, { recursive: true })

  const ndjson = selections.map((selection) => `${JSON.stringify(selection)}\n`).join('')
  const ndjsonPath = join(OUTPUT_DIR, NDJSON_FILE)
  await writeFile(ndjsonPath, ndjson)

  const png = renderSelectionGridPng(selections, palette)
  const pngPath = join(OUTPUT_DIR, PNG_FILE)
  await writeFile(pngPath, png)

  console.log(`Input ${INPUT_DIR}`)
  console.log(`Rarity rank ${RARITY_RANK}`)
  console.log(`Wrote ${ndjsonPath} (${selections.length} lines, ${sha256Hex(Buffer.from(ndjson))})`)
  console.log(`Wrote ${pngPath} (${png.length} bytes, ${sha256Hex(png)})`)
}

async function readManifest(inputDir: string): Promise<Manifest> {
  const parsed = JSON.parse(await readFile(join(inputDir, 'manifest.json'), 'utf8')) as unknown
  if (!isRecord(parsed) || !isRecord(parsed.files) || !Array.isArray(parsed.palette)) {
    throw new Error(`Invalid manifest at ${join(inputDir, 'manifest.json')}`)
  }
  return parsed as Manifest
}

function validateManifest(manifest: Manifest): void {
  if (manifest.counts?.punks !== undefined && manifest.counts.punks !== PUNK_COUNT) {
    throw new Error(`Expected ${PUNK_COUNT} Punks, manifest has ${manifest.counts.punks}`)
  }
  if (manifest.counts?.colors !== undefined && manifest.counts.colors !== manifest.palette.length) {
    throw new Error(
      `Manifest color count ${manifest.counts.colors} != palette length ${manifest.palette.length}`,
    )
  }
  if (manifest.files.pixelOffsets === undefined) throw new Error('manifest missing pixelOffsets file')
  if (manifest.files.compressedPixels === undefined) {
    throw new Error('manifest missing compressedPixels file')
  }
}

function decodePunkIndexedPixels(
  punkId: number,
  pixelOffsets: Uint8Array,
  compressedPixels: Uint8Array,
  paletteLength: number,
): Uint8Array {
  const start = readUint24(pixelOffsets, punkId * 3)
  const end = readUint24(pixelOffsets, (punkId + 1) * 3)
  if (end <= start || end > compressedPixels.length) {
    throw new Error(`Punk ${punkId}: invalid compressed pixel range ${start}..${end}`)
  }

  const indexed = decodeSparseIndexed(compressedPixels.subarray(start, end), paletteLength)
  if (indexed.length !== PIXELS_PER_PUNK) {
    throw new Error(`Punk ${punkId}: decoded ${indexed.length} pixels`)
  }
  return indexed
}

function countColors(indexed: Uint8Array): Map<number, number> {
  const counts = new Map<number, number>()
  for (const colorId of indexed) {
    counts.set(colorId, (counts.get(colorId) ?? 0) + 1)
  }
  return counts
}

function selectRarestColor(args: {
  punkId: number
  counts: Map<number, number>
  palette: string[]
  ignoredColors: boolean[]
  globalPunkCounts: Uint32Array
  globalPixelCounts: Uint32Array
  rarityRank: RarityRank
}): Selection {
  let best: Selection | undefined
  for (const [colorId, localPixelCount] of args.counts) {
    if (args.ignoredColors[colorId]) continue

    const candidate: Selection = {
      punkId: args.punkId,
      x: args.punkId % GRID_SIZE,
      y: Math.floor(args.punkId / GRID_SIZE),
      colorId,
      rgba: `#${args.palette[colorId]}`,
      localPixelCount,
      globalPunkCount: args.globalPunkCounts[colorId],
      globalPixelCount: args.globalPixelCounts[colorId],
    }
    if (best === undefined || compareSelections(candidate, best, args.rarityRank) < 0) {
      best = candidate
    }
  }

  return best ?? {
    punkId: args.punkId,
    x: args.punkId % GRID_SIZE,
    y: Math.floor(args.punkId / GRID_SIZE),
    colorId: null,
    rgba: null,
    localPixelCount: 0,
    globalPunkCount: 0,
    globalPixelCount: 0,
  }
}

function compareSelections(a: Selection, b: Selection, rarityRank: RarityRank): number {
  const aColorId = a.colorId ?? Number.MAX_SAFE_INTEGER
  const bColorId = b.colorId ?? Number.MAX_SAFE_INTEGER

  if (rarityRank === 'local-count') {
    return compareNumberTuple(
      [a.localPixelCount, a.globalPunkCount, a.globalPixelCount, aColorId],
      [b.localPixelCount, b.globalPunkCount, b.globalPixelCount, bColorId],
    )
  }
  if (rarityRank === 'pixel-count') {
    return compareNumberTuple(
      [a.globalPixelCount, a.globalPunkCount, a.localPixelCount, aColorId],
      [b.globalPixelCount, b.globalPunkCount, b.localPixelCount, bColorId],
    )
  }
  return compareNumberTuple(
    [a.globalPunkCount, a.globalPixelCount, a.localPixelCount, aColorId],
    [b.globalPunkCount, b.globalPixelCount, b.localPixelCount, bColorId],
  )
}

function renderSelectionGridPng(selections: Selection[], palette: string[]): Buffer {
  const scanlines = Buffer.alloc(GRID_SIZE * SCANLINE_BYTES)
  for (const selection of selections) {
    const color = selection.colorId === null ? '00000000' : palette[selection.colorId]
    const offset = selection.y * SCANLINE_BYTES + 1 + selection.x * RGBA_BYTES_PER_PIXEL
    writeRgba(scanlines, offset, color)
  }

  return framePng(GRID_SIZE, GRID_SIZE, deflateSync(scanlines, { level: 9 }))
}

function framePng(width: number, height: number, idat: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA

  const chunks = [
    pngChunk('IHDR', ihdr),
    ...chunkIdat(idat).map((chunk) => pngChunk('IDAT', chunk)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), ...chunks])
}

function chunkIdat(idat: Uint8Array): Uint8Array[] {
  const chunks: Uint8Array[] = []
  for (let offset = 0; offset < idat.length; offset += PNG_CHUNK_PAYLOAD_BYTES) {
    chunks.push(idat.subarray(offset, Math.min(idat.length, offset + PNG_CHUNK_PAYLOAD_BYTES)))
  }
  return chunks
}

function pngChunk(type: string, payload: Uint8Array): Buffer {
  if (type.length !== 4) throw new Error(`Invalid PNG chunk type ${type}`)
  const chunkType = Buffer.from(type, 'ascii')
  const out = Buffer.alloc(12 + payload.length)
  out.writeUInt32BE(payload.length, 0)
  chunkType.copy(out, 4)
  Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([chunkType, Buffer.from(payload)])), 8 + payload.length)
  return out
}

async function assertColorSuppliesMatch(
  manifest: Manifest,
  computedGlobalPixelCounts: Uint32Array,
): Promise<void> {
  if (manifest.files.colorSupplies === undefined) return
  const colorSupplies = readUint32Array(await readBinary(join(INPUT_DIR, manifest.files.colorSupplies)))
  if (colorSupplies.length !== computedGlobalPixelCounts.length) {
    throw new Error(
      `colorSupplies length ${colorSupplies.length} != palette length ${computedGlobalPixelCounts.length}`,
    )
  }
  for (let colorId = 0; colorId < colorSupplies.length; colorId++) {
    if (colorSupplies[colorId] !== computedGlobalPixelCounts[colorId]) {
      throw new Error(
        `colorSupplies[${colorId}] ${colorSupplies[colorId]} != decoded count ${computedGlobalPixelCounts[colorId]}`,
      )
    }
  }
}

async function readBinary(path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path))
}

function readUint24(bytes: Uint8Array, offset: number): number {
  if (offset + 3 > bytes.length) throw new Error(`uint24 read out of bounds at ${offset}`)
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2]
}

function readUint32Array(bytes: Uint8Array): number[] {
  if (bytes.length % 4 !== 0) throw new Error('uint32 array is not word-aligned')
  const out: number[] = []
  for (let offset = 0; offset < bytes.length; offset += 4) {
    out.push(bytes[offset] * 0x1000000
      + (bytes[offset + 1] << 16)
      + (bytes[offset + 2] << 8)
      + bytes[offset + 3])
  }
  return out
}

function writeRgba(out: Uint8Array, offset: number, rgba: string): void {
  for (let i = 0; i < RGBA_BYTES_PER_PIXEL; i++) {
    out[offset + i] = Number.parseInt(rgba.slice(i * 2, i * 2 + 2), 16)
  }
}

function normalizeRgba(rgba: string): string {
  const normalized = rgba.startsWith('#') ? rgba.slice(1) : rgba
  if (!/^[0-9a-fA-F]{8}$/.test(normalized)) {
    throw new Error(`Invalid RGBA color ${rgba}`)
  }
  return normalized.toLowerCase()
}

function isBlackOrTransparent(rgba: string): boolean {
  const r = Number.parseInt(rgba.slice(0, 2), 16)
  const g = Number.parseInt(rgba.slice(2, 4), 16)
  const b = Number.parseInt(rgba.slice(4, 6), 16)
  const a = Number.parseInt(rgba.slice(6, 8), 16)
  return a === 0 || (r === 0 && g === 0 && b === 0)
}

function compareNumberTuple(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

function readRarityRank(): RarityRank {
  const raw = process.env.RAREST_PUNK_COLORS_RANK ?? 'punk-count'
  if (raw === 'punk-count' || raw === 'pixel-count' || raw === 'local-count') return raw
  throw new Error('RAREST_PUNK_COLORS_RANK must be one of: punk-count, pixel-count, local-count')
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < table.length; i++) {
    let c = i
    for (let bit = 0; bit < 8; bit++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

await main()
