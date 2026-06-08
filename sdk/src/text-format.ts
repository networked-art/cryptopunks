import {
  COLOR_COUNT_MAX,
  COLOR_COUNT_MIN,
  PALETTE_SIZE,
  PIXEL_COUNT_MAX,
  PIXEL_COUNT_MIN,
  SkinTone,
  TRAIT_COUNT,
  skinToneHeadVariants,
  skinToneNames,
  type SkinToneValue,
} from './constants'
import type { OfflinePunksDataClient } from './offline'
import type { PunksFilter } from './query'
import { PunksDataValidationError, idsFromMask, validatePunkId } from './utils'

/// Inputs to {@link formatSearchText}. Mirrors the shape of a placed bid:
/// the onchain criteria plus the include / exclude id overlays.
export type FormatSearchTextInput = {
  criteria?: PunksFilter
  includeIds?: readonly number[]
  excludeIds?: readonly number[]
}

/// HEAD_VARIANT trait ids occupy 5..15 (offset 5 + HeadVariant 0..10).
const HEAD_VARIANT_TRAIT_OFFSET = 5
const HEAD_VARIANT_TRAIT_MAX = 15
/// ATTRIBUTE_COUNT trait ids occupy 16..23 (offset 16 + count 0..7).
const ATTRIBUTE_COUNT_TRAIT_OFFSET = 16
const ATTRIBUTE_COUNT_TRAIT_MAX = 23

/// Inverts a placed bid's `PunksFilter` + include/exclude id lists back into
/// a search-text string. Feeding the result into the offline searcher (or the
/// front-end search input) yields the same set of punks the bid matches —
/// for filters that round-trip cleanly.
///
/// Throws {@link PunksDataValidationError} when the criteria use features
/// the text grammar cannot express: forbidden trait or color masks, or any-of
/// color masks. General trait any-of groups are emitted as quoted OR terms.
export function formatSearchText(
  data: OfflinePunksDataClient,
  input: FormatSearchTextInput = {},
): string {
  const criteria = input.criteria
  const tokens: string[] = []
  let anyOfTraits:
    | {
        text: string
        genericOr: boolean
        index: number
      }
    | undefined

  if (criteria !== undefined) {
    if (criteria.forbiddenTraitMask !== 0n) {
      throw new PunksDataValidationError(
        'forbidden trait masks cannot be represented as search text',
      )
    }
    if (criteria.forbiddenColorMask !== 0n) {
      throw new PunksDataValidationError(
        'forbidden color masks cannot be represented as search text',
      )
    }
    if (criteria.anyOfColorMask !== 0n) {
      throw new PunksDataValidationError(
        'any-of color masks cannot be represented as search text',
      )
    }

    for (const traitId of idsFromMask(
      criteria.requiredTraitMask,
      TRAIT_COUNT,
    )) {
      tokens.push(quoteTerm(data.getTraitNameSync(traitId)))
    }

    if (criteria.anyOfTraitMask !== 0n) {
      anyOfTraits = {
        ...describeAnyOfTraits(data, criteria.anyOfTraitMask),
        index: tokens.length,
      }
    }

    for (const colorId of idsFromMask(
      criteria.requiredColorMask,
      PALETTE_SIZE,
    )) {
      tokens.push(hexColorToken(data.getColorSync(colorId).rgba))
    }

    /// `max === 0` is the contract's sentinel for "no constraint" — emit
    /// nothing in that case. When set, the count is always within the
    /// canonical [MIN, MAX] window because `compilePunksFilter` widens
    /// unbounded sides to those limits before validating.
    if (criteria.maxPixelCount > 0) {
      const token = formatCountConstraint(
        criteria.minPixelCount,
        criteria.maxPixelCount,
        PIXEL_COUNT_MIN,
        PIXEL_COUNT_MAX,
        'pixels',
      )
      if (token !== undefined) tokens.push(token)
    }
    if (criteria.maxColorCount > 0) {
      const token = formatCountConstraint(
        criteria.minColorCount,
        criteria.maxColorCount,
        COLOR_COUNT_MIN,
        COLOR_COUNT_MAX,
        'colors',
      )
      if (token !== undefined) tokens.push(token)
    }

    if (anyOfTraits !== undefined) {
      const hasOtherTokens =
        anyOfTraits.index > 0 || tokens.length > anyOfTraits.index
      const hasIdOverlays =
        (input.includeIds?.length ?? 0) > 0 ||
        (input.excludeIds?.length ?? 0) > 0
      if (anyOfTraits.genericOr && (hasOtherTokens || hasIdOverlays)) {
        throw new PunksDataValidationError(
          'generic any-of trait masks cannot be combined with other criteria as search text',
        )
      }
      tokens.splice(anyOfTraits.index, 0, anyOfTraits.text)
    }
  }

  for (const id of input.includeIds ?? []) {
    validatePunkId(id)
    tokens.push(`#${id}`)
  }
  for (const id of input.excludeIds ?? []) {
    validatePunkId(id)
    tokens.push(`-#${id}`)
  }

  return tokens.join(' ')
}

