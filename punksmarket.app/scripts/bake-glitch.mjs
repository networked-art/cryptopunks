import { PNG } from 'pngjs'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { indexedPngBuffer } from './lib/indexed-png.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SRC_PATH = resolve(here, '..', 'public', 'punks.png')
const OUTLINE_PATH = resolve(here, '..', 'public', 'punks-glitch-outline.png')
const STRIPES_PATH = resolve(here, '..', 'public', 'punks-glitch-stripes.png')

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

function clamp01(n) {
  return Math.min(1, Math.max(0, n))
}

function writePng(png) {
  return indexedPngBuffer(png) ?? PNG.sync.write(png)
}

function requiredAlpha(base, final) {
  const b = base / 255
  const f = final / 255
  if (f === b) return 0
  if (f > b) return b >= 1 ? 1 : (f - b) / (1 - b)
  return b <= 0 ? 1 : (b - f) / b
}

// Derive a source-over layer that reconstructs `glitched` above `base` while
// leaving unchanged base-punk pixels out of the baked PNG.
function writeOverlayPixel(base, glitched, overlay, idx) {
  const bR = base[idx]
  const bG = base[idx + 1]
  const bB = base[idx + 2]
  const bA = base[idx + 3] / 255
  const gR = glitched[idx]
  const gG = glitched[idx + 1]
  const gB = glitched[idx + 2]
  const gA = glitched[idx + 3] / 255

  if (
    bR === gR &&
    bG === gG &&
    bB === gB &&
    base[idx + 3] === glitched[idx + 3]
  ) {
    overlay[idx] = 0
    overlay[idx + 1] = 0
    overlay[idx + 2] = 0
    overlay[idx + 3] = 0
    return
  }

  let oA
  if (bA < 1) {
    oA = (gA - bA) / (1 - bA)
  } else {
    oA = Math.max(
      requiredAlpha(bR, gR),
      requiredAlpha(bG, gG),
      requiredAlpha(bB, gB),
    )
  }

  oA = clamp01(oA)
  if (oA <= 0) {
    overlay[idx] = 0
    overlay[idx + 1] = 0
    overlay[idx + 2] = 0
    overlay[idx + 3] = 0
    return
  }

  const bPremul = bA * (1 - oA)
  overlay[idx] = Math.round(
    clamp01(((gR / 255) * gA - (bR / 255) * bPremul) / oA) * 255,
  )
  overlay[idx + 1] = Math.round(
    clamp01(((gG / 255) * gA - (bG / 255) * bPremul) / oA) * 255,
  )
  overlay[idx + 2] = Math.round(
    clamp01(((gB / 255) * gA - (bB / 255) * bPremul) / oA) * 255,
  )
  overlay[idx + 3] = Math.round(oA * 255)
}

const srcBuf = await readFile(SRC_PATH)
const src = PNG.sync.read(srcBuf)
if (src.width !== SIZE || src.height !== SIZE) {
  throw new Error(
    `punks.png is ${src.width}x${src.height}, expected ${SIZE}x${SIZE}`,
  )
}

const outlined = new PNG({ width: SIZE, height: SIZE })
outlined.data.fill(0)
const glitched = new PNG({ width: SIZE, height: SIZE })
glitched.data.fill(0)

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
          paintOver(outlined.data, oIdx, f.r, f.g, f.b, (sa / 255) * f.a)
          paintOver(glitched.data, oIdx, f.r, f.g, f.b, (sa / 255) * f.a)
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
          outlined.data,
          oIdx,
          src.data[sIdx],
          src.data[sIdx + 1],
          src.data[sIdx + 2],
          sa / 255,
        )
        paintOver(
          glitched.data,
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
          const bA = glitched.data[oIdx + 3] / 255
          if (bA > 0) {
            const ovR = overlayWhite(glitched.data[oIdx])
            const ovG = overlayWhite(glitched.data[oIdx + 1])
            const ovB = overlayWhite(glitched.data[oIdx + 2])
            glitched.data[oIdx] = Math.round(
              glitched.data[oIdx] * (1 - SLICE_ALPHA) + ovR * SLICE_ALPHA,
            )
            glitched.data[oIdx + 1] = Math.round(
              glitched.data[oIdx + 1] * (1 - SLICE_ALPHA) + ovG * SLICE_ALPHA,
            )
            glitched.data[oIdx + 2] = Math.round(
              glitched.data[oIdx + 2] * (1 - SLICE_ALPHA) + ovB * SLICE_ALPHA,
            )
          } else {
            glitched.data[oIdx] = 255
            glitched.data[oIdx + 1] = 255
            glitched.data[oIdx + 2] = 255
            glitched.data[oIdx + 3] = Math.round(SLICE_ALPHA * 255)
          }
        }
      }
    }
  }
}

const outlineOverlay = new PNG({ width: SIZE, height: SIZE })
outlineOverlay.data.fill(0)
const stripesOverlay = new PNG({ width: SIZE, height: SIZE })
stripesOverlay.data.fill(0)

for (let idx = 0; idx < src.data.length; idx += 4) {
  writeOverlayPixel(src.data, outlined.data, outlineOverlay.data, idx)
  writeOverlayPixel(outlined.data, glitched.data, stripesOverlay.data, idx)
}

const outlineBuf = writePng(outlineOverlay)
const stripesBuf = writePng(stripesOverlay)
await Promise.all([
  writeFile(OUTLINE_PATH, outlineBuf),
  writeFile(STRIPES_PATH, stripesBuf),
])
console.log(
  `Wrote ${OUTLINE_PATH} glitch outline overlay (${outlineBuf.byteLength} bytes)`,
)
console.log(
  `Wrote ${STRIPES_PATH} glitch stripes overlay (${stripesBuf.byteLength} bytes)`,
)
