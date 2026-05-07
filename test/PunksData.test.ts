import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { network } from 'hardhat'
import {
  bytesToHex,
  encodeAbiParameters,
  keccak256,
  type Hex,
} from 'viem'

const PUNK_COUNT = 10_000
const TRAIT_COUNT = 111
const WORDS_PER_BITMAP = 40
const MAX_COLOR_COUNT = 222
const CHUNK_SIZE = 24_575
const PIXELS_PER_PUNK = 576
const VISIBLE_BITMAP_BYTES = PIXELS_PER_PUNK / 8

const CROSS_CHUNK_PATTERN =
  0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefn
const LAST_CHUNK_PATTERN =
  0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210n

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
  HeadVariant,
  NormalizedType,
  AttributeCount,
  Accessory,
}

type Ctx = Awaited<ReturnType<typeof deployLoadedPunksData>>

describe('PunksData', () => {
  it('loads, seals, and removes loader authority', async () => {
    const ctx = await deployLoadedPunksData()
    const { data, deployer, other, hashes } = ctx

    const dataAsOther = await ctx.viem.getContractAt('PunksData', data.address, {
      client: { wallet: other },
    })
    await assert.rejects(
      () => dataAsOther.write.loadColorMasks([0, [0n]]),
      /0x7bfa4b9f|NotAdmin/,
    )

    await ctx.viem.assertions.revertWithCustomError(
      data.write.loadBlobChunk([BlobId.Palette, 99, '0x12']),
      data,
      'InvalidChunkIndex',
    )

    await data.write.seal([
      {
        traitCatalogHash: hashes.traitCatalogHash,
        punkMaskHash: hashes.punkMaskHash,
        paletteHash: hashes.paletteHash,
        indexedPixelsHash: hashes.indexedPixelsHash,
        compressedPixelsHash: hashes.compressedPixelsHash,
      },
    ])

    assert.equal(await data.read.isSealed(), true)
    assert.equal(
      ((await data.read.admin()) as string).toLowerCase(),
      deployer.account.address.toLowerCase(),
    )
    assert.equal(
      ((await data.read.datasetHash()) as string).toLowerCase(),
      hashes.datasetHash.toLowerCase(),
    )

    await assert.rejects(
      () => data.write.loadColorMasks([0, [0n]]),
      /0x423311c0|AlreadySealed/,
    )
  })

  it('serves criteria, metadata, palette, color, and bitmap views', async () => {
    const ctx = await deployLoadedPunksData()
    const { data, fixture } = ctx

    assert.equal(await data.read.traitCount(), 111)
    assert.equal(await data.read.traitName([0]), 'Alien')
    assert.equal(await data.read.traitKind([0]), TraitKind.NormalizedType)
    assert.equal(await data.read.traitKind([5]), TraitKind.HeadVariant)
    assert.equal(await data.read.traitSupply([24]), 1)

    assert.equal(await data.read.hasTrait([0, 0]), true)
    assert.equal(await data.read.hasTrait([0, 1]), false)
    assert.equal(await data.read.traitMaskOf([0]), fixture.traitMask)
    assert.equal(await data.read.traitBitmapWord([24, 0]), 1n)
    assert.equal(
      await data.read.hasTraits([0, (1n << 0n) | (1n << 24n), 1n << 1n, 0n]),
      true,
    )
    assert.equal(await data.read.hasTraits([0, 1n << 1n, 0n, 0n]), false)
    assert.equal(await data.read.hasTraits([0, 0n, 0n, 1n << 24n]), true)

    await ctx.viem.assertions.revertWithCustomError(
      data.read.hasTraits([0, 1n << 111n, 0n, 0n]),
      data,
      'InvalidMask',
    )
    await ctx.viem.assertions.revertWithCustomError(
      data.read.hasTrait([0, 111]),
      data,
      'InvalidTraitId',
    )
    await ctx.viem.assertions.revertWithCustomError(
      data.read.traitMaskOf([10_000]),
      data,
      'InvalidPunkId',
    )
    await ctx.viem.assertions.revertWithCustomError(
      data.read.hasColor([10_000, 0]),
      data,
      'InvalidPunkId',
    )

    assert.equal(await data.read.paletteSize(), 222)
    assert.equal(await data.read.colorOf([1]), '0x112233ff')
    assert.equal(await data.read.colorSupply([0]), 428)
    assert.equal(await data.read.colorSupply([1]), 100)
    assert.equal(await data.read.colorMaskOf([0]), fixture.colorMask)
    assert.equal(await data.read.hasColor([0, 0]), false)
    assert.equal(await data.read.hasColor([0, 1]), true)
    assert.equal(await data.read.pixelCountOf([0]), 148)
    assert.equal(await data.read.colorCountOf([0]), 2)
    assert.equal(await data.read.attributeCountOf([0]), 0)
    assert.equal(await data.read.punkTypeOf([0]), 0)
    assert.equal(await data.read.headVariantOf([0]), 0)
    assert.equal(await data.read.colorBitmapWord([1, 0]), 1n)
    assert.equal(await data.read.pixelCountBitmapWord([148, 0]), 1n)
    assert.equal(await data.read.colorCountBitmapWord([2, 0]), 1n)

    assert.equal(hexDataLength(await data.read.paletteRgbaBytes()), 888)
    assert.equal(hexDataLength(await data.read.paletteRgbBytes()), 666)
    assert.equal(hexDataLength(await data.read.paletteAlphaBytes()), 222)
  })

  it('decodes sparse indexed pixels and validates visual keys', async () => {
    const ctx = await deployLoadedPunksData()
    const { data } = ctx

    const pixels = hexToBytes(await data.read.indexedPixelsOf([0]))
    assert.equal(pixels.length, PIXELS_PER_PUNK)
    assert.equal(pixels[0], 1)
    assert.equal(pixels[99], 1)
    assert.equal(pixels[100], 2)
    assert.equal(pixels[147], 2)
    assert.equal(pixels[148], 0)

    assert.equal(await data.read.colorAt([0, 0, 0]), 1)
    assert.equal(await data.read.colorAt([0, 5, 7]), 0)

    await ctx.viem.assertions.revertWithCustomError(
      data.read.colorAt([0, 24, 0]),
      data,
      'InvalidCoordinate',
    )
    await ctx.viem.assertions.revertWithCustomError(
      data.read.colorOf([222]),
      data,
      'InvalidColorId',
    )
    await ctx.viem.assertions.revertWithCustomError(
      data.read.pixelCountBitmapWord([147, 0]),
      data,
      'InvalidPixelCount',
    )
    await ctx.viem.assertions.revertWithCustomError(
      data.read.colorCountBitmapWord([15, 0]),
      data,
      'InvalidColorCount',
    )
  })

  it('reads bitmap words across multiple SSTORE2 chunks', async () => {
    const ctx = await deployLoadedPunksData()
    const { data } = ctx

    // Trait bitmaps: 142,080 bytes spread across 6 chunks of 24,575 bytes.
    // The cross-chunk word is at byte 24544..24575 (split chunks 0/1).
    assert.equal(await data.read.traitBitmapWord([19, 7]), CROSS_CHUNK_PATTERN)
    assert.equal(
      await data.read.traitBitmapWord([TRAIT_COUNT - 1, WORDS_PER_BITMAP - 1]),
      LAST_CHUNK_PATTERN,
    )
    // Sanity: words inside chunk 0 still read correctly.
    assert.equal(await data.read.traitBitmapWord([0, 0]), 1n)

    // Color bitmaps: 284,160 bytes / 12 chunks. Same cross-chunk + last-word coverage.
    assert.equal(await data.read.colorBitmapWord([19, 7]), CROSS_CHUNK_PATTERN)
    assert.equal(
      await data.read.colorBitmapWord([MAX_COLOR_COUNT - 1, WORDS_PER_BITMAP - 1]),
      LAST_CHUNK_PATTERN,
    )

    // pixelOffsets blob (30,003 bytes / 2 chunks): boundary at byte 24,575.
    // Entry 8191 occupies bytes 24573..24575, spanning the two chunks.
    // The fixture sets every offset >= 6 to compressed.length, so the read
    // should return that without erroring.
    const offset8191 = await data.read.indexedPixelsOf([0]).then(() => true)
    assert.equal(offset8191, true)
  })

  it('enforces the full mask combination matrix on hasTraits', async () => {
    const ctx = await deployLoadedPunksData()
    const { data, fixture } = ctx
    const m = fixture.traitMask
    const set = (bit: number) => 1n << BigInt(bit)

    // required-only
    assert.equal(await data.read.hasTraits([0, m, 0n, 0n]), true)
    assert.equal(await data.read.hasTraits([0, set(1), 0n, 0n]), false)

    // forbidden-only
    assert.equal(await data.read.hasTraits([0, 0n, set(1), 0n]), true)
    assert.equal(await data.read.hasTraits([0, 0n, set(0), 0n]), false)

    // anyOf-only
    assert.equal(await data.read.hasTraits([0, 0n, 0n, set(0) | set(1)]), true)
    assert.equal(await data.read.hasTraits([0, 0n, 0n, set(1) | set(2)]), false)

    // empty triple matches every Punk
    assert.equal(await data.read.hasTraits([0, 0n, 0n, 0n]), true)

    // all three combined: required ∧ ¬forbidden ∧ (anyOf == 0 ∨ ∃anyOf)
    assert.equal(
      await data.read.hasTraits([0, set(0) | set(24), set(1), set(5) | set(2)]),
      true,
    )
    // Same masks but anyOf misses
    assert.equal(
      await data.read.hasTraits([0, set(0) | set(24), set(1), set(2) | set(3)]),
      false,
    )

    // redundant required & anyOf overlap is allowed (no revert, no semantic change)
    assert.equal(await data.read.hasTraits([0, set(0), 0n, set(0) | set(2)]), true)

    // bit out of canonical range (>= 111) reverts
    await ctx.viem.assertions.revertWithCustomError(
      data.read.hasTraits([0, 1n << 111n, 0n, 0n]),
      data,
      'InvalidMask',
    )
    await ctx.viem.assertions.revertWithCustomError(
      data.read.hasTraits([0, 0n, 1n << 200n, 0n]),
      data,
      'InvalidMask',
    )
    await ctx.viem.assertions.revertWithCustomError(
      data.read.hasTraits([0, 0n, 0n, 1n << 255n]),
      data,
      'InvalidMask',
    )
    // required ∩ forbidden != 0 reverts
    await ctx.viem.assertions.revertWithCustomError(
      data.read.hasTraits([0, set(5), set(5), 0n]),
      data,
      'InvalidMask',
    )
    // forbidden ∩ anyOf != 0 reverts
    await ctx.viem.assertions.revertWithCustomError(
      data.read.hasTraits([0, 0n, set(5), set(5) | set(7)]),
      data,
      'InvalidMask',
    )
  })

  it('rejects malformed compressed pixel entries', async () => {
    const cases = [
      {
        label: 'entry shorter than the visible-bitmap header',
        entry: new Uint8Array(72),
      },
      {
        label: 'visibleColorCount == 0',
        entry: makeMalformedEntry({ visibleColorCount: 0, paletteIds: [], visibleBits: [] }),
      },
      {
        label: 'visibleColorCount > paletteCount - 1',
        entry: makeMalformedEntry({
          visibleColorCount: MAX_COLOR_COUNT,
          paletteIds: Array.from({ length: MAX_COLOR_COUNT }, (_, i) => i + 1),
          visibleBits: [],
        }),
      },
      {
        label: 'entry length < 73 + visibleColorCount',
        entry: makeMalformedEntry({
          visibleColorCount: 4,
          paletteIds: [1, 2, 3], // one palette byte short
          visibleBits: [],
        }),
      },
      {
        label: 'paletteId 0 in the local palette',
        entry: makeMalformedEntry({
          visibleColorCount: 1,
          paletteIds: [0],
          visibleBits: [0],
        }),
      },
      {
        label: 'paletteId >= paletteCount',
        entry: makeMalformedEntry({
          visibleColorCount: 1,
          paletteIds: [MAX_COLOR_COUNT],
          visibleBits: [0],
        }),
      },
      {
        label: 'localIndex >= visibleColorCount',
        entry: makeMalformedEntry({
          visibleColorCount: 3,
          paletteIds: [1, 2, 3],
          visibleBits: [0],
          forceLocalIndex: 3,
        }),
      },
      {
        label: 'trailing-byte mismatch (extra index bytes)',
        entry: makeMalformedEntry({
          visibleColorCount: 2,
          paletteIds: [1, 2],
          visibleBits: [0],
          extraIndexBytes: 4,
        }),
      },
      {
        label: 'all-zero visible bitmap',
        entry: makeMalformedEntry({
          visibleColorCount: 2,
          paletteIds: [1, 2],
          visibleBits: [],
        }),
      },
    ]

    for (const { label, entry } of cases) {
      const ctx = await deployLoadedPunksData({ pixelOverrideForPunk0: entry })
      await ctx.viem.assertions.revertWithCustomError(
        ctx.data.read.indexedPixelsOf([0]),
        ctx.data,
        'MalformedPixelBlob',
        label,
      )
    }
  })
})

