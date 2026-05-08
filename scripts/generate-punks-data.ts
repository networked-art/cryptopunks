import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  bytesToHex,
  createPublicClient,
  http,
  keccak256,
  parseAbi,
  type Hex,
} from 'viem'

import {
  PIXELS_PER_PUNK,
  PUNK_COUNT,
  RGBA_BYTES_PER_PUNK,
  buildDataset,
  countVisiblePixels,
  hexToBytes,
  sortedVisibleColors,
  type SourceRow,
} from './lib/punks-builder.js'

const SOURCE_DATA =
  '0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2' as const
const SOURCE_CHAIN_ID = 1
const SOURCE_BLOCK_NUMBER = 25_044_552n
const SOURCE_BLOCK_HASH =
  '0x2185f56dcb307a56cb8b90c1e61d4fd7898be906eb28d79e14c01d15f5cabb9f'
const SOURCE_EXTCODEHASH =
  '0x52ab51c14a3f26a80eca178374e21027492fd276c7365f9ab234b737d34c6b60'

const OUTPUT_DIR = process.env.PUNKS_DATA_OUTPUT ?? 'scripts/output/punks-data'
const RAW_CACHE_ENABLED = process.env.PUNKS_DATA_RAW_CACHE !== '0'
const RAW_CACHE_DIR = process.env.PUNKS_DATA_RAW_CACHE_DIR ?? join(OUTPUT_DIR, 'raw')
const CONCURRENCY = readPositiveIntEnv('PUNKS_DATA_CONCURRENCY', 4)
const RPC_RETRIES = readNonNegativeIntEnv('PUNKS_DATA_RPC_RETRIES', 8)
const RPC_RETRY_BASE_MS = readNonNegativeIntEnv('PUNKS_DATA_RPC_RETRY_BASE_MS', 750)
const RPC_RETRY_MAX_MS = readNonNegativeIntEnv('PUNKS_DATA_RPC_RETRY_MAX_MS', 30_000)
const REQUEST_DELAY_MS = readNonNegativeIntEnv('PUNKS_DATA_REQUEST_DELAY_MS', 0)
const RPC_URL =
  process.env.PUNKS_DATA_RPC_URL ??
  process.env.RPC_URL ??
  'https://ethereum-rpc.publicnode.com'

const dataAbi = parseAbi([
  'function punkAttributes(uint16 punkId) view returns (string)',
  'function punkImage(uint16 punkId) view returns (bytes)',
])

type RawPunkCache = {
  version: 1
  source: {
    address: string
    chainId: number
    blockNumber: number
  }
  id: number
  attributes: string
  image: Hex
  imageSha256: string
}

