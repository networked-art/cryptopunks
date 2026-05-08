import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { network } from 'hardhat'
import { bytesToHex, type Hex } from 'viem'

import {
  HEAD_VARIANTS,
  NORMALIZED_TYPES,
  PIXELS_PER_PUNK,
  PUNK_COUNT,
  countVisiblePixels,
  hexToBytes,
  parseAttributes,
  rgbaToIndexed,
  sortedVisibleColors,
} from '../scripts/lib/punks-builder.js'

const EXPORT_DIR = 'scripts/output/punks-data'
const SNAPSHOT_DIR = 'test/fixtures'
const SNAPSHOT_JSON = join(SNAPSHOT_DIR, 'source-snapshot.json')
const SNAPSHOT_BIN = join(SNAPSHOT_DIR, 'source-snapshot.bin')
const MANIFEST_PATH = join(EXPORT_DIR, 'manifest.json')

const CHUNK_SIZE = 24_575
const STORAGE_BATCH = 200
const TRAIT_COUNT = 111
const PALETTE_SIZE = 222
const BITMAP_WORDS_PER_ROW = 40
const PUNKS_PER_BITMAP_WORD = 256
const PIXEL_COUNT_MIN = 148
const PIXEL_COUNT_MAX = 332
const COLOR_COUNT_MIN = 2
const COLOR_COUNT_MAX = 14

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

enum TraitKind {
  HeadVariant = 0,
  NormalizedType = 1,
  AttributeCount = 2,
  Accessory = 3,
}

type Manifest = {
  hashes: {
    traitCatalogHash: Hex
    punkMaskHash: Hex
    paletteHash: Hex
    indexedPixelsHash: Hex
    compressedPixelsHash: Hex
    datasetHash: Hex
  }
  files: Record<string, string>
  palette: string[]
  traits: Array<{
    id: number
    name: string
    kind: number
    supply: number
    nameHash: Hex
  }>
}

type Snapshot = {
  bytesPerImage: number
  snapshotIds: number[]
  attributes: string[]
  images: Uint8Array[]
}

type Ctx = Awaited<ReturnType<typeof loadAndSeal>>

const EXPORT_PRESENT =
  existsSync(MANIFEST_PATH) && existsSync(SNAPSHOT_JSON) && existsSync(SNAPSHOT_BIN)

