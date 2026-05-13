import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { network } from 'hardhat'
import { bytesToHex, type Hex } from 'viem'

import { hexToBytes } from '../scripts/lib/punks-builder.js'
import {
  buildPngFlattened,
  buildPngTransparent,
  crc32,
} from './helpers/renderer-reference.js'

const PUNK_SIZE = 24
const GRID_SIZE = 100
const INDEXED_ROW_BYTES = 57_600
const RGBA_ROW_BYTES = 230_400
const SCANLINE_ROW_BYTES = 230_424
const SCANLINE_BYTES = 9_601
const RGBA_SCANLINE_BYTES = 9_600

describe('PunksPng', () => {
  let ctx: Awaited<ReturnType<typeof deployFixture>>

  before(async () => {
    ctx = await deployFixture()
  })

  it('exposes the underlying PunksData address', async () => {
    const onchain = ((await ctx.png.read.dataContract()) as string).toLowerCase()
    assert.equal(onchain, ctx.data.address.toLowerCase())
  })

  it('exposes canonical mosaic dimensions and reference hashes', async () => {
    assert.deepEqual(await ctx.png.read.mosaicSize(), [2400, 2400])
    assert.equal(await ctx.png.read.compositePngChunkCount(), 28)
    assert.deepEqual(await ctx.png.read.mosaicGridSize(), [100, 100])
    assert.deepEqual(await ctx.png.read.mosaicCoordOf([0]), [0, 0])
    assert.deepEqual(await ctx.png.read.mosaicCoordOf([99]), [2376, 0])
    assert.deepEqual(await ctx.png.read.mosaicCoordOf([100]), [0, 24])
    assert.deepEqual(await ctx.png.read.mosaicCoordOf([9999]), [2376, 2376])

    assert.equal(
      await ctx.png.read.mosaicPixelsHash(),
      '0xdb0e780ac7553b5dd6a3bb02ed2bf8106c16659e15a36797294e01e8817286bf',
    )
    assert.equal(
      await ctx.png.read.referencePngSha256(),
      '0xac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b',
    )
    assert.equal(
      await ctx.png.read.referenceIdatSha256(),
      '0x7d080b4bca3e4c8e19ed53254eb8dc1dd1c887c8b6b3560d3374436c19f9614f',
    )
    assert.equal(
      await ctx.png.read.referenceInflatedScanlinesSha256(),
      '0x62a66b4618a72410d6d99b5fceee6013fabcb3574728ed5ce437b2a161da8673',
    )

    assert.equal(await ctx.png.read.referenceDeflateBlockCount(), 23)
    assert.deepEqual(await ctx.png.read.referenceDeflateBlock([0]), [
      0,
      1_075_553,
      16_383,
    ])
    assert.deepEqual(await ctx.png.read.referenceDeflateBlock([22]), [
      22_851_278,
      23_042_400,
      3_537,
    ])
    assert.deepEqual(await ctx.png.read.referenceDeflateBlockBits([0]), [
      0,
      304_576,
    ])
    assert.deepEqual(await ctx.png.read.referenceDeflateBlockBits([22]), [
      6_715_796,
      6_782_488,
    ])
  })

  it('exposes composite PNG framing chunks', async () => {
    const header = hexToBytes((await ctx.png.read.compositePngChunk([0])) as Hex)
    const expectedHeader = Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      Buffer.from(pngChunk('IHDR', Uint8Array.from([
        0, 0, 9, 96,
        0, 0, 9, 96,
        8, 6, 0, 0, 0,
      ]))),
    ])
    assert.deepEqual(Buffer.from(header), expectedHeader)

    const iend = hexToBytes((await ctx.png.read.compositePngChunk([27])) as Hex)
    assert.equal(Buffer.from(iend).toString('hex'), '0000000049454e44ae426082')
  })

  it('mosaicIndexedRow returns one raster-order Punk row', async () => {
    const row = hexToBytes(
      (await ctx.png.read.mosaicIndexedRow([0], { gas: 16_000_000n })) as Hex,
    )
    assert.equal(row.length, INDEXED_ROW_BYTES)
    assert.deepEqual(row, expectedIndexedRow(0))
  })

  it('mosaicRgbaRow expands one raster-order Punk row through the palette', async () => {
    const row = hexToBytes(
      (await ctx.png.read.mosaicRgbaRow([0], { gas: 16_000_000n })) as Hex,
    )
    assert.equal(row.length, RGBA_ROW_BYTES)
    assert.deepEqual(row, expandIndexed(expectedIndexedRow(0), mockPaletteRgba()))
  })

  it('mosaicScanlineRow adds PNG filter bytes to one RGBA Punk row', async () => {
    const scanlines = hexToBytes(
      (await ctx.png.read.mosaicScanlineRow([0], { gas: 16_000_000n })) as Hex,
    )
    assert.equal(scanlines.length, SCANLINE_ROW_BYTES)

    const rgba = expandIndexed(expectedIndexedRow(0), mockPaletteRgba())
    for (let row = 0; row < PUNK_SIZE; row++) {
      assert.equal(scanlines[row * SCANLINE_BYTES], 0)
      assert.deepEqual(
        scanlines.subarray(row * SCANLINE_BYTES + 1, (row + 1) * SCANLINE_BYTES),
        rgba.subarray(row * 9600, (row + 1) * 9600),
      )
    }
  })

  it('mosaic scanline views expose one callable PNG scanline', async () => {
    const y = 17
    const indexed = hexToBytes((await ctx.png.read.mosaicIndexedScanline([y])) as Hex)
    const rgba = hexToBytes((await ctx.png.read.mosaicRgbaScanline([y])) as Hex)
    const pngScanline = hexToBytes((await ctx.png.read.mosaicPngScanline([y])) as Hex)
    const expectedIndexed = expectedIndexedRow(0).subarray(
      y * GRID_SIZE * PUNK_SIZE,
      (y + 1) * GRID_SIZE * PUNK_SIZE,
    )
    const expectedRgba = expandIndexed(expectedIndexed, mockPaletteRgba())

    assert.equal(indexed.length, GRID_SIZE * PUNK_SIZE)
    assert.equal(rgba.length, RGBA_SCANLINE_BYTES)
    assert.equal(pngScanline.length, SCANLINE_BYTES)
    assert.deepEqual(indexed, expectedIndexed)
    assert.deepEqual(rgba, expectedRgba)
    assert.equal(pngScanline[0], 0)
    assert.deepEqual(pngScanline.subarray(1), expectedRgba)
  })

  it('mosaic scanline chunks concatenate to the same PNG scanline', async () => {
    const y = 17
    const a = hexToBytes((await ctx.png.read.mosaicPngScanlineChunk([y, 0, 40])) as Hex)
    const b = hexToBytes((await ctx.png.read.mosaicPngScanlineChunk([y, 40, 40])) as Hex)
    const c = hexToBytes((await ctx.png.read.mosaicPngScanlineChunk([y, 80, 20])) as Hex)
    const full = hexToBytes((await ctx.png.read.mosaicPngScanline([y])) as Hex)

    assert.equal(a[0], 0)
    assert.equal(b.length, 40 * PUNK_SIZE * 4)
    assert.equal(c.length, 20 * PUNK_SIZE * 4)
    assert.deepEqual(Buffer.concat([a, b, c]), Buffer.from(full))
  })

  it('mosaicPngScanlineSlice returns byte-addressed inflated scanline ranges', async () => {
    const offset = SCANLINE_BYTES - 3
    const length = 10
    const onchain = hexToBytes(
      (await ctx.png.read.mosaicPngScanlineSlice([offset, length])) as Hex,
    )
    const expected = Buffer.concat([
      Buffer.from(expectedPngScanline(0).subarray(SCANLINE_BYTES - 3)),
      Buffer.from(expectedPngScanline(1).subarray(0, 7)),
    ])

    assert.deepEqual(Buffer.from(onchain), expected)
  })

  it('mosaicPngScanlineSlice accepts empty ranges', async () => {
    const onchain = hexToBytes(
      (await ctx.png.read.mosaicPngScanlineSlice([0, 0])) as Hex,
    )

    assert.equal(onchain.length, 0)
  })

  it('punkPng returns the same transparent PNG-8 bytes as the reference encoder', async () => {
    const punkId = 123
    const onchain = hexToBytes((await ctx.png.read.punkPng([punkId])) as Hex)
    const expected = buildPngTransparent(mockIndexedPunk(punkId), mockPaletteRgba())
    assert.deepEqual(onchain, expected)
  })

  it('punkPng with a background returns the same flattened PNG-8 bytes as the reference encoder', async () => {
    const punkId = 123
    const background = { r: 0x63, g: 0x85, b: 0x96 }
    const onchain = hexToBytes(
      (await ctx.png.read.punkPng([punkId, '0x638596ff' as Hex])) as Hex,
    )
    const expected = buildPngFlattened(mockIndexedPunk(punkId), mockPaletteRgba(), background)
    assert.deepEqual(onchain, expected)
  })

  it('rejects invalid ids, rows, and non-opaque flattened backgrounds', async () => {
    await ctx.viem.assertions.revertWithCustomError(
      ctx.png.read.mosaicCoordOf([10_000]),
      ctx.png,
      'InvalidPunkId',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.png.read.mosaicIndexedRow([100]),
      ctx.png,
      'InvalidRowIndex',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.png.read.mosaicIndexedScanlineChunk([0, 99, 2]),
      ctx.png,
      'InvalidColumnRange',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.png.read.punkPng([0, '0x638596fe' as Hex]),
      ctx.png,
      'InvalidBackground',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.png.read.mosaicPngScanlineSlice([23_042_400, 1]),
      ctx.png,
      'InvalidScanlineRange',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.png.read.referenceDeflateBlock([23]),
      ctx.png,
      'InvalidDeflateBlock',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.png.read.referenceDeflateBlockBits([23]),
      ctx.png,
      'InvalidDeflateBlock',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.png.read.compositePngChunk([28]),
      ctx.png,
      'InvalidCompositeChunk',
    )
  })
})

