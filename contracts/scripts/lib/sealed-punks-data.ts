import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bytesToHex, type Hex } from 'viem'

const CHUNK_SIZE = 24_575
const STORAGE_BATCH = 200

export enum BlobId {
  TraitBitmaps = 0,
  TraitMeta = 1,
  Palette = 2,
  PixelOffsets = 3,
  CompressedPixels = 4,
  ColorBitmaps = 5,
  PixelCountBitmaps = 6,
  ColorCountBitmaps = 7,
}

export type Manifest = {
  hashes: {
    traitCatalogHash: Hex
    punkMaskHash: Hex
    paletteHash: Hex
    indexedPixelsHash: Hex
    compressedPixelsHash: Hex
    datasetHash: Hex
  }
  files: Record<string, string>
  palette: string[]
  traits: Array<{
    id: number
    name: string
    kind: number
    supply: number
    nameHash: Hex
  }>
}

export async function readManifest(exportDir: string): Promise<Manifest> {
  return JSON.parse(await readFile(join(exportDir, 'manifest.json'), 'utf8')) as Manifest
}

/// Loads every blob, word-list, and supply count from `exportDir` into the
/// provided `PunksData` contract instance, then calls `seal` with the
/// manifest hashes. Use with hardhat-edr; expect ~30-60s.
export async function loadAndSealPunksData(
  data: any,
  exportDir: string,
  manifest: Manifest,
): Promise<void> {
  const readBin = async (name: string) =>
    new Uint8Array(await readFile(join(exportDir, name)))

  const blobBytes = {
    traitBitmaps: await readBin(manifest.files.traitBitmaps),
    traitMeta: await readBin(manifest.files.traitMeta),
    palette: await readBin(manifest.files.palette),
    pixelOffsets: await readBin(manifest.files.pixelOffsets),
    compressedPixels: await readBin(manifest.files.compressedPixels),
    colorBitmaps: await readBin(manifest.files.colorBitmaps),
    pixelCountBitmaps: await readBin(manifest.files.pixelCountBitmaps),
    colorCountBitmaps: await readBin(manifest.files.colorCountBitmaps),
  }
  const traitMaskPairs = readUint256Words(await readBin(manifest.files.traitMaskPairs))
  const colorMasks = readUint256Words(await readBin(manifest.files.colorMasks))
  const packedScalars = readUint256Words(await readBin(manifest.files.packedScalars))
  const colorSupplies = readUint32Array(await readBin(manifest.files.colorSupplies))

  await loadBlob(data, BlobId.TraitBitmaps, blobBytes.traitBitmaps)
  await loadBlob(data, BlobId.TraitMeta, blobBytes.traitMeta)
  await loadBlob(data, BlobId.Palette, blobBytes.palette)
  await loadBlob(data, BlobId.PixelOffsets, blobBytes.pixelOffsets)
  await loadBlob(data, BlobId.CompressedPixels, blobBytes.compressedPixels)
  await loadBlob(data, BlobId.ColorBitmaps, blobBytes.colorBitmaps)
  await loadBlob(data, BlobId.PixelCountBitmaps, blobBytes.pixelCountBitmaps)
  await loadBlob(data, BlobId.ColorCountBitmaps, blobBytes.colorCountBitmaps)

  await loadWordBatches(data, 'loadTraitMaskPairs', traitMaskPairs)
  await loadWordBatches(data, 'loadColorMasks', colorMasks)
  await loadWordBatches(data, 'loadPackedScalars', packedScalars)
  await loadSupplyBatches(data, colorSupplies)

  await data.write.seal([
    {
      traitCatalogHash: manifest.hashes.traitCatalogHash,
      punkMaskHash: manifest.hashes.punkMaskHash,
      paletteHash: manifest.hashes.paletteHash,
      indexedPixelsHash: manifest.hashes.indexedPixelsHash,
      compressedPixelsHash: manifest.hashes.compressedPixelsHash,
    },
  ])
}

async function loadBlob(data: any, blobId: BlobId, bytes: Uint8Array): Promise<void> {
  const chunks = Math.ceil(bytes.length / CHUNK_SIZE)
  for (let i = 0; i < chunks; i++) {
    const chunk = bytes.slice(i * CHUNK_SIZE, Math.min(bytes.length, (i + 1) * CHUNK_SIZE))
    await data.write.loadBlobChunk([blobId, i, bytesToHex(chunk)])
  }
}

async function loadWordBatches(
  data: any,
  method: 'loadTraitMaskPairs' | 'loadColorMasks' | 'loadPackedScalars',
  words: bigint[],
): Promise<void> {
  for (let start = 0; start < words.length; start += STORAGE_BATCH) {
    const batch = words.slice(start, start + STORAGE_BATCH)
    await data.write[method]([start, batch])
  }
}

async function loadSupplyBatches(data: any, supplies: number[]): Promise<void> {
  for (let start = 0; start < supplies.length; start += STORAGE_BATCH) {
    const batch = supplies.slice(start, start + STORAGE_BATCH)
    await data.write.loadColorSupplies([start, batch])
  }
}

function readUint256Words(bytes: Uint8Array): bigint[] {
  if (bytes.length % 32 !== 0) throw new Error('uint256 file not word-aligned')
  const out: bigint[] = []
  for (let offset = 0; offset < bytes.length; offset += 32) {
    let value = 0n
    for (let i = 0; i < 32; i++) value = (value << 8n) | BigInt(bytes[offset + i])
    out.push(value)
  }
  return out
}

function readUint32Array(bytes: Uint8Array): number[] {
  if (bytes.length % 4 !== 0) throw new Error('uint32 file not word-aligned')
  const out: number[] = []
  for (let offset = 0; offset < bytes.length; offset += 4) {
    out.push(
      bytes[offset] * 0x1000000
        + (bytes[offset + 1] << 16)
        + (bytes[offset + 2] << 8)
        + bytes[offset + 3],
    )
  }
  return out
}
