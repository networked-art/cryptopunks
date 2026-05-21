import { PNG } from 'pngjs'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SRC_PATH = resolve(here, '..', 'public', 'punks.png')
const DST_PATH = resolve(here, '..', 'public', 'punks-glitched.png')

const SPRITE_COLS = 100
const TILE = 24
const SIZE = SPRITE_COLS * TILE

function hash32(n) {
  let h = n | 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000
}

function tileParams(id) {
  const gxSign = hash32(id * 7 + 1) >= 0.5 ? 1 : -1
  const gySign = hash32(id * 13 + 2) >= 0.5 ? 1 : -1
  const sy1 = (12 + hash32(id * 23 + 1) * 28) / 100
  const sy2 = (55 + hash32(id * 29 + 1) * 30) / 100
  const sh1 = (2 + hash32(id * 37 + 1) * 4) / 100
  const sh2 = (2 + hash32(id * 41 + 1) * 3) / 100
  return {
    gx: gxSign,
    gy: gySign,
    slices: [
      { y: Math.floor(sy1 * TILE), h: Math.max(1, Math.round(sh1 * TILE)) },
      { y: Math.floor(sy2 * TILE), h: Math.max(1, Math.round(sh2 * TILE)) },
    ],
  }
}

function paintOver(out, idx, sR, sG, sB, sA) {
  const dR = out[idx]
  const dG = out[idx + 1]
  const dB = out[idx + 2]
  const dA = out[idx + 3] / 255
  const oA = sA + dA * (1 - sA)
  if (oA <= 0) {
    out[idx] = 0
    out[idx + 1] = 0
    out[idx + 2] = 0
    out[idx + 3] = 0
    return
  }
  out[idx] = Math.round((sR * sA + dR * dA * (1 - sA)) / oA)
  out[idx + 1] = Math.round((sG * sA + dG * dA * (1 - sA)) / oA)
  out[idx + 2] = Math.round((sB * sA + dB * dA * (1 - sA)) / oA)
  out[idx + 3] = Math.round(oA * 255)
}

function overlayWhite(c255) {
  return c255 <= 127 ? 2 * c255 : 255
}

const srcBuf = await readFile(SRC_PATH)
const src = PNG.sync.read(srcBuf)
if (src.width !== SIZE || src.height !== SIZE) {
  throw new Error(
    `punks.png is ${src.width}x${src.height}, expected ${SIZE}x${SIZE}`,
  )
}

const out = new PNG({ width: SIZE, height: SIZE })
out.data.fill(0)

const SLICE_ALPHA = 0.19

for (let row = 0; row < SPRITE_COLS; row++) {
  for (let col = 0; col < SPRITE_COLS; col++) {
    const id = row * SPRITE_COLS + col
    const baseX = col * TILE
    const baseY = row * TILE
    const { gx, gy, slices } = tileParams(id)

    // Chroma fringes (back-to-front: blue, green, red) — match PunkGrid.vue drop-shadow chain.
    const fringes = [
      { dx: 0, dy: gy, r: 0, g: 184, b: 255, a: 0.5 },
      { dx: -gx, dy: 0, r: 0, g: 255, b: 140, a: 0.5 },
      { dx: gx, dy: 0, r: 255, g: 0, b: 60, a: 0.6 },
    ]
    for (const f of fringes) {
      for (let ty = 0; ty < TILE; ty++) {
        for (let tx = 0; tx < TILE; tx++) {
          const sIdx = ((baseY + ty) * SIZE + (baseX + tx)) * 4
          const sa = src.data[sIdx + 3]
          if (sa === 0) continue
          const nx = baseX + tx + f.dx
          const ny = baseY + ty + f.dy
          if (nx < baseX || nx >= baseX + TILE) continue
          if (ny < baseY || ny >= baseY + TILE) continue
          const oIdx = (ny * SIZE + nx) * 4
          paintOver(out.data, oIdx, f.r, f.g, f.b, (sa / 255) * f.a)
        }
      }
    }

    // Original punk on top.
    for (let ty = 0; ty < TILE; ty++) {
      for (let tx = 0; tx < TILE; tx++) {
        const sIdx = ((baseY + ty) * SIZE + (baseX + tx)) * 4
        const sa = src.data[sIdx + 3]
        if (sa === 0) continue
        const oIdx = sIdx
        paintOver(
          out.data,
          oIdx,
          src.data[sIdx],
          src.data[sIdx + 1],
          src.data[sIdx + 2],
          sa / 255,
        )
      }
    }

    // Horizontal slice overlays — full-tile-width white bands.
    // On opaque pixels: overlay-blend with white at SLICE_ALPHA (brightens, preserves blacks).
    // On transparent pixels: paint semi-opaque white so the band continues across the tile.
    for (const slice of slices) {
      for (let dy = 0; dy < slice.h; dy++) {
        const y = baseY + slice.y + dy
        if (y < baseY || y >= baseY + TILE) continue
        for (let tx = 0; tx < TILE; tx++) {
          const x = baseX + tx
          const oIdx = (y * SIZE + x) * 4
          const bA = out.data[oIdx + 3] / 255
          if (bA > 0) {
            const ovR = overlayWhite(out.data[oIdx])
            const ovG = overlayWhite(out.data[oIdx + 1])
            const ovB = overlayWhite(out.data[oIdx + 2])
            out.data[oIdx] = Math.round(
              out.data[oIdx] * (1 - SLICE_ALPHA) + ovR * SLICE_ALPHA,
            )
            out.data[oIdx + 1] = Math.round(
              out.data[oIdx + 1] * (1 - SLICE_ALPHA) + ovG * SLICE_ALPHA,
            )
            out.data[oIdx + 2] = Math.round(
              out.data[oIdx + 2] * (1 - SLICE_ALPHA) + ovB * SLICE_ALPHA,
            )
          } else {
            out.data[oIdx] = 255
            out.data[oIdx + 1] = 255
            out.data[oIdx + 2] = 255
            out.data[oIdx + 3] = Math.round(SLICE_ALPHA * 255)
          }
        }
      }
    }
  }
}

const buf = PNG.sync.write(out)
await writeFile(DST_PATH, buf)
console.log(`Wrote ${DST_PATH} (${buf.byteLength} bytes)`)