async function deployFixture() {
  const connection: any = await network.create()
  const { viem } = connection
  const data = await viem.deployContract('MockPunksPngData')
  const png = await viem.deployContract('PunksPng', [data.address])
  return { connection, viem, data, png }
}

function mockIndexedPunk(punkId: number): Uint8Array {
  const out = new Uint8Array(PUNK_SIZE * PUNK_SIZE)
  out.fill(1 + (punkId % 14))
  return out
}

function expectedIndexedRow(rowIndex: number): Uint8Array {
  const out = new Uint8Array(INDEXED_ROW_BYTES)
  for (let col = 0; col < GRID_SIZE; col++) {
    const punk = mockIndexedPunk(rowIndex * GRID_SIZE + col)
    for (let localY = 0; localY < PUNK_SIZE; localY++) {
      out.set(
        punk.subarray(localY * PUNK_SIZE, (localY + 1) * PUNK_SIZE),
        localY * GRID_SIZE * PUNK_SIZE + col * PUNK_SIZE,
      )
    }
  }
  return out
}

function expectedPngScanline(y: number): Uint8Array {
  const rowIndex = Math.floor(y / PUNK_SIZE)
  const localY = y % PUNK_SIZE
  const indexedRow = expectedIndexedRow(rowIndex)
  const indexed = indexedRow.subarray(
    localY * GRID_SIZE * PUNK_SIZE,
    (localY + 1) * GRID_SIZE * PUNK_SIZE,
  )
  const rgba = expandIndexed(indexed, mockPaletteRgba())
  const out = new Uint8Array(SCANLINE_BYTES)
  out.set(rgba, 1)
  return out
}

