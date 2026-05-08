import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { network } from 'hardhat'
import { bytesToHex, type Hex } from 'viem'

import {
  ACCESSORY_COUNT,
  PIXELS_PER_PUNK,
  PUNK_COUNT,
  TRANSPARENT_RGBA,
  asciiSort,
  buildTraitCatalog,
  countVisiblePixels,
  encodeTraitMeta,
  encodeSparseIndexed,
  hexToBytes,
  KIND_ACCESSORY,
  KIND_ATTRIBUTE_COUNT,
  KIND_HEAD_VARIANT,
  KIND_NORMALIZED_TYPE,
  parseAttributes,
  rgbaToIndexed,
  rgbaKey,
  sortedVisibleColors,
  HEAD_VARIANTS,
  NORMALIZED_TYPES,
  type TraitRecord,
} from '../scripts/lib/punks-builder.js'
import {
  buildPngFlattened,
  buildPngTransparent,
  buildSvg,
  expandIndexedToRgba,
} from './helpers/renderer-reference.js'

const PALETTE_BYTES = 222 * 4
const PIXEL_OFFSETS_BYTES = (PUNK_COUNT + 1) * 3
const SCALARS_PER_WORD = 5
const PLACEHOLDER_PIXEL_COUNT = 148
const PLACEHOLDER_COLOR_COUNT = 2
const SNAPSHOT_DIR = 'test/fixtures'
const SNAPSHOT_JSON = join(SNAPSHOT_DIR, 'source-snapshot.json')
const SNAPSHOT_BIN = join(SNAPSHOT_DIR, 'source-snapshot.bin')
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

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

type Ctx = Awaited<ReturnType<typeof deployRendererFixture>>

const SNAPSHOT_PRESENT = existsSync(SNAPSHOT_JSON) && existsSync(SNAPSHOT_BIN)

describe('PunksRenderer ENS reverse name', () => {
  it('sets the configured ENS reverse name during deployment', async () => {
    const connection: any = await network.create()
    const { viem } = connection
    const registrar = await viem.deployContract('ReverseRegistrarMock')
    const renderer = await viem.deployContract('PunksRenderer', [
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      registrar.address,
      'renderer.punksdata.eth',
    ])

    assert.equal(await registrar.read.calls(), 1n)
    assert.equal(
      ((await registrar.read.lastCaller()) as string).toLowerCase(),
      renderer.address.toLowerCase(),
    )
    assert.equal(await registrar.read.lastName(), 'renderer.punksdata.eth')
  })

  it('skips ENS reverse-name setup when the registrar or name is unset', async () => {
    const connection: any = await network.create()
    const { viem } = connection
    const registrar = await viem.deployContract('ReverseRegistrarMock')

    await viem.deployContract('PunksRenderer', [
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      registrar.address,
      '',
    ])
    assert.equal(await registrar.read.calls(), 0n)

    const renderer = await viem.deployContract('PunksRenderer', [
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      'renderer.punksdata.eth',
    ])
    assert.equal(
      ((await renderer.read.dataContract()) as string).toLowerCase(),
      ZERO_ADDRESS,
    )
  })
})