describe('PunksData export e2e', () => {
  if (!EXPORT_PRESENT) {
    it('export fixture missing — run `npm run generate:punks-data` and `npm run snapshot:source`', () => {
      assert.ok(
        false,
        `${MANIFEST_PATH} or snapshot fixture not found. Generate them first.`,
      )
    })
    return
  }

  let ctx: Ctx

  before(
    async () => {
      ctx = await loadAndSeal()
    },
    { timeout: 600_000 },
  )

  it('seals to the manifest dataset hash', async () => {
    const { data, manifest } = ctx
    assert.equal(await data.read.isSealed(), true)
    assert.equal(
      ((await data.read.datasetHash()) as string).toLowerCase(),
      manifest.hashes.datasetHash.toLowerCase(),
    )
  })

  it('reports the manifest trait catalog (name, kind, supply)', async () => {
    const { data, manifest } = ctx
    assert.equal(await data.read.traitCount(), TRAIT_COUNT)
    assert.equal(await data.read.isValidTraitId([TRAIT_COUNT - 1]), true)
    assert.equal(await data.read.isValidTraitId([TRAIT_COUNT]), false)

    const records = await Promise.all(
      manifest.traits.map(async (trait) => ({
        id: trait.id,
        name: (await data.read.traitName([trait.id])) as string,
        kind: Number(await data.read.traitKind([trait.id])),
        supply: Number(await data.read.traitSupply([trait.id])),
      })),
    )
    for (const trait of manifest.traits) {
      const onchain = records[trait.id]
      assert.equal(onchain.name, trait.name, `trait ${trait.id} name`)
      assert.equal(onchain.kind, trait.kind, `trait ${trait.id} kind`)
      assert.equal(onchain.supply, trait.supply, `trait ${trait.id} supply`)
    }
  })

  it('reports the manifest palette colors and supplies', async () => {
    const { data, manifest, colorSupplies } = ctx
    assert.equal(await data.read.paletteSize(), PALETTE_SIZE)

    const colors = await Promise.all(
      manifest.palette.map(async (_, id) => ({
        rgba: (await data.read.colorOf([id])) as string,
        supply: Number(await data.read.colorSupply([id])),
      })),
    )
    for (let id = 0; id < PALETTE_SIZE; id++) {
      const expected = `0x${manifest.palette[id]}`.toLowerCase()
      assert.equal(colors[id].rgba.toLowerCase(), expected, `colorOf(${id})`)
      assert.equal(colors[id].supply, colorSupplies[id], `colorSupply(${id})`)
    }
  })

  it('palette RGBA, RGB, and alpha views match the palette bytes', async () => {
    const { data, paletteBytes } = ctx
    const rgba = hexToBytes((await data.read.paletteRgbaBytes()) as Hex)
    assert.deepEqual(rgba, paletteBytes, 'paletteRgbaBytes')

    const rgb = hexToBytes((await data.read.paletteRgbBytes()) as Hex)
    const expectedRgb = new Uint8Array(PALETTE_SIZE * 3)
    for (let i = 0; i < PALETTE_SIZE; i++) {
      expectedRgb[i * 3] = paletteBytes[i * 4]
      expectedRgb[i * 3 + 1] = paletteBytes[i * 4 + 1]
      expectedRgb[i * 3 + 2] = paletteBytes[i * 4 + 2]
    }
    assert.deepEqual(rgb, expectedRgb, 'paletteRgbBytes')

    const alpha = hexToBytes((await data.read.paletteAlphaBytes()) as Hex)
    const expectedAlpha = new Uint8Array(PALETTE_SIZE)
    for (let i = 0; i < PALETTE_SIZE; i++) {
      expectedAlpha[i] = paletteBytes[i * 4 + 3]
    }
    assert.deepEqual(alpha, expectedAlpha, 'paletteAlphaBytes')
  })

  it('trait bitmap popcounts equal traitSupply for every trait', async () => {
    const { data, manifest } = ctx
    const popcounts = await Promise.all(
      manifest.traits.map(async (trait) => {
        const words = await Promise.all(
          Array.from({ length: BITMAP_WORDS_PER_ROW }, (_, w) =>
            data.read.traitBitmapWord([trait.id, w]) as Promise<bigint>,
          ),
        )
        return words.reduce((sum, word) => sum + popcount(word), 0)
      }),
    )
    for (const trait of manifest.traits) {
      assert.equal(
        popcounts[trait.id],
        trait.supply,
        `trait ${trait.id} (${trait.name}) bitmap popcount`,
      )
    }
  })

  it('pixel-count and color-count bitmaps cover every Punk exactly once', async () => {
    const { data } = ctx

    const pixelRowSums = await Promise.all(
      Array.from({ length: PIXEL_COUNT_MAX - PIXEL_COUNT_MIN + 1 }, async (_, offset) => {
        const pc = PIXEL_COUNT_MIN + offset
        const words = await Promise.all(
          Array.from({ length: BITMAP_WORDS_PER_ROW }, (_, w) =>
            data.read.pixelCountBitmapWord([pc, w]) as Promise<bigint>,
          ),
        )
        return words.reduce((sum, word) => sum + popcount(word), 0)
      }),
    )
    assert.equal(
      pixelRowSums.reduce((a, b) => a + b, 0),
      PUNK_COUNT,
      'pixel-count bitmap covers all Punks',
    )

    const colorRowSums = await Promise.all(
      Array.from({ length: COLOR_COUNT_MAX - COLOR_COUNT_MIN + 1 }, async (_, offset) => {
        const cc = COLOR_COUNT_MIN + offset
        const words = await Promise.all(
          Array.from({ length: BITMAP_WORDS_PER_ROW }, (_, w) =>
            data.read.colorCountBitmapWord([cc, w]) as Promise<bigint>,
          ),
        )
        return words.reduce((sum, word) => sum + popcount(word), 0)
      }),
    )
    assert.equal(
      colorRowSums.reduce((a, b) => a + b, 0),
      PUNK_COUNT,
      'color-count bitmap covers all Punks',
    )
  })

  it('snapshot Punks: indexed pixels expand to the source RGBA', async () => {
    const { data, snapshot, manifest } = ctx
    for (let i = 0; i < snapshot.snapshotIds.length; i++) {
      const id = snapshot.snapshotIds[i]
      const onchain = hexToBytes((await data.read.indexedPixelsOf([id])) as Hex)
      assert.equal(onchain.length, PIXELS_PER_PUNK, `Punk ${id}: indexed length`)
      const expandedRgba = expandPalette(onchain, manifest.palette)
      assert.deepEqual(expandedRgba, snapshot.images[i], `Punk ${id}: RGBA round-trip`)
    }
  })

  it('snapshot Punks: visual scalars match the source attributes', async () => {
    const { data, snapshot, colorIdByRgba } = ctx
    for (let i = 0; i < snapshot.snapshotIds.length; i++) {
      const id = snapshot.snapshotIds[i]
      const indexed = rgbaToIndexed(snapshot.images[i], colorIdByRgba)
      const expectedPixels = countVisiblePixels(indexed)
      const expectedColors = sortedVisibleColors(indexed).length
      const parsed = parseAttributes(snapshot.attributes[i])
      const expectedHead = HEAD_VARIANTS.indexOf(
        parsed.headVariant as (typeof HEAD_VARIANTS)[number],
      )
      const expectedType = NORMALIZED_TYPES.indexOf(
        parsed.normalizedType as (typeof NORMALIZED_TYPES)[number],
      )

      assert.equal(await data.read.pixelCountOf([id]), expectedPixels, `Punk ${id}: pixelCount`)
      assert.equal(await data.read.colorCountOf([id]), expectedColors, `Punk ${id}: colorCount`)
      assert.equal(
        await data.read.attributeCountOf([id]),
        parsed.accessories.length,
        `Punk ${id}: attributeCount`,
      )
      assert.equal(await data.read.headVariantOf([id]), expectedHead, `Punk ${id}: headVariant`)
      assert.equal(await data.read.punkTypeOf([id]), expectedType, `Punk ${id}: punkType`)
    }
  })

  it('snapshot Punks: color mask and hasColor match visible colors', async () => {
    const { data, snapshot, colorIdByRgba } = ctx
    for (let i = 0; i < snapshot.snapshotIds.length; i++) {
      const id = snapshot.snapshotIds[i]
      const indexed = rgbaToIndexed(snapshot.images[i], colorIdByRgba)
      const visible = sortedVisibleColors(indexed)
      let expectedMask = 0n
      for (const c of visible) expectedMask |= 1n << BigInt(c)

      assert.equal(await data.read.colorMaskOf([id]), expectedMask, `Punk ${id}: colorMask`)
      assert.equal(await data.read.hasColor([id, 0]), false, `Punk ${id}: hasColor(0)`)
      const flags = await Promise.all(
        visible.map((c) => data.read.hasColor([id, c]) as Promise<boolean>),
      )
      for (let j = 0; j < visible.length; j++) {
        assert.equal(flags[j], true, `Punk ${id}: hasColor(${visible[j]})`)
      }
    }
  })

  it('snapshot Punks: trait masks, hasTrait, and trait bitmaps are consistent', async () => {
    const { data, snapshot, traitIdByKindAndName } = ctx
    for (let i = 0; i < snapshot.snapshotIds.length; i++) {
      const id = snapshot.snapshotIds[i]
      const expectedMask = buildExpectedTraitMask(snapshot.attributes[i], traitIdByKindAndName)
      const onchainMask = (await data.read.traitMaskOf([id])) as bigint
      assert.equal(onchainMask, expectedMask, `Punk ${id}: traitMask`)

      const wordIndex = Math.floor(id / PUNKS_PER_BITMAP_WORD)
      const bitIndex = id % PUNKS_PER_BITMAP_WORD

      const [hasFlags, bitmapWords] = await Promise.all([
        Promise.all(
          Array.from({ length: TRAIT_COUNT }, (_, t) =>
            data.read.hasTrait([id, t]) as Promise<boolean>,
          ),
        ),
        Promise.all(
          Array.from({ length: TRAIT_COUNT }, (_, t) =>
            data.read.traitBitmapWord([t, wordIndex]) as Promise<bigint>,
          ),
        ),
      ])

      for (let t = 0; t < TRAIT_COUNT; t++) {
        const inMask = ((onchainMask >> BigInt(t)) & 1n) === 1n
        assert.equal(hasFlags[t], inMask, `Punk ${id}: hasTrait(${t}) vs mask`)
        const inBitmap = ((bitmapWords[t] >> BigInt(bitIndex)) & 1n) === 1n
        assert.equal(inBitmap, inMask, `Punk ${id}: traitBitmapWord(${t}) vs mask`)
      }
    }
  })
})

