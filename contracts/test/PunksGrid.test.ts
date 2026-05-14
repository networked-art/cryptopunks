import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { Buffer } from 'node:buffer'
import { network } from 'hardhat'
import { type Hex } from 'viem'

import { hexToBytes } from '../scripts/lib/punks-builder.js'

const PUNK_COUNT = 10_000
const GRID_SIZE = 100
const BITMAP_ROW_BYTES = 13
const BITMAP_BYTES = 1_300
const WORD_COUNT = 40
const PIXEL_COUNT_MIN = 148
const COLOR_COUNT_MIN = 2
const READ_GAS = 16_000_000n

type Filter = {
  requiredTraitMask: bigint
  forbiddenTraitMask: bigint
  anyOfTraitMask: bigint
  requiredColorMask: bigint
  forbiddenColorMask: bigint
  anyOfColorMask: bigint
  minPixelCount: number
  maxPixelCount: number
  minColorCount: number
  maxColorCount: number
}

const emptyFilter = (): Filter => ({
  requiredTraitMask: 0n,
  forbiddenTraitMask: 0n,
  anyOfTraitMask: 0n,
  requiredColorMask: 0n,
  forbiddenColorMask: 0n,
  anyOfColorMask: 0n,
  minPixelCount: 0,
  maxPixelCount: 0,
  minColorCount: 0,
  maxColorCount: 0,
})

describe('PunksGrid', () => {
  let ctx: Awaited<ReturnType<typeof deployFixture>>

  before(async () => {
    ctx = await deployFixture()
  })

  it('exposes the dataset address and grid dimensions', async () => {
    const onchain = ((await ctx.grid.read.dataContract()) as string).toLowerCase()
    assert.equal(onchain, ctx.data.address.toLowerCase())
    assert.deepEqual(await ctx.grid.read.gridSize(), [GRID_SIZE, GRID_SIZE])
    assert.deepEqual(await ctx.grid.read.gridCoordOf([0]), [0, 0])
    assert.deepEqual(await ctx.grid.read.gridCoordOf([99]), [99, 0])
    assert.deepEqual(await ctx.grid.read.gridCoordOf([100]), [0, 1])
    assert.deepEqual(await ctx.grid.read.gridCoordOf([9_999]), [99, 99])
  })

  it('rejects out-of-range punkIds in gridCoordOf', async () => {
    await ctx.viem.assertions.revertWithCustomError(
      ctx.grid.read.gridCoordOf([PUNK_COUNT]),
      ctx.grid,
      'InvalidPunkId',
    )
  })

  it('empty filter lights every Punk', async () => {
    const bits = hexToBytes(
      (await ctx.grid.read.gridBitmap([emptyFilter()], { gas: READ_GAS })) as Hex,
    )
    assert.equal(bits.length, BITMAP_BYTES)
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let i = 0; i < BITMAP_ROW_BYTES - 1; i++) {
        assert.equal(bits[row * BITMAP_ROW_BYTES + i], 0xff)
      }
      assert.equal(bits[row * BITMAP_ROW_BYTES + 12], 0xf0)
    }

    const png = hexToBytes(
      (await ctx.grid.read.gridPng([emptyFilter()], { gas: READ_GAS })) as Hex,
    )
    const decoded = decodeOneBitIndexedPng(png)
    assert.equal(decoded.width, GRID_SIZE)
    assert.equal(decoded.height, GRID_SIZE)
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        assert.equal(decoded.bits[y * GRID_SIZE + x], 1, `(${x},${y})`)
      }
    }
  })

  it('matches a required trait against a seeded set of Punks', async () => {
    const traitId = 7
    const matchIds = [0, 1, 99, 100, 4_321, 9_999]
    for (const punkId of matchIds) {
      await ctx.data.write.addPunkTrait([punkId, traitId])
    }

    const filter = emptyFilter()
    filter.requiredTraitMask = 1n << BigInt(traitId)

    const bits = hexToBytes(
      (await ctx.grid.read.gridBitmap([filter], { gas: READ_GAS })) as Hex,
    )
    assert.deepEqual([...collectBits(bits)].sort((a, b) => a - b), matchIds)

    const png = hexToBytes(
      (await ctx.grid.read.gridPng([filter], { gas: READ_GAS })) as Hex,
    )
    const decoded = decodeOneBitIndexedPng(png)
    const decodedSet = new Set<number>()
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (decoded.bits[y * GRID_SIZE + x] === 1) decodedSet.add(y * GRID_SIZE + x)
      }
    }
    assert.deepEqual([...decodedSet].sort((a, b) => a - b), matchIds)
  })

  it('combines required color, pixel-count range, and color-count range', async () => {
    const colorId = 5
    // Two of these match the color, only one matches the count ranges.
    await ctx.data.write.addPunkColor([42, colorId])
    await ctx.data.write.addPunkPixelCount([42, 200])
    await ctx.data.write.addPunkColorCount([42, 5])

    await ctx.data.write.addPunkColor([200, colorId])
    await ctx.data.write.addPunkPixelCount([200, 150])
    await ctx.data.write.addPunkColorCount([200, 3])

    await ctx.data.write.addPunkColor([777, colorId])
    await ctx.data.write.addPunkPixelCount([777, 220])
    await ctx.data.write.addPunkColorCount([777, 10])

    const filter = emptyFilter()
    filter.requiredColorMask = 1n << BigInt(colorId)
    filter.minPixelCount = 200
    filter.maxPixelCount = 220
    filter.minColorCount = 4
    filter.maxColorCount = 12

    const bits = hexToBytes(
      (await ctx.grid.read.gridBitmap([filter], { gas: READ_GAS })) as Hex,
    )
    assert.deepEqual([...collectBits(bits)].sort((a, b) => a - b), [42, 777])
  })

  it('honors forbidden traits and anyOf groups', async () => {
    // Trait 20 marks our candidate punks.
    for (const punkId of [10, 11, 12, 13]) {
      await ctx.data.write.addPunkTrait([punkId, 20])
    }
    // Trait 21 forbids one of them.
    await ctx.data.write.addPunkTrait([11, 21])
    // Trait 22 / 23 are the anyOf set; tag two of the remainder.
    await ctx.data.write.addPunkTrait([10, 22])
    await ctx.data.write.addPunkTrait([13, 23])

    const filter = emptyFilter()
    filter.requiredTraitMask = 1n << 20n
    filter.forbiddenTraitMask = 1n << 21n
    filter.anyOfTraitMask = (1n << 22n) | (1n << 23n)

    const bits = hexToBytes(
      (await ctx.grid.read.gridBitmap([filter], { gas: READ_GAS })) as Hex,
    )
    assert.deepEqual([...collectBits(bits)].sort((a, b) => a - b), [10, 13])
  })

  it('rejects invalid filters', async () => {
    const filter = emptyFilter()
    filter.requiredTraitMask = 1n << 200n // outside canonical trait space (111 bits)

    await ctx.viem.assertions.revertWithCustomError(
      ctx.grid.read.gridBitmap([filter]),
      ctx.grid,
      'InvalidTraitMask',
    )
  })

  it('produces a valid 100x100 1-bit indexed PNG with tRNS', async () => {
    const filter = emptyFilter()
    filter.requiredTraitMask = 1n << 7n // matches the punks seeded above

    const png = hexToBytes(
      (await ctx.grid.read.gridPng([filter], { gas: READ_GAS })) as Hex,
    )

    assert.deepEqual(
      Buffer.from(png.subarray(0, 8)),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )

    const chunks = parseChunks(png)
    assert.deepEqual(chunks.map((c) => c.type), ['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'])

    const ihdr = chunks[0]!.data
    assert.equal(readUint32(ihdr, 0), GRID_SIZE)
    assert.equal(readUint32(ihdr, 4), GRID_SIZE)
    assert.equal(ihdr[8], 1) // bit depth
    assert.equal(ihdr[9], 3) // color type = indexed
    assert.equal(ihdr[10], 0) // compression
    assert.equal(ihdr[11], 0) // filter
    assert.equal(ihdr[12], 0) // interlace

    assert.equal(chunks[1]!.data.length, 6) // two palette entries
    assert.deepEqual(Array.from(chunks[2]!.data), [0x00, 0xff]) // tRNS
  })
})