describe('PunksRenderer', () => {
  if (!SNAPSHOT_PRESENT) {
    it('snapshot fixture missing — run `npm run snapshot:source`', () => {
      assert.ok(
        false,
        `${SNAPSHOT_JSON} / ${SNAPSHOT_BIN} not found. Run \`npm run snapshot:source\` to fetch them.`,
      )
    })
    return
  }

  let ctx: Ctx

  before(
    async () => {
      ctx = await deployRendererFixture()
    },
    { timeout: 120_000 },
  )

  it('exposes the underlying PunksData address', async () => {
    const onchain = ((await ctx.renderer.read.dataContract()) as string).toLowerCase()
    assert.equal(onchain, ctx.data.address.toLowerCase())
  })

  it('punkImage returns the source RGBA bytes for every snapshot Punk', async () => {
    for (let i = 0; i < ctx.snapshot.snapshotIds.length; i++) {
      const id = ctx.snapshot.snapshotIds[i]
      const onchain = hexToBytes(
        (await ctx.renderer.read.punkImage([id])) as Hex,
      )
      assert.equal(onchain.length, 2304, `Punk ${id}: punkImage length`)
      assert.deepEqual(
        onchain,
        ctx.snapshot.images[i],
        `Punk ${id}: punkImage byte-equal to source`,
      )

      // Cross-check against the offchain reference using the loaded palette.
      const indexed = rgbaToIndexed(ctx.snapshot.images[i], ctx.colorIdByRgba)
      const expected = expandIndexedToRgba(indexed, ctx.paletteRgba)
      assert.deepEqual(onchain, expected, `Punk ${id}: punkImage matches reference`)
    }
  })

  it('punkSvg matches the offchain reference for every snapshot Punk', async () => {
    for (let i = 0; i < ctx.snapshot.snapshotIds.length; i++) {
      const id = ctx.snapshot.snapshotIds[i]
      const onchain = (await ctx.renderer.read.punkSvg([id])) as string
      const indexed = rgbaToIndexed(ctx.snapshot.images[i], ctx.colorIdByRgba)
      const expected = buildSvg(indexed, ctx.paletteRgba)
      assert.equal(onchain, expected, `Punk ${id}: SVG byte-equal`)
    }
  })

  it('punkAttributes returns CSV display traits in canonical trait order', async () => {
    for (let i = 0; i < ctx.snapshot.snapshotIds.length; i++) {
      const id = ctx.snapshot.snapshotIds[i]
      const expected = expectedPunkAttributesCsv(
        ctx.snapshot.attributes[i],
        ctx.traitIdByKindAndName,
        ctx.traits,
      )
      assert.equal(await ctx.renderer.read.punkAttributes([id]), expected)
    }
  })

  it('metadataJson and tokenURI render ERC721-style metadata', async () => {
    const id = 0
    const snapshotIndex = ctx.snapshot.snapshotIds.indexOf(id)
    const indexed = rgbaToIndexed(ctx.snapshot.images[snapshotIndex], ctx.colorIdByRgba)
    const metadata = JSON.parse((await ctx.renderer.read.metadataJson([id])) as string)
    const expectedImagePrefix = 'data:image/svg+xml;base64,'

    assert.equal(metadata.name, 'CryptoPunk #0')
    assert.equal(
      metadata.description,
      'CryptoPunk #0 rendered fully onchain from sealed CryptoPunks pixel and trait data.',
    )
    assert.equal(metadata.image.startsWith(expectedImagePrefix), true)
    assert.equal(
      Buffer.from(metadata.image.slice(expectedImagePrefix.length), 'base64').toString('utf8'),
      await ctx.renderer.read.punkSvg([id]),
    )
    assert.deepEqual(
      metadata.attributes,
      expectedMetadataAttributes(
        ctx.snapshot.attributes[snapshotIndex],
        countVisiblePixels(indexed),
        sortedVisibleColors(indexed).length,
        ctx.traitIdByKindAndName,
        ctx.traits,
      ),
    )

    const tokenUriPrefix = 'data:application/json;base64,'
    const uri = (await ctx.renderer.read.tokenURI([id])) as string
    assert.equal(uri.startsWith(tokenUriPrefix), true)
    assert.deepEqual(
      JSON.parse(Buffer.from(uri.slice(tokenUriPrefix.length), 'base64').toString('utf8')),
      metadata,
    )
  })

  it('punkPng (transparent) is byte-equal to the offchain reference', async () => {
    for (let i = 0; i < ctx.snapshot.snapshotIds.length; i++) {
      const id = ctx.snapshot.snapshotIds[i]
      const onchain = hexToBytes((await ctx.renderer.read.punkPng([id])) as Hex)
      const indexed = rgbaToIndexed(ctx.snapshot.images[i], ctx.colorIdByRgba)
      const expected = buildPngTransparent(indexed, ctx.paletteRgba)
      assert.deepEqual(onchain, expected, `Punk ${id}: PNG transparent byte-equal`)
    }
  })

  it('punkPng (flattened, #638596 background) is byte-equal to the offchain reference', async () => {
    const bg = { r: 0x63, g: 0x85, b: 0x96 }
    const bgBytes = `0x638596ff` as Hex
    for (let i = 0; i < ctx.snapshot.snapshotIds.length; i++) {
      const id = ctx.snapshot.snapshotIds[i]
      const onchain = hexToBytes(
        (await ctx.renderer.read.punkPng([id, bgBytes])) as Hex,
      )
      const indexed = rgbaToIndexed(ctx.snapshot.images[i], ctx.colorIdByRgba)
      const expected = buildPngFlattened(indexed, ctx.paletteRgba, bg)
      assert.deepEqual(onchain, expected, `Punk ${id}: PNG flattened byte-equal`)
    }
  })

  it('punkPng decodes through Node zlib and yields the input scanlines', async () => {
    // Independent verification: the offchain reference and onchain encoder
    // could share a CRC/Adler bug and still byte-match. zlib's inflate runs
    // its own Adler-32 check and its own DEFLATE state machine.
    for (let i = 0; i < ctx.snapshot.snapshotIds.length; i++) {
      const id = ctx.snapshot.snapshotIds[i]
      const png = hexToBytes((await ctx.renderer.read.punkPng([id])) as Hex)
      const idat = extractIdat(png)
      const inflated = new Uint8Array(inflateSync(Buffer.from(idat)))
      assert.equal(inflated.length, 600, `Punk ${id}: inflated IDAT length`)

      const indexed = rgbaToIndexed(ctx.snapshot.images[i], ctx.colorIdByRgba)
      for (let row = 0; row < 24; row++) {
        assert.equal(inflated[row * 25], 0, `Punk ${id} row ${row}: filter byte`)
        for (let col = 0; col < 24; col++) {
          assert.equal(
            inflated[row * 25 + 1 + col],
            indexed[row * 24 + col],
            `Punk ${id} row ${row} col ${col}: indexed byte`,
          )
        }
      }
    }
  })

  it('punkPng reverts when the background alpha is not 0xff', async () => {
    await ctx.viem.assertions.revertWithCustomError(
      ctx.renderer.read.punkPng([0, '0x638596fe' as Hex]),
      ctx.renderer,
      'InvalidBackground',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.renderer.read.punkPng([0, '0x00000000' as Hex]),
      ctx.renderer,
      'InvalidBackground',
    )
  })

  it('view functions delegate punk-id validation to PunksData', async () => {
    await ctx.viem.assertions.revertWithCustomError(
      ctx.renderer.read.punkImage([10_000]),
      ctx.data,
      'InvalidPunkId',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.renderer.read.punkSvg([10_000]),
      ctx.data,
      'InvalidPunkId',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.renderer.read.punkAttributes([10_000]),
      ctx.data,
      'InvalidPunkId',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.renderer.read.metadataJson([10_000]),
      ctx.data,
      'InvalidPunkId',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.renderer.read.punkPng([10_000]),
      ctx.data,
      'InvalidPunkId',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.renderer.read.punkPng([10_000, '0x000000ff' as Hex]),
      ctx.data,
      'InvalidPunkId',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.renderer.read.tokenURI([10_000]),
      ctx.renderer,
      'InvalidTokenId',
    )
  })
})

