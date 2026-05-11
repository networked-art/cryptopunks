import type { Hex } from 'viem'
import {
  PIXELS_PER_PUNK,
  PUNK_HEIGHT,
  PUNK_WIDTH,
  PUNKS_RENDERER_BACKGROUND_DEFAULT,
} from './constants'
import type { PunksDataset } from './dataset'
import type { PaletteColor, PunkMetadata, PunkMetadataAttribute, PunkSummary } from './types'
import {
  PunksDataValidationError,
  assertIndexedPixels,
  normalizeRgbaHex,
  rgbaHexToParts,
  validatePunkId,
} from './utils'

export type PunkRenderBackground = 'classic' | 'default' | 'transparent' | Hex | `#${string}`

export type PunkRenderOptions = {
  background?: PunkRenderBackground
}

export type PunkSvgOptions = PunkRenderOptions & {
  title?: string
}

export class PunkImageRenderer {
  private readonly dataset: PunksDataset

  constructor(dataset: PunksDataset) {
    this.dataset = dataset
  }

  svg(punkId: number, options: PunkSvgOptions = {}): string {
    validatePunkId(punkId)
    const indexed = this.dataset.indexedPixels(punkId)
    const palette = this.dataset.palette()
    return renderSvg(indexed, palette, options)
  }

  png(punkId: number, options: PunkRenderOptions = {}): Uint8Array {
    return rgbaPng(this.rgba(punkId, options), PUNK_WIDTH, PUNK_HEIGHT)
  }

  rgba(punkId: number, options: PunkRenderOptions = {}): Uint8Array {
    validatePunkId(punkId)
    const indexed = this.dataset.indexedPixels(punkId)
    const palette = this.dataset.source.getPaletteRgbaBytesSync()
    return renderRgba(indexed, palette, normalizeBackground(options.background))
  }

  svgDataUri(punkId: number, options: PunkSvgOptions = {}): string {
    return `data:image/svg+xml;base64,${bytesToBase64(utf8Bytes(this.svg(punkId, options)))}`
  }

  pngDataUri(punkId: number, options: PunkRenderOptions = {}): string {
    return `data:image/png;base64,${bytesToBase64(this.png(punkId, options))}`
  }

  metadata(punkId: number, options: PunkSvgOptions = {}): PunkMetadata {
    const punk = this.dataset.get(punkId, { includeTraits: true, includeColors: true })
    return metadataForPunk(punk, this.svgDataUri(punkId, options))
  }

  metadataJson(punkId: number, options: PunkSvgOptions = {}): string {
    return JSON.stringify(this.metadata(punkId, options))
  }

  tokenUri(punkId: number, options: PunkSvgOptions = {}): string {
    return `data:application/json;base64,${bytesToBase64(utf8Bytes(this.metadataJson(punkId, options)))}`
  }
}

export function createPunkImageRenderer(dataset: PunksDataset): PunkImageRenderer {
  return new PunkImageRenderer(dataset)
}

function renderSvg(
  indexed: Uint8Array,
  palette: readonly PaletteColor[],
  options: PunkSvgOptions,
): string {
  assertIndexedPixels(indexed)
  const background = normalizeBackground(options.background)
  const parts: string[] = [
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' shape-rendering='crispEdges'>",
  ]
  if (options.title !== undefined && options.title.trim() !== '') {
    parts.push(`<title>${escapeXml(options.title)}</title>`)
  }
  if (background !== undefined) {
    parts.push(`<rect width='24' height='24' fill='${cssRgb(background)}'/>`)
  }

  for (let y = 0; y < PUNK_HEIGHT; y++) {
    let x = 0
    while (x < PUNK_WIDTH) {
      const colorId = indexed[y * PUNK_WIDTH + x]
      const color = palette[colorId]
      if (!color || color.alpha === 0) {
        x++
        continue
      }

      let width = 1
      while (x + width < PUNK_WIDTH && indexed[y * PUNK_WIDTH + x + width] === colorId) {
        width++
      }
      const opacity = color.alpha === 255 ? '' : ` fill-opacity='${formatOpacity(color.alpha)}'`
      parts.push(
        `<rect x='${x}' y='${y}' width='${width}' height='1' fill='${cssRgb(color.rgba)}'${opacity}/>`,
      )
      x += width
    }
  }

  parts.push('</svg>')
  return parts.join('')
}