async function loadAndSeal() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Manifest
  const snapshot = await loadSnapshot()

  const blobBytes = {
    traitBitmaps: await readBin(manifest.files.traitBitmaps),
    traitMeta: await readBin(manifest.files.traitMeta),
    palette: await readBin(manifest.files.palette),
    pixelOffsets: await readBin(manifest.files.pixelOffsets),
    compressedPixels: await readBin(manifest.files.compressedPixels),
    colorBitmaps: await readBin(manifest.files.colorBitmaps),
    pixelCountBitmaps: await readBin(manifest.files.pixelCountBitmaps),
    colorCountBitmaps: await readBin(manifest.files.colorCountBitmaps),
  }
  const traitMaskPairs = readUint256Words(await readBin(manifest.files.traitMaskPairs))
  const colorMasks = readUint256Words(await readBin(manifest.files.colorMasks))
  const packedScalars = readUint256Words(await readBin(manifest.files.packedScalars))
  const colorSupplies = readUint32Array(await readBin(manifest.files.colorSupplies))

  const connection: any = await network.create()
  const { viem } = connection
  const [deployer] = await viem.getWalletClients()
  const data = await viem.deployContract('PunksData', [deployer.account.address])

  await loadBlob(data, BlobId.TraitBitmaps, blobBytes.traitBitmaps)
  await loadBlob(data, BlobId.TraitMeta, blobBytes.traitMeta)
  await loadBlob(data, BlobId.Palette, blobBytes.palette)
  await loadBlob(data, BlobId.PixelOffsets, blobBytes.pixelOffsets)
  await loadBlob(data, BlobId.CompressedPixels, blobBytes.compressedPixels)
  await loadBlob(data, BlobId.ColorBitmaps, blobBytes.colorBitmaps)
  await loadBlob(data, BlobId.PixelCountBitmaps, blobBytes.pixelCountBitmaps)
  await loadBlob(data, BlobId.ColorCountBitmaps, blobBytes.colorCountBitmaps)

  await loadWordBatches(data, 'loadTraitMaskPairs', traitMaskPairs)
  await loadWordBatches(data, 'loadColorMasks', colorMasks)
  await loadWordBatches(data, 'loadPackedScalars', packedScalars)
  await loadSupplyBatches(data, colorSupplies)

  await data.write.seal([
    {
      traitCatalogHash: manifest.hashes.traitCatalogHash,
      punkMaskHash: manifest.hashes.punkMaskHash,
      paletteHash: manifest.hashes.paletteHash,
      indexedPixelsHash: manifest.hashes.indexedPixelsHash,
      compressedPixelsHash: manifest.hashes.compressedPixelsHash,
    },
  ])

  const colorIdByRgba = new Map<string, number>()
  manifest.palette.forEach((rgba, index) => colorIdByRgba.set(rgba, index))

  const traitIdByKindAndName = new Map<string, number>()
  for (const trait of manifest.traits) {
    traitIdByKindAndName.set(`${trait.kind}:${trait.name}`, trait.id)
  }

  return {
    connection,
    viem,
    data,
    manifest,
    snapshot,
    paletteBytes: blobBytes.palette,
    colorSupplies,
    colorIdByRgba,
    traitIdByKindAndName,
  }
}