// ------------------ Fixture deploy ------------------
//
// Mirrors `deployWithSnapshot` from PunksData.snapshot.test.ts but additionally
// deploys PunksRenderer against the loaded data contract. The snapshot palette
// is padded to 222 entries with sentinel colors (alpha=0) so the data contract
// passes its shape checks; the snapshot Punks themselves only reference real
// palette entries.

async function deployRendererFixture() {
  const snapshot = await loadSnapshot()
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
  const traits = buildTestTraitCatalog(snapshot)
  const traitMeta = encodeTraitMeta(traits)
  const traitIdByKindAndName = buildTraitIdByKindAndName(traits)
  const traitMaskPairGroups = buildTraitMaskPairGroups(snapshot, traitIdByKindAndName)
  const colorMaskGroups = buildColorMaskGroups(snapshot, colorIdByRgba)
  const packedScalarGroups = buildPackedScalarGroups(snapshot, colorIdByRgba)

  const connection: any = await network.create()
  const { viem } = connection
  const [deployer] = await viem.getWalletClients()
  const data = await viem.deployContract('PunksData', [deployer.account.address])

  await loadBlob(data, BlobId.TraitMeta, traitMeta)
  await loadBlob(data, BlobId.Palette, paletteBytes)
  await loadBlob(data, BlobId.PixelOffsets, pixelOffsets)
  await loadBlob(data, BlobId.CompressedPixels, compressedPixels)

  for (const { start, values } of traitMaskPairGroups) {
    await data.write.loadTraitMaskPairs([start, values])
  }
  for (const { start, values } of colorMaskGroups) {
    await data.write.loadColorMasks([start, values])
  }
  for (const { start, values } of packedScalarGroups) {
    await data.write.loadPackedScalars([start, values])
  }

  // Tests run without a CryptoPunks market mock, so wire all marketplace
  // addresses to zero. `backgroundOf` short-circuits and returns BG_DEFAULT,
  // matching the legacy `punkSvg` output.
  const renderer = await viem.deployContract('PunksRenderer', [
    data.address,
    ZERO_ADDRESS,
    ZERO_ADDRESS,
    ZERO_ADDRESS,
    ZERO_ADDRESS,
    '',
  ])

  // Convert the padded palette hex strings into a single Uint8Array for the
  // offchain encoders.
  const paletteRgba = encodePalette(palette)

  return {
    connection,
    viem,
    data,
    renderer,
    snapshot,
    palette,
    paletteRgba,
    colorIdByRgba,
    traits,
    traitIdByKindAndName,
  }
}

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
    images.push(bin.subarray(i * json.bytesPerImage, (i + 1) * json.bytesPerImage))
  }
  return { ...json, images }
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
  let pad = 0
  while (palette.length < 222) {
    palette.push(`f${(pad++).toString(16).padStart(7, '0')}`)
  }
  if (palette.length !== 222) throw new Error(`palette size ${palette.length}`)
  return palette
}