async function main() {
  const publicClient = createPublicClient({
    transport: http(RPC_URL),
  })

  const chainId = await publicClient.getChainId()
  if (chainId !== SOURCE_CHAIN_ID) {
    throw new Error(`Expected chain ${SOURCE_CHAIN_ID}, got ${chainId}`)
  }

  const block = await publicClient.getBlock({ blockNumber: SOURCE_BLOCK_NUMBER })
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

  console.log(`Using RPC ${redactRpcUrl(RPC_URL)}`)
  console.log(
    `RPC settings: concurrency=${CONCURRENCY}, retries=${RPC_RETRIES}, requestDelayMs=${REQUEST_DELAY_MS}`,
  )
  if (RAW_CACHE_ENABLED) {
    await mkdir(RAW_CACHE_DIR, { recursive: true })
    console.log(`Raw cache ${RAW_CACHE_DIR}`)
  }
  console.log(`Reading ${PUNK_COUNT} Punk attribute/image pairs`)
  const rows = await mapLimit(
    Array.from({ length: PUNK_COUNT }, (_, id) => id),
    CONCURRENCY,
    async (id): Promise<SourceRow> => {
      const cached = await readRawPunkCache(id)
      if (cached !== undefined) {
        if (id % 500 === 0) console.log(`  cached ${id}`)
        return cached
      }

      const attributes = await withRpcRetry(`punkAttributes(${id})`, async () => {
        await sleep(REQUEST_DELAY_MS)
        return publicClient.readContract({
          address: SOURCE_DATA,
          abi: dataAbi,
          functionName: 'punkAttributes',
          args: [id],
          blockNumber: SOURCE_BLOCK_NUMBER,
        })
      })
      const imageHex = await withRpcRetry(`punkImage(${id})`, async () => {
        await sleep(REQUEST_DELAY_MS)
        return publicClient.readContract({
          address: SOURCE_DATA,
          abi: dataAbi,
          functionName: 'punkImage',
          args: [id],
          blockNumber: SOURCE_BLOCK_NUMBER,
        })
      })
      const image = hexToBytes(imageHex)
      if (image.length !== RGBA_BYTES_PER_PUNK) {
        throw new Error(`Punk ${id} image length ${image.length}`)
      }
      await writeRawPunkCache({ id, attributes, image })
      if (id % 500 === 0) console.log(`  read ${id}`)
      return { id, attributes, image }
    },
  )

  rows.sort((a, b) => a.id - b.id)

  const attrHash = createHash('sha256')
  const imageHash = createHash('sha256')
  for (const row of rows) {
    attrHash.update(`${row.id}:${row.attributes}\n`, 'utf8')
    imageHash.update(row.image)
  }

  const dataset = buildDataset(rows)

  const visualMetricsHash = createHash('sha256')
  for (let id = 0; id < PUNK_COUNT; id++) {
    const slice = dataset.indexedPixels.subarray(id * PIXELS_PER_PUNK, (id + 1) * PIXELS_PER_PUNK)
    const visibleColors = sortedVisibleColors(slice)
    const visiblePixelCount = countVisiblePixels(slice)
    visualMetricsHash.update(
      `${id}:${visiblePixelCount}:${visibleColors.length}:${visibleColors.join(',')}\n`,
      'utf8',
    )
  }

  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeBinary('trait-bitmaps.bin', dataset.traitBitmapsBytes)
  await writeBinary('trait-meta.bin', dataset.traitMeta)
  await writeBinary('palette.bin', dataset.paletteBytes)
  await writeBinary('pixel-offsets.bin', dataset.pixelOffsets)
  await writeBinary('compressed-pixels.bin', dataset.compressedPixels)
  await writeBinary('color-bitmaps.bin', dataset.colorBitmapsBytes)
  await writeBinary('pixel-count-bitmaps.bin', dataset.pixelCountBitmapsBytes)
  await writeBinary('color-count-bitmaps.bin', dataset.colorCountBitmapsBytes)
  await writeBinary('trait-mask-pairs.bin', dataset.traitMaskPairsBytes)
  await writeBinary('color-masks.bin', dataset.colorMasksBytes)
  await writeBinary('packed-scalars.bin', dataset.packedScalarsBytes)
  await writeBinary('color-supplies.bin', dataset.colorSuppliesBytes)

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: {
      address: SOURCE_DATA,
      chainId: SOURCE_CHAIN_ID,
      blockNumber: Number(SOURCE_BLOCK_NUMBER),
      blockHash: SOURCE_BLOCK_HASH,
      extcodehash: SOURCE_EXTCODEHASH,
    },
    counts: {
      punks: PUNK_COUNT,
      traits: dataset.traits.length,
      colors: dataset.palette.length,
    },
    hashes: {
      sourceAttributesSha256: attrHash.digest('hex'),
      sourceImagesSha256: imageHash.digest('hex'),
      visualMetricsSha256: visualMetricsHash.digest('hex'),
      traitCatalogHash: dataset.traitCatalogHash,
      punkMaskHash: dataset.punkMaskHash,
      paletteHash: dataset.paletteHash,
      indexedPixelsHash: dataset.indexedPixelsHash,
      compressedPixelsHash: dataset.compressedPixelsHash,
      datasetHash: dataset.datasetHash,
    },
    files: {
      traitBitmaps: 'trait-bitmaps.bin',
      traitMeta: 'trait-meta.bin',
      palette: 'palette.bin',
      pixelOffsets: 'pixel-offsets.bin',
      compressedPixels: 'compressed-pixels.bin',
      colorBitmaps: 'color-bitmaps.bin',
      pixelCountBitmaps: 'pixel-count-bitmaps.bin',
      colorCountBitmaps: 'color-count-bitmaps.bin',
      traitMaskPairs: 'trait-mask-pairs.bin',
      colorMasks: 'color-masks.bin',
      packedScalars: 'packed-scalars.bin',
      colorSupplies: 'color-supplies.bin',
    },
    palette: dataset.palette,
    traits: dataset.traits,
  }
  await writeFile(
    join(OUTPUT_DIR, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )

  console.log(`Wrote ${OUTPUT_DIR}`)
  console.log(`datasetHash ${dataset.datasetHash}`)
}

async function readRawPunkCache(id: number): Promise<SourceRow | undefined> {
  if (!RAW_CACHE_ENABLED) return undefined

  try {
    const parsed = JSON.parse(await readFile(rawPunkCachePath(id), 'utf8')) as unknown
    if (!isRawPunkCache(parsed, id)) return undefined

    const image = hexToBytes(parsed.image)
    if (image.length !== RGBA_BYTES_PER_PUNK) return undefined

    const imageSha256 = sha256Hex(image)
    if (parsed.imageSha256 !== imageSha256) return undefined

    return {
      id,
      attributes: parsed.attributes,
      image,
    }
  } catch (error) {
    if (isMissingFileError(error)) return undefined
    console.warn(`  ignoring invalid raw cache for Punk ${id}: ${shortError(error)}`)
    return undefined
  }
}

