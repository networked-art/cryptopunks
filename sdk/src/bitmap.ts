import {
  BITMAP_WORD_COUNT,
  FULL_BITMAP_WORD,
  LAST_BITMAP_WORD_MASK,
  PUNK_COUNT,
  PUNKS_PER_BITMAP_WORD,
} from './constants'
import type { BitmapToPunkIdsOptions, PunkBitmap } from './types'
import { assertIntegerInRange, validatePunkId } from './utils'

export function emptyPunkBitmap(): PunkBitmap {
  return Array.from({ length: BITMAP_WORD_COUNT }, () => 0n)
}

export function fullPunkBitmap(): PunkBitmap {
  return Array.from({ length: BITMAP_WORD_COUNT }, (_, index) =>
    index === BITMAP_WORD_COUNT - 1 ? LAST_BITMAP_WORD_MASK : FULL_BITMAP_WORD,
  )
}

export function normalizePunkBitmap(bitmap: readonly bigint[]): PunkBitmap {
  const out = emptyPunkBitmap()
  for (let i = 0; i < Math.min(bitmap.length, BITMAP_WORD_COUNT); i++) {
    out[i] = bitmap[i]
  }
  out[BITMAP_WORD_COUNT - 1] &= LAST_BITMAP_WORD_MASK
  return out
}

export function clonePunkBitmap(bitmap: readonly bigint[]): PunkBitmap {
  return normalizePunkBitmap(bitmap)
}

export function punkBitmapFromIds(punkIds: Iterable<number>): PunkBitmap {
  const bitmap = emptyPunkBitmap()
  for (const punkId of punkIds) {
    validatePunkId(punkId)
    const wordIndex = Math.floor(punkId / PUNKS_PER_BITMAP_WORD)
    const bitIndex = punkId % PUNKS_PER_BITMAP_WORD
    bitmap[wordIndex] |= 1n << BigInt(bitIndex)
  }
  return bitmap
}

export function punkBitmapHasId(bitmap: readonly bigint[], punkId: number): boolean {
  validatePunkId(punkId)
  const wordIndex = Math.floor(punkId / PUNKS_PER_BITMAP_WORD)
  const bitIndex = punkId % PUNKS_PER_BITMAP_WORD
  return (((bitmap[wordIndex] ?? 0n) >> BigInt(bitIndex)) & 1n) === 1n
}

export function bitmapToPunkIds(
  bitmap: readonly bigint[],
  options: BitmapToPunkIdsOptions = {},
): number[] {
  const offset = options.offset ?? 0
  const limit = options.limit ?? Number.POSITIVE_INFINITY
  const minId = options.minId ?? 0
  const maxId = options.maxId ?? PUNK_COUNT - 1
  assertIntegerInRange('offset', offset, 0, Number.MAX_SAFE_INTEGER)
  assertIntegerInRange('minId', minId, 0, PUNK_COUNT - 1)
  assertIntegerInRange('maxId', maxId, 0, PUNK_COUNT - 1)
  if (!Number.isFinite(limit) && limit !== Number.POSITIVE_INFINITY) {
    throw new Error('limit must be a non-negative integer')
  }
  if (Number.isFinite(limit)) assertIntegerInRange('limit', limit, 0, Number.MAX_SAFE_INTEGER)
  if (minId > maxId) return []

  const ids: number[] = []
  let skipped = 0
  for (let wordIndex = 0; wordIndex < BITMAP_WORD_COUNT; wordIndex++) {
    let word = bitmap[wordIndex] ?? 0n
    if (wordIndex === BITMAP_WORD_COUNT - 1) word &= LAST_BITMAP_WORD_MASK
    if (word === 0n) continue

    for (let bitIndex = 0; bitIndex < PUNKS_PER_BITMAP_WORD; bitIndex++) {
      const punkId = wordIndex * PUNKS_PER_BITMAP_WORD + bitIndex
      if (punkId >= PUNK_COUNT || punkId > maxId) break
      if (punkId < minId) continue
      if (((word >> BigInt(bitIndex)) & 1n) === 0n) continue
      if (skipped < offset) {
        skipped++
        continue
      }
      ids.push(punkId)
      if (ids.length >= limit) return ids
    }
  }
  return ids
}

export function countPunkBitmap(bitmap: readonly bigint[]): number {
  let count = 0
  for (let index = 0; index < BITMAP_WORD_COUNT; index++) {
    const word =
      index === BITMAP_WORD_COUNT - 1
        ? (bitmap[index] ?? 0n) & LAST_BITMAP_WORD_MASK
        : (bitmap[index] ?? 0n)
    count += popcount(word)
  }
  return count
}

export function unionPunkBitmaps(bitmaps: Iterable<readonly bigint[]>): PunkBitmap {
  const out = emptyPunkBitmap()
  for (const bitmap of bitmaps) {
    for (let i = 0; i < BITMAP_WORD_COUNT; i++) out[i] |= bitmap[i] ?? 0n
  }
  out[BITMAP_WORD_COUNT - 1] &= LAST_BITMAP_WORD_MASK
  return out
}

export function intersectPunkBitmaps(bitmaps: Iterable<readonly bigint[]>): PunkBitmap {
  let out: PunkBitmap | undefined
  for (const bitmap of bitmaps) {
    if (out === undefined) {
      out = normalizePunkBitmap(bitmap)
      continue
    }
    for (let i = 0; i < BITMAP_WORD_COUNT; i++) out[i] &= bitmap[i] ?? 0n
  }
  return out ?? fullPunkBitmap()
}

export function subtractPunkBitmaps(
  base: readonly bigint[],
  remove: readonly bigint[],
): PunkBitmap {
  const out = emptyPunkBitmap()
  for (let i = 0; i < BITMAP_WORD_COUNT; i++) out[i] = (base[i] ?? 0n) & ~(remove[i] ?? 0n)
  out[BITMAP_WORD_COUNT - 1] &= LAST_BITMAP_WORD_MASK
  return out
}

export function invertPunkBitmap(bitmap: readonly bigint[]): PunkBitmap {
  return subtractPunkBitmaps(fullPunkBitmap(), bitmap)
}

export function punkBitmapsEqual(a: readonly bigint[], b: readonly bigint[]): boolean {
  for (let i = 0; i < BITMAP_WORD_COUNT; i++) {
    const mask = i === BITMAP_WORD_COUNT - 1 ? LAST_BITMAP_WORD_MASK : FULL_BITMAP_WORD
    if (((a[i] ?? 0n) & mask) !== ((b[i] ?? 0n) & mask)) return false
  }
  return true
}

function popcount(value: bigint): number {
  let count = 0
  while (value !== 0n) {
    value &= value - 1n
    count++
  }
  return count
}