async function readBin(fileName: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(EXPORT_DIR, fileName)))
}

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

async function loadBlob(data: any, blobId: BlobId, bytes: Uint8Array) {
  const chunks = Math.ceil(bytes.length / CHUNK_SIZE)
  for (let i = 0; i < chunks; i++) {
    const chunk = bytes.slice(i * CHUNK_SIZE, Math.min(bytes.length, (i + 1) * CHUNK_SIZE))
    await data.write.loadBlobChunk([blobId, i, bytesToHex(chunk)])
  }
}

async function loadWordBatches(
  data: any,
  method: 'loadTraitMaskPairs' | 'loadColorMasks' | 'loadPackedScalars',
  words: bigint[],
) {
  for (let start = 0; start < words.length; start += STORAGE_BATCH) {
    const batch = words.slice(start, start + STORAGE_BATCH)
    await data.write[method]([start, batch])
  }
}

async function loadSupplyBatches(data: any, supplies: number[]) {
  for (let start = 0; start < supplies.length; start += STORAGE_BATCH) {
    const batch = supplies.slice(start, start + STORAGE_BATCH)
    await data.write.loadColorSupplies([start, batch])
  }
}

function readUint256Words(bytes: Uint8Array): bigint[] {
  if (bytes.length % 32 !== 0) throw new Error('uint256 file not word-aligned')
  const out: bigint[] = []
  for (let offset = 0; offset < bytes.length; offset += 32) {
    let value = 0n
    for (let i = 0; i < 32; i++) value = (value << 8n) | BigInt(bytes[offset + i])
    out.push(value)
  }
  return out
}