function renderRgba(
  indexed: Uint8Array,
  paletteRgbaBytes: Uint8Array,
  background: Hex | undefined,
): Uint8Array {
  assertIndexedPixels(indexed)
  if (paletteRgbaBytes.length < 4) {
    throw new PunksDataValidationError('palette must contain RGBA colors')
  }

  const out = new Uint8Array(PIXELS_PER_PUNK * 4)
  const bg = background === undefined ? undefined : rgbaHexToParts(background)
  for (let i = 0; i < indexed.length; i++) {
    const colorId = indexed[i]
    const paletteOffset = colorId * 4
    const outputOffset = i * 4
    const r = paletteRgbaBytes[paletteOffset]
    const g = paletteRgbaBytes[paletteOffset + 1]
    const b = paletteRgbaBytes[paletteOffset + 2]
    const a = paletteRgbaBytes[paletteOffset + 3]

    if (bg === undefined) {
      out[outputOffset] = r
      out[outputOffset + 1] = g
      out[outputOffset + 2] = b
      out[outputOffset + 3] = a
    } else if (a === 255) {
      out[outputOffset] = r
      out[outputOffset + 1] = g
      out[outputOffset + 2] = b
      out[outputOffset + 3] = 255
    } else {
      const alpha = a / 255
      out[outputOffset] = Math.round(r * alpha + bg.r * (1 - alpha))
      out[outputOffset + 1] = Math.round(g * alpha + bg.g * (1 - alpha))
      out[outputOffset + 2] = Math.round(b * alpha + bg.b * (1 - alpha))
      out[outputOffset + 3] = 255
    }
  }
  return out
}

function metadataForPunk(punk: PunkSummary, image: string): PunkMetadata {
  const traits = punk.traits ?? []
  const attributes: PunkMetadataAttribute[] = [
    { trait_type: 'Type', value: punk.punkTypeName },
    { trait_type: 'Head Variant', value: punk.headVariantName },
    { display_type: 'number', trait_type: 'Attribute Count', value: punk.attributeCount },
    { display_type: 'number', trait_type: 'Color Count', value: punk.colorCount },
    { display_type: 'number', trait_type: 'Pixel Count', value: punk.pixelCount },
  ]
  for (const trait of traits) {
    if (trait.kind === 'Accessory') {
      attributes.push({ trait_type: 'Accessory', value: trait.name })
    }
  }

  return {
    name: `CryptoPunk ${punk.id}`,
    description: `CryptoPunk ${punk.id} has ${punk.attributeCount} attributes.`,
    image,
    attributes,
    colors: (punk.colors ?? []).map((color) => `#${color.rgba.slice(2)}`),
  }
}

function normalizeBackground(background: PunkRenderBackground | undefined): Hex | undefined {
  if (background === undefined || background === 'classic' || background === 'default') {
    return PUNKS_RENDERER_BACKGROUND_DEFAULT
  }
  if (background === 'transparent') return undefined
  return normalizeRgbaHex(background)
}

function cssRgb(rgba: Hex): string {
  return `#${rgba.slice(2, 8)}`
}

function formatOpacity(alpha: number): string {
  return (alpha / 255).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function rgbaPng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new PunksDataValidationError('RGBA buffer length does not match image dimensions')
  }

  const stride = 1 + width * 4
  const scanlines = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const rowOffset = y * stride
    const rgbaOffset = y * width * 4
    scanlines[rowOffset] = 0
    scanlines.set(rgba.slice(rgbaOffset, rgbaOffset + width * 4), rowOffset + 1)
  }

  return pngFromScanlines(scanlines, width, height)
}

function pngFromScanlines(scanlines: Uint8Array, width: number, height: number): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = new Uint8Array(13)
  writeU32(ihdr, 0, width)
  writeU32(ihdr, 4, height)
  ihdr[8] = 8
  ihdr[9] = 6

  const idat = zlibNoCompression(scanlines)
  return concatBytes([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', new Uint8Array()),
  ])
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = asciiBytes(type)
  const out = new Uint8Array(12 + data.length)
  writeU32(out, 0, data.length)
  out.set(typeBytes, 4)
  out.set(data, 8)
  writeU32(out, 8 + data.length, crc32(concatBytes([typeBytes, data])))
  return out
}

function zlibNoCompression(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])]
  for (let offset = 0; offset < data.length; offset += 0xffff) {
    const chunk = data.slice(offset, offset + 0xffff)
    const header = new Uint8Array(5)
    header[0] = offset + chunk.length >= data.length ? 1 : 0
    header[1] = chunk.length & 0xff
    header[2] = chunk.length >> 8
    const nlen = (~chunk.length) & 0xffff
    header[3] = nlen & 0xff
    header[4] = nlen >> 8
    blocks.push(header, chunk)
  }
  const checksum = new Uint8Array(4)
  writeU32(checksum, 0, adler32(data))
  blocks.push(checksum)
  return concatBytes(blocks)
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function adler32(data: Uint8Array): number {
  let a = 1
  let b = 0
  for (const byte of data) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function writeU32(out: Uint8Array, offset: number, value: number): void {
  out[offset] = (value >>> 24) & 0xff
  out[offset + 1] = (value >>> 16) & 0xff
  out[offset + 2] = (value >>> 8) & 0xff
  out[offset + 3] = value & 0xff
}

function asciiBytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length)
  for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i)
  return out
}

function utf8Bytes(value: string): Uint8Array {
  const out: number[] = []
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x7f) out.push(code)
    else if (code <= 0x7ff) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else if (code <= 0xffff) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      )
    }
  }
  return new Uint8Array(out)
}

function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const triplet = (a << 16) | (b << 8) | c
    out += chars[(triplet >> 18) & 63]
    out += chars[(triplet >> 12) & 63]
    out += i + 1 < bytes.length ? chars[(triplet >> 6) & 63] : '='
    out += i + 2 < bytes.length ? chars[triplet & 63] : '='
  }
  return out
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
