import type { Hex } from 'viem'
import {
  BITMAP_WORD_COUNT,
  CANONICAL_COLOR_MASK,
  CANONICAL_TRAIT_MASK,
  COLOR_COUNT_MAX,
  COLOR_COUNT_MIN,
  PALETTE_SIZE,
  PIXEL_COUNT_MAX,
  PIXEL_COUNT_MIN,
  PIXELS_PER_PUNK,
  PUNK_COUNT,
  PUNK_HEIGHT,
  PUNK_WIDTH,
  TRAIT_COUNT,
  TraitKind,
  traitKindNames,
  type TraitKindValue,
} from './constants'
import type { NumericRange, TraitKindInput } from './types'

export class PunksDataSdkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PunksDataSdkError'
  }
}

export class PunksDataValidationError extends PunksDataSdkError {
  constructor(message: string) {
    super(message)
    this.name = 'PunksDataValidationError'
  }
}

export class PunksDataDatasetMismatchError extends PunksDataSdkError {
  constructor(message: string) {
    super(message)
    this.name = 'PunksDataDatasetMismatchError'
  }
}

export function assertIntegerInRange(
  label: string,
  value: number,
  min: number,
  max: number,
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new PunksDataValidationError(`${label} must be an integer from ${min} to ${max}`)
  }
}

export function validatePunkId(punkId: number): void {
  assertIntegerInRange('punkId', punkId, 0, PUNK_COUNT - 1)
}

export function validateTraitId(traitId: number): void {
  assertIntegerInRange('traitId', traitId, 0, TRAIT_COUNT - 1)
}

export function validateColorId(colorId: number): void {
  assertIntegerInRange('colorId', colorId, 0, PALETTE_SIZE - 1)
}

export function validateBitmapWordIndex(wordIndex: number): void {
  assertIntegerInRange('wordIndex', wordIndex, 0, BITMAP_WORD_COUNT - 1)
}

export function validatePixelCount(pixelCount: number): void {
  assertIntegerInRange('pixelCount', pixelCount, PIXEL_COUNT_MIN, PIXEL_COUNT_MAX)
}

export function validateColorCount(colorCount: number): void {
  assertIntegerInRange('colorCount', colorCount, COLOR_COUNT_MIN, COLOR_COUNT_MAX)
}

export function validateCoordinate(x: number, y: number): void {
  assertIntegerInRange('x', x, 0, PUNK_WIDTH - 1)
  assertIntegerInRange('y', y, 0, PUNK_HEIGHT - 1)
}

export function validateTraitMask(mask: bigint, label = 'trait mask'): void {
  if (mask < 0n || (mask & ~CANONICAL_TRAIT_MASK) !== 0n) {
    throw new PunksDataValidationError(`${label} contains bits outside the trait catalog`)
  }
}

export function validateColorMask(mask: bigint, label = 'color mask'): void {
  if (mask < 0n || (mask & ~CANONICAL_COLOR_MASK) !== 0n) {
    throw new PunksDataValidationError(`${label} contains bits outside the palette`)
  }
}

export function validateTraitCriteriaMasks(
  requiredMask: bigint,
  forbiddenMask: bigint,
  anyOfMask: bigint,
): void {
  validateTraitMask(requiredMask, 'requiredMask')
  validateTraitMask(forbiddenMask, 'forbiddenMask')
  validateTraitMask(anyOfMask, 'anyOfMask')
  if ((requiredMask & forbiddenMask) !== 0n) {
    throw new PunksDataValidationError('requiredMask and forbiddenMask overlap')
  }
  if ((forbiddenMask & anyOfMask) !== 0n) {
    throw new PunksDataValidationError('forbiddenMask and anyOfMask overlap')
  }
}

export function validateColorCriteriaMasks(
  requiredMask: bigint,
  forbiddenMask: bigint,
  anyOfMask: bigint,
): void {
  validateColorMask(requiredMask, 'requiredMask')
  validateColorMask(forbiddenMask, 'forbiddenMask')
  validateColorMask(anyOfMask, 'anyOfMask')
  if ((requiredMask & forbiddenMask) !== 0n) {
    throw new PunksDataValidationError('requiredMask and forbiddenMask overlap')
  }
  if ((forbiddenMask & anyOfMask) !== 0n) {
    throw new PunksDataValidationError('forbiddenMask and anyOfMask overlap')
  }
}

