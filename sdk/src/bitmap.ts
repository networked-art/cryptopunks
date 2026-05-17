import {
  BITMAP_WORD_COUNT,
  FULL_BITMAP_WORD,
  LAST_BITMAP_WORD_MASK,
  PUNK_COUNT,
} from './constants'
import type { BitmapToPunkIdsOptions, PunkBitmap } from './types'
import {
  PunksDataValidationError,
  assertIntegerInRange,
  validatePunkId,
} from './utils'

const LANES_PER_BITMAP_WORD = 8
const BITS_PER_LANE = 32
const BITMAP_LANE_COUNT = BITMAP_WORD_COUNT * LANES_PER_BITMAP_WORD
const LAST_PUNK_LANE_INDEX = Math.floor((PUNK_COUNT - 1) / BITS_PER_LANE)
const LAST_PUNK_LANE_BITS = PUNK_COUNT % BITS_PER_LANE || BITS_PER_LANE
const LAST_PUNK_LANE_MASK =
  LAST_PUNK_LANE_BITS === BITS_PER_LANE
    ? 0xffffffff
    : 0xffffffff >>> (BITS_PER_LANE - LAST_PUNK_LANE_BITS)

type PunkBitmapInput = PunkBitmap | readonly bigint[]

export function emptyPunkBitmap(): PunkBitmap {
  return new Uint32Array(BITMAP_LANE_COUNT)
}

export function fullPunkBitmap(): PunkBitmap {
  const out = new Uint32Array(BITMAP_LANE_COUNT)
  out.fill(0xffffffff)
  maskInvalidTail(out)
  return out
}

export function normalizePunkBitmap(bitmap: PunkBitmapInput): PunkBitmap {
  if (typeof bitmap !== 'object' || bitmap === null) {
    throw new PunksDataValidationError('bitmap must be an array-like object')
  }
  if (isTypedBitmap(bitmap)) {
    const out = new Uint32Array(BITMAP_LANE_COUNT)
    out.set(bitmap.subarray(0, BITMAP_LANE_COUNT))
    maskInvalidTail(out)
    return out
  }

  const out = emptyPunkBitmap()
  const wordCount = Math.min(bitmap.length, BITMAP_WORD_COUNT)
  for (let wordIndex = 0; wordIndex < wordCount; wordIndex++) {
    unpackWordInto(out, wordIndex, bitmapWordAt(bitmap, wordIndex))
  }
  maskInvalidTail(out)
  return out
}

export function clonePunkBitmap(bitmap: PunkBitmapInput): PunkBitmap {
  return normalizePunkBitmap(bitmap)
}

export function punkBitmapFromIds(punkIds: Iterable<number>): PunkBitmap {
  const bitmap = emptyPunkBitmap()
  for (const punkId of punkIds) {
    validatePunkId(punkId)
    const laneIndex = Math.floor(punkId / BITS_PER_LANE)
    const bitIndex = punkId % BITS_PER_LANE
    bitmap[laneIndex] |= bitMask32(bitIndex)
  }
  return bitmap
}

export function punkBitmapHasId(
  bitmap: PunkBitmapInput,
  punkId: number,
): boolean {
  validatePunkId(punkId)
  const lanes = bitmapLanes(bitmap)
  const laneIndex = Math.floor(punkId / BITS_PER_LANE)
  const bitIndex = punkId % BITS_PER_LANE
  return (((lanes[laneIndex] ?? 0) >>> bitIndex) & 1) === 1
}

export function punkBitmapWord(
  bitmap: PunkBitmapInput,
  wordIndex: number,
): bigint {
  assertIntegerInRange('wordIndex', wordIndex, 0, BITMAP_WORD_COUNT - 1)
  if (!isTypedBitmap(bitmap)) return bitmapWordAt(bitmap, wordIndex)

  let word = 0n
  const laneOffset = wordIndex * LANES_PER_BITMAP_WORD
  for (let lane = LANES_PER_BITMAP_WORD - 1; lane >= 0; lane--) {
    word = (word << 32n) | BigInt(bitmap[laneOffset + lane] ?? 0)
  }
  return wordIndex === BITMAP_WORD_COUNT - 1
    ? word & LAST_BITMAP_WORD_MASK
    : word
}