async function deployFixture() {
  const connection: any = await network.create()
  const { viem } = connection
  const data = await viem.deployContract('MockPunksGridData')
  const grid = await viem.deployContract('PunksGrid', [data.address])
  return { connection, viem, data, grid }
}

function collectBits(bits: Uint8Array): Set<number> {
  const out = new Set<number>()
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const byte = bits[y * BITMAP_ROW_BYTES + (x >> 3)]
      if ((byte & (1 << (7 - (x & 7)))) !== 0) out.add(y * GRID_SIZE + x)
    }
  }
  return out
}

type Chunk = { type: string; data: Uint8Array }

function parseChunks(png: Uint8Array): Chunk[] {
  const out: Chunk[] = []
  let i = 8
  while (i < png.length) {
    const length = readUint32(png, i)
    const type = Buffer.from(png.subarray(i + 4, i + 8)).toString('ascii')
    const data = png.subarray(i + 8, i + 8 + length)
    out.push({ type, data })
    i += 8 + length + 4
    if (type === 'IEND') break
  }
  return out
}

function readUint32(data: Uint8Array, offset: number): number {
  return (
    data[offset] * 0x1000000
    + (data[offset + 1] << 16)
    + (data[offset + 2] << 8)
    + data[offset + 3]
  )
}

function decodeOneBitIndexedPng(png: Uint8Array): {
  width: number
  height: number
  bits: Uint8Array
} {
  const chunks = parseChunks(png)
  const idat = chunks.find((c) => c.type === 'IDAT')
  if (!idat) throw new Error('missing IDAT')
  const ihdr = chunks.find((c) => c.type === 'IHDR')!
  const width = readUint32(ihdr.data, 0)
  const height = readUint32(ihdr.data, 4)

  const raw = inflateSync(Buffer.from(idat.data))
  const stride = Math.ceil(width / 8)
  assert.equal(raw.length, height * (1 + stride))

  const bits = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const rowOff = y * (1 + stride)
    assert.equal(raw[rowOff], 0, `filter byte ${y}`)
    for (let x = 0; x < width; x++) {
      const byte = raw[rowOff + 1 + (x >> 3)]
      bits[y * width + x] = (byte & (1 << (7 - (x & 7)))) !== 0 ? 1 : 0
    }
  }
  return { width, height, bits }
}