export function idsFromMask(mask: bigint, maxExclusive: number): number[] {
  const ids: number[] = []
  for (let id = 0; id < maxExclusive; id++) {
    if (((mask >> BigInt(id)) & 1n) === 1n) ids.push(id)
  }
  return ids
}

export function maskFromIds(ids: Iterable<number>, validate: (id: number) => void): bigint {
  let mask = 0n
  for (const id of ids) {
    validate(id)
    mask |= 1n << BigInt(id)
  }
  return mask
}

export function normalizeTraitKind(kind: TraitKindInput): TraitKindValue {
  if (typeof kind === 'number') {
    if (!traitKindNames[kind]) {
      throw new PunksDataValidationError('trait kind must be 0, 1, 2, or 3')
    }
    return kind as TraitKindValue
  }

  if (kind in TraitKind) return TraitKind[kind as keyof typeof TraitKind]

  const normalized = kind.replaceAll(/\s|_/g, '').toLowerCase()
  const index = traitKindNames.findIndex(
    (name) => name.replaceAll(/\s|_/g, '').toLowerCase() === normalized,
  )
  if (index < 0) throw new PunksDataValidationError(`unknown trait kind ${kind}`)
  return index as TraitKindValue
}

export function hexToBytes(hex: Hex): Uint8Array {
  const clean = stripHexPrefix(hex)
  if (clean.length % 2 !== 0) {
    throw new PunksDataValidationError('hex byte string must have an even length')
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function bytesToHex(bytes: Uint8Array): Hex {
  let out = '0x'
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out as Hex
}

export function normalizeRgbaHex(value: string): Hex {
  let clean = stripHexPrefix(value.trim())
  if (clean.startsWith('#')) clean = clean.slice(1)
  clean = clean.toLowerCase()
  if (clean.length === 6) clean += 'ff'
  if (!/^[0-9a-f]{8}$/.test(clean)) {
    throw new PunksDataValidationError('color hex must be rrggbbaa or rrggbb')
  }
  return `0x${clean}` as Hex
}

export function rgbaHexToParts(rgba: Hex): {
  r: number
  g: number
  b: number
  a: number
  rgb: Hex
  alpha: number
} {
  const clean = stripHexPrefix(rgba)
  if (!/^[0-9a-fA-F]{8}$/.test(clean)) {
    throw new PunksDataValidationError('rgba hex must be four bytes')
  }
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  const a = Number.parseInt(clean.slice(6, 8), 16)
  return {
    r,
    g,
    b,
    a,
    alpha: a,
    rgb: `0x${clean.slice(0, 6).toLowerCase()}` as Hex,
  }
}

export function normalizeNumericRange(
  label: string,
  range: NumericRange | undefined,
  minAllowed: number,
  maxAllowed: number,
): number[] | undefined {
  if (range === undefined) return undefined

  if (typeof range === 'number') {
    assertIntegerInRange(label, range, minAllowed, maxAllowed)
    return [range]
  }

  if (range.eq !== undefined && (range.min !== undefined || range.max !== undefined)) {
    throw new PunksDataValidationError(`${label} cannot combine eq with min or max`)
  }

  if (range.eq !== undefined) {
    assertIntegerInRange(label, range.eq, minAllowed, maxAllowed)
    return [range.eq]
  }

  const min = range.min ?? minAllowed
  const max = range.max ?? maxAllowed
  assertIntegerInRange(`${label}.min`, min, minAllowed, maxAllowed)
  assertIntegerInRange(`${label}.max`, max, minAllowed, maxAllowed)
  if (min > max) throw new PunksDataValidationError(`${label}.min cannot exceed ${label}.max`)

  return Array.from({ length: max - min + 1 }, (_, offset) => min + offset)
}

export function assertIndexedPixels(pixels: Uint8Array): void {
  if (pixels.length !== PIXELS_PER_PUNK) {
    throw new PunksDataValidationError(`indexed pixel buffer must contain ${PIXELS_PER_PUNK} bytes`)
  }
}

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value
}