function readUint32Array(bytes: Uint8Array): number[] {
  if (bytes.length % 4 !== 0) throw new Error('uint32 file not word-aligned')
  const out: number[] = []
  for (let offset = 0; offset < bytes.length; offset += 4) {
    out.push(
      bytes[offset] * 0x1000000 +
        (bytes[offset + 1] << 16) +
        (bytes[offset + 2] << 8) +
        bytes[offset + 3],
    )
  }
  return out
}

function expandPalette(indexed: Uint8Array, paletteHex: string[]): Uint8Array {
  const out = new Uint8Array(indexed.length * 4)
  for (let i = 0; i < indexed.length; i++) {
    const rgba = paletteHex[indexed[i]]
    for (let b = 0; b < 4; b++) {
      out[i * 4 + b] = Number.parseInt(rgba.slice(b * 2, b * 2 + 2), 16)
    }
  }
  return out
}

function popcount(value: bigint): number {
  let count = 0
  while (value !== 0n) {
    if ((value & 1n) === 1n) count++
    value >>= 1n
  }
  return count
}

function buildExpectedTraitMask(
  attributes: string,
  traitIdByKindAndName: Map<string, number>,
): bigint {
  const parsed = parseAttributes(attributes)
  let mask = 0n
  mask |= 1n << BigInt(
    mustGet(traitIdByKindAndName, `${TraitKind.NormalizedType}:${parsed.normalizedType}`),
  )
  mask |= 1n << BigInt(
    mustGet(traitIdByKindAndName, `${TraitKind.HeadVariant}:${parsed.headVariant}`),
  )
  mask |= 1n << BigInt(
    mustGet(
      traitIdByKindAndName,
      `${TraitKind.AttributeCount}:${parsed.accessories.length} Attributes`,
    ),
  )
  for (const accessory of parsed.accessories) {
    mask |= 1n << BigInt(
      mustGet(traitIdByKindAndName, `${TraitKind.Accessory}:${accessory}`),
    )
  }
  return mask
}

function mustGet<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key)
  if (value === undefined) throw new Error(`Missing trait id for ${String(key)}`)
  return value
}
