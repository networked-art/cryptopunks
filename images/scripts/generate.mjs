import sharp from 'sharp'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'punks.png')
const DIST = join(ROOT, 'dist')

const TILE = 24 // source pixels per punk
const COLS = 100 // sprite sheet is a 100x100 grid of punks
const COUNT = COLS * COLS // 10000
const SHEET = COLS * TILE // 2400
const LG = 1200 // large-variant edge length (50x)

// Background colors as RGBA hex (all opaque). The marketplace colors are
// from contracts/contracts/PunksRenderer.sol; wrapped-v1 is the
// PunksV1Wrapper background.
const BACKGROUNDS = {
  default: '638596ff',
  'for-sale': '8c5851ff',
  bid: '8970b1ff',
  wrapped: '66a670ff',
  'wrapped-c721': '75a475ff',
  'wrapped-v1': 'a79affff',
}

const RAW_TILE = { raw: { width: TILE, height: TILE, channels: 4 } }

// Slice the 24x24 RGBA region for `id` out of the decoded sprite sheet.
function tileBuffer(sheet, id) {
  const col = id % COLS
  const row = (id - col) / COLS
  const rowBytes = TILE * 4
  const out = Buffer.allocUnsafe(TILE * rowBytes)
  for (let y = 0; y < TILE; y++) {
    const srcStart = ((row * TILE + y) * SHEET + col * TILE) * 4
    sheet.copy(out, y * rowBytes, srcStart, srcStart + rowBytes)
  }
  return out
}

async function emitPunk(sheet, id) {
  const tile = tileBuffer(sheet, id)
  await sharp(tile, RAW_TILE).png().toFile(join(DIST, 'sm', `${id}.png`))
  await sharp(tile, RAW_TILE)
    // nearest-neighbor keeps crisp pixel-art edges on the 50x upscale
    .resize(LG, LG, { kernel: 'nearest' })
    .png()
    .toFile(join(DIST, 'lg', `${id}.png`))
}

async function emitBackground(name, hex) {
  const background = {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    alpha: parseInt(hex.slice(6, 8), 16) / 255,
  }
  for (const [variant, size] of [
    ['sm', TILE],
    ['lg', LG],
  ]) {
    await sharp({
      create: { width: size, height: size, channels: 4, background },
    })
      .png()
      .toFile(join(DIST, 'backgrounds', variant, `${name}.png`))
  }
}

async function run() {
  const { data: sheet, info } = await sharp(SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.width !== SHEET || info.height !== SHEET) {
    throw new Error(
      `punks.png is ${info.width}x${info.height}, expected ${SHEET}x${SHEET}`,
    )
  }

  await rm(DIST, { recursive: true, force: true })
  for (const dir of ['sm', 'lg', 'backgrounds/sm', 'backgrounds/lg']) {
    await mkdir(join(DIST, dir), { recursive: true })
  }

  await copyFile(SRC, join(DIST, 'punks.png'))

  for (const [name, hex] of Object.entries(BACKGROUNDS)) {
    await emitBackground(name, hex)
  }
  console.log(`backgrounds: ${Object.keys(BACKGROUNDS).length} colors (sm + lg)`)

  let next = 0
  let done = 0
  async function worker() {
    while (next < COUNT) {
      const id = next++
      await emitPunk(sheet, id)
      if (++done % 1000 === 0) console.log(`punks: ${done}/${COUNT}`)
    }
  }
  const started = Date.now()
  await Promise.all(Array.from({ length: 24 }, worker))
  const secs = ((Date.now() - started) / 1000).toFixed(1)

  console.log(`punks: ${COUNT}/${COUNT} (sm + lg) in ${secs}s`)
  console.log(`done -> ${DIST}`)
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