/// Upper-cases the first letter of each whitespace-separated word, leaving the
/// rest of each word as-is so existing acronyms (`VR`, `3D`) survive. A display
/// helper for labels — search titles, suggestion aliases — not a linguistic
/// title-caser: it applies no small-word, punctuation, or acronym rules.
export function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/// Recognizes compact names for any-of trait masks that the compile path
/// produces:
///   - exactly the two head variants of one skin tone pair → `<tone> skin`
///     (or the bare `albino` shorthand);
///   - all four female / male head variants → `female` / `male`;
///   - a contiguous run of attribute-count traits → `<n>-<m> attributes`.
/// Anything else is emitted as a quoted OR list, which round-trips through
/// the trait-OR path in the query compiler.
function describeAnyOfTraits(
  data: OfflinePunksDataClient,
  mask: bigint,
): { text: string; genericOr: boolean } {
  const ids = idsFromMask(mask, TRAIT_COUNT)

  if (
    ids.every(
      (id) =>
        id >= ATTRIBUTE_COUNT_TRAIT_OFFSET && id <= ATTRIBUTE_COUNT_TRAIT_MAX,
    )
  ) {
    const counts = ids.map((id) => id - ATTRIBUTE_COUNT_TRAIT_OFFSET)
    const min = counts[0]
    const max = counts[counts.length - 1]
    if (max - min + 1 !== counts.length) {
      throw new PunksDataValidationError(
        'non-contiguous attribute-count any-of group cannot be represented as search text',
      )
    }
    if (min === max) return { text: `${min} attributes`, genericOr: false }
    return { text: `${min}-${max} attributes`, genericOr: false }
  }

  if (
    ids.every(
      (id) => id >= HEAD_VARIANT_TRAIT_OFFSET && id <= HEAD_VARIANT_TRAIT_MAX,
    )
  ) {
    const variants = ids.map((id) => id - HEAD_VARIANT_TRAIT_OFFSET)

    if (variants.length === 2) {
      for (let tone = 0; tone < skinToneHeadVariants.length; tone++) {
        const [female, male] = skinToneHeadVariants[tone]
        if (variants[0] === female && variants[1] === male) {
          return {
            text: skinToneToken(tone as SkinToneValue),
            genericOr: false,
          }
        }
      }
    }

    /// Female 1..4 → HeadVariant 2..5; Male 1..4 → HeadVariant 6..9.
    if (variants.length === 4) {
      if (variants.every((v) => v >= 2 && v <= 5)) {
        return { text: 'female', genericOr: false }
      }
      if (variants.every((v) => v >= 6 && v <= 9)) {
        return { text: 'male', genericOr: false }
      }
    }
  }

  return {
    text: ids.map((id) => quoteTerm(data.getTraitNameSync(id))).join(' OR '),
    genericOr: ids.length > 1,
  }
}

function skinToneToken(tone: SkinToneValue): string {
  /// `albino` is unambiguous on its own (the search grammar accepts the
  /// bare word); the other tones need the `skin` axis word.
  if (tone === SkinTone.Albino) return 'albino'
  return `${skinToneNames[tone].toLowerCase()} skin`
}

function formatCountConstraint(
  min: number,
  max: number,
  canonicalMin: number,
  canonicalMax: number,
  axis: string,
): string | undefined {
  if (min === max) return `${min} ${axis}`
  /// When a side equals the canonical limit it carries no information —
  /// `>=148 pixels` would parse correctly but reads as junk, so emit a
  /// one-sided comparator instead.
  if (min <= canonicalMin && max < canonicalMax) return `<=${max} ${axis}`
  if (max >= canonicalMax && min > canonicalMin) return `>=${min} ${axis}`
  if (min <= canonicalMin && max >= canonicalMax) return undefined
  return `${min}-${max} ${axis}`
}

function hexColorToken(rgba: string): string {
  if (!rgba.startsWith('0x')) {
    throw new PunksDataValidationError(`color rgba must start with 0x: ${rgba}`)
  }
  return `#${rgba.slice(2)}`
}

/// Quotes the term so the text parser treats it as an exact match — avoids
/// ambiguity for trait names that share a prefix (e.g. `"Wild Hair"` vs
/// `"Wild White Hair"`) and protects names with spaces (`"Stringy Hair"`)
/// from being chopped into separate fuzzy tokens.
function quoteTerm(text: string): string {
  if (text.includes('"')) {
    throw new PunksDataValidationError(
      `cannot quote trait name containing a double-quote: ${text}`,
    )
  }
  return `"${text}"`
}
