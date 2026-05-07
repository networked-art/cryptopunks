import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { network } from 'hardhat'
import { bytesToHex, getAddress, type Address, type Hex } from 'viem'

const OUTPUT_DIR = process.env.PUNKS_DATA_OUTPUT ?? 'scripts/output/punks-data'
const CHUNK_SIZE = 24_575
const STORAGE_BATCH = Number(process.env.PUNKS_DATA_STORAGE_BATCH ?? '100')

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

async function main() {
  const manifest = JSON.parse(
    await readFile(join(OUTPUT_DIR, 'manifest.json'), 'utf8'),
  ) as Manifest

  const { viem } = await network.create()
  const publicClient = await viem.getPublicClient()

  const address = await resolvePunksDataAddress(publicClient)
  const contract = await viem.getContractAt('PunksData', address)

  console.log(`PunksData ${contract.address}`)

  await loadBlob(contract, publicClient, BlobId.TraitBitmaps, manifest.files.traitBitmaps)
  await loadBlob(contract, publicClient, BlobId.TraitMeta, manifest.files.traitMeta)
  await loadBlob(contract, publicClient, BlobId.Palette, manifest.files.palette)
  await loadBlob(contract, publicClient, BlobId.PixelOffsets, manifest.files.pixelOffsets)
  await loadBlob(contract, publicClient, BlobId.CompressedPixels, manifest.files.compressedPixels)
  await loadBlob(contract, publicClient, BlobId.ColorBitmaps, manifest.files.colorBitmaps)
  await loadBlob(
    contract,
    publicClient,
    BlobId.PixelCountBitmaps,
    manifest.files.pixelCountBitmaps,
  )
  await loadBlob(
    contract,
    publicClient,
    BlobId.ColorCountBitmaps,
    manifest.files.colorCountBitmaps,
  )

  await loadUint256Batches(
    'trait mask pairs',
    contract,
    publicClient,
    'loadTraitMaskPairs',
    manifest.files.traitMaskPairs,
  )
  await loadUint256Batches(
    'color masks',
    contract,
    publicClient,
    'loadColorMasks',
    manifest.files.colorMasks,
  )
  await loadUint256Batches(
    'packed scalars',
    contract,
    publicClient,
    'loadPackedScalars',
    manifest.files.packedScalars,
  )
  await loadColorSupplies(contract, publicClient, manifest.files.colorSupplies)

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

  const onchainHash = await contract.read.datasetHash()
  if (onchainHash.toLowerCase() !== manifest.hashes.datasetHash.toLowerCase()) {
    throw new Error(`datasetHash mismatch: ${onchainHash}`)
  }

  console.log(`sealed datasetHash ${onchainHash}`)
}

async function loadBlob(
  contract: any,
  publicClient: any,
  blobId: BlobId,
  fileName: string,
) {
  const bytes = new Uint8Array(await readFile(join(OUTPUT_DIR, fileName)))
  const chunks = Math.ceil(bytes.length / CHUNK_SIZE)
  console.log(`loading blob ${blobId} ${fileName} (${bytes.length} bytes, ${chunks} chunks)`)
  for (let index = 0; index < chunks; index++) {
    const chunk = bytes.slice(index * CHUNK_SIZE, Math.min(bytes.length, (index + 1) * CHUNK_SIZE))
    await submit(
      publicClient,
      contract.write.loadBlobChunk([blobId, index, bytesToHex(chunk)]),
    )
  }
}

async function loadUint256Batches(
  label: string,
  contract: any,
  publicClient: any,
  method: 'loadTraitMaskPairs' | 'loadColorMasks' | 'loadPackedScalars',
  fileName: string,
) {
  const words = readUint256Words(new Uint8Array(await readFile(join(OUTPUT_DIR, fileName))))
  console.log(`loading ${label} (${words.length} words)`)
  for (let start = 0; start < words.length; start += STORAGE_BATCH) {
    const batch = words.slice(start, start + STORAGE_BATCH)
    await submit(publicClient, contract.write[method]([start, batch]))
  }
}

async function loadColorSupplies(contract: any, publicClient: any, fileName: string) {
  const bytes = new Uint8Array(await readFile(join(OUTPUT_DIR, fileName)))
  const supplies: number[] = []
  for (let offset = 0; offset < bytes.length; offset += 4) {
    supplies.push(readUint32(bytes, offset))
  }
  console.log(`loading color supplies (${supplies.length})`)
  for (let start = 0; start < supplies.length; start += STORAGE_BATCH) {
    const batch = supplies.slice(start, start + STORAGE_BATCH)
    await submit(publicClient, contract.write.loadColorSupplies([start, batch]))
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

await main()
