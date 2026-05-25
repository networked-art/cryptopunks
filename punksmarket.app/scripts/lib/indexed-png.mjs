import { deflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

function buildCrcTable() {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
}

const CRC_TABLE = buildCrcTable()

function crc32(data) {
  let c = 0xffffffff
  for (const byte of data) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type)
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  typeBuf.copy(out, 4)
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 8 + data.length)
  return out
}

export function indexedPngBuffer(png) {
  const palette = []
  const indexOf = new Map()
  const indexed = Buffer.alloc(png.width * png.height)

  for (let src = 0, dst = 0; src < png.data.length; src += 4, dst++) {
    const key =
      (png.data[src] << 24) |
      (png.data[src + 1] << 16) |
      (png.data[src + 2] << 8) |
      png.data[src + 3]
    let index = indexOf.get(key)
    if (index === undefined) {
      if (palette.length >= 256) return undefined
      index = palette.length
      indexOf.set(key, index)
      palette.push([
        png.data[src],
        png.data[src + 1],
        png.data[src + 2],
        png.data[src + 3],
      ])
    }
    indexed[dst] = index
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(png.width, 0)
  ihdr.writeUInt32BE(png.height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 3 // indexed color
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const plte = Buffer.alloc(palette.length * 3)
  const trns = Buffer.alloc(palette.length)
  for (let i = 0; i < palette.length; i++) {
    plte[i * 3] = palette[i][0]
    plte[i * 3 + 1] = palette[i][1]
    plte[i * 3 + 2] = palette[i][2]
    trns[i] = palette[i][3]
  }

  const raw = Buffer.alloc((png.width + 1) * png.height)
  for (let y = 0; y < png.height; y++) {
    const row = y * (png.width + 1)
    raw[row] = 0 // no filter
    indexed.copy(raw, row + 1, y * png.width, (y + 1) * png.width)
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('PLTE', plte),
    pngChunk('tRNS', trns),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}
