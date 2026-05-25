import { PNG } from 'pngjs'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { indexedPngBuffer } from './lib/indexed-png.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SRC_PATH = resolve(here, '..', 'public', 'punks.png')
const DST_PATH = resolve(here, '..', 'public', 'punks.optimized.png')

const srcBuf = await readFile(SRC_PATH)
const src = PNG.sync.read(srcBuf)
const optimizedBuf = indexedPngBuffer(src)
if (!optimizedBuf) {
  throw new Error(
    'punks.png has more than 256 RGBA colors; cannot index safely',
  )
}

const roundTrip = PNG.sync.read(optimizedBuf)
if (roundTrip.width !== src.width || roundTrip.height !== src.height) {
  throw new Error('optimized punks.png dimensions changed')
}

for (let i = 0; i < src.data.length; i++) {
  if (src.data[i] !== roundTrip.data[i]) {
    throw new Error(`optimized punks.png changed decoded RGBA at byte ${i}`)
  }
}

if (optimizedBuf.byteLength >= srcBuf.byteLength) {
  console.log(
    `Skipped ${DST_PATH}; optimized output is not smaller (${srcBuf.byteLength} -> ${optimizedBuf.byteLength} bytes)`,
  )
} else {
  await writeFile(DST_PATH, optimizedBuf)
  console.log(
    `Optimized ${DST_PATH} from ${SRC_PATH} (${srcBuf.byteLength} -> ${optimizedBuf.byteLength} bytes)`,
  )
}
