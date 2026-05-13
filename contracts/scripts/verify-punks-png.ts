import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  type Address,
  createPublicClient,
  getAddress,
  http,
  parseAbi,
  type Hex,
} from 'viem'

const execFileAsync = promisify(execFile)

const DEFAULT_PUNKS_DATA = '0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C'
const DEFAULT_RPC_URL = 'https://ethereum-rpc.publicnode.com'

const PUNK_COUNT = 10_000
const PUNK_SIZE = 24
const GRID_SIZE = 100
const MOSAIC_SIZE = 2_400
const RGBA_BYTES_PER_PIXEL = 4
const SCANLINE_BYTES = 1 + MOSAIC_SIZE * RGBA_BYTES_PER_PIXEL
const CONCURRENCY = readPositiveIntEnv('PUNKS_PNG_CONCURRENCY', 8)
const PUNKS_PNG_COLUMN_CHUNK_SIZE = readPositiveIntEnv('PUNKS_PNG_COLUMN_CHUNK_SIZE', 25)
const PUNKS_PNG_CALL_GAS = BigInt(readPositiveIntEnv('PUNKS_PNG_CALL_GAS', 16_000_000))
const RPC_RETRIES = readNonNegativeIntEnv('PUNKS_PNG_RPC_RETRIES', 8)
const RPC_RETRY_BASE_MS = readNonNegativeIntEnv('PUNKS_PNG_RPC_RETRY_BASE_MS', 400)
const RPC_RETRY_MAX_MS = readNonNegativeIntEnv('PUNKS_PNG_RPC_RETRY_MAX_MS', 20_000)

const EXPECTED_SCANLINES_SHA256 =
  '62a66b4618a72410d6d99b5fceee6013fabcb3574728ed5ce437b2a161da8673'
const EXPECTED_IDAT_SHA256 =
  '7d080b4bca3e4c8e19ed53254eb8dc1dd1c887c8b6b3560d3374436c19f9614f'
const EXPECTED_PNG_SHA256 =
  'ac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b'

const dataAbi = parseAbi([
  'function paletteRgbaBytes() view returns (bytes)',
  'function indexedPixelsOf(uint16 punkId) view returns (bytes)',
])

const pngAbi = parseAbi([
  'function dataContract() view returns (address)',
  'function mosaicPngScanlineChunk(uint16 y, uint8 startColumn, uint8 columnCount) view returns (bytes)',
])

type PythonResult = {
  zlibVersion: string
  idatLength: number
  idatSha256: string
  pngLength: number
  pngSha256: string
  localPunksPngMatch?: boolean
}

type SourceMode = 'data' | 'punks-png' | 'fork-punks-png'

type PunksPngSource = {
  label: string
  readChunk: (y: number, startColumn: number, columnCount: number) => Promise<Hex>
  close?: () => Promise<void>
}

