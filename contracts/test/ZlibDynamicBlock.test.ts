import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { inflateRawSync, inflateSync } from 'node:zlib'
import { network } from 'hardhat'
import { bytesToHex, hexToBytes, type Hex } from 'viem'

describe('ZlibDynamicBlock', () => {
  let ctx: Awaited<ReturnType<typeof deployFixture>>

  before(async () => {
    ctx = await deployFixture()
  })

  it('emits an inflatable final dynamic block with literals and a match', async () => {
    const encoded = Buffer.from(hexToBytes(
      (await ctx.encoder.read.encodeDynamicBlock([
        [0, 0, 0, 1, 0],
        [0x61, 0x62, 0x63, 6, 0x21],
        [0, 0, 0, 3, 0],
        true,
      ])) as Hex,
    ))

    assert.equal(encoded[0] & 0x07, 0x05)
    assert.deepEqual(inflateRawSync(encoded), Buffer.from('abcabcabc!'))
  })

  it('emits length 258 as the dedicated DEFLATE symbol', async () => {
    const encoded = Buffer.from(hexToBytes(
      (await ctx.encoder.read.encodeDynamicBlock([
        [0, 1],
        [0x78, 258],
        [0, 1],
        true,
      ])) as Hex,
    ))

    assert.equal(encoded[0] & 0x07, 0x05)
    assert.deepEqual(inflateRawSync(encoded), Buffer.alloc(259, 0x78))
  })

  it('generates the same lazy zlib tokens for a repeated pattern', async () => {
    const [positions, kinds, values, distances] =
      await ctx.slow.read.generateTokens([bytesToHex(Buffer.from('abcabcabc!'))])

    assert.deepEqual(Array.from(positions, Number), [0, 1, 2, 3, 4, 5, 9])
    assert.deepEqual(Array.from(kinds, Number), [0, 0, 0, 0, 0, 1, 0])
    assert.deepEqual(Array.from(values, Number), [97, 98, 99, 97, 98, 4, 33])
    assert.deepEqual(Array.from(distances, Number), [0, 0, 0, 0, 0, 3, 0])
  })

  it('generates the same lazy zlib tokens for a long run', async () => {
    const [positions, kinds, values, distances] =
      await ctx.slow.read.generateTokens([bytesToHex(Buffer.alloc(259, 0x78))])

    assert.deepEqual(Array.from(positions, Number), [0, 1, 2, 3])
    assert.deepEqual(Array.from(kinds, Number), [0, 0, 0, 1])
    assert.deepEqual(Array.from(values, Number), [120, 120, 120, 256])
    assert.deepEqual(Array.from(distances, Number), [0, 0, 0, 1])
  })

  it('generates bounded token ranges without storing skipped tokens', async () => {
    const [positions, kinds, values, distances] =
      await ctx.slow.read.generateTokenRange([
        bytesToHex(Buffer.from('abcabcabc!')),
        2,
        3,
      ])

    assert.deepEqual(Array.from(positions, Number), [2, 3, 4])
    assert.deepEqual(Array.from(kinds, Number), [0, 0, 0])
    assert.deepEqual(Array.from(values, Number), [99, 97, 98])
    assert.deepEqual(Array.from(distances, Number), [0, 0, 0])
  })

  it('generates empty bounded token ranges', async () => {
    const [positions, kinds, values, distances] =
      await ctx.slow.read.generateTokenRange([
        bytesToHex(Buffer.from('abcabcabc!')),
        2,
        0,
      ])

    assert.equal(positions.length, 0)
    assert.equal(kinds.length, 0)
    assert.equal(values.length, 0)
    assert.equal(distances.length, 0)
  })

  it('compresses raw bytes through generated tokens and an inflatable dynamic block', async () => {
    const raw = Buffer.from('abcabcabc!')
    const encoded = Buffer.from(hexToBytes(
      (await ctx.level9.read.encodeRawDynamicBlock([bytesToHex(raw)])) as Hex,
    ))

    assert.equal(encoded[0] & 0x07, 0x05)
    assert.deepEqual(inflateRawSync(encoded), raw)
  })

  it('PunksPngZlib emits a dynamic block from a bounded token range', async () => {
    const raw = Buffer.from('abcabcabc!')
    const encoded = Buffer.from(hexToBytes(
      (await ctx.zlib.read.encodeDynamicBlockFromTokenRange([
        bytesToHex(raw),
        0,
        7,
        true,
      ])) as Hex,
    ))

    assert.equal(encoded[0] & 0x07, 0x05)
    assert.deepEqual(inflateRawSync(encoded), raw)
  })

  it('PunksPngZlib rejects incomplete token ranges', async () => {
    await ctx.viem.assertions.revertWithCustomError(
      ctx.zlib.read.encodeDynamicBlockFromTokenRange([
        bytesToHex(Buffer.from('abcabcabc!')),
        0,
        8,
        true,
      ]),
      ctx.zlib,
      'TokenRangeIncomplete',
    )
  })

  it('wraps generated dynamic blocks in a valid zlib stream', async () => {
    const raw = Buffer.from('abcabcabc!')
    const encoded = Buffer.from(hexToBytes(
      (await ctx.level9.read.encodeZlib([bytesToHex(raw)])) as Hex,
    ))

    assert.equal(encoded[0], 0x78)
    assert.equal(encoded[1], 0xda)
    assert.deepEqual(inflateSync(encoded), raw)
  })

  it('keeps multiple dynamic blocks bit-contiguous inside a zlib stream', async () => {
    const raw = Buffer.from('abcabcabc!')
    const encoded = Buffer.from(hexToBytes(
      (await ctx.level9.read.encodeZlibWithTokenLimit([bytesToHex(raw), 3])) as Hex,
    ))

    assert.equal(encoded[0], 0x78)
    assert.equal(encoded[1], 0xda)
    assert.deepEqual(inflateSync(encoded), raw)
  })

  it('wraps empty input in a valid zlib stream', async () => {
    const encoded = Buffer.from(hexToBytes(
      (await ctx.level9.read.encodeZlib(['0x'])) as Hex,
    ))

    assert.equal(encoded[0], 0x78)
    assert.equal(encoded[1], 0xda)
    assert.deepEqual(encoded.subarray(encoded.length - 4), Buffer.from([0, 0, 0, 1]))
    assert.deepEqual(inflateSync(encoded), Buffer.alloc(0))
  })
})

async function deployFixture() {
  const connection: any = await network.create()
  const { viem } = connection
  const encoder = await viem.deployContract('MockZlibDynamicBlock')
  const slow = await viem.deployContract('MockZlibSlow')
  const level9 = await viem.deployContract('MockZlibLevel9')
  const zlib = await viem.deployContract('PunksPngZlib')
  return { connection, viem, encoder, slow, level9, zlib }
}
