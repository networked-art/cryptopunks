import {
  PUNK_COUNT,
  SkinTone,
  skinToneNames,
  type SkinToneValue,
} from './constants'
import { PunksDataValidationError } from './utils'

/// Single tokenized term from a search text query.
export type SearchTextTerm = {
  text: string
  exact: boolean
}

/// Numeric constraint extracted from a phrase like `2 colors`, `>= 4 colors`,
/// or `2-4 attributes`. Mirrors the `NumericRange` shape so it can be passed
/// straight through to {@link normalizeNumericRange}.
export type ParsedNumericConstraint =
  | { eq: number }
  | { min?: number; max?: number }

/// Structured constraints recovered from one AND-joined group of tokens.
/// Unrecognized terms remain in `freeTerms` so the caller can fall back to
/// the offline trait-name / color index or reject them as un-chainable.
export type ParsedSearchTextGroup = {
  attributeCount?: ParsedNumericConstraint
  colorCount?: ParsedNumericConstraint
  pixelCount?: ParsedNumericConstraint
  skinTones?: SkinToneValue[]
  /// Punk ids the user asked to include (e.g. `1001`, `#1001`). These do
  /// not fit in a `Punks.Filter` and must be carried alongside as the
  /// `includeIds[]` arg of the offer-slot call.
  includeIds?: number[]
  /// Punk ids the user asked to exclude (e.g. `-1001`). Same calling-
  /// convention note as `includeIds`.
  excludeIds?: number[]
  freeTerms: SearchTextTerm[]
}

/// Result of {@link parseSearchText}: one or more OR-joined groups. Tokens
/// before the first `OR` separator land in `orGroups[0]`. An empty input
/// returns a single empty group so callers can treat the result uniformly.
export type ParsedSearchText = {
  orGroups: ParsedSearchTextGroup[]
}

/// Parses a search text string into structured constraints + free-term
/// fallback. Recognizes:
///   - `<n> color(s)`, `<n> attribute(s)`, `<n> attr(s)`, `<n> pixel(s)` →
///     numeric eq constraint on the matching axis;
///   - `<n>-<m> color(s)` etc. → numeric range;
///   - `<= <n> color(s)`, `>= <n> color(s)`, `< <n>`, `> <n>` → numeric
///     range bounded by min/max;
///   - `albino` (alone), `<tone> skin/skinned`, `skin <tone>`, `skintone
///     <tone>`, `tone <tone>` → skin-tone match. Tones are
///     `dark`, `brown`, `fair`, `albino` and resolve to the four human
///     head-variant slots (Female 1..4 / Male 1..4).
/// Anything else is left in `freeTerms` for downstream interpretation.
export function parseSearchText(input: string): ParsedSearchText {
  if (typeof input !== 'string') {
    throw new PunksDataValidationError('text search must be a string')
  }
  const tokens = tokenizeSearchText(input)
  const orGroups: ParsedSearchTextGroup[] = []
  let current: SearchTextTerm[] = []
  for (const token of tokens) {
    if (!token.exact && /^(or|\|\|)$/i.test(token.text)) {
      if (current.length > 0) {
        orGroups.push(parseSearchTextGroup(current))
        current = []
      }
      continue
    }
    current.push(token)
  }
  if (current.length > 0 || orGroups.length === 0) {
    orGroups.push(parseSearchTextGroup(current))
  }
  return { orGroups }
}

/// Tokenizes a search text string the same way as the offline text-search
/// path: closed double quotes mark exact terms; everything else splits on
/// whitespace. An unclosed opening quote (the user is mid-typing `"cap forw`)
/// produces a fuzzy token over the verbatim slice so incremental input still
/// matches as a substring; the term only flips to `exact` once the closing
/// quote is added.
export function tokenizeSearchText(input: string): SearchTextTerm[] {
  const tokens: SearchTextTerm[] = []
  let cursor = 0

  while (cursor < input.length) {
    while (cursor < input.length && /\s/.test(input[cursor])) cursor++
    if (cursor >= input.length) break

    if (input[cursor] === '"') {
      cursor++
      const start = cursor
      while (cursor < input.length && input[cursor] !== '"') cursor++
      const closed = cursor < input.length && input[cursor] === '"'
      const text = input.slice(start, cursor).trim()
      if (closed) cursor++
      if (text) tokens.push({ text, exact: closed })
      continue
    }

    const start = cursor
    while (cursor < input.length && !/\s/.test(input[cursor])) cursor++
    const text = input.slice(start, cursor).replaceAll('"', '').trim()
    if (text) tokens.push({ text, exact: false })
  }

  return tokens
}

