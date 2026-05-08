import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { network } from 'hardhat'
import { bytesToHex, type Hex } from 'viem'

import { PUNK_COUNT, hexToBytes } from '../scripts/lib/punks-builder.js'

const EXPORT_DIR = 'scripts/output/punks-data'
const MANIFEST_PATH = join(EXPORT_DIR, 'manifest.json')
const CHUNK_SIZE = 24_575
const STORAGE_BATCH = 200
const PUNK_IMAGE_BATCH = 100

// SHA-256 of `concat(punkImage(0..9999))` — `sourceImagesSha256` in
// `scripts/output/punks-data/manifest.json`, equal to `mosaicPixelsHash`.
const EXPECTED_IMAGES_SHA256 =
  'db0e780ac7553b5dd6a3bb02ed2bf8106c16659e15a36797294e01e8817286bf'

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
    sourceImagesSha256: string
  }
  files: Record<string, string>
}

const EXPORT_PRESENT = existsSync(MANIFEST_PATH)

describe('PunksRenderer snapshot (10k)', () => {
  if (!EXPORT_PRESENT) {
    it('export fixture missing — run `npm run generate:punks-data`', () => {
      assert.ok(false, `${MANIFEST_PATH} not found`)
    })
    return
  }

  let renderer: any

  before(
    async () => {
      ({ renderer } = await deployRendererWithFullDataset())
    },
    { timeout: 600_000 },
  )

  it('punkImage(0..9999) concatenates to the canonical sourceImagesSha256', async () => {
    const hash = createHash('sha256')
    for (let start = 0; start < PUNK_COUNT; start += PUNK_IMAGE_BATCH) {
      const ids = Array.from(
        { length: Math.min(PUNK_IMAGE_BATCH, PUNK_COUNT - start) },
        (_, i) => start + i,
      )
      const images = await Promise.all(
        ids.map((id) => renderer.read.punkImage([id]) as Promise<Hex>),
      )
      for (const image of images) {
        const bytes = hexToBytes(image)
        if (bytes.length !== 2304) {
          throw new Error(`punkImage length ${bytes.length} at id ${start}`)
        }
        hash.update(bytes)
      }
    }
    assert.equal(hash.digest('hex'), EXPECTED_IMAGES_SHA256)
  })
})

// ------------------ Fixture deploy (full 10k) ------------------
//
// Mirrors `loadAndSeal` from PunksData.export.test.ts but only loads the data
// strictly required for `PunksRenderer.punkImage` (palette, pixel offsets,
// compressed pixels). PunksData stays unsealed because the renderer does not
// require seal.

async function deployRendererWithFullDataset() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Manifest

  const palette = await readBin(manifest.files.palette)
  const pixelOffsets = await readBin(manifest.files.pixelOffsets)
  const compressedPixels = await readBin(manifest.files.compressedPixels)

  const connection: any = await network.create()
  const { viem } = connection
  const [deployer] = await viem.getWalletClients()
  const data = await viem.deployContract('PunksData', [deployer.account.address])

  await loadBlob(data, BlobId.Palette, palette)
  await loadBlob(data, BlobId.PixelOffsets, pixelOffsets)
  await loadBlob(data, BlobId.CompressedPixels, compressedPixels)

  const renderer = await viem.deployContract('PunksRenderer', [data.address])
  return { connection, viem, data, renderer }
}

async function readBin(fileName: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(EXPORT_DIR, fileName)))
}

async function loadBlob(data: any, blobId: BlobId, bytes: Uint8Array) {
  const chunks = Math.ceil(bytes.length / CHUNK_SIZE)
  for (let i = 0; i < chunks; i++) {
    const slice = bytes.slice(i * CHUNK_SIZE, Math.min(bytes.length, (i + 1) * CHUNK_SIZE))
    await data.write.loadBlobChunk([blobId, i, bytesToHex(slice)])
  }
}
