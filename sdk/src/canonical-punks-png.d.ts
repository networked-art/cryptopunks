// Type declarations for ./canonical-punks-png.js.
//
// The runtime is pure ES JavaScript so it can also serve as the canonical
// on-chain script. These ambient types are for TypeScript consumers.

export type IndexedPunks = Uint8Array | Uint8Array[]

export function renderPunksPng(
  indexedPunks: IndexedPunks,
  paletteRgba: Uint8Array,
): Uint8Array

export function assembleScanlines(
  indexedPunks: IndexedPunks,
  paletteRgba: Uint8Array,
): Uint8Array

export function encodeZlibStream(scanlines: Uint8Array): Uint8Array

export function framePng(idat: Uint8Array): Uint8Array

export function adler32(
  data: Uint8Array,
  offset?: number,
  length?: number,
): number

export function crc32(
  data: Uint8Array,
  offset?: number,
  length?: number,
): number

export function generateAllTokens(
  paddedInput: Uint8Array,
  inputLength: number,
): {
  kinds: Uint8Array
  values: Uint16Array
  distances: Uint16Array
}

export function encodeDynamicBlock(
  writer: BitWriter,
  kinds: Uint8Array,
  values: Uint16Array,
  distances: Uint16Array,
  start: number,
  end: number,
  finalBlock: boolean,
): void

export class BitWriter {
  constructor(initialBytes?: number)
  writeBits(value: number, bitCount: number): void
  flushPartialByte(): void
  result(): Uint8Array
}

export const INFLATED_SCANLINE_BYTES: number
export const SCANLINE_BYTES: number
export const MOSAIC_SIZE: number
