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
const DEFAULT_CALL_GAS = 500_000_000n
const DEFAULT_RPC_TIMEOUT_MS = 1_200_000

const DEFLATE_BLOCK_END_BITS = [
  304_576, 612_155, 919_475, 1_224_474, 1_528_708, 1_833_212,
  2_137_876, 2_445_230, 2_750_826, 3_056_217, 3_361_045, 3_667_211,
  3_972_211, 4_277_027, 4_581_609, 4_886_183, 5_189_839, 5_493_763,
  5_800_597, 6_104_207, 6_409_532, 6_715_796, 6_782_488,
]

const pngAbi = parseAbi([
  'function dataContract() view returns (address)',
  'function referenceDeflateBlockPayload(uint8 blockIndex) view returns (bytes)',
])

async function main() {
  const rpcUrl = process.env.PUNKS_PNG_RPC_URL
    ?? process.env.PUNKS_DATA_RPC_URL
    ?? process.env.RPC_URL
    ?? DEFAULT_RPC_URL
  const punksData = getAddress(process.env.PUNKS_DATA_ADDRESS ?? DEFAULT_PUNKS_DATA)
  const blockIndexes = readBlockIndexes()
  const callGas = BigInt(process.env.PUNKS_PNG_CALL_GAS ?? DEFAULT_CALL_GAS)
  const rpcTimeout = readRpcTimeout()

  const png = readLocalPunksPng()
  const idat = extractIdat(png)
  const deflate = idat.subarray(2, idat.length - 4)

  console.log(`PunksData ${punksData}`)
  console.log(`RPC ${redactRpcUrl(rpcUrl)}`)
  console.log(`Blocks ${blockIndexes.join(',')}`)
  console.log(`Call gas ${callGas}`)
  console.log(`RPC timeout ${rpcTimeout}ms`)

  const existingPngAddress = process.env.PUNKS_PNG_ADDRESS
  if (existingPngAddress) {
    const encoder = getAddress(existingPngAddress)
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
    console.log(`PunksPng ${encoder}`)

    for (const blockIndex of blockIndexes) {
      await verifyBlock({
        readPayload: () => publicClient.readContract({
          address: encoder,
          abi: pngAbi,
          functionName: 'referenceDeflateBlockPayload',
          args: [blockIndex],
          gas: callGas,
        } as any) as Promise<Hex>,
        deflate,
        blockIndex,
      })
    }
    return
  }

  const mainnet = createPublicClient({ transport: http(rpcUrl, { timeout: rpcTimeout }) })
  const blockNumber = Number(await mainnet.getBlockNumber())
  const { network } = await import('hardhat')
  const connection = await network.create({
    network: 'hardhatMainnet',
    chainType: 'l1',
    override: {
      blockGasLimit: Number(callGas),
      forking: { url: rpcUrl, blockNumber },
    } as any,
  })

  try {
    const { viem } = connection as never as {
      viem: {
        deployContract: (
          name: string,
          args: readonly unknown[],
        ) => Promise<{
          address: Address
          read: {
            referenceDeflateBlockPayload: (
              args: readonly [number],
              options: { gas: bigint },
            ) => Promise<Hex>
          }
        }>
      }
    }
    const encoder = await viem.deployContract('PunksPng', [punksData])
    console.log(`Fork PunksPng ${encoder.address} at block ${blockNumber}`)

    for (const blockIndex of blockIndexes) {
      await verifyBlock({
        readPayload: () => encoder.read.referenceDeflateBlockPayload(
          [blockIndex],
          { gas: callGas },
        ),
        deflate,
        blockIndex,
      })
    }
  } finally {
    await connection.close?.()
  }
}

async function verifyBlock({
  readPayload,
  deflate,
  blockIndex,
}: {
  readPayload: () => Promise<Hex>
  deflate: Uint8Array
  blockIndex: number
}) {
  const startBit = blockIndex === 0 ? 0 : DEFLATE_BLOCK_END_BITS[blockIndex - 1]
  const endBit = DEFLATE_BLOCK_END_BITS[blockIndex]
  console.log(`Block ${blockIndex} bits ${startBit}..${endBit}`)
  const actual = hexToBytes(await readPayload())
  compareBlockBits(actual, deflate, startBit, endBit)
  console.log(`Block ${blockIndex} payload matches reference bits (${actual.length} bytes)`)
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

function extractIdat(png: Buffer): Buffer {
  const parts: Buffer[] = []
  let offset = 8
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    const payload = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IDAT') parts.push(payload)
    offset += 12 + length
    if (type === 'IEND') break
  }
  return Buffer.concat(parts)
}

function compareBlockBits(
  actual: Uint8Array,
  expectedDeflate: Uint8Array,
  startBit: number,
  endBit: number,
) {
  const bitLength = endBit - startBit
  const expectedLength = Math.ceil(bitLength / 8)
  if (actual.length !== expectedLength) {
    throw new Error(`payload length ${actual.length} != ${expectedLength}`)
  }

  for (let bit = 0; bit < bitLength; bit++) {
    const actualBit = (actual[bit >> 3] >> (bit & 7)) & 1
    const expectedBit = (
      expectedDeflate[(startBit + bit) >> 3] >> ((startBit + bit) & 7)
    ) & 1
    if (actualBit !== expectedBit) {
      throw new Error(`bit ${bit}: ${actualBit} != ${expectedBit}`)
    }
  }

  for (let bit = bitLength; bit < actual.length * 8; bit++) {
    const actualBit = (actual[bit >> 3] >> (bit & 7)) & 1
    if (actualBit !== 0) throw new Error(`padding bit ${bit} is ${actualBit}`)
  }
}

function readBlockIndexes(): number[] {
  const raw = process.env.PUNKS_PNG_DEFLATE_BLOCK ?? '0'
  if (raw === 'all') return Array.from(DEFLATE_BLOCK_END_BITS, (_, index) => index)

  const indexes = raw.split(',').map((part) => Number(part.trim()))
  for (const value of indexes) {
    if (!Number.isInteger(value) || value < 0 || value >= DEFLATE_BLOCK_END_BITS.length) {
      throw new Error('PUNKS_PNG_DEFLATE_BLOCK must be "all" or integer(s) in [0, 22]')
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

function hexToBytes(hex: Hex): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
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
