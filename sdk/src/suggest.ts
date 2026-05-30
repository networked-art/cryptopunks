import {
  SkinTone,
  TraitKind,
  type PunkStandardRef,
  type PunkStandardValue,
  type SkinToneValue,
} from './constants'
import { getSearchCollection, searchCollectionEntries } from './collections'
import type { OfflinePunksDataClient } from './offline'
import type { TraitRecord } from './types'
import { tokenizeSearchText, type SearchTextTerm } from './text-parse'
import {
  canonicalizeSearchInput,
  normalizePunkStandard,
  normalizeSynonymText,
} from './utils'

/// What a suggestion completes the active word into. `trait` and `collection`
/// carry a `count`; `skin-tone` and `count` are grammar qualifiers with none.
export type SearchSuggestionKind = 'trait' | 'collection' | 'skin-tone' | 'count'

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
/// first (they only match a deliberate prefix), then trait names by supply.
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
  const active = normalizeSynonymText(token.active)
  if (active === '') return []
  const standard =
    options.standard !== undefined
      ? normalizePunkStandard(options.standard)
      : data.standard
  const preceding = tokenizeSearchText(token.preceding)

  return [
    ...collectionSuggestions(active, preceding, standard),
    ...skinToneSuggestions(active, preceding),
    ...countSuggestions(active, preceding),
    ...traitSuggestions(data, token.active, active, preceding, options.traitLimit ?? 7),
  ]
}

function traitSuggestions(
  data: OfflinePunksDataClient,
  activeRaw: string,
  active: string,
  preceding: readonly SearchTextTerm[],
  limit: number,
): SearchSuggestion[] {
  // Restrict to the names worth completing: wearable accessories and the
  // human/zombie/ape/alien types. HeadVariant (`Male 1`..`Female 4`) and
  // AttributeCount (`3 Attributes`) names only duplicate the skin-tone and
  // count grammar, so they are dropped here.
  const seen = new Set<string>()
  const matches: { trait: TraitRecord; absorbed: number }[] = []
  for (const trait of data.findTraitsByTextSync(activeRaw)) {
    if (
      trait.kindId !== TraitKind.Accessory &&
      trait.kindId !== TraitKind.NormalizedType
    ) {
      continue
    }
    if (seen.has(trait.name)) continue
    seen.add(trait.name)
    const words = normalizeSynonymText(trait.name).split(' ')
    const index = Math.max(0, matchedWordIndex(words, active))
    matches.push({ trait, absorbed: absorbedPrecedingCount(words, index, preceding) })
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
      query: withCompletion(preceding.slice(0, preceding.length - absorbed), `"${trait.name}"`),
    }))
}

function collectionSuggestions(
  active: string,
  preceding: readonly SearchTextTerm[],
  standard: PunkStandardValue | undefined,
): SearchSuggestion[] {
  // One row per target (collection / institution), keyed by its slugs, taking
  // the shortest alias that the active word completes in full.
  // A single letter is too thin to mean a curated set; wait for two.
  if (active.length < 2) return []
  type Candidate = { entry: (typeof searchCollectionEntries)[number]; absorbed: number }
  const best = new Map<string, Candidate>()
  for (const entry of searchCollectionEntries) {
    if (standard !== undefined && entry.standard !== standard) continue
    const index = matchedWordIndex(entry.tokens, active)
    // The active word must complete the alias's last word, with every earlier
    // word covered by a preceding token — so a partial multi-word alias never
    // half-matches.
    if (index !== entry.tokens.length - 1) continue
    const absorbed = absorbedPrecedingCount(entry.tokens, index, preceding)
    if (absorbed !== index) continue
    const key = `${entry.collectionSlug}/${entry.institutionSlug ?? ''}`
    const current = best.get(key)
    if (current === undefined || entry.key.length < current.entry.key.length) {
      best.set(key, { entry, absorbed })
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

const SKIN_TONES: { tone: SkinToneValue; word: string; phrase: string }[] = [
  { tone: SkinTone.Dark, word: 'dark', phrase: 'dark skin' },
  { tone: SkinTone.Brown, word: 'brown', phrase: 'brown skin' },
  { tone: SkinTone.Fair, word: 'fair', phrase: 'fair skin' },
  { tone: SkinTone.Albino, word: 'albino', phrase: 'albino' },
]

/// Grammar words that introduce a skin tone (`skin dark`, `tone dark`,
/// `skintone dark`) or trail one (`dark skin`). When the user typed one right
/// before the tone being completed, drop it: the canonical phrase (`dark skin`)
/// already carries it, so keeping it would duplicate (`skin dark skin`).
const SKIN_TONE_GRAMMAR_WORDS = new Set(['skin', 'skinned', 'skintone', 'tone'])

function skinToneSuggestions(
  active: string,
  preceding: readonly SearchTextTerm[],
): SearchSuggestion[] {
  if (active.length < 2) return []
  const last = preceding[preceding.length - 1]
  const kept =
    last !== undefined &&
    !last.exact &&
    SKIN_TONE_GRAMMAR_WORDS.has(normalizeSynonymText(last.text))
      ? preceding.slice(0, -1)
      : preceding
  const result: SearchSuggestion[] = []
  for (const { word, phrase } of SKIN_TONES) {
    if (!word.startsWith(active)) continue
    result.push({
      kind: 'skin-tone',
      label: capitalize(phrase),
      query: withCompletion(kept, phrase),
    })
  }
  return result
}

const COUNT_AXES: { words: readonly string[]; canonical: string }[] = [
  { words: ['colors', 'color'], canonical: 'colors' },
  { words: ['attributes', 'attribute', 'attrs', 'traits', 'trait'], canonical: 'attributes' },
  { words: ['pixels', 'pixel'], canonical: 'pixels' },
]

function countSuggestions(
  active: string,
  preceding: readonly SearchTextTerm[],
): SearchSuggestion[] {
  const last = preceding[preceding.length - 1]
  if (last === undefined || last.exact || !/^\d+$/.test(last.text)) return []
  const axis = COUNT_AXES.find(({ words }) => words.some((w) => w.startsWith(active)))
  if (axis === undefined) return []
  const phrase = `${Number.parseInt(last.text, 10)} ${axis.canonical}`
  return [
    {
      kind: 'count',
      label: phrase,
      query: withCompletion(preceding.slice(0, -1), phrase),
    },
  ]
}

/// The first word of `words` that the active term prefixes, or `-1`. The active
/// term has already been normalized the same way as the words.
function matchedWordIndex(words: readonly string[], active: string): number {
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith(active)) return i
  }
  return -1
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
  for (let k = preceding.length - 1; k >= 0 && wordIndex >= 0; k--, wordIndex--) {
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