async function writeRawPunkCache(row: SourceRow): Promise<void> {
  if (!RAW_CACHE_ENABLED) return

  const payload: RawPunkCache = {
    version: 1,
    source: {
      address: SOURCE_DATA,
      chainId: SOURCE_CHAIN_ID,
      blockNumber: Number(SOURCE_BLOCK_NUMBER),
    },
    id: row.id,
    attributes: row.attributes,
    image: bytesToHex(row.image),
    imageSha256: sha256Hex(row.image),
  }

  const path = rawPunkCachePath(row.id)
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmpPath, `${JSON.stringify(payload)}\n`)
  await rename(tmpPath, path)
}

function isRawPunkCache(value: unknown, id: number): value is RawPunkCache {
  if (!isRecord(value)) return false
  if (value.version !== 1 || value.id !== id) return false
  if (typeof value.attributes !== 'string' || value.attributes.length === 0) return false
  if (typeof value.image !== 'string' || !/^0x[0-9a-fA-F]*$/.test(value.image)) {
    return false
  }
  if (typeof value.imageSha256 !== 'string') return false
  if (!isRecord(value.source)) return false
  if (
    typeof value.source.address !== 'string'
      || typeof value.source.chainId !== 'number'
      || typeof value.source.blockNumber !== 'number'
  ) return false

  return value.source.address.toLowerCase() === SOURCE_DATA.toLowerCase()
    && value.source.chainId === SOURCE_CHAIN_ID
    && value.source.blockNumber === Number(SOURCE_BLOCK_NUMBER)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function rawPunkCachePath(id: number): string {
  return join(RAW_CACHE_DIR, `${String(id).padStart(4, '0')}.json`)
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT'
}

async function withRpcRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= RPC_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === RPC_RETRIES) break

      const delayMs = retryDelayMs(attempt, isRateLimitError(error))
      console.warn(
        `  retry ${label} in ${delayMs}ms (attempt ${attempt + 1}/${RPC_RETRIES}): ${shortError(error)}`,
      )
      await sleep(delayMs)
    }
  }
  throw lastError
}

function retryDelayMs(attempt: number, rateLimited: boolean): number {
  const exponential = RPC_RETRY_BASE_MS * 2 ** attempt
  const capped = Math.min(exponential, RPC_RETRY_MAX_MS)
  const floor = rateLimited ? Math.max(capped, 2_500) : capped
  return floor + Math.floor(Math.random() * 250)
}

function shortError(error: unknown): string {
  const text = errorText(error)
  const status = statusCode(error)
  if (status !== undefined) return `status ${status}`
  return text.split('\n')[0].slice(0, 160)
}

function isRateLimitError(error: unknown): boolean {
  return statusCode(error) === 429 || /429|too many requests|rate limit/i.test(errorText(error))
}

function statusCode(error: unknown): number | undefined {
  let current: unknown = error
  while (current !== undefined && current !== null) {
    if (typeof current === 'object' && 'status' in current) {
      const status = Number((current as { status?: unknown }).status)
      if (Number.isInteger(status)) return status
    }
    current = typeof current === 'object' && 'cause' in current
      ? (current as { cause?: unknown }).cause
      : undefined
  }
  return undefined
}

function errorText(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  while (current !== undefined && current !== null) {
    if (current instanceof Error) parts.push(`${current.name}: ${current.message}`)
    else parts.push(String(current))

    if (typeof current === 'object' && 'details' in current) {
      const details = (current as { details?: unknown }).details
      if (typeof details === 'string') parts.push(details)
    }

    current = typeof current === 'object' && 'cause' in current
      ? (current as { cause?: unknown }).cause
      : undefined
  }
  return parts.join('\n')
}

function sleep(ms: number): Promise<void> {
  if (ms === 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = readNonNegativeIntEnv(name, fallback)
  if (value === 0) throw new Error(`${name} must be greater than zero`)
  return value
}

function readNonNegativeIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return value
}

function redactRpcUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.username !== '') parsed.username = '...'
    if (parsed.password !== '') parsed.password = '...'
    const pathSegments = parsed.pathname.split('/').filter(Boolean)
    if (pathSegments.length > 1) {
      parsed.pathname = `/${pathSegments[0]}/...`
    } else if (pathSegments.length === 1 && pathSegments[0].length > 12) {
      parsed.pathname = '/...'
    }
    for (const key of parsed.searchParams.keys()) {
      parsed.searchParams.set(key, '...')
    }
    return parsed.toString()
  } catch {
    return '<custom rpc>'
  }
}

async function writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
  await writeFile(join(OUTPUT_DIR, fileName), Buffer.from(bytes))
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let stopped = false
  async function worker() {
    while (!stopped) {
      const index = next++
      if (index >= items.length) return
      try {
        results[index] = await fn(items[index])
      } catch (error) {
        stopped = true
        throw error
      }
    }
  }
  const settled = await Promise.allSettled(Array.from({ length: limit }, worker))
  const failure = settled.find((result) => result.status === 'rejected')
  if (failure !== undefined && failure.status === 'rejected') throw failure.reason
  return results
}

await main()