function mockPaletteRgba(): Uint8Array {
  const out = new Uint8Array(222 * 4)
  for (let i = 0; i < 222; i++) {
    out[i * 4] = i
    out[i * 4 + 1] = 255 - i
    out[i * 4 + 2] = (i * 17) & 0xff
    out[i * 4 + 3] = i === 0 ? 0 : 0xff
  }
  return out
}

function expandIndexed(indexed: Uint8Array, palette: Uint8Array): Uint8Array {
  const out = new Uint8Array(indexed.length * 4)
  for (let i = 0; i < indexed.length; i++) {
    const src = indexed[i] * 4
    out[i * 4] = palette[src]
    out[i * 4 + 1] = palette[src + 1]
    out[i * 4 + 2] = palette[src + 2]
    out[i * 4 + 3] = palette[src + 3]
  }
  return out
}

function pngChunk(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + payload.length)
  out[0] = (payload.length >>> 24) & 0xff
  out[1] = (payload.length >>> 16) & 0xff
  out[2] = (payload.length >>> 8) & 0xff
  out[3] = payload.length & 0xff
  out.set(Buffer.from(type, 'ascii'), 4)
  out.set(payload, 8)
  const crc = crc32(out.subarray(4, 8 + payload.length))
  out[8 + payload.length] = (crc >>> 24) & 0xff
  out[9 + payload.length] = (crc >>> 16) & 0xff
  out[10 + payload.length] = (crc >>> 8) & 0xff
  out[11 + payload.length] = crc & 0xff
  return out
}
