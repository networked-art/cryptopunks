import {
  PUNK_COUNT,
  SkinTone,
  skinToneNames,
  type PunkStandardRef,
  type PunkStandardValue,
  type SkinToneValue,
} from './constants'
import { searchCollectionEntries } from './collections'
import type { SearchCollectionEntry } from './collections'
import searchSynonymsJson from './search-synonyms.json'
import {
  canonicalizeSearchInput,
  normalizePunkStandard,
  normalizeSynonymText,
  PunksDataValidationError,
} from './utils'

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
  /// When set, scopes curated-collection resolution to this standard. Carried
  /// by the offline client so both the search and filter-compile paths inherit
  /// the SDK's configured standard without a separate argument.
  readonly standard?: PunkStandardValue
  /// Optional unambiguous-prefix completer (`bur` → `burned`). When present,
  /// the parser rewrites an unfinished fuzzy term to the alias it uniquely
  /// completes before resolving collections, synonyms, and traits, so a partial
  /// word resolves when nothing else in the dataset could match it.
  completeSearchPrefix?(text: string): string | undefined
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
///     `<n> pixel(s)` (`<n>` may be digits or a zero-through-seven word) →
///     numeric eq constraint on the matching axis;
///   - `<n>-<m> color(s)` etc. → numeric range;
///   - `<= <n> color(s)`, `>= <n> color(s)`, `< <n>`, `> <n>` → numeric
///     range bounded by min/max;
///   - `albino` (alone), `<tone> skin/skinned`, `skin <tone>`, `skintone
///     <tone>`, `tone <tone>` → skin-tone match. Tones are
///     `dark`, `brown`, `fair`, `albino` and resolve to the four human
///     head-variant slots (Female 1..4 / Male 1..4).
/// Anything else is left in `freeTerms` for downstream interpretation.
/// Options for {@link parseSearchText}.
export type ParseSearchTextOptions = {
  /// When set, only curated collections of this standard resolve to their id
  /// set; an alias of any other standard falls through to a literal trait
  /// lookup. Omitted means every collection resolves (the default).
  standard?: PunkStandardRef
  /// Rewrites an unfinished fuzzy term to the alias it unambiguously completes
  /// (e.g. `bur` → `burned`) before grouping; return `undefined` to leave a
  /// term unchanged. Wired from {@link ExactTraitTextResolver.completeSearchPrefix}.
  completePrefix?: (term: string) => string | undefined
}

