import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { network } from 'hardhat'
import { bytesToHex, getAddress, type Address, type Hex } from 'viem'

const OUTPUT_DIR = process.env.PUNKS_DATA_OUTPUT ?? 'scripts/output/punks-data'
const CHUNK_SIZE = 24_575
const STORAGE_BATCH = Number(process.env.PUNKS_DATA_STORAGE_BATCH ?? '200')
const SEAL_AFTER_LOAD = parseBoolEnv(process.env.PUNKS_DATA_SEAL)

enum BlobId {
  TraitBitmaps,
  TraitMeta,
  Palette,
  PixelOffsets,
  CompressedPixels,
  ColorBitmaps,
  PixelCountBitmaps,
  ColorCountBitmaps,
}

type BlobName = keyof typeof BlobId & string
type WordMethod = 'loadTraitMaskPairs' | 'loadColorMasks' | 'loadPackedScalars'

type Manifest = {
  hashes: {
    traitCatalogHash: Hex
    punkMaskHash: Hex
    paletteHash: Hex
    indexedPixelsHash: Hex
    compressedPixelsHash: Hex
    datasetHash: Hex
  }
  files: Record<string, string>
}

type LoadState = {
  address: Address
  chainId: number
  blobs: Record<BlobName, number>
  words: Record<WordMethod, number>
  colorSupplies: number
  sealed: boolean
}

async function main() {
  const manifest = JSON.parse(
    await readFile(join(OUTPUT_DIR, 'manifest.json'), 'utf8'),
  ) as Manifest

  const { viem } = await network.create()
  const publicClient = await viem.getPublicClient()

  const address = await resolvePunksDataAddress(publicClient)
  const chainId = await publicClient.getChainId()
  const contract = await viem.getContractAt('PunksData', address)
  const state = await loadOrInitState(address, chainId)
  state.sealed = await contract.read.isSealed()
  await saveState(state)

  console.log(`PunksData ${contract.address} (chain ${chainId})`)
  console.log(`progress state ${stateFilePath(chainId)}`)
  console.log(`seal after load: ${SEAL_AFTER_LOAD ? 'yes' : 'no'}`)

  await loadBlob(state, contract, publicClient, BlobId.TraitBitmaps, manifest.files.traitBitmaps)
  await loadBlob(state, contract, publicClient, BlobId.TraitMeta, manifest.files.traitMeta)
  await loadBlob(state, contract, publicClient, BlobId.Palette, manifest.files.palette)
  await loadBlob(state, contract, publicClient, BlobId.PixelOffsets, manifest.files.pixelOffsets)
  await loadBlob(
    state,
    contract,
    publicClient,
    BlobId.CompressedPixels,
    manifest.files.compressedPixels,
  )
  await loadBlob(state, contract, publicClient, BlobId.ColorBitmaps, manifest.files.colorBitmaps)
  await loadBlob(
    state,
    contract,
    publicClient,
    BlobId.PixelCountBitmaps,
    manifest.files.pixelCountBitmaps,
  )
  await loadBlob(
    state,
    contract,
    publicClient,
    BlobId.ColorCountBitmaps,
    manifest.files.colorCountBitmaps,
  )

  await loadUint256Batches(
    state,
    contract,
    publicClient,
    'loadTraitMaskPairs',
    manifest.files.traitMaskPairs,
  )
  await loadUint256Batches(
    state,
    contract,
    publicClient,
    'loadColorMasks',
    manifest.files.colorMasks,
  )
  await loadUint256Batches(
    state,
    contract,
    publicClient,
    'loadPackedScalars',
    manifest.files.packedScalars,
  )
  await loadColorSupplies(state, contract, publicClient, manifest.files.colorSupplies)

  if (SEAL_AFTER_LOAD && !state.sealed) {
    await submit(
      publicClient,
      contract.write.seal([
        {
          traitCatalogHash: manifest.hashes.traitCatalogHash,
          punkMaskHash: manifest.hashes.punkMaskHash,
          paletteHash: manifest.hashes.paletteHash,
          indexedPixelsHash: manifest.hashes.indexedPixelsHash,
          compressedPixelsHash: manifest.hashes.compressedPixelsHash,
        },
      ]),
    )
    state.sealed = true
    await saveState(state)
  }

  if (SEAL_AFTER_LOAD || state.sealed) {
    const onchainHash = await contract.read.datasetHash()
    if (onchainHash.toLowerCase() !== manifest.hashes.datasetHash.toLowerCase()) {
      throw new Error(`datasetHash mismatch: ${onchainHash}`)
    }
    console.log(`sealed datasetHash ${onchainHash}`)
  } else {
    console.log('data loaded but not sealed')
    console.log('set ENS forward and reverse records before sealing')
    console.log('rerun with PUNKS_DATA_SEAL=1 to seal the dataset')
  }
}

async function loadBlob(
  state: LoadState,
  contract: any,
  publicClient: any,
  blobId: BlobId,
  fileName: string,
) {
  const blobName = BlobId[blobId] as BlobName
  const bytes = new Uint8Array(await readFile(join(OUTPUT_DIR, fileName)))
  const chunks = Math.ceil(bytes.length / CHUNK_SIZE)
  const startIndex = state.blobs[blobName]
  if (startIndex >= chunks) {
    console.log(`blob ${blobName}: already loaded (${chunks}/${chunks} chunks)`)
    return
  }
  console.log(
    `blob ${blobName}: loading chunks ${startIndex}..${chunks - 1} (${bytes.length} bytes, ${fileName})`,
  )
  for (let index = startIndex; index < chunks; index++) {
    const chunk = bytes.slice(index * CHUNK_SIZE, Math.min(bytes.length, (index + 1) * CHUNK_SIZE))
    await submit(publicClient, contract.write.loadBlobChunk([blobId, index, bytesToHex(chunk)]))
    state.blobs[blobName] = index + 1
    await saveState(state)
  }
}

