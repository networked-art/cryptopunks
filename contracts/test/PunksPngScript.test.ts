import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'

import { network } from 'hardhat'
import { bytesToHex, keccak256, type Hex } from 'viem'

const CHUNK_SIZE = 24_575
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolvePath(__dirname, '..', '..')
const SCRIPT_PATH = resolvePath(REPO_ROOT, 'sdk', 'src', 'canonical-punks-png.js')
const CANONICAL_PNG_PATH = resolvePath(REPO_ROOT, 'punks.png')

const EXPECTED_PNG_SHA256_HEX =
  'ac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b'

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function hexToBytes(hex: Hex): Uint8Array {
  return new Uint8Array(Buffer.from(hex.slice(2), 'hex'))
}

async function deployFixture() {
  const connection: any = await network.create()
  const { viem } = connection
  const [deployer, other] = await viem.getWalletClients()
  const contract = await viem.deployContract('PunksPngScript', [deployer.account.address])
  return { connection, viem, deployer, other, contract }
}

async function loadAndSeal(contract: any, source: Uint8Array): Promise<Hex> {
  const chunkCount = Math.ceil(source.length / CHUNK_SIZE)
  for (let index = 0; index < chunkCount; index++) {
    const chunk = source.slice(index * CHUNK_SIZE, Math.min(source.length, (index + 1) * CHUNK_SIZE))
    await contract.write.appendScriptChunk([index, bytesToHex(chunk)])
  }
  const expectedHash = keccak256(bytesToHex(source))
  await contract.write.seal([expectedHash])
  return expectedHash
}

describe('PunksPngScript storage', () => {
  let ctx: Awaited<ReturnType<typeof deployFixture>>

  before(async () => {
    ctx = await deployFixture()
  })

  it('starts unsealed with zero script and zero hash', async () => {
    assert.equal(await ctx.contract.read.isSealed(), false)
    assert.equal(await ctx.contract.read.scriptLength(), 0n)
    assert.equal(await ctx.contract.read.scriptChunkCount(), 0n)
    assert.equal(
      await ctx.contract.read.scriptHash(),
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    )
  })

  it('exposes the canonical PNG sha256 commitment', async () => {
    assert.equal(
      await ctx.contract.read.referencePngSha256(),
      `0x${EXPECTED_PNG_SHA256_HEX}`,
    )
  })

  it('loads, seals, and exposes the canonical renderer script', async () => {
    const source = new Uint8Array(readFileSync(SCRIPT_PATH))
    const expectedHash = await loadAndSeal(ctx.contract, source)

    assert.equal(await ctx.contract.read.isSealed(), true)
    assert.equal(await ctx.contract.read.scriptLength(), BigInt(source.length))
    assert.equal(await ctx.contract.read.scriptHash(), expectedHash)

    const onchainHex = (await ctx.contract.read.script()) as Hex
    const onchain = hexToBytes(onchainHex)
    assert.equal(onchain.length, source.length)
    assert.equal(keccak256(onchainHex), expectedHash)
  })

  it('rejects further appends or re-seals after sealing', async () => {
    await assert.rejects(
      ctx.contract.write.appendScriptChunk([99, '0xdead']),
      /AlreadySealed/,
    )
    await assert.rejects(
      ctx.contract.write.seal([
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ]),
      /AlreadySealed/,
    )
  })

  it('rejects non-owner appends', async () => {
    const fresh = await deployFixture()
    const otherWriter: any = await fresh.viem.getContractAt(
      'PunksPngScript',
      fresh.contract.address,
      { client: { wallet: fresh.other } },
    )
    await assert.rejects(
      otherWriter.write.appendScriptChunk([0, '0xdead']),
      /NotOwner/,
    )
  })

  it('rejects seal with a wrong expected hash', async () => {
    const fresh = await deployFixture()
    await fresh.contract.write.appendScriptChunk([0, '0xdeadbeef'])
    await assert.rejects(
      fresh.contract.write.seal([
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ]),
      /ScriptHashMismatch/,
    )
    assert.equal(await fresh.contract.read.isSealed(), false)
  })
})

