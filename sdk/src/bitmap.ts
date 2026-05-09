import {
  BITMAP_WORD_COUNT,
  FULL_BITMAP_WORD,
  LAST_BITMAP_WORD_MASK,
  PUNK_COUNT,
  PUNKS_PER_BITMAP_WORD,
} from './constants'
import type { BitmapToPunkIdsOptions, PunkBitmap } from './types'
import { PunksDataValidationError, assertIntegerInRange, validatePunkId } from './utils'

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
    out[i] = bitmapWordAt(bitmap, i)
  }
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
  return ((bitmapWordAt(bitmap, wordIndex) >> BigInt(bitIndex)) & 1n) === 1n
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
    throw new PunksDataValidationError('limit must be a non-negative integer')
  }
  if (Number.isFinite(limit)) assertIntegerInRange('limit', limit, 0, Number.MAX_SAFE_INTEGER)
  if (limit === 0) return []
  if (minId > maxId) return []

  const ids: number[] = []
  let skipped = 0
  for (let wordIndex = 0; wordIndex < BITMAP_WORD_COUNT; wordIndex++) {
    const word = bitmapWordAt(bitmap, wordIndex)
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
    count += popcount(bitmapWordAt(bitmap, index))
  }
  return count
}

export function unionPunkBitmaps(bitmaps: Iterable<readonly bigint[]>): PunkBitmap {
  const out = emptyPunkBitmap()
  for (const bitmap of bitmaps) {
    for (let i = 0; i < BITMAP_WORD_COUNT; i++) out[i] |= bitmapWordAt(bitmap, i)
  }
  return out
}

export function intersectPunkBitmaps(bitmaps: Iterable<readonly bigint[]>): PunkBitmap {
  let out: PunkBitmap | undefined
  for (const bitmap of bitmaps) {
    if (out === undefined) {
      out = normalizePunkBitmap(bitmap)
      continue
    }
    for (let i = 0; i < BITMAP_WORD_COUNT; i++) out[i] &= bitmapWordAt(bitmap, i)
  }
  return out ?? fullPunkBitmap()
}

export function subtractPunkBitmaps(
  base: readonly bigint[],
  remove: readonly bigint[],
): PunkBitmap {
  const out = emptyPunkBitmap()
  for (let i = 0; i < BITMAP_WORD_COUNT; i++) {
    out[i] = bitmapWordAt(base, i) & ~bitmapWordAt(remove, i)
  }
  out[BITMAP_WORD_COUNT - 1] &= LAST_BITMAP_WORD_MASK
  return out
}

export function invertPunkBitmap(bitmap: readonly bigint[]): PunkBitmap {
  return subtractPunkBitmaps(fullPunkBitmap(), bitmap)
}

export function punkBitmapsEqual(a: readonly bigint[], b: readonly bigint[]): boolean {
  for (let i = 0; i < BITMAP_WORD_COUNT; i++) {
    if (bitmapWordAt(a, i) !== bitmapWordAt(b, i)) return false
  }
  return true
}

function bitmapWordAt(bitmap: readonly bigint[], index: number): bigint {
  if (typeof bitmap !== 'object' || bitmap === null) {
    throw new PunksDataValidationError('bitmap must be an array-like object')
  }
  const word = bitmap[index] ?? 0n
  if (typeof word !== 'bigint') {
    throw new PunksDataValidationError(`bitmap word ${index} must be a bigint`)
  }
  if (word < 0n || word > FULL_BITMAP_WORD) {
    throw new PunksDataValidationError(`bitmap word ${index} must be an unsigned 256-bit bigint`)
  }
  return index === BITMAP_WORD_COUNT - 1 ? word & LAST_BITMAP_WORD_MASK : word
}

function popcount(value: bigint): number {
  let count = 0
  while (value !== 0n) {
    value &= value - 1n
    count++
  }
  return count
}