function parseSearchTextGroup(
  tokens: readonly SearchTextTerm[],
): ParsedSearchTextGroup {
  const group: ParsedSearchTextGroup = { freeTerms: [] }
  let i = 0

  while (i < tokens.length) {
    const t0 = tokens[i]
    const t1 = tokens[i + 1]
    const t2 = tokens[i + 2]

    if (!t0.exact) {
      const word0 = normalizeWord(t0.text)

      // `<comparator> <n> <axis>` — `<= 4 colors`, `>= 3 attributes`, etc.
      if (t1 !== undefined && t2 !== undefined && !t1.exact && !t2.exact) {
        const comparator = matchComparator(word0)
        const numericAfterComparator = parseNonNegativeInt(t1.text)
        const axisAfterComparator = matchCountAxis(normalizeWord(t2.text))
        if (
          comparator !== undefined &&
          numericAfterComparator !== undefined &&
          axisAfterComparator !== undefined
        ) {
          assignNumeric(
            group,
            axisAfterComparator,
            comparatorToConstraint(comparator, numericAfterComparator),
          )
          i += 3
          continue
        }
      }

      // `<n><comparator-suffix> <axis>` — `2<=colors` (rare) skipped; we keep
      // it terse and only handle space-separated comparators above.

      // `<comparator><n> <axis>` — `<=4 colors`, `>3 attributes`.
      if (t1 !== undefined && !t1.exact) {
        const compound = parseComparatorNumber(word0)
        const axisCompound = matchCountAxis(normalizeWord(t1.text))
        if (compound !== undefined && axisCompound !== undefined) {
          assignNumeric(
            group,
            axisCompound,
            comparatorToConstraint(compound.comparator, compound.value),
          )
          i += 2
          continue
        }
      }

      // `<n>-<m> <axis>` — `2-4 colors`.
      if (t1 !== undefined && !t1.exact) {
        const range = parseHyphenRange(word0)
        const axisRange = matchCountAxis(normalizeWord(t1.text))
        if (range !== undefined && axisRange !== undefined) {
          assignNumeric(group, axisRange, range)
          i += 2
          continue
        }
      }

      // `<n> <axis>` — `2 colors`, `3 attributes`, `220 pixels`.
      if (t1 !== undefined && !t1.exact) {
        const n = parseNonNegativeInt(t0.text)
        const axis = matchCountAxis(normalizeWord(t1.text))
        if (n !== undefined && axis !== undefined) {
          assignNumeric(group, axis, { eq: n })
          i += 2
          continue
        }
      }

      // `<tone> skin(ned)` — `dark skin`, `fair skinned`. Bigram-first so
      // `albino skin` consumes both tokens (otherwise the single-token
      // `albino` rule below would swallow `albino` and leave `skin`
      // dangling).
      if (t1 !== undefined && !t1.exact) {
        const word1 = normalizeWord(t1.text)
        if (word1 === 'skin' || word1 === 'skinned') {
          const tone = matchSkinToneWord(word0)
          if (tone !== undefined) {
            addSkinTone(group, tone)
            i += 2
            continue
          }
        }
        // `skin <tone>`, `skintone <tone>`, `tone <tone>`.
        if (word0 === 'skin' || word0 === 'skintone' || word0 === 'tone') {
          const tone = matchSkinToneWord(word1)
          if (tone !== undefined) {
            addSkinTone(group, tone)
            i += 2
            continue
          }
        }
      }

      // `albino` alone is unambiguous — no other trait or color uses the
      // word, so it always means SkinTone.Albino. Accept any prefix of
      // length 3+ (`alb`, `albi`, `albin`) since no trait name starts
      // with those letters either; shorter prefixes (`al`) collide with
      // `alien`.
      if (word0.length >= 3 && 'albino'.startsWith(word0)) {
        addSkinTone(group, SkinTone.Albino)
        i += 1
        continue
      }

      // Punk-id include / exclude. `#1001` and bare `1001` both include;
      // `-1001` and `-#1001` exclude. The leading `<n> <axis>` and skin-
      // tone bigrams above run first, so `2 colors` and `dark skin` never
      // reach this branch.
      const idMatch = matchPunkIdToken(t0.text)
      if (idMatch !== undefined) {
        if (idMatch.exclude) addExcludeId(group, idMatch.id)
        else addIncludeId(group, idMatch.id)
        i += 1
        continue
      }
    }

    group.freeTerms.push(t0)
    i += 1
  }

  return group
}

type ComparatorKind = '<=' | '<' | '>=' | '>' | '='

function matchComparator(word: string): ComparatorKind | undefined {
  if (word === '<=' || word === '=<') return '<='
  if (word === '>=' || word === '=>') return '>='
  if (word === '<') return '<'
  if (word === '>') return '>'
  if (word === '=' || word === '==') return '='
  return undefined
}