async function main() {
  const rpcUrl = process.env.PUNKS_PNG_RPC_URL
    ?? process.env.PUNKS_DATA_RPC_URL
    ?? process.env.RPC_URL
    ?? DEFAULT_RPC_URL
  const punksData = getAddress(process.env.PUNKS_DATA_ADDRESS ?? DEFAULT_PUNKS_DATA)
  const sourceMode = readSourceMode()

  console.log(`PunksData ${punksData}`)
  console.log(`RPC ${redactRpcUrl(rpcUrl)}`)
  console.log(`Source ${sourceMode}`)
  console.log(`Concurrency ${CONCURRENCY}`)
  if (sourceMode !== 'data') {
    if (PUNKS_PNG_COLUMN_CHUNK_SIZE > GRID_SIZE) {
      throw new Error('PUNKS_PNG_COLUMN_CHUNK_SIZE must be <= 100')
    }
    console.log(`PunksPng column chunk size ${PUNKS_PNG_COLUMN_CHUNK_SIZE}`)
    console.log(`PunksPng call gas ${PUNKS_PNG_CALL_GAS}`)
  }

  let closeSource: (() => Promise<void>) | undefined

  try {
    const scanlines = sourceMode === 'data'
      ? await buildScanlinesFromPunksData(rpcUrl, punksData)
      : await (async () => {
          const source = await createPunksPngSource(sourceMode, rpcUrl, punksData)
          closeSource = source.close
          console.log(source.label)
          return buildScanlinesFromPunksPng(source)
        })()

    const scanlinesSha256 = sha256Hex(scanlines)
    console.log(`Inflated scanlines sha256 ${scanlinesSha256}`)
    requireEqual(scanlinesSha256, EXPECTED_SCANLINES_SHA256, 'inflated scanlines sha256')

    const tempDir = await mkdtemp(join(tmpdir(), 'punks-png-'))
    try {
      const scanlinesPath = join(tempDir, 'scanlines.bin')
      await writeFile(scanlinesPath, scanlines)
      const result = await pythonCompress(scanlinesPath, findLocalPunksPng())

      console.log(`Python zlib ${result.zlibVersion}`)
      console.log(`IDAT length ${result.idatLength}`)
      console.log(`IDAT sha256 ${result.idatSha256}`)
      console.log(`PNG length ${result.pngLength}`)
      console.log(`PNG sha256 ${result.pngSha256}`)
      if (result.localPunksPngMatch !== undefined) {
        console.log(`Local punks.png byte match ${result.localPunksPngMatch}`)
      }

      requireEqual(result.idatSha256, EXPECTED_IDAT_SHA256, 'IDAT sha256')
      requireEqual(result.pngSha256, EXPECTED_PNG_SHA256, 'PNG sha256')
      if (result.localPunksPngMatch === false) {
        throw new Error('generated PNG did not byte-match local punks.png')
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  } finally {
    await closeSource?.()
  }
}

async function buildScanlinesFromPunksData(
  rpcUrl: string,
  punksData: Address,
): Promise<Buffer> {
  const publicClient = createPublicClient({ transport: http(rpcUrl) })
  const palette = hexToBytes(await readContractWithRetry(
    `paletteRgbaBytes()`,
    () => publicClient.readContract({
      address: punksData,
      abi: dataAbi,
      functionName: 'paletteRgbaBytes',
    }),
  ))
  if (palette.length % RGBA_BYTES_PER_PIXEL !== 0) {
    throw new Error(`palette length ${palette.length} is not RGBA-aligned`)
  }
  console.log(`Palette ${palette.length / RGBA_BYTES_PER_PIXEL} colors`)

  const indexed = await mapLimit(
    Array.from({ length: PUNK_COUNT }, (_, id) => id),
    CONCURRENCY,
    async (id) => {
      const bytes = hexToBytes(await readContractWithRetry(
        `indexedPixelsOf(${id})`,
        () => publicClient.readContract({
          address: punksData,
          abi: dataAbi,
          functionName: 'indexedPixelsOf',
          args: [id],
        }),
      ))
      if (bytes.length !== PUNK_SIZE * PUNK_SIZE) {
        throw new Error(`Punk ${id}: indexed length ${bytes.length}`)
      }
      if (id % 1000 === 0) console.log(`Read Punk ${id}`)
      return bytes
    },
  )

  return buildScanlines(indexed, palette)
}

async function createPunksPngSource(
  sourceMode: Exclude<SourceMode, 'data'>,
  rpcUrl: string,
  punksData: Address,
): Promise<PunksPngSource> {
  if (sourceMode === 'punks-png') {
    const address = getAddress(requireEnv('PUNKS_PNG_ADDRESS'))
    const publicClient = createPublicClient({ transport: http(rpcUrl) })
    const dataContract = getAddress(await readContractWithRetry(
      `PunksPng.dataContract()`,
      () => publicClient.readContract({
        address,
        abi: pngAbi,
        functionName: 'dataContract',
      }),
    ))
    if (dataContract !== punksData) {
      throw new Error(`PunksPng dataContract ${dataContract} != ${punksData}`)
    }

    return {
      label: `PunksPng ${address}`,
      readChunk: (y, startColumn, columnCount) => readContractWithRetry(
        `mosaicPngScanlineChunk(${y},${startColumn},${columnCount})`,
        () => publicClient.readContract({
          address,
          abi: pngAbi,
          functionName: 'mosaicPngScanlineChunk',
          args: [y, startColumn, columnCount],
          gas: PUNKS_PNG_CALL_GAS,
        } as any) as Promise<Hex>,
      ),
    }
  }

  const mainnet = createPublicClient({ transport: http(rpcUrl) })
  const blockNumber = Number(await mainnet.getBlockNumber())
  const { network } = await import('hardhat')
  const connection = await network.create({
    network: 'hardhatMainnet',
    chainType: 'l1',
    override: { forking: { url: rpcUrl, blockNumber } },
  })
  const { viem } = connection as never as {
    viem: {
      deployContract: (
        name: string,
        args: readonly unknown[],
      ) => Promise<{
        address: Address
        read: {
          mosaicPngScanlineChunk: (
            args: readonly [number, number, number],
            options: { gas: bigint },
          ) => Promise<Hex>
        }
      }>
    }
    close?: () => Promise<void>
  }
  const png = await viem.deployContract('PunksPng', [punksData])

  return {
    label: `Fork PunksPng ${png.address} at block ${blockNumber}`,
    readChunk: (y, startColumn, columnCount) => readContractWithRetry(
      `mosaicPngScanlineChunk(${y},${startColumn},${columnCount})`,
      () => png.read.mosaicPngScanlineChunk(
        [y, startColumn, columnCount],
        { gas: PUNKS_PNG_CALL_GAS },
      ),
    ),
    close: async () => { await connection.close?.() },
  }
}

async function buildScanlinesFromPunksPng(source: PunksPngSource): Promise<Buffer> {
  const scanlines = Buffer.alloc(MOSAIC_SIZE * SCANLINE_BYTES)
  const chunkSize = PUNKS_PNG_COLUMN_CHUNK_SIZE
  const items: Array<{ y: number, startColumn: number, columnCount: number }> = []
  for (let y = 0; y < MOSAIC_SIZE; y++) {
    for (let startColumn = 0; startColumn < GRID_SIZE; startColumn += chunkSize) {
      items.push({
        y,
        startColumn,
        columnCount: Math.min(chunkSize, GRID_SIZE - startColumn),
      })
    }
  }

  await mapLimit(items, CONCURRENCY, async ({ y, startColumn, columnCount }) => {
    const bytes = hexToBytes(await source.readChunk(y, startColumn, columnCount))
    const expected = (startColumn === 0 ? 1 : 0)
      + columnCount * PUNK_SIZE * RGBA_BYTES_PER_PIXEL
    if (bytes.length !== expected) {
      throw new Error(
        `scanline ${y} columns ${startColumn}..${startColumn + columnCount}: `
        + `length ${bytes.length} != ${expected}`,
      )
    }

    const offset = y * SCANLINE_BYTES
      + (startColumn === 0 ? 0 : 1 + startColumn * PUNK_SIZE * RGBA_BYTES_PER_PIXEL)
    scanlines.set(bytes, offset)
    if (startColumn === 0 && y % 100 === 0) console.log(`Read scanline ${y}`)
  })

  return scanlines
}

function buildScanlines(indexed: Uint8Array[], palette: Uint8Array): Buffer {
  const scanlines = Buffer.alloc(MOSAIC_SIZE * SCANLINE_BYTES)
  for (let y = 0; y < MOSAIC_SIZE; y++) {
    const scanlineOffset = y * SCANLINE_BYTES
    scanlines[scanlineOffset] = 0

    const gridY = Math.floor(y / PUNK_SIZE)
    const localY = y % PUNK_SIZE
    for (let col = 0; col < GRID_SIZE; col++) {
      const punk = indexed[gridY * GRID_SIZE + col]
      const srcBase = localY * PUNK_SIZE
      let dst = scanlineOffset + 1 + col * PUNK_SIZE * RGBA_BYTES_PER_PIXEL

      for (let x = 0; x < PUNK_SIZE; x++) {
        const colorId = punk[srcBase + x]
        const palOffset = colorId * RGBA_BYTES_PER_PIXEL
        scanlines[dst++] = palette[palOffset]
        scanlines[dst++] = palette[palOffset + 1]
        scanlines[dst++] = palette[palOffset + 2]
        scanlines[dst++] = palette[palOffset + 3]
      }
    }
  }
  return scanlines
}

async function pythonCompress(
  scanlinesPath: string,
  localPunksPngPath: string | undefined,
): Promise<PythonResult> {
  const python = String.raw`
from pathlib import Path
import hashlib
import json
import struct
import sys
import zlib

scanlines_path = Path(sys.argv[1])
local_path = Path(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else None
raw = scanlines_path.read_bytes()
idat = zlib.compress(raw, 9)

def crc32(data):
    return zlib.crc32(data) & 0xffffffff

def chunk(kind, data):
    typed = kind.encode("ascii")
    return struct.pack(">I", len(data)) + typed + data + struct.pack(">I", crc32(typed + data))

ihdr = struct.pack(">IIBBBBB", 2400, 2400, 8, 6, 0, 0, 0)
parts = [bytes.fromhex("89504e470d0a1a0a"), chunk("IHDR", ihdr)]
for offset in range(0, len(idat), 32768):
    parts.append(chunk("IDAT", idat[offset:offset + 32768]))
parts.append(chunk("IEND", b""))
png = b"".join(parts)

result = {
    "zlibVersion": zlib.ZLIB_VERSION,
    "idatLength": len(idat),
    "idatSha256": hashlib.sha256(idat).hexdigest(),
    "pngLength": len(png),
    "pngSha256": hashlib.sha256(png).hexdigest(),
}
if local_path is not None and local_path.exists():
    result["localPunksPngMatch"] = png == local_path.read_bytes()
print(json.dumps(result))
`
  const args = ['-c', python, scanlinesPath]
  if (localPunksPngPath !== undefined) args.push(localPunksPngPath)
  const { stdout } = await execFileAsync('python3', args, { maxBuffer: 1024 * 1024 })
  return JSON.parse(stdout) as PythonResult
}

function findLocalPunksPng(): string | undefined {
  const candidates = [
    join(process.cwd(), '..', 'punks.png'),
    join(process.cwd(), 'punks.png'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[0]
}

async function readContractWithRetry(label: string, fn: () => Promise<Hex>): Promise<Hex> {
  let lastError: unknown
  for (let attempt = 0; attempt <= RPC_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === RPC_RETRIES) break
      const delayMs = Math.min(RPC_RETRY_BASE_MS * 2 ** attempt, RPC_RETRY_MAX_MS)
        + Math.floor(Math.random() * 100)
      console.warn(`Retry ${label} in ${delayMs}ms: ${shortError(error)}`)
      await sleep(delayMs)
    }
  }
  throw lastError
}

async function mapLimit<T, U>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const out = new Array<U>(items.length)
  let next = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const index = next++
      out[index] = await fn(items[index], index)
    }
  }))
  return out
}

function hexToBytes(hex: Hex): Buffer {
  return Buffer.from(hex.slice(2), 'hex')
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function requireEqual(actual: string, expected: string, label: string) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label} mismatch: ${actual} != ${expected}`)
  }
}

function readSourceMode(): SourceMode {
  const value = process.env.PUNKS_PNG_SOURCE ?? 'data'
  if (value === 'data' || value === 'punks-png' || value === 'fork-punks-png') {
    return value
  }
  throw new Error('PUNKS_PNG_SOURCE must be one of: data, punks-png, fork-punks-png')
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`${name} is required`)
  return value
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function readNonNegativeIntEnv(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return parsed
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shortError(error: unknown): string {
  if (error instanceof Error) return error.message.split('\n')[0].slice(0, 160)
  return String(error).slice(0, 160)
}

function redactRpcUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.pathname.length > 12) parsed.pathname = `${parsed.pathname.slice(0, 8)}...`
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return '<invalid rpc url>'
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
