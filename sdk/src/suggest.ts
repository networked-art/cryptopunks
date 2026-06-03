import {
  TraitKind,
  type PunkStandardRef,
  type PunkStandardValue,
} from './constants'
import { getSearchCollection, searchCollectionEntries } from './collections'
import type { OfflinePunksDataClient } from './offline'
import type { TraitRecord } from './types'
import {
  searchSynonyms,
  tokenizeSearchText,
  type SearchTextTerm,
} from './text-parse'
import {
  canonicalizeSearchInput,
  normalizePunkStandard,
  normalizeSynonymText,
} from './utils'

/// What a suggestion completes the active word into. `trait`, `collection`,
/// and `synonym` can carry a `count`; `skin-tone` and `count` are grammar
/// qualifiers with none.
export type SearchSuggestionKind =
  | 'trait'
  | 'collection'
  | 'synonym'
  | 'skin-tone'
  | 'count'

/// One typeahead row. `query` is the whole search text with the active word
/// completed — set it as the input value to apply the suggestion. `count` is
/// the population behind the suggestion when it is cheap and meaningful (a
/// trait's supply, a curated collection's size); omitted for qualifiers.
export type SearchSuggestion = {
  kind: SearchSuggestionKind
  label: string
  query: string
  count?: number
}

export type SuggestSearchTextOptions = {
  /// Caps the trait rows — the only open-ended group. Curated collections,
  /// skin tones and count hints are few and always returned in full. Default 7.
  traitLimit?: number
  /// Scopes curated-collection matches to one Punk standard, mirroring the
  /// search parser. Defaults to the client's configured standard.
  standard?: PunkStandardRef
}

/// The trailing partial word under the cursor (`active`) and everything before
/// it (`preceding`, verbatim so a completion keeps the rest of the query).
export type ActiveSearchToken = { active: string; preceding: string }