function buildTestTraitCatalog(snapshot: Snapshot): TraitRecord[] {
  const accessories = new Set<string>()
  for (const attributes of snapshot.attributes) {
    for (const accessory of parseAttributes(attributes).accessories) {
      accessories.add(accessory)
    }
  }

  const names = [...accessories]
  let i = 0
  while (names.length < ACCESSORY_COUNT) {
    names.push(`zz Test Accessory ${String(i++).padStart(2, '0')}`)
  }
  names.sort(asciiSort)
  return buildTraitCatalog(names)
}

function buildTraitIdByKindAndName(traits: TraitRecord[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const trait of traits) out.set(`${trait.kind}:${trait.name}`, trait.id)
  return out
}

function buildTraitMaskPairGroups(
  snapshot: Snapshot,
  traitIdByKindAndName: Map<string, number>,
): Array<{ start: number; values: bigint[] }> {
  const packedByPair = new Map<number, bigint>()
  const lowMask = (1n << 128n) - 1n

  for (let i = 0; i < snapshot.snapshotIds.length; i++) {
    const id = snapshot.snapshotIds[i]
    const pairIndex = Math.floor(id / 2)
    const mask = buildExpectedTraitMask(snapshot.attributes[i], traitIdByKindAndName)
    const current = packedByPair.get(pairIndex) ?? 0n
    const packed = id % 2 === 0
      ? (current & ~lowMask) | mask
      : (current & lowMask) | (mask << 128n)
    packedByPair.set(pairIndex, packed)
  }

  return [...packedByPair.entries()].map(([start, value]) => ({ start, values: [value] }))
}

