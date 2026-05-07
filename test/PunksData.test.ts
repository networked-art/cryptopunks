import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { network } from 'hardhat'
import {
  bytesToHex,
  encodeAbiParameters,
  keccak256,
  zeroAddress,
  type Hex,
} from 'viem'

const SOURCE_DATA = '0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2'
const PUNK_COUNT = 10_000
const TRAIT_COUNT = 111
const WORDS_PER_BITMAP = 40
const MAX_COLOR_COUNT = 222
const CHUNK_SIZE = 24_575

const BLOB_TRAIT_BITMAPS = 1
const BLOB_TRAIT_META = 2
const BLOB_PALETTE = 3
const BLOB_PIXEL_OFFSETS = 4
const BLOB_COMPRESSED_PIXELS = 5
const BLOB_COLOR_BITMAPS = 6
const BLOB_PIXEL_COUNT_BITMAPS = 7
const BLOB_COLOR_COUNT_BITMAPS = 8

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
    const { data, other, hashes } = ctx

    const dataAsOther = await ctx.viem.getContractAt('PunksData', data.address, {
      client: { wallet: other },
    })
    await assert.rejects(
      () => dataAsOther.write.loadColorMasks([0, [0n]]),
      /0x7bfa4b9f|NotAdmin/,
    )

    await ctx.viem.assertions.revertWithCustomError(
      data.write.loadBlobChunk([BLOB_PALETTE, 99, '0x12']),
      data,
      'InvalidChunkIndex',
    )

    await data.write.seal([
      hashes.traitCatalogHash,
      hashes.punkMaskHash,
      hashes.paletteHash,
      hashes.indexedPixelsHash,
      hashes.compressedPixelsHash,
    ])

    assert.equal(await data.read.isSealed(), true)
    assert.equal(((await data.read.admin()) as string).toLowerCase(), zeroAddress)
    assert.equal(
      ((await data.read.datasetHash()) as string).toLowerCase(),
      hashes.datasetHash.toLowerCase(),
    )

    await assert.rejects(
      () => data.write.loadColorMasks([0, [0n]]),
      /0x7bfa4b9f|NotAdmin/,
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

    const alienHash = keccakBytes(new TextEncoder().encode('Alien'))
    assert.deepEqual(
      await data.read.traitIdByNameHash([alienHash, TraitKind.NormalizedType]),
      [0, true],
    )
    assert.deepEqual(
      await data.read.traitIdByNameHash([alienHash, TraitKind.HeadVariant]),
      [5, true],
    )
    await assert.rejects(() => data.read.traitIdByNameHash([alienHash, 4]))

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

    assert.equal(await data.read.colorCount(), 222)
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
    assert.equal(pixels.length, 576)
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
})

async function deployLoadedPunksData() {
  const connection: any = await network.create()
  const { viem } = connection
  const [deployer, other] = await viem.getWalletClients()
  const data = await viem.deployContract('PunksData', [
    SOURCE_DATA,
    deployer.account.address,
  ])
  const fixture = makeFixture()

  await loadBlob(data, BLOB_TRAIT_BITMAPS, fixture.traitBitmaps)
  await loadBlob(data, BLOB_TRAIT_META, fixture.traitMeta)
  await loadBlob(data, BLOB_PALETTE, fixture.palette)
  await loadBlob(data, BLOB_PIXEL_OFFSETS, fixture.pixelOffsets)
  await loadBlob(data, BLOB_COMPRESSED_PIXELS, fixture.compressedPixels)
  await loadBlob(data, BLOB_COLOR_BITMAPS, fixture.colorBitmaps)
  await loadBlob(data, BLOB_PIXEL_COUNT_BITMAPS, fixture.pixelCountBitmaps)
  await loadBlob(data, BLOB_COLOR_COUNT_BITMAPS, fixture.colorCountBitmaps)

  await data.write.loadTraitMaskPairs([0, [fixture.traitMask]])
  await data.write.loadColorMasks([0, [fixture.colorMask]])
  await data.write.loadPackedScalars([0, [fixture.packedScalarWord]])
  await data.write.loadColorSupplies([0, fixture.colorSupplies])
  await data.write.loadTraitNameHashes([
    [
      keccakBytes(new TextEncoder().encode('Alien')),
      keccakBytes(new TextEncoder().encode('Alien')),
      keccakBytes(new TextEncoder().encode('Beanie')),
    ],
    [TraitKind.NormalizedType, TraitKind.HeadVariant, TraitKind.Accessory],
    [0, 5, 24],
  ])

  return { connection, viem, deployer, other, data, fixture, hashes: fixture.hashes }
}

async function loadBlob(data: any, blobId: number, bytes: Uint8Array) {
  const chunkCount = Math.ceil(bytes.length / CHUNK_SIZE)
  for (let index = 0; index < chunkCount; index++) {
    const chunk = bytes.slice(index * CHUNK_SIZE, Math.min(bytes.length, (index + 1) * CHUNK_SIZE))
    await data.write.loadBlobChunk([blobId, index, bytesToHex(chunk)])
  }
}

function makeFixture() {
  const traitMask = (1n << 0n) | (1n << 5n) | (1n << 16n) | (1n << 24n)
  const colorMask = (1n << 1n) | (1n << 2n)

  const traitBitmaps = new Uint8Array(TRAIT_COUNT * WORDS_PER_BITMAP * 32)
  writeBitmapWord(traitBitmaps, 0, 0, 1n)
  writeBitmapWord(traitBitmaps, 5, 0, 1n)
  writeBitmapWord(traitBitmaps, 16, 0, 1n)
  writeBitmapWord(traitBitmaps, 24, 0, 1n)

  const traitMeta = makeTraitMeta()
  const palette = new Uint8Array(MAX_COLOR_COUNT * 4)
  palette.set([0x00, 0x00, 0x00, 0x00], 0)
  palette.set([0x11, 0x22, 0x33, 0xff], 4)
  palette.set([0xaa, 0xbb, 0xcc, 0x80], 8)

  const indexed = new Uint8Array(576)
  indexed.fill(1, 0, 100)
  indexed.fill(2, 100, 148)
  const compressed = encodeSparseIndexed(indexed, [1, 2])
  const pixelOffsets = new Uint8Array((PUNK_COUNT + 1) * 3)
  writeUint24(pixelOffsets, 3, compressed.length)
  for (let punkId = 2; punkId <= PUNK_COUNT; punkId++) {
    writeUint24(pixelOffsets, punkId * 3, compressed.length)
  }

  const colorBitmaps = new Uint8Array(MAX_COLOR_COUNT * WORDS_PER_BITMAP * 32)
  writeBitmapWord(colorBitmaps, 1, 0, 1n)
  writeBitmapWord(colorBitmaps, 2, 0, 1n)

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
  const bitmap = new Uint8Array(72)
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
