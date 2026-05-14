// Public, TypeScript-typed entry point for the canonical punks.png renderer.
//
// The byte-deterministic encoding lives in ./canonical-punks-png.js — a pure
// ES module that doubles as the canonical on-chain artifact. This file adds
// TypeScript types and a small fetcher that adapts arbitrary punks data
// sources (online RPC, bundled offline dataset, custom) to the renderer.

import {
  renderPunksPng as _renderPunksPng,
  assembleScanlines as _assembleScanlines,
  encodeZlibStream as _encodeZlibStream,
  framePng as _framePng,
} from './canonical-punks-png.js'
import { PUNK_COUNT } from './constants'

const PUNK_PIXELS = 24 * 24

/** Raw indexed pixels for all 10,000 punks. Each punk is 576 bytes. */
export type IndexedPunks = Uint8Array[] | Uint8Array

/**
 * Render the canonical `punks.png` mosaic from in-memory pixel data.
 *
 * Output is byte-identical to the canonical file
 * (sha256 `ac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b`).
 */
export function renderPunksPng(
  indexedPunks: IndexedPunks,
  paletteRgba: Uint8Array,
): Uint8Array {
  return _renderPunksPng(indexedPunks, paletteRgba)
}

/**
 * Build the canonical inflated scanline stream (23,042,400 bytes:
 * 2400 scanlines of 1 filter byte + 9600 RGBA bytes) without DEFLATE.
 *
 * Useful for clients that want to render progressively to a canvas without
 * paying the encoder cost.
 */
export function assembleScanlines(
  indexedPunks: IndexedPunks,
  paletteRgba: Uint8Array,
): Uint8Array {
  return _assembleScanlines(indexedPunks, paletteRgba)
}

/** zlib-level-9 DEFLATE wrap around the canonical scanlines. */
export function encodeZlibStream(scanlines: Uint8Array): Uint8Array {
  return _encodeZlibStream(scanlines)
}

/** PNG container framing (signature + IHDR + IDAT chunked at 32 KiB + IEND). */
export function framePng(idat: Uint8Array): Uint8Array {
  return _framePng(idat)
}

/**
 * Minimal source interface accepted by `fetchAndRenderPunksPng`.
 *
 * - The bundled `PunksDataset` (offline) and the `PunksDataClient` (online)
 *   both satisfy this shape via adapters below.
 * - Return values may be sync or async; the fetcher awaits whichever.
 */
export interface PunksMosaicSource {
  getIndexedPixels(punkId: number): Promise<Uint8Array> | Uint8Array
  getPaletteRgbaBytes(): Promise<Uint8Array> | Uint8Array
}

export type FetchAndRenderOptions = {
  /** Parallel in-flight indexedPixels reads. Defaults to 8. */
  concurrency?: number
  /** Progress callback: invoked after each punk loads. */
  onProgress?: (loaded: number, total: number) => void
}

/**
 * Fetch all 10,000 punks' indexed pixels + the palette from any source that
 * implements `PunksMosaicSource`, then render the canonical PNG.
 *
 * For an online `PunksDataClient`, wrap it with
 * `adaptPunksDataClient(client)`.
 * For an offline `PunksDataset`, wrap it with `adaptPunksDataset(dataset)`.
 */
export async function fetchAndRenderPunksPng(
  source: PunksMosaicSource,
  options: FetchAndRenderOptions = {},
): Promise<Uint8Array> {
  const concurrency = Math.max(1, options.concurrency ?? 8)
  const onProgress = options.onProgress

  const paletteRaw = await source.getPaletteRgbaBytes()
  const palette = toUint8Array(paletteRaw)

  const indexed: Uint8Array[] = new Array(PUNK_COUNT)
  let cursor = 0
  let loaded = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < PUNK_COUNT) {
      const id = cursor++
      const px = await source.getIndexedPixels(id)
      const u8 = toUint8Array(px)
      if (u8.length !== PUNK_PIXELS) {
        throw new Error(`punk ${id}: indexed length ${u8.length} != ${PUNK_PIXELS}`)
      }
      indexed[id] = u8
      loaded++
      onProgress?.(loaded, PUNK_COUNT)
    }
  })
  await Promise.all(workers)

  return renderPunksPng(indexed, palette)
}

/** Adapt the online `PunksDataClient` to the `PunksMosaicSource` shape. */
export function adaptPunksDataClient(client: {
  getIndexedPixels: (punkId: number) => Promise<Uint8Array>
  getPaletteRgbaBytes: () => Promise<Uint8Array>
}): PunksMosaicSource {
  return {
    getIndexedPixels: (id) => client.getIndexedPixels(id),
    getPaletteRgbaBytes: () => client.getPaletteRgbaBytes(),
  }
}

/** Adapt the offline `PunksDataset` (sync) to the `PunksMosaicSource` shape. */
export function adaptPunksDataset(dataset: {
  indexedPixels: (punkId: number) => Uint8Array
  source: { getPaletteRgbaBytesSync: () => Uint8Array }
}): PunksMosaicSource {
  return {
    getIndexedPixels: (id) => dataset.indexedPixels(id),
    getPaletteRgbaBytes: () => dataset.source.getPaletteRgbaBytesSync(),
  }
}

function toUint8Array(value: Uint8Array): Uint8Array {
  // viem returns Uint8Array directly; some adapters may return Buffer.
  // A Node Buffer is a Uint8Array subclass so this is a pass-through.
  return value
}