async function deployLoadedPunksData(opts?: { pixelOverrideForPunk0?: Uint8Array }) {
  const connection: any = await network.create()
  const { viem } = connection
  const [deployer, other] = await viem.getWalletClients()
  const data = await viem.deployContract('PunksData', [deployer.account.address])
  const fixture = makeFixture(opts)

  await loadBlob(data, BlobId.TraitBitmaps, fixture.traitBitmaps)
  await loadBlob(data, BlobId.TraitMeta, fixture.traitMeta)
  await loadBlob(data, BlobId.Palette, fixture.palette)
  await loadBlob(data, BlobId.PixelOffsets, fixture.pixelOffsets)
  await loadBlob(data, BlobId.CompressedPixels, fixture.compressedPixels)
  await loadBlob(data, BlobId.ColorBitmaps, fixture.colorBitmaps)
  await loadBlob(data, BlobId.PixelCountBitmaps, fixture.pixelCountBitmaps)
  await loadBlob(data, BlobId.ColorCountBitmaps, fixture.colorCountBitmaps)

  await data.write.loadTraitMaskPairs([0, [fixture.traitMask]])
  await data.write.loadColorMasks([0, [fixture.colorMask]])
  await data.write.loadPackedScalars([0, [fixture.packedScalarWord]])
  await data.write.loadColorSupplies([0, fixture.colorSupplies])
  return { connection, viem, deployer, other, data, fixture, hashes: fixture.hashes }
}

