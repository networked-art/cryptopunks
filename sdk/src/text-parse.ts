import {
  PUNK_COUNT,
  SkinTone,
  skinToneNames,
  type SkinToneValue,
} from './constants'
import { searchCollections } from './collections'
import searchSynonymsJson from './search-synonyms.json'
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

export type SearchSynonymsMap = Record<string, string>

type ExactTraitTextResolver = {
  findTraitsByTextSync(
    text: string,
    options?: { exact?: boolean },
  ): readonly { name: string }[]
}

/// Offchain folk-trait aliases. Keys are user-facing search phrases; values
/// are normal search text, so contributors can compose existing canonical
/// traits with quotes for exact multi-word trait names.
export const searchSynonyms: SearchSynonymsMap = searchSynonymsJson

type SearchSynonymEntry = {
  key: string
  tokens: string[]
  value: SearchTextTerm[]
}

const SEARCH_SYNONYM_ENTRIES = buildSearchSynonymEntries(searchSynonyms)

/// Parses a search text string into structured constraints + free-term
/// fallback. Recognizes:
///   - `<n> color(s)`, `<n> attribute(s)`, `<n> attr(s)`, `<n> trait(s)`,
///     `<n> pixel(s)` →
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

/// Parses search text, first folding a whole-query exact trait-name match into
/// the same shape produced by explicit quotes. This keeps `Dark Hair` equivalent
/// to `"Dark Hair"` while leaving partial or compound queries on the fuzzy path.
export function parseSearchTextWithExactTraitsSync(
  input: string,
  data: ExactTraitTextResolver,
): ParsedSearchText {
  if (typeof input !== 'string') {
    throw new PunksDataValidationError('text search must be a string')
  }
  const trimmed = input.trim()
  const exactTrait = trimmed
    ? data.findTraitsByTextSync(trimmed, { exact: true })[0]
    : undefined
  if (exactTrait !== undefined) {
    return {
      orGroups: [
        {
          freeTerms: [{ text: exactTrait.name, exact: true }],
        },
      ],
    }
  }
  return parseSearchText(input)
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

      // Collection suffixes are filler in free-text search. This keeps folk
      // aliases composable: `marilyn punk` should mean the `marilyn` alias,
      // not `marilyn` AND an impossible trait named `punk`.
      if (isSearchFillerTerm(t0)) {
        i += 1
        continue
      }
    }

    group.freeTerms.push(t0)
    i += 1
  }

  // Curated collections resolve first, pulling whole-phrase aliases
  // (`burned punks`) out as `includeIds` before the remaining terms reach the
  // trait-phrase synonym rewriter. The two never collide: collections own id
  // sets, synonyms own trait phrases.
  group.freeTerms = resolveSearchCollectionTerms(group, group.freeTerms)
  group.freeTerms = expandSearchSynonymTerms(group.freeTerms)
  return group
}

function buildSearchSynonymEntries(
  synonyms: SearchSynonymsMap,
): SearchSynonymEntry[] {
  const entries: SearchSynonymEntry[] = []
  for (const [rawKey, rawValue] of Object.entries(synonyms)) {
    if (typeof rawKey !== 'string' || typeof rawValue !== 'string') continue
    const key = normalizeSynonymText(rawKey)
    if (!key) continue
    const value = tokenizeSearchText(rawValue)
    if (value.length === 0) continue
    entries.push({
      key,
      tokens: key.split(/\s+/),
      value,
    })
  }
  return entries.sort((a, b) => {
    const tokenDelta = b.tokens.length - a.tokens.length
    if (tokenDelta !== 0) return tokenDelta
    return b.key.length - a.key.length
  })
}

function expandSearchSynonymTerms(
  terms: readonly SearchTextTerm[],
): SearchTextTerm[] {
  if (terms.length === 0 || SEARCH_SYNONYM_ENTRIES.length === 0) {
    return [...terms]
  }

  const expanded: SearchTextTerm[] = []
  let i = 0
  while (i < terms.length) {
    const match = findSearchSynonymAt(terms, i)
    if (match === undefined) {
      expanded.push(terms[i])
      i += 1
      continue
    }
    expanded.push(...match.entry.value)
    i += match.consumed
  }
  return expanded
}

function findSearchSynonymAt(
  terms: readonly SearchTextTerm[],
  start: number,
): { entry: SearchSynonymEntry; consumed: number } | undefined {
  for (const entry of SEARCH_SYNONYM_ENTRIES) {
    const consumed = matchSearchSynonymEntry(terms, start, entry)
    if (consumed !== undefined) return { entry, consumed }
  }
  return undefined
}

function matchSearchSynonymEntry(
  terms: readonly SearchTextTerm[],
  start: number,
  entry: SearchSynonymEntry,
): number | undefined {
  let phrase = ''
  const maxTerms = Math.min(entry.tokens.length, terms.length - start)
  for (let consumed = 1; consumed <= maxTerms; consumed++) {
    const normalized = normalizeSynonymText(terms[start + consumed - 1].text)
    if (!normalized) return undefined
    phrase = phrase ? `${phrase} ${normalized}` : normalized
    if (phrase === entry.key) return consumed
    if (!entry.key.startsWith(`${phrase} `)) return undefined
  }
  return undefined
}

type SearchCollectionEntry = {
  key: string
  tokens: string[]
  ids: readonly number[]
}

const SEARCH_COLLECTION_ENTRIES = buildSearchCollectionEntries()

