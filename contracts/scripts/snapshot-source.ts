import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  bytesToHex,
  createPublicClient,
  http,
  keccak256,
  parseAbi,
  type Hex,
} from 'viem'

import { RGBA_BYTES_PER_PUNK, hexToBytes } from './lib/punks-builder.js'

const SOURCE_DATA = '0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2' as const
const SOURCE_CHAIN_ID = 1
const SOURCE_BLOCK_NUMBER = 25_044_552n
const SOURCE_BLOCK_HASH =
  '0x2185f56dcb307a56cb8b90c1e61d4fd7898be906eb28d79e14c01d15f5cabb9f'
const SOURCE_EXTCODEHASH =
  '0x52ab51c14a3f26a80eca178374e21027492fd276c7365f9ab234b737d34c6b60'

const OUTPUT_DIR = process.env.SNAPSHOT_OUTPUT ?? 'test/fixtures'
const RPC_URL =
  process.env.MAINNET_RPC_URL ??
  process.env.PUNKS_DATA_RPC_URL ??
  process.env.RPC_URL ??
  'https://ethereum-rpc.publicnode.com'

// Hand-picked subset that exercises every meaningful axis:
//  - id boundaries (0, 1, 9998, 9999)
//  - one example of each head variant (per docs/cryptopunks-data-research/05)
//  - all eight zero-attribute Punk ids (per docs/05)
//  - min/max pixel-count and visible-color-count examples (per docs/07)
//  - a handful spread by id for breadth
const SNAPSHOT_IDS: readonly number[] = [
  0, 1, 2, 4, 10, 15, 17, 31, 100, 117, 233, 281, 338, 372, 465, 510, 635, 641,
  741, 1000, 1050, 2204, 3307, 4067, 5000, 6487, 6980, 7334, 8348, 8888, 9998,
  9999,
]

const dataAbi = parseAbi([
  'function punkAttributes(uint16 punkId) view returns (string)',
  'function punkImage(uint16 punkId) view returns (bytes)',
])

async function main() {
  console.log(`Snapshot RPC: ${redactRpcUrl(RPC_URL)}`)
  const publicClient = createPublicClient({ transport: http(RPC_URL) })

  const chainId = await publicClient.getChainId()
  if (chainId !== SOURCE_CHAIN_ID) {
    throw new Error(`Expected chain ${SOURCE_CHAIN_ID}, got ${chainId}`)
  }

  const block = await publicClient.getBlock({
    blockNumber: SOURCE_BLOCK_NUMBER,
  })
  if (block.hash.toLowerCase() !== SOURCE_BLOCK_HASH.toLowerCase()) {
    throw new Error(`Pinned block hash mismatch: ${block.hash}`)
  }

  const code = await publicClient.getCode({
    address: SOURCE_DATA,
    blockNumber: SOURCE_BLOCK_NUMBER,
  })
  const codeHash = keccak256(code ?? '0x')
  if (codeHash.toLowerCase() !== SOURCE_EXTCODEHASH.toLowerCase()) {
    throw new Error(`Pinned source extcodehash mismatch: ${codeHash}`)
  }

  console.log(
    `Snapshotting ${SNAPSHOT_IDS.length} Punks at block ${SOURCE_BLOCK_NUMBER}`,
  )

  const attributes: string[] = []
  const images: Uint8Array[] = []
  const imageSha256s: string[] = []

  for (const id of SNAPSHOT_IDS) {
    const attrs = (await publicClient.readContract({
      address: SOURCE_DATA,
      abi: dataAbi,
      functionName: 'punkAttributes',
      args: [id],
      blockNumber: SOURCE_BLOCK_NUMBER,
    })) as string

    const imageHex = (await publicClient.readContract({
      address: SOURCE_DATA,
      abi: dataAbi,
      functionName: 'punkImage',
      args: [id],
      blockNumber: SOURCE_BLOCK_NUMBER,
    })) as Hex

    const image = hexToBytes(imageHex)
    if (image.length !== RGBA_BYTES_PER_PUNK) {
      throw new Error(`Punk ${id} image length ${image.length}`)
    }

    attributes.push(attrs)
    images.push(image)
    imageSha256s.push(createHash('sha256').update(image).digest('hex'))
    console.log(`  ${id}: ${attrs}`)
  }

  const concatenated = new Uint8Array(images.length * RGBA_BYTES_PER_PUNK)
  images.forEach((image, i) => concatenated.set(image, i * RGBA_BYTES_PER_PUNK))

  await mkdir(OUTPUT_DIR, { recursive: true })

  const binPath = join(OUTPUT_DIR, 'source-snapshot.bin')
  await writeFile(binPath, Buffer.from(concatenated))

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      address: SOURCE_DATA,
      chainId: SOURCE_CHAIN_ID,
      blockNumber: Number(SOURCE_BLOCK_NUMBER),
      blockHash: SOURCE_BLOCK_HASH,
      extcodehash: SOURCE_EXTCODEHASH,
    },
    bytesPerImage: RGBA_BYTES_PER_PUNK,
    snapshotIds: [...SNAPSHOT_IDS],
    attributes,
    imageSha256s,
    imagesSha256: createHash('sha256').update(concatenated).digest('hex'),
    imageBlobFile: 'source-snapshot.bin',
  }

  const jsonPath = join(OUTPUT_DIR, 'source-snapshot.json')
  await writeFile(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`)

  console.log(`Wrote ${jsonPath}`)
  console.log(
    `Wrote ${binPath} (${concatenated.length} bytes, ${manifest.imagesSha256})`,
  )
}

function redactRpcUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.username !== '') parsed.username = '...'
    if (parsed.password !== '') parsed.password = '...'
    return parsed.toString()
  } catch {
    return '<custom rpc>'
  }
}

await main()