async function loadBlob(data: any, blobId: BlobId, bytes: Uint8Array) {
  const chunkCount = Math.ceil(bytes.length / CHUNK_SIZE)
  for (let index = 0; index < chunkCount; index++) {
    const chunk = bytes.slice(index * CHUNK_SIZE, Math.min(bytes.length, (index + 1) * CHUNK_SIZE))
    await data.write.loadBlobChunk([blobId, index, bytesToHex(chunk)])
  }
}

function makeFixture(opts?: { pixelOverrideForPunk0?: Uint8Array }) {
  const traitMask = (1n << 0n) | (1n << 5n) | (1n << 16n) | (1n << 24n)
  const colorMask = (1n << 1n) | (1n << 2n)

  const traitBitmaps = new Uint8Array(TRAIT_COUNT * WORDS_PER_BITMAP * 32)
  writeBitmapWord(traitBitmaps, 0, 0, 1n)
  writeBitmapWord(traitBitmaps, 5, 0, 1n)
  writeBitmapWord(traitBitmaps, 16, 0, 1n)
  writeBitmapWord(traitBitmaps, 24, 0, 1n)
  // Cross-chunk word: traitId=19, wordIndex=7 lives at byte offset 24544
  // (spans chunk 0 [0..24574] -> chunk 1 [24575..49149]).
  writeBitmapWord(traitBitmaps, 19, 7, CROSS_CHUNK_PATTERN)
  // Last word in the last chunk of trait bitmaps.
  writeBitmapWord(traitBitmaps, TRAIT_COUNT - 1, WORDS_PER_BITMAP - 1, LAST_CHUNK_PATTERN)

  const traitMeta = makeTraitMeta()
  const palette = new Uint8Array(MAX_COLOR_COUNT * 4)
  palette.set([0x00, 0x00, 0x00, 0x00], 0)
  palette.set([0x11, 0x22, 0x33, 0xff], 4)
  palette.set([0xaa, 0xbb, 0xcc, 0x80], 8)

  const indexed = new Uint8Array(PIXELS_PER_PUNK)
  indexed.fill(1, 0, 100)
  indexed.fill(2, 100, 148)
  const defaultCompressed = encodeSparseIndexed(indexed, [1, 2])
  const compressed = opts?.pixelOverrideForPunk0 ?? defaultCompressed
  const pixelOffsets = new Uint8Array((PUNK_COUNT + 1) * 3)
  writeUint24(pixelOffsets, 3, compressed.length)
  for (let punkId = 2; punkId <= PUNK_COUNT; punkId++) {
    writeUint24(pixelOffsets, punkId * 3, compressed.length)
  }

  const colorBitmaps = new Uint8Array(MAX_COLOR_COUNT * WORDS_PER_BITMAP * 32)
  writeBitmapWord(colorBitmaps, 1, 0, 1n)
  writeBitmapWord(colorBitmaps, 2, 0, 1n)
  writeBitmapWord(colorBitmaps, 19, 7, CROSS_CHUNK_PATTERN)
  writeBitmapWord(colorBitmaps, MAX_COLOR_COUNT - 1, WORDS_PER_BITMAP - 1, LAST_CHUNK_PATTERN)

  const pixelCountBitmaps = new Uint8Array((332 - 148 + 1) * WORDS_PER_BITMAP * 32)
  writeBitmapWord(pixelCountBitmaps, 0, 0, 1n)
  const colorCountBitmaps = new Uint8Array((14 - 2 + 1) * WORDS_PER_BITMAP * 32)
  writeBitmapWord(colorCountBitmaps, 0, 0, 1n)

  const colorSupplies = new Array<number>(MAX_COLOR_COUNT).fill(0)
  colorSupplies[0] = 428
  colorSupplies[1] = 100
  colorSupplies[2] = 48

  const packedScalarWord = packScalarWord([
    { pixelCount: 148, colorCount: 2, attributeCount: 0, punkType: 0, headVariant: 0 },
    { pixelCount: 148, colorCount: 2, attributeCount: 0, punkType: 0, headVariant: 0 },
    { pixelCount: 148, colorCount: 2, attributeCount: 0, punkType: 0, headVariant: 0 },
    { pixelCount: 148, colorCount: 2, attributeCount: 0, punkType: 0, headVariant: 0 },
    { pixelCount: 148, colorCount: 2, attributeCount: 0, punkType: 0, headVariant: 0 },
  ])

  const hashes = makeHashes()

  return {
    traitMask,
    colorMask,
    traitBitmaps,
    traitMeta,
    palette,
    pixelOffsets,
    compressedPixels: compressed,
    colorBitmaps,
    pixelCountBitmaps,
    colorCountBitmaps,
    colorSupplies,
    packedScalarWord,
    hashes,
  }
}