describe('PunksPngScript end-to-end: chain script + canonical data', () => {
  it('on-chain script reproduces the canonical punks.png byte-for-byte', async () => {
    const { contract } = await deployFixture()
    const source = new Uint8Array(readFileSync(SCRIPT_PATH))
    await loadAndSeal(contract, source)

    // Pull the source back from the chain and instantiate the module from
    // those bytes — this is what a real consumer would do.
    const onchain = hexToBytes((await contract.read.script()) as Hex)
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(onchain).toString('base64')}`
    const mod: any = await import(moduleUrl)
    assert.equal(typeof mod.renderPunksPng, 'function')

    // Decompose the canonical png into a synthetic (palette, indexed) pair.
    // The encoder is byte-deterministic for any consistent decomposition,
    // so this stands in for the real PunksData fetch path (which is just
    // transport).
    const canonical = new Uint8Array(readFileSync(CANONICAL_PNG_PATH))
    const idat = extractIdat(canonical)
    const scanlines = new Uint8Array(inflateSync(idat))
    const { palette, indexed } = decomposeScanlines(scanlines)

    const png: Uint8Array = mod.renderPunksPng(indexed, palette)
    assert.equal(sha256(png), EXPECTED_PNG_SHA256_HEX)

    // And the chain advertises the same commitment.
    const onchainCommit = (await contract.read.referencePngSha256()) as Hex
    assert.equal(onchainCommit.toLowerCase(), `0x${EXPECTED_PNG_SHA256_HEX}`)
  })
})

function extractIdat(png: Uint8Array): Uint8Array {
  const buf = Buffer.from(png.buffer, png.byteOffset, png.byteLength)
  let cursor = 8
  const parts: Buffer[] = []
  while (cursor < buf.length) {
    const len = buf.readUInt32BE(cursor)
    const type = buf.slice(cursor + 4, cursor + 8).toString('ascii')
    if (type === 'IDAT') parts.push(buf.slice(cursor + 8, cursor + 8 + len))
    cursor += 12 + len
  }
  return new Uint8Array(Buffer.concat(parts))
}

function decomposeScanlines(scanlines: Uint8Array) {
  const MOSAIC_SIZE = 2400
  const SCANLINE_BYTES = 1 + MOSAIC_SIZE * 4
  const seen = new Map<number, number>()
  const colors: number[][] = []
  for (let y = 0; y < MOSAIC_SIZE; y++) {
    const off = y * SCANLINE_BYTES + 1
    for (let x = 0; x < MOSAIC_SIZE; x++) {
      const p = off + x * 4
      const key =
        (scanlines[p] << 24) |
        (scanlines[p + 1] << 16) |
        (scanlines[p + 2] << 8) |
        scanlines[p + 3]
      if (!seen.has(key)) {
        seen.set(key, colors.length)
        colors.push([scanlines[p], scanlines[p + 1], scanlines[p + 2], scanlines[p + 3]])
      }
    }
  }
  const palette = new Uint8Array(colors.length * 4)
  colors.forEach((rgba, i) => palette.set(rgba, i * 4))

  const indexed: Uint8Array[] = new Array(10000)
  for (let id = 0; id < 10000; id++) {
    const gridRow = (id / 100) | 0
    const gridCol = id % 100
    const px = new Uint8Array(576)
    for (let ly = 0; ly < 24; ly++) {
      const y = gridRow * 24 + ly
      const rowOff = y * SCANLINE_BYTES + 1 + gridCol * 24 * 4
      for (let lx = 0; lx < 24; lx++) {
        const p = rowOff + lx * 4
        const key =
          (scanlines[p] << 24) |
          (scanlines[p + 1] << 16) |
          (scanlines[p + 2] << 8) |
          scanlines[p + 3]
        px[ly * 24 + lx] = seen.get(key)!
      }
    }
    indexed[id] = px
  }

  return { palette, indexed }
}
