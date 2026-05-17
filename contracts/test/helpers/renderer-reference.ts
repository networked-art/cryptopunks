// Offchain reference encoders for PunksRenderer byte-equality tests.
//
// These mirror the Solidity implementation in `contracts/PunksRenderer.sol`
// and `contracts/lib/`. Both sides must produce byte-identical output. The
// reference is intentionally written from scratch (no `pngjs`/`zlib`) so the
// test asserts the exact wire format we want, not whatever a generic encoder
// happens to emit.

const SIGNATURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

const TYPE_IHDR = 0x49484452
const TYPE_PLTE = 0x504c5445
const TYPE_TRNS = 0x74524e53
const TYPE_IDAT = 0x49444154
const TYPE_IEND = 0x49454e44

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function adler32(data: Uint8Array): number {
  let a = 1
  let b = 0
  const BASE = 65521
  const NMAX = 5552
  let i = 0
  while (i < data.length) {
    const limit = Math.min(i + NMAX, data.length)
    while (i < limit) {
      a += data[i]
      b += a
      i++
    }
    a %= BASE
    b %= BASE
  }
  return ((b << 16) | a) >>> 0
}

function ihdrPayload(): Uint8Array {
  // Width=24, Height=24, depth=8, colorType=3 (palette), compression=0, filter=0, interlace=0.
  return Uint8Array.from([0, 0, 0, 24, 0, 0, 0, 24, 8, 3, 0, 0, 0])
}

function chunk(type: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + payload.length)
  // Length BE
  out[0] = (payload.length >>> 24) & 0xff
  out[1] = (payload.length >>> 16) & 0xff
  out[2] = (payload.length >>> 8) & 0xff
  out[3] = payload.length & 0xff
  // Type
  out[4] = (type >>> 24) & 0xff
  out[5] = (type >>> 16) & 0xff
  out[6] = (type >>> 8) & 0xff
  out[7] = type & 0xff
  // Payload
  out.set(payload, 8)
  // CRC32 over (type || payload)
  const crc = crc32(out.subarray(4, 8 + payload.length))
  const crcOff = 8 + payload.length
  out[crcOff] = (crc >>> 24) & 0xff
  out[crcOff + 1] = (crc >>> 16) & 0xff
  out[crcOff + 2] = (crc >>> 8) & 0xff
  out[crcOff + 3] = crc & 0xff
  return out
}

export function buildIdatPayload(indexedPixels: Uint8Array): Uint8Array {
  if (indexedPixels.length !== 576) {
    throw new Error(`indexedPixels length ${indexedPixels.length}`)
  }
  const raw = new Uint8Array(600)
  // 24 scanlines: filter byte 0 (default) + 24 indexed bytes per row
  for (let row = 0; row < 24; row++) {
    for (let col = 0; col < 24; col++) {
      raw[row * 25 + 1 + col] = indexedPixels[row * 24 + col]
    }
  }

  const payload = new Uint8Array(611)
  // zlib header
  payload[0] = 0x78
  payload[1] = 0x01
  // DEFLATE stored block header (BFINAL=1, BTYPE=00)
  payload[2] = 0x01
  // LEN = 600 LE
  payload[3] = 0x58
  payload[4] = 0x02
  // NLEN = ~600 & 0xFFFF, LE
  payload[5] = 0xa7
  payload[6] = 0xfd
  // Raw bytes
  payload.set(raw, 7)
  // Adler-32 BE
  const adler = adler32(raw)
  payload[607] = (adler >>> 24) & 0xff
  payload[608] = (adler >>> 16) & 0xff
  payload[609] = (adler >>> 8) & 0xff
  payload[610] = adler & 0xff
  return payload
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function expandIndexedToRgba(
  indexed: Uint8Array,
  paletteRgba: Uint8Array,
): Uint8Array {
  if (indexed.length !== 576)
    throw new Error(`indexed length ${indexed.length}`)
  const out = new Uint8Array(2304)
  for (let i = 0; i < 576; i++) {
    const c = indexed[i]
    out[i * 4] = paletteRgba[c * 4]
    out[i * 4 + 1] = paletteRgba[c * 4 + 1]
    out[i * 4 + 2] = paletteRgba[c * 4 + 2]
    out[i * 4 + 3] = paletteRgba[c * 4 + 3]
  }
  return out
}

export function buildPngTransparent(
  indexed: Uint8Array,
  paletteRgba: Uint8Array,
): Uint8Array {
  const colorCount = paletteRgba.length / 4
  const plte = new Uint8Array(colorCount * 3)
  const trns = new Uint8Array(colorCount)
  for (let i = 0; i < colorCount; i++) {
    plte[i * 3] = paletteRgba[i * 4]
    plte[i * 3 + 1] = paletteRgba[i * 4 + 1]
    plte[i * 3 + 2] = paletteRgba[i * 4 + 2]
    trns[i] = paletteRgba[i * 4 + 3]
  }
  return concat([
    SIGNATURE,
    chunk(TYPE_IHDR, ihdrPayload()),
    chunk(TYPE_PLTE, plte),
    chunk(TYPE_TRNS, trns),
    chunk(TYPE_IDAT, buildIdatPayload(indexed)),
    chunk(TYPE_IEND, new Uint8Array(0)),
  ])
}

export function buildPngFlattened(
  indexed: Uint8Array,
  paletteRgba: Uint8Array,
  bg: { r: number; g: number; b: number },
): Uint8Array {
  const localRgb: number[] = [bg.r, bg.g, bg.b]
  const localOf = new Map<number, number>()
  const remapped = new Uint8Array(576)
  let localCount = 1

  for (let i = 0; i < 576; i++) {
    const c = indexed[i]
    if (c === 0) continue
    let li = localOf.get(c)
    if (li === undefined) {
      li = localCount++
      localOf.set(c, li)
      localRgb.push(
        paletteRgba[c * 4],
        paletteRgba[c * 4 + 1],
        paletteRgba[c * 4 + 2],
      )
    }
    remapped[i] = li
  }

  return concat([
    SIGNATURE,
    chunk(TYPE_IHDR, ihdrPayload()),
    chunk(TYPE_PLTE, Uint8Array.from(localRgb)),
    chunk(TYPE_IDAT, buildIdatPayload(remapped)),
    chunk(TYPE_IEND, new Uint8Array(0)),
  ])
}

export function buildSvg(indexed: Uint8Array, paletteRgba: Uint8Array): string {
  let out =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' shape-rendering='crispEdges'>\n" +
    "<rect width='24' height='24' fill='#638596'/>\n"

  for (let y = 0; y < 24; y++) {
    let x = 0
    while (x < 24) {
      const c = indexed[y * 24 + x]
      if (c === 0) {
        x++
        continue
      }
      const startX = x
      while (x < 24 && indexed[y * 24 + x] === c) x++
      const runLen = x - startX

      const r = paletteRgba[c * 4].toString(16).padStart(2, '0')
      const g = paletteRgba[c * 4 + 1].toString(16).padStart(2, '0')
      const b = paletteRgba[c * 4 + 2].toString(16).padStart(2, '0')
      const a = paletteRgba[c * 4 + 3]
      const opacity = a === 0xff ? '' : " fill-opacity='.5'"

      out += `<rect x='${startX}' y='${y}' width='${runLen}' height='1' fill='#${r}${g}${b}'${opacity}/>\n`
    }
  }

  out += '</svg>'
  return out
}