async function loadUint256Batches(
  state: LoadState,
  contract: any,
  publicClient: any,
  method: WordMethod,
  fileName: string,
) {
  const words = readUint256Words(new Uint8Array(await readFile(join(OUTPUT_DIR, fileName))))
  const startIndex = state.words[method]
  if (startIndex >= words.length) {
    console.log(`${method}: already loaded (${words.length}/${words.length} words)`)
    return
  }
  console.log(
    `${method}: loading words ${startIndex}..${words.length - 1} (${words.length} total)`,
  )
  for (let start = startIndex; start < words.length; start += STORAGE_BATCH) {
    const batch = words.slice(start, start + STORAGE_BATCH)
    await submit(publicClient, contract.write[method]([start, batch]))
    state.words[method] = start + batch.length
    await saveState(state)
  }
}

async function loadColorSupplies(
  state: LoadState,
  contract: any,
  publicClient: any,
  fileName: string,
) {
  const bytes = new Uint8Array(await readFile(join(OUTPUT_DIR, fileName)))
  const supplies: number[] = []
  for (let offset = 0; offset < bytes.length; offset += 4) {
    supplies.push(readUint32(bytes, offset))
  }
  const startIndex = state.colorSupplies
  if (startIndex >= supplies.length) {
    console.log(`color supplies: already loaded (${supplies.length}/${supplies.length})`)
    return
  }
  console.log(
    `color supplies: loading entries ${startIndex}..${supplies.length - 1} (${supplies.length} total)`,
  )
  for (let start = startIndex; start < supplies.length; start += STORAGE_BATCH) {
    const batch = supplies.slice(start, start + STORAGE_BATCH)
    await submit(publicClient, contract.write.loadColorSupplies([start, batch]))
    state.colorSupplies = start + batch.length
    await saveState(state)
  }
}

async function submit(publicClient: any, txPromise: Promise<Hex>) {
  const hash = await txPromise
  await publicClient.waitForTransactionReceipt({ hash })
}

async function resolvePunksDataAddress(publicClient: any): Promise<Address> {
  if (process.env.PUNKS_DATA_ADDRESS) {
    return getAddress(process.env.PUNKS_DATA_ADDRESS)
  }
  const chainId = await publicClient.getChainId()
  const deploymentId = process.env.PUNKS_DATA_DEPLOYMENT_ID ?? `chain-${chainId}`
  const deployedAddressesPath = join(
    'ignition/deployments',
    deploymentId,
    'deployed_addresses.json',
  )
  if (!existsSync(deployedAddressesPath)) {
    throw new Error(
      `No PunksData address found. Set PUNKS_DATA_ADDRESS, or deploy first: hardhat ignition deploy ignition/modules/PunksData.ts --network <network>`,
    )
  }
  const deployed = JSON.parse(await readFile(deployedAddressesPath, 'utf8')) as Record<
    string,
    string
  >
  const address = deployed['PunksData#PunksData']
  if (!address) {
    throw new Error(`PunksData#PunksData not found in ${deployedAddressesPath}`)
  }
  return getAddress(address)
}

function stateFilePath(chainId: number): string {
  return join(OUTPUT_DIR, `.load-state-${chainId}.json`)
}

function freshState(address: Address, chainId: number): LoadState {
  return {
    address,
    chainId,
    blobs: {
      TraitBitmaps: 0,
      TraitMeta: 0,
      Palette: 0,
      PixelOffsets: 0,
      CompressedPixels: 0,
      ColorBitmaps: 0,
      PixelCountBitmaps: 0,
      ColorCountBitmaps: 0,
    },
    words: {
      loadTraitMaskPairs: 0,
      loadColorMasks: 0,
      loadPackedScalars: 0,
    },
    colorSupplies: 0,
    sealed: false,
  }
}

async function loadOrInitState(address: Address, chainId: number): Promise<LoadState> {
  const path = stateFilePath(chainId)
  if (!existsSync(path)) return freshState(address, chainId)
  const existing = JSON.parse(await readFile(path, 'utf8')) as LoadState
  if (
    existing.address.toLowerCase() !== address.toLowerCase()
    || existing.chainId !== chainId
  ) {
    throw new Error(
      `State file ${path} mismatches current address/chainId (file: ${existing.address} on ${existing.chainId}, want: ${address} on ${chainId}). Delete it to start fresh.`,
    )
  }
  return existing
}

async function saveState(state: LoadState) {
  const path = stateFilePath(state.chainId)
  const tmpPath = `${path}.tmp`
  await writeFile(tmpPath, JSON.stringify(state, null, 2))
  await rename(tmpPath, path)
}

function readUint256Words(bytes: Uint8Array): bigint[] {
  if (bytes.length % 32 !== 0) throw new Error('uint256 file length is not word-aligned')
  const words: bigint[] = []
  for (let offset = 0; offset < bytes.length; offset += 32) {
    let value = 0n
    for (let i = 0; i < 32; i++) value = (value << 8n) | BigInt(bytes[offset + i])
    words.push(value)
  }
  return words
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  )
}

function parseBoolEnv(value: string | undefined): boolean {
  if (value === undefined || value === '') return false
  const normalized = value.toLowerCase()
  if (['1', 'true', 'yes'].includes(normalized)) return true
  if (['0', 'false', 'no'].includes(normalized)) return false
  throw new Error(`Invalid PUNKS_DATA_SEAL value: ${value}`)
}

await main()