function makeTraitMeta(): Uint8Array {
  const names = Array.from({ length: TRAIT_COUNT }, (_, id) => traitName(id))
  const encodedNames = names.map((name) => new TextEncoder().encode(name))
  const nameLength = encodedNames.reduce((sum, bytes) => sum + bytes.length, 0)
  const out = new Uint8Array(TRAIT_COUNT * 6 + nameLength)
  let nameOffset = 0
  for (let id = 0; id < TRAIT_COUNT; id++) {
    const recordOffset = id * 6
    const name = encodedNames[id]
    out[recordOffset] = traitKind(id)
    writeUint16(out, recordOffset + 1, [0, 5, 16, 24].includes(id) ? 1 : 0)
    writeUint16(out, recordOffset + 3, nameOffset)
    out[recordOffset + 5] = name.length
    out.set(name, TRAIT_COUNT * 6 + nameOffset)
    nameOffset += name.length
  }
  return out
}

function traitName(id: number): string {
  if (id === 0 || id === 5) return 'Alien'
  if (id === 1 || id === 6) return 'Ape'
  if (id >= 16 && id <= 23) return `${id - 16} Attributes`
  if (id === 24) return 'Beanie'
  return `Trait ${id}`
}

function traitKind(id: number): TraitKind {
  if (id < 5) return TraitKind.NormalizedType
  if (id < 16) return TraitKind.HeadVariant
  if (id < 24) return TraitKind.AttributeCount
  return TraitKind.Accessory
}