export function bitmapToPunkIds(
  bitmap: PunkBitmapInput,
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
  if (Number.isFinite(limit))
    assertIntegerInRange('limit', limit, 0, Number.MAX_SAFE_INTEGER)
  if (limit === 0) return []
  if (minId > maxId) return []

  const lanes = bitmapLanes(bitmap)
  const ids: number[] = []
  let skipped = 0
  const firstLane = Math.floor(minId / BITS_PER_LANE)
  const lastLane = Math.floor(maxId / BITS_PER_LANE)

  for (let laneIndex = firstLane; laneIndex <= lastLane; laneIndex++) {
    const lane = lanes[laneIndex] ?? 0
    if (lane === 0) continue

    for (let bitIndex = 0; bitIndex < BITS_PER_LANE; bitIndex++) {
      const punkId = laneIndex * BITS_PER_LANE + bitIndex
      if (punkId > maxId || punkId >= PUNK_COUNT) break
      if (punkId < minId) continue
      if (((lane >>> bitIndex) & 1) === 0) continue
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

export function countPunkBitmap(bitmap: PunkBitmapInput): number {
  const lanes = bitmapLanes(bitmap)
  let count = 0
  for (let index = 0; index <= LAST_PUNK_LANE_INDEX; index++) {
    const lane =
      index === LAST_PUNK_LANE_INDEX
        ? (lanes[index] ?? 0) & LAST_PUNK_LANE_MASK
        : (lanes[index] ?? 0)
    count += popcount32(lane)
  }
  return count
}

export function unionPunkBitmaps(
  bitmaps: Iterable<PunkBitmapInput>,
): PunkBitmap {
  const out = emptyPunkBitmap()
  for (const bitmap of bitmaps) {
    const lanes = bitmapLanes(bitmap)
    for (let i = 0; i < BITMAP_LANE_COUNT; i++) out[i] |= lanes[i] ?? 0
  }
  maskInvalidTail(out)
  return out
}

export function intersectPunkBitmaps(
  bitmaps: Iterable<PunkBitmapInput>,
): PunkBitmap {
  let out: PunkBitmap | undefined
  for (const bitmap of bitmaps) {
    const lanes = bitmapLanes(bitmap)
    if (out === undefined) {
      out = normalizePunkBitmap(lanes)
      continue
    }
    for (let i = 0; i < BITMAP_LANE_COUNT; i++) out[i] &= lanes[i] ?? 0
  }
  return out ?? fullPunkBitmap()
}

export function subtractPunkBitmaps(
  base: PunkBitmapInput,
  remove: PunkBitmapInput,
): PunkBitmap {
  const normalizedBase = bitmapLanes(base)
  const normalizedRemove = bitmapLanes(remove)
  const out = emptyPunkBitmap()
  for (let i = 0; i < BITMAP_LANE_COUNT; i++) {
    out[i] = normalizedBase[i] & ~normalizedRemove[i]
  }
  maskInvalidTail(out)
  return out
}

export function invertPunkBitmap(bitmap: PunkBitmapInput): PunkBitmap {
  return subtractPunkBitmaps(fullPunkBitmap(), bitmap)
}

export function punkBitmapsEqual(
  a: PunkBitmapInput,
  b: PunkBitmapInput,
): boolean {
  const normalizedA = bitmapLanes(a)
  const normalizedB = bitmapLanes(b)
  for (let i = 0; i < BITMAP_LANE_COUNT; i++) {
    if (normalizedA[i] !== normalizedB[i]) return false
  }
  return true
}

function isTypedBitmap(bitmap: PunkBitmapInput): bitmap is PunkBitmap {
  return bitmap instanceof Uint32Array
}

function bitmapLanes(bitmap: PunkBitmapInput): PunkBitmap {
  return isTypedBitmap(bitmap) ? bitmap : normalizePunkBitmap(bitmap)
}

function unpackWordInto(
  out: PunkBitmap,
  wordIndex: number,
  word: bigint,
): void {
  const laneOffset = wordIndex * LANES_PER_BITMAP_WORD
  for (let lane = 0; lane < LANES_PER_BITMAP_WORD; lane++) {
    out[laneOffset + lane] = Number(
      (word >> BigInt(lane * BITS_PER_LANE)) & 0xffffffffn,
    )
  }
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
    throw new PunksDataValidationError(
      `bitmap word ${index} must be an unsigned 256-bit bigint`,
    )
  }
  return index === BITMAP_WORD_COUNT - 1 ? word & LAST_BITMAP_WORD_MASK : word
}

function maskInvalidTail(bitmap: PunkBitmap): void {
  bitmap[LAST_PUNK_LANE_INDEX] &= LAST_PUNK_LANE_MASK
  for (
    let index = LAST_PUNK_LANE_INDEX + 1;
    index < BITMAP_LANE_COUNT;
    index++
  ) {
    bitmap[index] = 0
  }
}

function bitMask32(bitIndex: number): number {
  return bitIndex === 31 ? 0x80000000 : 1 << bitIndex
}

function popcount32(value: number): number {
  value -= (value >>> 1) & 0x55555555
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333)
  return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}