function buildColorMaskGroups(
  snapshot: Snapshot,
  colorIdByRgba: Map<string, number>,
): Array<{ start: number; values: bigint[] }> {
  return snapshot.snapshotIds.map((id, i) => {
    const indexed = rgbaToIndexed(snapshot.images[i], colorIdByRgba)
    let mask = 0n
    for (const colorId of sortedVisibleColors(indexed)) mask |= 1n << BigInt(colorId)
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
    const headIndex = HEAD_VARIANTS.indexOf(parsed.headVariant as (typeof HEAD_VARIANTS)[number])
    const typeIndex = NORMALIZED_TYPES.indexOf(parsed.normalizedType as (typeof NORMALIZED_TYPES)[number])
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
    BigInt(PLACEHOLDER_PIXEL_COUNT) |
    (BigInt(PLACEHOLDER_COLOR_COUNT) << 16n)

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
    const slice = bytes.slice(i * CHUNK_SIZE, Math.min(bytes.length, (i + 1) * CHUNK_SIZE))
    await data.write.loadBlobChunk([blobId, i, bytesToHex(slice)])
  }
}

function writeUint24(out: Uint8Array, offset: number, value: number) {
  out[offset] = (value >> 16) & 0xff
  out[offset + 1] = (value >> 8) & 0xff
  out[offset + 2] = value & 0xff
}

function extractIdat(png: Uint8Array): Uint8Array {
  // Skip 8-byte signature, walk chunks until IDAT.
  let offset = 8
  while (offset < png.length) {
    const length =
      (png[offset] << 24) |
      (png[offset + 1] << 16) |
      (png[offset + 2] << 8) |
      png[offset + 3]
    const type = String.fromCharCode(
      png[offset + 4],
      png[offset + 5],
      png[offset + 6],
      png[offset + 7],
    )
    if (type === 'IDAT') {
      return png.subarray(offset + 8, offset + 8 + length)
    }
    offset += 12 + length
  }
  throw new Error('IDAT chunk not found')
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

function expectedPunkAttributesCsv(
  attributes: string,
  traitIdByKindAndName: Map<string, number>,
  traits: TraitRecord[],
): string {
  const parsed = parseAttributes(attributes)
  const accessoryNames = accessoryTraitIds(parsed.accessories, traitIdByKindAndName)
    .map((id) => traits[id].name)
  return [parsed.headVariant, ...accessoryNames].join(', ')
}

function expectedMetadataAttributes(
  attributes: string,
  pixelCount: number,
  colorCount: number,
  traitIdByKindAndName: Map<string, number>,
  traits: TraitRecord[],
): Array<Record<string, number | string>> {
  const parsed = parseAttributes(attributes)
  return [
    { trait_type: 'Type', value: parsed.normalizedType },
    { trait_type: 'Head Variant', value: parsed.headVariant },
    { display_type: 'number', trait_type: 'Attribute Count', value: parsed.accessories.length },
    { display_type: 'number', trait_type: 'Color Count', value: colorCount },
    { display_type: 'number', trait_type: 'Pixel Count', value: pixelCount },
    ...accessoryTraitIds(parsed.accessories, traitIdByKindAndName).map((id) => ({
      trait_type: 'Accessory',
      value: traits[id].name,
    })),
  ]
}

function buildExpectedTraitMask(
  attributes: string,
  traitIdByKindAndName: Map<string, number>,
): bigint {
  const parsed = parseAttributes(attributes)
  let mask = 0n
  mask |= 1n << BigInt(
    mustGet(traitIdByKindAndName, `${KIND_NORMALIZED_TYPE}:${parsed.normalizedType}`),
  )
  mask |= 1n << BigInt(
    mustGet(traitIdByKindAndName, `${KIND_HEAD_VARIANT}:${parsed.headVariant}`),
  )
  mask |= 1n << BigInt(
    mustGet(
      traitIdByKindAndName,
      `${KIND_ATTRIBUTE_COUNT}:${parsed.accessories.length} Attributes`,
    ),
  )
  for (const id of accessoryTraitIds(parsed.accessories, traitIdByKindAndName)) {
    mask |= 1n << BigInt(id)
  }
  return mask
}

function accessoryTraitIds(
  accessories: string[],
  traitIdByKindAndName: Map<string, number>,
): number[] {
  return accessories
    .map((name) => mustGet(traitIdByKindAndName, `${KIND_ACCESSORY}:${name}`))
    .sort((a, b) => a - b)
}

function mustGet<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key)
  if (value === undefined) throw new Error(`Missing key ${String(key)}`)
  return value
}