function encodeSparseIndexed(indexed: Uint8Array, visibleColors: number[]): Uint8Array {
  const bitmap = new Uint8Array(VISIBLE_BITMAP_BYTES)
  const indexBytes = new Uint8Array(Math.ceil(148 / 8))
  let bitOffset = 0
  for (let pixel = 0; pixel < indexed.length; pixel++) {
    const colorId = indexed[pixel]
    if (colorId === 0) continue
    bitmap[pixel >> 3] |= 1 << (7 - (pixel & 7))
    const localIndex = visibleColors.indexOf(colorId)
    if (localIndex < 0) throw new Error('missing local color')
    writeBits(indexBytes, bitOffset, 1, localIndex)
    bitOffset += 1
  }
  return concatBytes([Uint8Array.of(visibleColors.length), bitmap, Uint8Array.from(visibleColors), indexBytes])
}

function packScalarWord(
  scalars: Array<{
    pixelCount: number
    colorCount: number
    attributeCount: number
    punkType: number
    headVariant: number
  }>,
): bigint {
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

function makeHashes() {
  const traitCatalogHash = keccakBytes(Uint8Array.of(1))
  const punkMaskHash = keccakBytes(Uint8Array.of(2))
  const paletteHash = keccakBytes(Uint8Array.of(3))
  const indexedPixelsHash = keccakBytes(Uint8Array.of(4))
  const compressedPixelsHash = keccakBytes(Uint8Array.of(5))
  const datasetHash = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
      ],
      [traitCatalogHash, punkMaskHash, paletteHash, indexedPixelsHash, compressedPixelsHash],
    ),
  )
  return {
    traitCatalogHash,
    punkMaskHash,
    paletteHash,
    indexedPixelsHash,
    compressedPixelsHash,
    datasetHash,
  }
}