/// Splits `text` into the word currently being typed and the text before it.
/// Returns `undefined` when there is nothing to complete: empty input, a
/// trailing space (the last word is finished), or an open double-quote (the
/// user is mid exact-term). Suggestions complete the `active` word and keep
/// `preceding` intact.
export function activeSearchToken(text: string): ActiveSearchToken | undefined {
  if (typeof text !== 'string') return undefined
  const canon = canonicalizeSearchInput(text)
  if (canon === '' || /\s$/.test(canon)) return undefined
  if (((canon.match(/"/g)?.length ?? 0) & 1) === 1) return undefined
  const match = /\S+$/.exec(canon)
  if (match === null || match[0].includes('"')) return undefined
  return { active: match[0], preceding: canon.slice(0, match.index) }
}

/// Ranked typeahead suggestions for the active word in `text`, completing it
/// into the search vocabulary: curated collections and grammar qualifiers
/// first (they need at least two meaningful characters), then trait names by
/// supply.
/// Returns `[]` when there is nothing to complete (see {@link
/// activeSearchToken}). Pure and synchronous — the caller owns presentation
/// and any app-specific qualifiers (e.g. market state) layered on top.
export function suggestSearchText(
  data: OfflinePunksDataClient,
  text: string,
  options: SuggestSearchTextOptions = {},
): SearchSuggestion[] {
  const token = activeSearchToken(text)
  if (token === undefined) return []
  const activeVariants = suggestionTextVariants(token.active)
  if (activeVariants.length === 0) return []
  const standard =
    options.standard !== undefined
      ? normalizePunkStandard(options.standard)
      : data.standard
  const preceding = tokenizeSearchText(token.preceding)

  return [
    ...collectionSuggestions(activeVariants, preceding, standard),
    ...skinToneSuggestions(activeVariants, preceding),
    ...countSuggestions(activeVariants, preceding),
    ...synonymSuggestions(data, activeVariants, preceding),
    ...traitSuggestions(
      data,
      activeVariants,
      preceding,
      options.traitLimit ?? 7,
    ),
  ]
}

function traitSuggestions(
  data: OfflinePunksDataClient,
  activeVariants: readonly string[],
  preceding: readonly SearchTextTerm[],
  limit: number,
): SearchSuggestion[] {
  // Restrict to the names worth completing: wearable accessories and the
  // human/zombie/ape/alien types. HeadVariant (`Male 1`..`Female 4`) and
  // AttributeCount (`3 Attributes`) names only duplicate the skin-tone and
  // count grammar, so they are dropped here.
  const seen = new Set<string>()
  const matches: { trait: TraitRecord; absorbed: number }[] = []
  for (const trait of data.getTraitCatalogSync()) {
    if (
      trait.kindId !== TraitKind.Accessory &&
      trait.kindId !== TraitKind.NormalizedType
    ) {
      continue
    }
    if (seen.has(trait.name)) continue
    seen.add(trait.name)
    const words = normalizedWords(trait.name)
    const match = bestMatchedWord(words, activeVariants, preceding)
    if (match === undefined) continue
    matches.push({ trait, absorbed: match.absorbed })
  }
  // When a preceding word also belongs to a trait name (`big sh` → Big Shades),
  // keep only the candidates that fold in the most of it — so partial matches
  // that would strand `big` as its own broken term drop out.
  const maxAbsorbed = matches.reduce((max, m) => Math.max(max, m.absorbed), 0)
  return matches
    .filter((m) => m.absorbed === maxAbsorbed)
    .sort((a, b) => b.trait.supply - a.trait.supply)
    .slice(0, Math.max(0, limit))
    .map(({ trait, absorbed }) => ({
      kind: 'trait',
      label: trait.name,
      count: trait.supply,
      query: withCompletion(
        preceding.slice(0, preceding.length - absorbed),
        `"${trait.name}"`,
      ),
    }))
}

function collectionSuggestions(
  activeVariants: readonly string[],
  preceding: readonly SearchTextTerm[],
  standard: PunkStandardValue | undefined,
): SearchSuggestion[] {
  // One row per target (collection / institution), keyed by its slugs, taking
  // a key that matches the active word when possible, then the shortest alias.
  // A single letter is too thin to mean a curated set; wait for two.
  if (!hasMinimumSignal(activeVariants, 2)) return []
  type Candidate = {
    entry: (typeof searchCollectionEntries)[number]
    absorbed: number
    keyMatches: boolean
  }
  const best = new Map<string, Candidate>()
  for (const entry of searchCollectionEntries) {
    if (standard !== undefined && entry.standard !== standard) continue
    const collection = getSearchCollection(entry.collectionSlug)
    if (collection === undefined) continue
    const institution =
      entry.institutionSlug === undefined
        ? undefined
        : collection.institutions?.find((i) => i.slug === entry.institutionSlug)
    const label = institution?.title ?? collection.title
    const keyMatch = bestMatchedWord(entry.tokens, activeVariants, preceding)
    const labelMatches = matchesSuggestionText(label, activeVariants)
    if (keyMatch === undefined && !labelMatches) continue
    const key = `${entry.collectionSlug}/${entry.institutionSlug ?? ''}`
    const current = best.get(key)
    const candidate = {
      entry,
      absorbed: keyMatch?.absorbed ?? 0,
      keyMatches: keyMatch !== undefined,
    }
    if (
      current === undefined ||
      isBetterCollectionCandidate(candidate, current)
    ) {
      best.set(key, candidate)
    }
  }
  const result: SearchSuggestion[] = []
  for (const { entry, absorbed } of best.values()) {
    const collection = getSearchCollection(entry.collectionSlug)
    if (collection === undefined) continue
    const institution =
      entry.institutionSlug === undefined
        ? undefined
        : collection.institutions?.find((i) => i.slug === entry.institutionSlug)
    const kept = preceding.slice(0, preceding.length - absorbed)
    result.push({
      kind: 'collection',
      label: institution?.title ?? collection.title,
      count: entry.ids.length,
      query: withCompletion(kept, entry.key),
    })
  }
  return result.sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
}

type SearchSynonymSuggestionEntry = {
  key: string
  words: string[]
  target: string
}

const SEARCH_SYNONYM_SUGGESTION_ENTRIES: readonly SearchSynonymSuggestionEntry[] =
  Object.freeze(buildSearchSynonymSuggestionEntries())

function buildSearchSynonymSuggestionEntries(): SearchSynonymSuggestionEntry[] {
  const entries: SearchSynonymSuggestionEntry[] = []
  for (const [rawKey, rawValue] of Object.entries(searchSynonyms)) {
    if (typeof rawKey !== 'string' || typeof rawValue !== 'string') continue
    const key = normalizeSynonymText(rawKey)
    const words = normalizedWords(key)
    if (!key || words.length === 0) continue
    const target = tokenizeSearchText(rawValue)
      .map((term) => (term.exact ? `"${term.text}"` : term.text))
      .join(' ')
    if (!target) continue
    entries.push({ key, words, target })
  }
  return entries.sort((a, b) => {
    const tokenDelta = b.words.length - a.words.length
    if (tokenDelta !== 0) return tokenDelta
    return b.key.length - a.key.length
  })
}

function synonymSuggestions(
  data: OfflinePunksDataClient,
  activeVariants: readonly string[],
  preceding: readonly SearchTextTerm[],
): SearchSuggestion[] {
  const activeSignal = maxSignalLength(activeVariants)
  if (activeSignal === 0) return []
  const best = new Map<
    string,
    { entry: SearchSynonymSuggestionEntry; absorbed: number }
  >()
  for (const entry of SEARCH_SYNONYM_SUGGESTION_ENTRIES) {
    const match = bestMatchedSynonymWord(entry.words, activeVariants, preceding)
    if (match === undefined) continue
    if (activeSignal < 2 && match.absorbed === 0) continue
    const current = best.get(entry.target)
    const candidate = { entry, absorbed: match.absorbed }
    if (
      current === undefined ||
      candidate.absorbed > current.absorbed ||
      (candidate.absorbed === current.absorbed &&
        candidate.entry.key.length < current.entry.key.length)
    ) {
      best.set(entry.target, candidate)
    }
  }
  return Array.from(best.values()).map(({ entry, absorbed }) => ({
    kind: 'synonym',
    label: titleizeAlias(entry.key),
    query: withCompletion(
      preceding.slice(0, preceding.length - absorbed),
      entry.key,
    ),
    count: safeTextCount(data, entry.key),
  }))
}

function bestMatchedSynonymWord(
  words: readonly string[],
  activeVariants: readonly string[],
  preceding: readonly SearchTextTerm[],
): { index: number; absorbed: number } | undefined {
  let best: { index: number; absorbed: number } | undefined
  for (let index = 0; index < words.length; index++) {
    if (!activeVariants.some((active) => words[index].startsWith(active))) {
      continue
    }
    const absorbed = absorbedPrecedingCount(words, index, preceding)
    if (
      best === undefined ||
      absorbed > best.absorbed ||
      (absorbed === best.absorbed && index > best.index)
    ) {
      best = { index, absorbed }
    }
  }
  return best
}

const SKIN_TONES: { phrase: string; searchText?: string }[] = [
  { phrase: 'dark skin' },
  { phrase: 'brown skin' },
  { phrase: 'fair skin' },
  { phrase: 'albino', searchText: 'albino skin' },
]

/// Grammar words that introduce a skin tone (`skin dark`, `tone dark`,
/// `skintone dark`) or trail one (`dark skin`). When the user typed one right
/// before the tone being completed, drop it: the canonical phrase (`dark skin`)
/// already carries it, so keeping it would duplicate (`skin dark skin`).
const SKIN_TONE_GRAMMAR_WORDS = new Set(['skin', 'skinned', 'skintone', 'tone'])

function skinToneSuggestions(
  activeVariants: readonly string[],
  preceding: readonly SearchTextTerm[],
): SearchSuggestion[] {
  if (!hasMinimumSignal(activeVariants, 2)) return []
  const last = preceding[preceding.length - 1]
  const kept =
    last !== undefined &&
    !last.exact &&
    SKIN_TONE_GRAMMAR_WORDS.has(normalizeSynonymText(last.text))
      ? preceding.slice(0, -1)
      : preceding
  const result: SearchSuggestion[] = []
  for (const { phrase, searchText = phrase } of SKIN_TONES) {
    if (!matchesSuggestionText(searchText, activeVariants)) continue
    result.push({
      kind: 'skin-tone',
      label: capitalize(phrase),
      query: withCompletion(kept, phrase),
    })
  }
  return result
}

type CountSuggestionAxis = {
  words: readonly string[]
  canonical: string
  suggestedValues: readonly number[]
}

const COUNT_AXES: CountSuggestionAxis[] = [
  {
    words: ['colors', 'color'],
    canonical: 'colors',
    suggestedValues: rangeInclusive(2, 14),
  },
  {
    words: ['attributes', 'attribute', 'attrs', 'traits', 'trait'],
    canonical: 'attributes',
    suggestedValues: rangeInclusive(0, 7),
  },
  {
    words: ['pixels', 'pixel'],
    canonical: 'pixels',
    // Pixel counts span a wide numeric range, so keep them discoverable via
    // `220 p`-style completions instead of filling the dropdown from `pixels`.
    suggestedValues: [],
  },
]

const COUNT_NUMBER_WORDS: { word: string; value: number }[] = [
  { word: 'zero', value: 0 },
  { word: 'one', value: 1 },
  { word: 'two', value: 2 },
  { word: 'three', value: 3 },
  { word: 'four', value: 4 },
  { word: 'five', value: 5 },
  { word: 'six', value: 6 },
  { word: 'seven', value: 7 },
]

function countSuggestions(
  activeVariants: readonly string[],
  preceding: readonly SearchTextTerm[],
): SearchSuggestion[] {
  const last = preceding[preceding.length - 1]
  const axis = COUNT_AXES.find(({ words }) =>
    words.some((word) => matchesWord(word, activeVariants)),
  )
  const precedingNumber =
    last === undefined || last.exact
      ? undefined
      : parseCountSuggestionNumber(last.text)

  if (axis !== undefined && precedingNumber !== undefined) {
    return [countSuggestion(preceding.slice(0, -1), precedingNumber, axis)]
  }

  const activeNumber = parseActiveNumberWord(activeVariants)
  if (activeNumber !== undefined) {
    return countValueSuggestions(preceding, activeNumber)
  }

  if (!hasMinimumSignal(activeVariants, 2) || axis === undefined) return []
  return axis.suggestedValues.map((value) =>
    countSuggestion(preceding, value, axis),
  )
}

function countValueSuggestions(
  preceding: readonly SearchTextTerm[],
  value: number,
): SearchSuggestion[] {
  return COUNT_AXES.filter((axis) => axis.suggestedValues.includes(value)).map(
    (axis) => countSuggestion(preceding, value, axis),
  )
}

function countSuggestion(
  preceding: readonly SearchTextTerm[],
  value: number,
  axis: CountSuggestionAxis,
): SearchSuggestion {
  const phrase = `${value} ${axis.canonical}`
  return {
    kind: 'count',
    label: phrase,
    query: withCompletion(preceding, phrase),
  }
}

function parseCountSuggestionNumber(value: string): number | undefined {
  if (/^\d+$/.test(value)) {
    const n = Number.parseInt(value, 10)
    return Number.isInteger(n) && n >= 0 ? n : undefined
  }
  const normalized = normalizeSynonymText(value)
  return COUNT_NUMBER_WORDS.find((entry) => entry.word === normalized)?.value
}

function parseActiveNumberWord(
  activeVariants: readonly string[],
): number | undefined {
  if (!hasMinimumSignal(activeVariants, 2)) return undefined
  return COUNT_NUMBER_WORDS.find(({ word }) =>
    activeVariants.some((active) => word.startsWith(active)),
  )?.value
}

function rangeInclusive(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_value, index) => min + index)
}

/// Comparison keys for an active search token. The first is the standard
/// `normalizeSynonymText` form; when the token joins word characters with
/// `-`/`_`, a second joined form lets `3-d` match `3D Glasses`.
function suggestionTextVariants(value: string): string[] {
  const spaced = normalizeSynonymText(value)
  if (!spaced) return []
  const joined = value
    .toLowerCase()
    .replaceAll(/[_-]+/g, '')
    .replaceAll(/[^#a-z0-9]+/g, ' ')
    .trim()
  return joined && joined !== spaced ? [spaced, joined] : [spaced]
}

function normalizedWords(value: string): string[] {
  return normalizeSynonymText(value).split(/\s+/).filter(Boolean)
}

function hasMinimumSignal(
  activeVariants: readonly string[],
  minLength: number,
): boolean {
  return maxSignalLength(activeVariants) >= minLength
}

function maxSignalLength(activeVariants: readonly string[]): number {
  return activeVariants.reduce(
    (max, variant) => Math.max(max, signalLength(variant)),
    0,
  )
}

function signalLength(value: string): number {
  return value.replaceAll(/\s+/g, '').length
}

/// A normalized string matches when the active token starts a word, or when a
/// two-plus-character token appears anywhere in the result text.
function matchesNormalizedText(value: string, active: string): boolean {
  if (!active) return false
  if (value.startsWith(active) || value.includes(` ${active}`)) return true
  return signalLength(active) >= 2 && value.includes(active)
}

function matchesSuggestionText(
  value: string,
  activeVariants: readonly string[],
): boolean {
  const normalized = normalizeSynonymText(value)
  if (!normalized) return false
  return activeVariants.some((active) =>
    matchesNormalizedText(normalized, active),
  )
}

function matchesWord(word: string, activeVariants: readonly string[]): boolean {
  return activeVariants.some((active) => matchesNormalizedText(word, active))
}

function bestMatchedWord(
  words: readonly string[],
  activeVariants: readonly string[],
  preceding: readonly SearchTextTerm[],
): { index: number; absorbed: number } | undefined {
  let best: { index: number; absorbed: number } | undefined
  for (let index = 0; index < words.length; index++) {
    if (!matchesWord(words[index], activeVariants)) continue
    const absorbed = absorbedPrecedingCount(words, index, preceding)
    if (
      best === undefined ||
      absorbed > best.absorbed ||
      (absorbed === best.absorbed && index > best.index)
    ) {
      best = { index, absorbed }
    }
  }
  return best
}

function isBetterCollectionCandidate(
  candidate: {
    entry: (typeof searchCollectionEntries)[number]
    absorbed: number
    keyMatches: boolean
  },
  current: {
    entry: (typeof searchCollectionEntries)[number]
    absorbed: number
    keyMatches: boolean
  },
): boolean {
  if (candidate.keyMatches !== current.keyMatches) return candidate.keyMatches
  if (candidate.absorbed !== current.absorbed) {
    return candidate.absorbed > current.absorbed
  }
  return candidate.entry.key.length < current.entry.key.length
}

/// How many trailing `preceding` tokens fold into a multi-word target. Walking
/// left from the matched word, each earlier target word is paired with a
/// trailing input token that prefixes it — so `big sh` completes to `Big
/// Shades`, absorbing `big`, instead of leaving it stranded.
function absorbedPrecedingCount(
  words: readonly string[],
  matchedIndex: number,
  preceding: readonly SearchTextTerm[],
): number {
  let absorbed = 0
  let wordIndex = matchedIndex - 1
  for (
    let k = preceding.length - 1;
    k >= 0 && wordIndex >= 0;
    k--, wordIndex--
  ) {
    const term = preceding[k]
    const word = normalizeSynonymText(term.text)
    if (term.exact || word === '' || !words[wordIndex].startsWith(word)) break
    absorbed++
  }
  return absorbed
}

function withCompletion(
  preceding: readonly SearchTextTerm[],
  completion: string,
): string {
  const prefix = preceding
    .map((term) => (term.exact ? `"${term.text}"` : term.text))
    .join(' ')
  return prefix ? `${prefix} ${completion}` : completion
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function titleizeAlias(value: string): string {
  return value
    .split(' ')
    .map((word) => (word.length === 1 ? word.toUpperCase() : capitalize(word)))
    .join(' ')
}

function safeTextCount(
  data: OfflinePunksDataClient,
  text: string,
): number | undefined {
  try {
    return data.countSync({ text })
  } catch {
    return undefined
  }
}