/// Builds the alias → id-set match table from the bundled collections and any
/// institutions nested within them (so `museum punks` resolves to the whole
/// set and `moma` resolves to just MoMA's). The matchable key for each slug and
/// alias is normalized and stripped of the trailing `punk(s)` filler (so
/// `burned punks`, `burned`, and the slug all reduce to the same key),
/// mirroring how `freeTerms` look by the time this runs. Longest keys sort
/// first so a multi-word alias wins over a shorter one.
/// A new alias must not collide with what the group loop consumes first (a
/// bare number, `#id`, `albino`, or an `<n> <axis>` / skin bigram), or it
/// never reaches this table.
function buildSearchCollectionEntries(): SearchCollectionEntry[] {
  const byKey = new Map<string, { owner: string; ids: readonly number[] }>()
  const register = (
    owner: string,
    phrases: readonly string[],
    ids: readonly number[],
  ): void => {
    for (const phrase of phrases) {
      const key = normalizeCollectionPhrase(phrase)
      if (!key) continue
      const existing = byKey.get(key)
      if (existing !== undefined && existing.owner !== owner) {
        throw new PunksDataValidationError(
          `collection alias "${key}" is claimed by both ${existing.owner} and ${owner}`,
        )
      }
      byKey.set(key, { owner, ids })
    }
  }
  for (const collection of searchCollections) {
    register(
      collection.slug,
      [collection.slug, ...collection.aliases],
      collection.ids,
    )
    for (const institution of collection.institutions ?? []) {
      register(
        `${collection.slug}/${institution.slug}`,
        [institution.slug, ...institution.aliases],
        institution.ids,
      )
    }
  }
  return [...byKey.entries()]
    .map(([key, value]) => ({
      key,
      tokens: key.split(/\s+/),
      ids: value.ids,
    }))
    .sort((a, b) => {
      const tokenDelta = b.tokens.length - a.tokens.length
      if (tokenDelta !== 0) return tokenDelta
      return b.key.length - a.key.length
    })
}

/// Normalizes a collection slug/alias the same way `freeTerms` are normalized
/// at match time, then drops the `punk(s)` filler the group parser already
/// removes from user input. Returns `''` when nothing matchable remains.
function normalizeCollectionPhrase(phrase: string): string {
  return normalizeSynonymText(phrase)
    .split(/\s+/)
    .filter((token) => token && token !== 'punk' && token !== 'punks')
    .join(' ')
}

/// Replaces whole-phrase collection aliases in `terms` with their id set,
/// pushed onto `group.includeIds`, and returns the terms left for downstream
/// trait/synonym resolution. Only non-exact terms match, so a quoted `"burned"`
/// stays a literal trait lookup.
function resolveSearchCollectionTerms(
  group: ParsedSearchTextGroup,
  terms: readonly SearchTextTerm[],
): SearchTextTerm[] {
  if (terms.length === 0 || SEARCH_COLLECTION_ENTRIES.length === 0) {
    return [...terms]
  }
  const remaining: SearchTextTerm[] = []
  let i = 0
  while (i < terms.length) {
    const match = findSearchCollectionAt(terms, i)
    if (match === undefined) {
      remaining.push(terms[i])
      i += 1
      continue
    }
    for (const id of match.entry.ids) addIncludeId(group, id)
    i += match.consumed
  }
  return remaining
}

function findSearchCollectionAt(
  terms: readonly SearchTextTerm[],
  start: number,
): { entry: SearchCollectionEntry; consumed: number } | undefined {
  for (const entry of SEARCH_COLLECTION_ENTRIES) {
    const consumed = matchSearchCollectionEntry(terms, start, entry)
    if (consumed !== undefined) return { entry, consumed }
  }
  return undefined
}

function matchSearchCollectionEntry(
  terms: readonly SearchTextTerm[],
  start: number,
  entry: SearchCollectionEntry,
): number | undefined {
  let phrase = ''
  let consumed = 0
  while (start + consumed < terms.length) {
    const term = terms[start + consumed]
    if (term.exact) return undefined
    consumed++
    // Punctuation-only tokens (e.g. the `&` in `perfect & priceless`) normalize
    // to nothing; consume them but skip them in the phrase so the surrounding
    // words still match the `&`-free alias key.
    const normalized = normalizeSynonymText(term.text)
    if (!normalized) continue
    phrase = phrase ? `${phrase} ${normalized}` : normalized
    if (phrase === entry.key) return consumed
    if (!entry.key.startsWith(`${phrase} `)) return undefined
  }
  return undefined
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

/// Aliases per count axis. The bigram rule (`<n> <word>`) accepts any
/// non-empty prefix of any alias, so `2 c`, `2 co`, `2 colors` all parse
/// the same way — and `2 cap` does not, because `cap` is not a prefix of
/// `color(s)`. Aliases use disjoint starting letters across axes (c, a/t,
/// p), so prefixes never collide across axes.
const COUNT_AXIS_ALIASES: Record<CountAxis, readonly string[]> = {
  colorCount: ['color', 'colors'],
  attributeCount: ['attribute', 'attributes', 'attrs', 'trait', 'traits'],
  pixelCount: ['pixel', 'pixels'],
}

function matchCountAxis(word: string): CountAxis | undefined {
  if (word.length === 0) return undefined
  for (const axis of Object.keys(COUNT_AXIS_ALIASES) as CountAxis[]) {
    if (COUNT_AXIS_ALIASES[axis].some((alias) => alias.startsWith(word))) {
      return axis
    }
  }
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
  if ('eq' in a)
    return mergeEqWithRange(a.eq, b as { min?: number; max?: number })
  if ('eq' in b)
    return mergeEqWithRange(b.eq, a as { min?: number; max?: number })
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

function addSkinTone(group: ParsedSearchTextGroup, tone: SkinToneValue): void {
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

function normalizeSynonymText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/[^#a-z0-9]+/g, ' ')
    .trim()
}

function isSearchFillerTerm(term: SearchTextTerm): boolean {
  if (term.exact) return false
  const normalized = normalizeSynonymText(term.text)
  return normalized === 'punk' || normalized === 'punks'
}
