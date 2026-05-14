import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'

import {
  renderPunksPng,
  assembleScanlines,
  encodeZlibStream,
  framePng,
  fetchAndRenderPunksPng,
  adaptPunksDataset,
} from '../dist/canonical-png.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolvePath(__dirname, '..', '..')
const CANONICAL_PNG_PATH = resolvePath(PROJECT_ROOT, 'punks.png')

const EXPECTED_PNG_SHA256 =
  'ac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b'
const EXPECTED_IDAT_SHA256 =
  '7d080b4bca3e4c8e19ed53254eb8dc1dd1c887c8b6b3560d3374436c19f9614f'
const EXPECTED_SCANLINES_SHA256 =
  '62a66b4618a72410d6d99b5fceee6013fabcb3574728ed5ce437b2a161da8673'

const MOSAIC_SIZE = 2400
const SCANLINE_BYTES = 1 + MOSAIC_SIZE * 4

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function readCanonicalPng() {
  return new Uint8Array(readFileSync(CANONICAL_PNG_PATH))
}

function extractIdat(png) {
  const buf = Buffer.from(png.buffer, png.byteOffset, png.byteLength)
  let cursor = 8
  const parts = []
  while (cursor < buf.length) {
    const len = buf.readUInt32BE(cursor)
    const type = buf.slice(cursor + 4, cursor + 8).toString('ascii')
    if (type === 'IDAT') parts.push(buf.slice(cursor + 8, cursor + 8 + len))
    cursor += 12 + len
  }
  return new Uint8Array(Buffer.concat(parts))
}

function decomposeCanonical() {
  const png = readCanonicalPng()
  const idat = extractIdat(png)
  const scanlines = new Uint8Array(inflateSync(idat))

  // Reconstruct a palette + per-punk indexed pixels from the canonical
  // scanlines. The renderer is byte-deterministic for any consistent
  // (palette, indexed) decomposition; we don't need the exact on-chain
  // palette here.
  const seen = new Map()
  const colors = []
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

  const indexed = new Array(10000)
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
        px[ly * 24 + lx] = seen.get(key)
      }
    }
    indexed[id] = px
  }

  return { canonicalPng: png, canonicalIdat: idat, canonicalScanlines: scanlines, palette, indexed }
}

describe('canonical punks.png renderer', { concurrency: false }, () => {
  it('assembleScanlines produces canonical inflated scanlines from indexed + palette', () => {
    const { palette, indexed, canonicalScanlines } = decomposeCanonical()
    const rebuilt = assembleScanlines(indexed, palette)
    assert.equal(rebuilt.length, canonicalScanlines.length)
    assert.equal(sha256(rebuilt), EXPECTED_SCANLINES_SHA256)
  })

  it('encodeZlibStream + framePng produce byte-identical canonical IDAT and PNG', () => {
    const { canonicalScanlines, canonicalIdat, canonicalPng } = decomposeCanonical()
    const idat = encodeZlibStream(canonicalScanlines)
    assert.equal(idat.length, canonicalIdat.length)
    assert.equal(sha256(idat), EXPECTED_IDAT_SHA256)

    const png = framePng(idat)
    assert.equal(png.length, canonicalPng.length)
    assert.equal(sha256(png), EXPECTED_PNG_SHA256)
  })

  it('renderPunksPng end-to-end equals the canonical file', () => {
    const { palette, indexed, canonicalPng } = decomposeCanonical()
    const png = renderPunksPng(indexed, palette)
    assert.equal(sha256(png), EXPECTED_PNG_SHA256)
    assert.equal(png.length, canonicalPng.length)
  })

  it('fetchAndRenderPunksPng with a sync mock source produces the canonical PNG', async () => {
    const { palette, indexed } = decomposeCanonical()
    const source = adaptPunksDataset({
      indexedPixels: (id) => indexed[id],
      source: { getPaletteRgbaBytesSync: () => palette },
    })
    let lastLoaded = 0
    const png = await fetchAndRenderPunksPng(source, {
      concurrency: 16,
      onProgress: (loaded) => { lastLoaded = loaded },
    })
    assert.equal(lastLoaded, 10000)
    assert.equal(sha256(png), EXPECTED_PNG_SHA256)
  })
})