function parseComparatorNumber(
  word: string,
): { comparator: ComparatorKind; value: number } | undefined {
  const match = /^(<=|>=|=<|=>|==|<|>|=)(\d+)$/.exec(word)
  if (!match) return undefined
  const comparator = matchComparator(match[1])
  if (comparator === undefined) return undefined
  const value = Number.parseInt(match[2], 10)
  if (!Number.isInteger(value) || value < 0) return undefined
  return { comparator, value }
}

function parseHyphenRange(
  word: string,
): { min: number; max: number } | undefined {
  const match = /^(\d+)-(\d+)$/.exec(word)
  if (!match) return undefined
  const min = Number.parseInt(match[1], 10)
  const max = Number.parseInt(match[2], 10)
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    return undefined
  }
  return { min, max }
}

function comparatorToConstraint(
  comparator: ComparatorKind,
  value: number,
): ParsedNumericConstraint {
  if (comparator === '=') return { eq: value }
  if (comparator === '<=') return { max: value }
  if (comparator === '<') return { max: value > 0 ? value - 1 : 0 }
  if (comparator === '>=') return { min: value }
  return { min: value + 1 }
}

type CountAxis = 'colorCount' | 'attributeCount' | 'pixelCount'

function matchCountAxis(word: string): CountAxis | undefined {
  if (word === 'color' || word === 'colors') return 'colorCount'
  if (
    word === 'attribute' ||
    word === 'attributes' ||
    word === 'attr' ||
    word === 'attrs'
  ) {
    return 'attributeCount'
  }
  if (word === 'pixel' || word === 'pixels') return 'pixelCount'
  return undefined
}

function assignNumeric(
  group: ParsedSearchTextGroup,
  axis: CountAxis,
  constraint: ParsedNumericConstraint,
): void {
  const existing = group[axis]
  group[axis] = mergeConstraints(existing, constraint)
}

function mergeConstraints(
  a: ParsedNumericConstraint | undefined,
  b: ParsedNumericConstraint,
): ParsedNumericConstraint {
  if (a === undefined) return b
  if ('eq' in a && 'eq' in b) {
    if (a.eq === b.eq) return a
    throw new PunksDataValidationError(
      `conflicting numeric constraints in text: ${a.eq} and ${b.eq}`,
    )
  }
  if ('eq' in a) return mergeEqWithRange(a.eq, b as { min?: number; max?: number })
  if ('eq' in b) return mergeEqWithRange(b.eq, a as { min?: number; max?: number })
  return {
    min: Math.max(a.min ?? -Infinity, b.min ?? -Infinity) || undefined,
    max: Math.min(a.max ?? Infinity, b.max ?? Infinity) || undefined,
  }
}

function mergeEqWithRange(
  eq: number,
  range: { min?: number; max?: number },
): ParsedNumericConstraint {
  if (range.min !== undefined && eq < range.min) {
    throw new PunksDataValidationError(
      `conflicting numeric constraints in text: =${eq} and >=${range.min}`,
    )
  }
  if (range.max !== undefined && eq > range.max) {
    throw new PunksDataValidationError(
      `conflicting numeric constraints in text: =${eq} and <=${range.max}`,
    )
  }
  return { eq }
}

function addSkinTone(
  group: ParsedSearchTextGroup,
  tone: SkinToneValue,
): void {
  if (group.skinTones === undefined) group.skinTones = []
  if (!group.skinTones.includes(tone)) group.skinTones.push(tone)
}

function addIncludeId(group: ParsedSearchTextGroup, id: number): void {
  if (group.includeIds === undefined) group.includeIds = []
  if (!group.includeIds.includes(id)) group.includeIds.push(id)
}

function addExcludeId(group: ParsedSearchTextGroup, id: number): void {
  if (group.excludeIds === undefined) group.excludeIds = []
  if (!group.excludeIds.includes(id)) group.excludeIds.push(id)
}

function matchPunkIdToken(
  value: string,
): { id: number; exclude: boolean } | undefined {
  const match = /^(-)?(#?)(\d+)$/.exec(value)
  if (!match) return undefined
  const id = Number.parseInt(match[3], 10)
  if (!Number.isInteger(id) || id < 0 || id >= PUNK_COUNT) return undefined
  return { id, exclude: match[1] === '-' }
}

function matchSkinToneWord(word: string): SkinToneValue | undefined {
  for (let id = 0; id < skinToneNames.length; id++) {
    if (skinToneNames[id].toLowerCase() === word) return id as SkinToneValue
  }
  return undefined
}

function parseNonNegativeInt(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined
  const n = Number.parseInt(value, 10)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

function normalizeWord(value: string): string {
  return value.toLowerCase().replaceAll(/[_,]/g, '')
}
