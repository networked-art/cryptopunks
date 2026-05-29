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
  PunkStandard,
  TRAIT_COUNT,
} from './constants'
import type { NumericRange } from './types'
import type { PunkStandardRef, PunkStandardValue } from './constants'

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

export function assertIntegerInRange(
  label: string,
  value: number,
  min: number,
  max: number,
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new PunksDataValidationError(
      `${label} must be an integer from ${min} to ${max}`,
    )
  }
}

export function validatePunkId(punkId: number | bigint): void {
  assertIntegerInRange('punkId', toNumber(punkId), 0, PUNK_COUNT - 1)
}

export function validateTraitId(traitId: number | bigint): void {
  assertIntegerInRange('traitId', toNumber(traitId), 0, TRAIT_COUNT - 1)
}

export function validateColorId(colorId: number | bigint): void {
  assertIntegerInRange('colorId', toNumber(colorId), 0, PALETTE_SIZE - 1)
}

export function validateBitmapWordIndex(wordIndex: number | bigint): void {
  assertIntegerInRange(
    'wordIndex',
    toNumber(wordIndex),
    0,
    BITMAP_WORD_COUNT - 1,
  )
}

export function validatePixelCount(pixelCount: number | bigint): void {
  assertIntegerInRange(
    'pixelCount',
    toNumber(pixelCount),
    PIXEL_COUNT_MIN,
    PIXEL_COUNT_MAX,
  )
}

export function validateColorCount(colorCount: number | bigint): void {
  assertIntegerInRange(
    'colorCount',
    toNumber(colorCount),
    COLOR_COUNT_MIN,
    COLOR_COUNT_MAX,
  )
}

export function validateCoordinate(
  x: number | bigint,
  y: number | bigint,
): void {
  assertIntegerInRange('x', toNumber(x), 0, PUNK_WIDTH - 1)
  assertIntegerInRange('y', toNumber(y), 0, PUNK_HEIGHT - 1)
}

/// Coerces a `number | bigint` to a JavaScript number. viem decodes Solidity
/// `uint8`/`uint16` as `number`, but larger widths and `read`-style helpers
/// hand back `bigint`. The validators above accept either so callers don't
/// have to remember which path is which. A bigint outside the safe-integer
/// range still flows through and fails the range check below.
function toNumber(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value
}

export function validateTraitMask(mask: bigint, label = 'trait mask'): void {
  assertBigintMask(mask, label)
  if (mask < 0n || (mask & ~CANONICAL_TRAIT_MASK) !== 0n) {
    throw new PunksDataValidationError(
      `${label} contains bits outside the trait catalog`,
    )
  }
}

export function validateColorMask(mask: bigint, label = 'color mask'): void {
  assertBigintMask(mask, label)
  if (mask < 0n || (mask & ~CANONICAL_COLOR_MASK) !== 0n) {
    throw new PunksDataValidationError(
      `${label} contains bits outside the palette`,
    )
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
  assertBigintMask(mask, 'mask')
  if (mask < 0n) throw new PunksDataValidationError('mask must be non-negative')
  const ids: number[] = []
  for (let id = 0; id < maxExclusive; id++) {
    if (((mask >> BigInt(id)) & 1n) === 1n) ids.push(id)
  }
  return ids
}

export function maskFromIds(
  ids: Iterable<number>,
  validate: (id: number) => void,
): bigint {
  let mask = 0n
  for (const id of ids) {
    validate(id)
    mask |= 1n << BigInt(id)
  }
  return mask
}

export function hexToBytes(hex: Hex): Uint8Array {
  if (typeof hex !== 'string') {
    throw new PunksDataValidationError('hex byte string must be a string')
  }
  const clean = stripHexPrefix(hex)
  if (clean.length % 2 !== 0) {
    throw new PunksDataValidationError(
      'hex byte string must have an even length',
    )
  }
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new PunksDataValidationError(
      'hex byte string contains non-hex characters',
    )
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
  if (typeof value !== 'string') {
    throw new PunksDataValidationError('color hex must be a string')
  }
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
  if (typeof rgba !== 'string') {
    throw new PunksDataValidationError('rgba hex must be a string')
  }
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

  if (typeof range !== 'object' || range === null || Array.isArray(range)) {
    throw new PunksDataValidationError(
      `${label} must be a number or range object`,
    )
  }

  if (
    range.eq !== undefined &&
    (range.min !== undefined || range.max !== undefined)
  ) {
    throw new PunksDataValidationError(
      `${label} cannot combine eq with min or max`,
    )
  }

  if (range.eq !== undefined) {
    assertIntegerInRange(label, range.eq, minAllowed, maxAllowed)
    return [range.eq]
  }

  const min = range.min ?? minAllowed
  const max = range.max ?? maxAllowed
  assertIntegerInRange(`${label}.min`, min, minAllowed, maxAllowed)
  assertIntegerInRange(`${label}.max`, max, minAllowed, maxAllowed)
  if (min > max)
    throw new PunksDataValidationError(
      `${label}.min cannot exceed ${label}.max`,
    )

  return Array.from({ length: max - min + 1 }, (_, offset) => min + offset)
}

export function assertIndexedPixels(pixels: Uint8Array): void {
  if (pixels.length !== PIXELS_PER_PUNK) {
    throw new PunksDataValidationError(
      `indexed pixel buffer must contain ${PIXELS_PER_PUNK} bytes`,
    )
  }
}

/// Collapses a free-form name to a comparison key: lowercased, with every
/// non-alphanumeric character removed. Used to match user-supplied trait,
/// type, skin-tone, and Punk-standard references against canonical names.
export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/// Normalizes free-text for whole-phrase synonym and curated-collection
/// matching: lowercased, `_`/`-` and any other punctuation collapsed to single
/// spaces, `#` and alphanumerics preserved, trimmed. Shared by the search
/// synonym rewriter ({@link ./text-parse}) and the curated-collection match
/// table ({@link ./collections}); kept here in the leaf module so both can
/// import it without an import cycle.
export function normalizeSynonymText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/[^#a-z0-9]+/g, ' ')
    .trim()
}

export function normalizePunkStandard(
  standard: PunkStandardRef,
): PunkStandardValue {
  if (
    standard === PunkStandard.CryptoPunks ||
    standard === PunkStandard.CryptoPunksV1
  ) {
    return standard
  }
  if (typeof standard !== 'string') {
    throw new PunksDataValidationError(
      'standard must be cryptopunks or cryptopunks-v1',
    )
  }
  const key = normalizeName(standard)
  if (
    key === 'cryptopunks' ||
    key === 'punks' ||
    key === 'v2' ||
    key === 'cryptopunksv2'
  ) {
    return PunkStandard.CryptoPunks
  }
  if (key === 'cryptopunksv1' || key === 'v1') return PunkStandard.CryptoPunksV1
  throw new PunksDataValidationError(`unknown Punk standard ${standard}`)
}

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') || value.startsWith('0X')
    ? value.slice(2)
    : value
}

function assertBigintMask(mask: bigint, label: string): void {
  if (typeof mask !== 'bigint') {
    throw new PunksDataValidationError(`${label} must be a bigint`)
  }
}