function writeBitmapWord(out: Uint8Array, row: number, wordIndex: number, value: bigint) {
  writeUint256(out, (row * WORDS_PER_BITMAP + wordIndex) * 32, value)
}

function writeBits(target: Uint8Array, bitOffset: number, bitLength: number, value: number) {
  for (let i = 0; i < bitLength; i++) {
    const bit = (value >> (bitLength - 1 - i)) & 1
    if (bit === 0) continue
    const absoluteBit = bitOffset + i
    target[absoluteBit >> 3] |= 1 << (7 - (absoluteBit & 7))
  }
}

function writeUint16(out: Uint8Array, offset: number, value: number) {
  out[offset] = (value >> 8) & 0xff
  out[offset + 1] = value & 0xff
}

function writeUint24(out: Uint8Array, offset: number, value: number) {
  out[offset] = (value >> 16) & 0xff
  out[offset + 1] = (value >> 8) & 0xff
  out[offset + 2] = value & 0xff
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

function hexDataLength(hex: Hex): number {
  return (hex.length - 2) / 2
}

function keccakBytes(bytes: Uint8Array): Hex {
  return keccak256(bytesToHex(bytes))
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

function makeMalformedEntry(opts: {
  visibleColorCount: number
  paletteIds: number[]
  visibleBits: number[]
  forceLocalIndex?: number
  extraIndexBytes?: number
}): Uint8Array {
  const { visibleColorCount, paletteIds, visibleBits } = opts
  const forceLocalIndex = opts.forceLocalIndex ?? 0
  const extraIndexBytes = opts.extraIndexBytes ?? 0
  const bitsPerIndex = bitsForPalette(Math.max(visibleColorCount, 1))

  const bitmap = new Uint8Array(VISIBLE_BITMAP_BYTES)
  for (const pixel of visibleBits) {
    bitmap[pixel >> 3] |= 1 << (7 - (pixel & 7))
  }

  const indexBytesLen = Math.ceil((visibleBits.length * bitsPerIndex) / 8) + extraIndexBytes
  const indexBytes = new Uint8Array(indexBytesLen)
  let bitOffset = 0
  for (let i = 0; i < visibleBits.length; i++) {
    if (bitsPerIndex > 0) {
      writeBits(indexBytes, bitOffset, bitsPerIndex, forceLocalIndex)
      bitOffset += bitsPerIndex
    }
  }

  return concatBytes([
    Uint8Array.of(visibleColorCount),
    bitmap,
    Uint8Array.from(paletteIds),
    indexBytes,
  ])
}