export function parseSearchText(
  input: string,
  options: ParseSearchTextOptions = {},
): ParsedSearchText {
  if (typeof input !== 'string') {
    throw new PunksDataValidationError('text search must be a string')
  }
  const standard =
    options.standard === undefined
      ? undefined
      : normalizePunkStandard(options.standard)
  const tokens = completePrefixTokens(
    tokenizeSearchText(input),
    options.completePrefix,
  )
  const orGroups: ParsedSearchTextGroup[] = []
  let current: SearchTextTerm[] = []
  for (const token of tokens) {
    if (!token.exact && /^(or|\|\|)$/i.test(token.text)) {
      if (current.length > 0) {
        orGroups.push(parseSearchTextGroup(current, standard))
        current = []
      }
      continue
    }
    current.push(token)
  }
  if (current.length > 0 || orGroups.length === 0) {
    orGroups.push(parseSearchTextGroup(current, standard))
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
  return parseSearchText(input, {
    standard: data.standard,
    completePrefix: data.completeSearchPrefix
      ? (term) => data.completeSearchPrefix!(term)
      : undefined,
  })
}

/// Rewrites each unfinished fuzzy token to the alias it unambiguously completes
/// (via `complete`), re-tokenizing the completion so a multi-word expansion
/// splits correctly. Exact (quoted) terms, the `OR` operator, and tokens with
/// no letters (numbers, ids, comparators) are passed through untouched.
function completePrefixTokens(
  tokens: readonly SearchTextTerm[],
  complete: ((term: string) => string | undefined) | undefined,
): SearchTextTerm[] {
  if (complete === undefined) return [...tokens]
  const out: SearchTextTerm[] = []
  for (const token of tokens) {
    if (
      token.exact ||
      /^(or|\|\|)$/i.test(token.text) ||
      !/[a-z]/i.test(token.text)
    ) {
      out.push(token)
      continue
    }
    const completion = complete(token.text)
    const expanded =
      completion === undefined ? [] : tokenizeSearchText(completion)
    if (expanded.length === 0) out.push(token)
    else out.push(...expanded)
  }
  return out
}

/// Completes an unfinished term to the single curated-collection alias or
/// synonym key it unambiguously prefixes. Only single-word keys are considered
/// (so a partial `bur` reaches `burned`, but the partial first word of a
/// multi-word alias is left alone), and a completion is returned only when every
/// matching key resolves to the same target — `bur` → `burned`, but a prefix two
/// different collections share stays unresolved. Returns `undefined` when the
/// term already equals a key (it matches as-is) or when nothing matches. The
/// caller owns the "no trait already matches" guard, so a prefix that also names
/// a trait (`mus` → Mustache) is left for the fuzzy trait path.
export function findUniquePrefixCompletion(
  term: string,
  standard?: PunkStandardValue,
): string | undefined {
  const norm = normalizeSynonymText(term)
  if (!norm || norm.includes(' ')) return undefined
  const byTarget = new Map<string, string>()
  const consider = (key: string, target: string): void => {
    if (key.includes(' ') || !key.startsWith(norm)) return
    const existing = byTarget.get(target)
    if (existing === undefined || key.length < existing.length) {
      byTarget.set(target, key)
    }
  }
  for (const entry of searchCollectionEntries) {
    if (standard !== undefined && entry.standard !== standard) continue
    consider(
      entry.key,
      `collection:${entry.collectionSlug}/${entry.institutionSlug ?? ''}`,
    )
  }
  for (const entry of SEARCH_SYNONYM_ENTRIES) {
    consider(entry.key, `synonym:${synonymTargetKey(entry)}`)
  }
  if (byTarget.size !== 1) return undefined
  const [key] = byTarget.values()
  return key === norm ? undefined : key
}

/// Identity for a synonym's expansion, so two aliases that rewrite to the same
/// thing (`girl` / `girls` → `female`) count as one target when completing.
function synonymTargetKey(entry: SearchSynonymEntry): string {
  return entry.value.map((t) => (t.exact ? `"${t.text}"` : t.text)).join(' ')
}

/// Tokenizes a search text string the same way as the offline text-search
/// path: closed double quotes mark exact terms; everything else splits on
/// whitespace. An unclosed opening quote (the user is mid-typing `"cap forw`)
/// produces a fuzzy token over the verbatim slice so incremental input still
/// matches as a substring; the term only flips to `exact` once the closing
/// quote is added.
export function tokenizeSearchText(input: string): SearchTextTerm[] {
  const tokens: SearchTextTerm[] = []
  const source = canonicalizeSearchInput(input)
  let cursor = 0

  while (cursor < source.length) {
    while (cursor < source.length && /\s/.test(source[cursor])) cursor++
    if (cursor >= source.length) break

    if (source[cursor] === '"') {
      cursor++
      const start = cursor
      while (cursor < source.length && source[cursor] !== '"') cursor++
      const closed = cursor < source.length && source[cursor] === '"'
      const text = source.slice(start, cursor).trim()
      if (closed) cursor++
      if (text) tokens.push({ text, exact: closed })
      continue
    }

    const start = cursor
    while (cursor < source.length && !/\s/.test(source[cursor])) cursor++
    const text = source.slice(start, cursor).replaceAll('"', '').trim()
    if (text) tokens.push({ text, exact: false })
  }

  return tokens
}

function parseSearchTextGroup(
  tokens: readonly SearchTextTerm[],
  standard?: PunkStandardValue,
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
        // `skin tone <tone>`, `skin tones <tone>`.
        if (
          t2 !== undefined &&
          !t2.exact &&
          (word0 === 'skin' || word0 === 'skintone') &&
          (word1 === 'tone' || word1 === 'tones')
        ) {
          const tone = matchSkinToneWord(normalizeWord(t2.text))
          if (tone !== undefined) {
            addSkinTone(group, tone)
            i += 3
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

      // `skin`, `skinned`, `skin tone`, `skin tones` — all human skin-tone
      // slots. This is a safe bare alias because no canonical trait uses
      // "skin" as a name component.
      if (isSkinToneGrammarWord(word0)) {
        addAllSkinTones(group)
        const word1 =
          t1 !== undefined && !t1.exact ? normalizeWord(t1.text) : ''
        i += isSkinToneGrammarWord(word1) ? 2 : 1
        continue
      }

      // `fair` and `brown` are unambiguous tone words. Keep bare `dark` on the
      // trait path because it also names Dark Hair / Mohawk Dark / etc.
      const bareTone = matchBareSkinToneWord(word0)
      if (bareTone !== undefined) {
        addSkinTone(group, bareTone)
        i += 1
        continue
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
  group.freeTerms = resolveSearchCollectionTerms(
    group,
    group.freeTerms,
    standard,
  )
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

/// Replaces whole-phrase collection aliases in `terms` with their id set,
/// pushed onto `group.includeIds`, and returns the terms left for downstream
/// trait/synonym resolution. Only non-exact terms match, so a quoted `"burned"`
/// stays a literal trait lookup.
function resolveSearchCollectionTerms(
  group: ParsedSearchTextGroup,
  terms: readonly SearchTextTerm[],
  standard?: PunkStandardValue,
): SearchTextTerm[] {
  if (terms.length === 0 || searchCollectionEntries.length === 0) {
    return [...terms]
  }
  const remaining: SearchTextTerm[] = []
  let i = 0
  while (i < terms.length) {
    const match = findSearchCollectionAt(terms, i, standard)
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
  standard?: PunkStandardValue,
): { entry: SearchCollectionEntry; consumed: number } | undefined {
  for (const entry of searchCollectionEntries) {
    // A scoped SDK skips collections of other standards; the alias then falls
    // through to literal trait matching instead of resolving as an id set.
    if (standard !== undefined && entry.standard !== standard) continue
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

function addAllSkinTones(group: ParsedSearchTextGroup): void {
  for (let id = 0; id < skinToneNames.length; id++) {
    addSkinTone(group, id as SkinToneValue)
  }
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

function matchBareSkinToneWord(word: string): SkinToneValue | undefined {
  const tone = matchSkinToneWord(word)
  return tone === SkinTone.Brown || tone === SkinTone.Fair ? tone : undefined
}

function isSkinToneGrammarWord(word: string): boolean {
  return (
    word === 'skin' ||
    word === 'skinned' ||
    word === 'skintone' ||
    word === 'tone' ||
    word === 'tones'
  )
}

function parseNonNegativeInt(value: string): number | undefined {
  if (/^\d+$/.test(value)) {
    const n = Number.parseInt(value, 10)
    return Number.isInteger(n) && n >= 0 ? n : undefined
  }
  return parseNumberWord(value)
}

const NUMBER_WORDS: Partial<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
}

function parseNumberWord(value: string): number | undefined {
  const normalized = normalizeWord(value)
  return NUMBER_WORDS[normalized]
}

function normalizeWord(value: string): string {
  return value.toLowerCase().replaceAll(/[_,]/g, '')
}

function isSearchFillerTerm(term: SearchTextTerm): boolean {
  if (term.exact) return false
  const normalized = normalizeSynonymText(term.text)
  return normalized === 'punk' || normalized === 'punks'
}
