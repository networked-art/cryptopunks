import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createPublicClient,
  getAddress,
  http,
  parseAbi,
  type Address,
  type Hex,
} from 'viem'

const DEFAULT_PUNKS_DATA = '0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C'
const DEFAULT_RPC_URL = 'https://ethereum-rpc.publicnode.com'
const DEFAULT_CALL_GAS = 300_000_000_000n
const DEFAULT_RPC_TIMEOUT_MS = 1_200_000

const pngAbi = parseAbi([
  'function dataContract() view returns (address)',
  'function compositePngChunkCount() view returns (uint16)',
  'function compositePngChunk(uint16 chunkIndex) view returns (bytes)',
])

async function main() {
  const rpcUrl = process.env.PUNKS_PNG_RPC_URL
    ?? process.env.PUNKS_DATA_RPC_URL
    ?? process.env.RPC_URL
    ?? DEFAULT_RPC_URL
  const punksData = getAddress(process.env.PUNKS_DATA_ADDRESS ?? DEFAULT_PUNKS_DATA)
  const encoder = getAddress(requireEnv('PUNKS_PNG_ADDRESS'))
  const callGas = BigInt(process.env.PUNKS_PNG_CALL_GAS ?? DEFAULT_CALL_GAS)
  const rpcTimeout = readRpcTimeout()
  const expectedChunks = splitReferencePng(readLocalPunksPng())
  const chunkIndexes = readChunkIndexes(expectedChunks.length)

  console.log(`PunksData ${punksData}`)
  console.log(`PunksPng ${encoder}`)
  console.log(`RPC ${redactRpcUrl(rpcUrl)}`)
  console.log(`Chunks ${chunkIndexes.join(',')}`)
  console.log(`Call gas ${callGas}`)
  console.log(`RPC timeout ${rpcTimeout}ms`)

  const publicClient = createPublicClient({
    transport: http(rpcUrl, { timeout: rpcTimeout }),
  })
  const dataContract = getAddress(await publicClient.readContract({
    address: encoder,
    abi: pngAbi,
    functionName: 'dataContract',
  }))
  if (dataContract !== punksData) {
    throw new Error(`PunksPng dataContract ${dataContract} != ${punksData}`)
  }

  const count = Number(await publicClient.readContract({
    address: encoder,
    abi: pngAbi,
    functionName: 'compositePngChunkCount',
  }))
  if (count !== expectedChunks.length) {
    throw new Error(`compositePngChunkCount ${count} != ${expectedChunks.length}`)
  }

  for (const chunkIndex of chunkIndexes) {
    const actual = hexToBytes(await publicClient.readContract({
      address: encoder,
      abi: pngAbi,
      functionName: 'compositePngChunk',
      args: [chunkIndex],
      gas: callGas,
    } as any) as Hex)
    const expected = expectedChunks[chunkIndex]
    if (!buffersEqual(actual, expected)) {
      throw new Error(`chunk ${chunkIndex} mismatch: ${firstDiff(actual, expected)}`)
    }
    console.log(`Chunk ${chunkIndex} matches reference (${actual.length} bytes)`)
  }
}

function splitReferencePng(png: Buffer): Buffer[] {
  const chunks: Buffer[] = [png.subarray(0, 33)]
  let offset = 33
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    chunks.push(png.subarray(offset, offset + 12 + length))
    offset += 12 + length
    if (type === 'IEND') break
  }
  return chunks
}

function readLocalPunksPng(): Buffer {
  const candidates = [
    join(process.cwd(), '..', 'punks.png'),
    join(process.cwd(), 'punks.png'),
    join(process.cwd(), '..', '..', 'punks.png'),
  ]
  const path = candidates.find((candidate) => existsSync(candidate))
  if (!path) throw new Error(`punks.png not found in: ${candidates.join(', ')}`)
  return readFileSync(path)
}

function readChunkIndexes(chunkCount: number): number[] {
  const raw = process.env.PUNKS_PNG_CHUNK ?? 'all'
  if (raw === 'all') return Array.from({ length: chunkCount }, (_, index) => index)

  const indexes = raw.split(',').map((part) => Number(part.trim()))
  for (const value of indexes) {
    if (!Number.isInteger(value) || value < 0 || value >= chunkCount) {
      throw new Error(`PUNKS_PNG_CHUNK must be "all" or integer(s) in [0, ${chunkCount - 1}]`)
    }
  }
  return indexes
}

function readRpcTimeout(): number {
  const value = Number(process.env.PUNKS_PNG_RPC_TIMEOUT_MS ?? DEFAULT_RPC_TIMEOUT_MS)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('PUNKS_PNG_RPC_TIMEOUT_MS must be a positive integer')
  }
  return value
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function hexToBytes(hex: Hex): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function buffersEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false
  }
  return true
}

function firstDiff(left: Uint8Array, right: Uint8Array): string {
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return `byte ${i}: ${left[i]} != ${right[i]}`
  }
  return `length ${left.length} != ${right.length}`
}

function redactRpcUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.pathname.length > 8) parsed.pathname = '/...'
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return '<invalid-url>'
  }
}

await main()
