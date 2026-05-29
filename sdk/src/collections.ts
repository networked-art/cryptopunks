import searchCollectionsJson from './search-collections.json'
import { PUNK_COUNT } from './constants'
import type { PunkStandardRef, PunkStandardValue } from './constants'
import type {
  CuratedCollection,
  CuratedCollectionInstitution,
  CuratedCollectionMatch,
  CuratedCollectionMembership,
} from './types'
import {
  PunksDataValidationError,
  normalizePunkStandard,
  normalizeSynonymText,
  validatePunkId,
} from './utils'

/// The bundled JSON shape, before validation/normalization. The slug is the
/// object key; everything else lives in the value.
type RawCuratedCollection = {
  title?: unknown
  description?: unknown
  aliases?: unknown
  source?: unknown
  sourceTemplate?: unknown
  standard?: unknown
  ids?: unknown
  institutions?: unknown
}

type RawInstitution = {
  title?: unknown
  aliases?: unknown
  source?: unknown
  sourceTemplate?: unknown
  ids?: unknown
}

function asString(value: unknown, slug: string, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PunksDataValidationError(
      `collection ${slug} is missing a non-empty ${field}`,
    )
  }
  return value.trim()
}

/// An optional per-Punk source URL template. When present it must be a
/// non-empty string with an `{id}` placeholder to fill with the Punk id.
function asSourceTemplate(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    !value.includes('{id}')
  ) {
    throw new PunksDataValidationError(
      `collection ${label} sourceTemplate must be a non-empty string containing {id}`,
    )
  }
  return value.trim()
}

function asAliases(value: unknown, slug: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((a) => typeof a !== 'string')) {
    throw new PunksDataValidationError(
      `collection ${slug} aliases must be a string array`,
    )
  }
  return value as string[]
}

function asIds(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PunksDataValidationError(
      `collection ${label} must list at least one id`,
    )
  }
  for (const id of value) validatePunkId(id as number)
  return uniqueSortedIds(value as number[])
}

function uniqueSortedIds(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b)
}

function asInstitutions(
  value: unknown,
  slug: string,
): CuratedCollectionInstitution[] | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PunksDataValidationError(
      `collection ${slug} institutions must be an object keyed by slug`,
    )
  }
  const institutions: CuratedCollectionInstitution[] = []
  for (const [instSlug, raw] of Object.entries(
    value as Record<string, RawInstitution>,
  )) {
    if (instSlug.trim() === '') continue
    const label = `${slug}.${instSlug}`
    const sourceTemplate = asSourceTemplate(raw.sourceTemplate, label)
    institutions.push({
      slug: instSlug,
      title: asString(raw.title, label, 'title'),
      aliases: asAliases(raw.aliases, label),
      source: asString(raw.source, label, 'source'),
      ...(sourceTemplate === undefined ? {} : { sourceTemplate }),
      ids: asIds(raw.ids, label),
    })
  }
  if (institutions.length === 0) {
    throw new PunksDataValidationError(
      `collection ${slug} institutions must not be empty`,
    )
  }
  return institutions.sort((a, b) => a.slug.localeCompare(b.slug))
}

/// Deep-freezes a collection so the shared bundle, and the `searchCollections`
/// export that aliases it, can't be mutated. The facade still hands out clones.
function freeze(collection: CuratedCollection): CuratedCollection {
  Object.freeze(collection.aliases)
  Object.freeze(collection.ids)
  if (collection.institutions !== undefined) {
    for (const institution of collection.institutions) {
      Object.freeze(institution.aliases)
      Object.freeze(institution.ids)
      Object.freeze(institution)
    }
    Object.freeze(collection.institutions)
  }
  return Object.freeze(collection)
}

function buildCollections(
  raw: Record<string, RawCuratedCollection>,
): CuratedCollection[] {
  const collections: CuratedCollection[] = []
  for (const [slug, entry] of Object.entries(raw)) {
    if (slug.trim() === '') continue
    const institutions = asInstitutions(entry.institutions, slug)
    if (institutions !== undefined && entry.ids !== undefined) {
      throw new PunksDataValidationError(
        `collection ${slug} sets ids from institutions; remove the top-level ids`,
      )
    }
    // A collection with institutions takes its id set from their union; a flat
    // collection lists ids directly.
    const ids =
      institutions === undefined
        ? asIds(entry.ids, slug)
        : uniqueSortedIds(institutions.flatMap((inst) => inst.ids))
    const sourceTemplate = asSourceTemplate(entry.sourceTemplate, slug)
    collections.push({
      slug,
      title: asString(entry.title, slug, 'title'),
      description: asString(entry.description, slug, 'description'),
      aliases: asAliases(entry.aliases, slug),
      source: asString(entry.source, slug, 'source'),
      ...(sourceTemplate === undefined ? {} : { sourceTemplate }),
      standard: normalizePunkStandard(entry.standard as PunkStandardRef),
      ids,
      ...(institutions === undefined ? {} : { institutions }),
    })
  }
  return collections.sort((a, b) => a.slug.localeCompare(b.slug)).map(freeze)
}

const COLLECTIONS: readonly CuratedCollection[] = Object.freeze(
  buildCollections(
    searchCollectionsJson as Record<string, RawCuratedCollection>,
  ),
)

const COLLECTIONS_BY_SLUG = new Map(
  COLLECTIONS.map((collection) => [collection.slug.toLowerCase(), collection]),
)

/// One whole-phrase alias → id-set entry in the curated-collection match table.
/// `collectionSlug` / `institutionSlug` identify what the alias resolves to so
/// callers can map a match back to its collection. Consumed by the text parser
/// (which uses `key`/`tokens`/`ids`/`standard`) and by `PunksCollections.matches`.
export type SearchCollectionEntry = {
  key: string
  tokens: string[]
  ids: readonly number[]
  standard: PunkStandardValue
  collectionSlug: string
  institutionSlug?: string
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

/// Builds the alias → id-set match table from the bundled collections and any
/// institutions nested within them (so `museum punks` resolves to the whole
/// set and `moma` resolves to just MoMA's). The matchable key for each slug and
/// alias is normalized and stripped of the trailing `punk(s)` filler (so
/// `burned punks`, `burned`, and the slug all reduce to the same key),
/// mirroring how `freeTerms` look by the time the parser runs. Longest keys
/// sort first so a multi-word alias wins over a shorter one.
/// A new alias must not collide with what the group loop consumes first (a
/// bare number, `#id`, `albino`, or an `<n> <axis>` / skin bigram), or it
/// never reaches this table.
function buildSearchCollectionEntries(): SearchCollectionEntry[] {
  type Owned = {
    owner: string
    ids: readonly number[]
    standard: PunkStandardValue
    collectionSlug: string
    institutionSlug?: string
  }
  const byKey = new Map<string, Owned>()
  const register = (owned: Owned, phrases: readonly string[]): void => {
    for (const phrase of phrases) {
      const key = normalizeCollectionPhrase(phrase)
      if (!key) continue
      const existing = byKey.get(key)
      if (existing !== undefined && existing.owner !== owned.owner) {
        throw new PunksDataValidationError(
          `collection alias "${key}" is claimed by both ${existing.owner} and ${owned.owner}`,
        )
      }
      byKey.set(key, owned)
    }
  }
  for (const collection of COLLECTIONS) {
    register(
      {
        owner: collection.slug,
        ids: collection.ids,
        standard: collection.standard,
        collectionSlug: collection.slug,
      },
      [collection.slug, ...collection.aliases],
    )
    // Institutions resolve on their own but inherit the parent's standard.
    for (const institution of collection.institutions ?? []) {
      register(
        {
          owner: `${collection.slug}/${institution.slug}`,
          ids: institution.ids,
          standard: collection.standard,
          collectionSlug: collection.slug,
          institutionSlug: institution.slug,
        },
        [institution.slug, ...institution.aliases],
      )
    }
  }
  return [...byKey.entries()]
    .map(([key, value]) => ({
      key,
      tokens: key.split(/\s+/),
      ids: value.ids,
      standard: value.standard,
      collectionSlug: value.collectionSlug,
      ...(value.institutionSlug === undefined
        ? {}
        : { institutionSlug: value.institutionSlug }),
    }))
    .sort((a, b) => {
      const tokenDelta = b.tokens.length - a.tokens.length
      if (tokenDelta !== 0) return tokenDelta
      return b.key.length - a.key.length
    })
}

/// The curated-collection alias match table, sorted longest-first. The text
/// parser ({@link ./text-parse}) consumes this to fold aliases into search
/// `includeIds`; {@link PunksCollections.matches} reuses it to report which
/// collections a phrase mentions.
export const searchCollectionEntries: readonly SearchCollectionEntry[] =
  Object.freeze(buildSearchCollectionEntries())

/// Scans a free-text phrase for every curated-collection alias it contains,
/// returning the matched entries in order (greedy, longest alias wins). Used by
/// the "any collection term" lookup behind {@link PunksCollections.matches}.
function matchCollectionEntries(
  text: string,
  standard?: PunkStandardValue,
): SearchCollectionEntry[] {
  if (typeof text !== 'string') return []
  const tokens = normalizeSynonymText(text)
    .split(/\s+/)
    .filter((token) => token && token !== 'punk' && token !== 'punks')
  if (tokens.length === 0) return []
  const matched: SearchCollectionEntry[] = []
  let i = 0
  while (i < tokens.length) {
    const entry = findCollectionEntryAt(tokens, i, standard)
    if (entry === undefined) {
      i += 1
      continue
    }
    matched.push(entry)
    i += entry.tokens.length
  }
  return matched
}

function findCollectionEntryAt(
  tokens: readonly string[],
  start: number,
  standard?: PunkStandardValue,
): SearchCollectionEntry | undefined {
  for (const entry of searchCollectionEntries) {
    // A scoped client skips collections of other standards, exactly as the
    // parser does, so an out-of-scope alias is reported as no match.
    if (standard !== undefined && entry.standard !== standard) continue
    if (entry.tokens.length > tokens.length - start) continue
    let isMatch = true
    for (let k = 0; k < entry.tokens.length; k++) {
      if (tokens[start + k] !== entry.tokens[k]) {
        isMatch = false
        break
      }
    }
    if (isMatch) return entry
  }
  return undefined
}

/// Fills a `sourceTemplate`'s `{id}` placeholder(s) with the Punk id.
function fillSourceTemplate(template: string, punkId: number): string {
  return template.replaceAll('{id}', String(punkId))
}

/// Resolves the best per-Punk source link for a membership, most specific
/// first: a containing institution's `sourceTemplate`, then the collection's,
/// then a lone containing institution's `source`, then the collection `source`.
function resolveSourceUrl(
  collection: CuratedCollection,
  institutions: readonly CuratedCollectionInstitution[],
  punkId: number,
): string {
  const institutionTemplate = institutions.find(
    (institution) => institution.sourceTemplate,
  )?.sourceTemplate
  if (institutionTemplate !== undefined) {
    return fillSourceTemplate(institutionTemplate, punkId)
  }
  if (collection.sourceTemplate !== undefined) {
    return fillSourceTemplate(collection.sourceTemplate, punkId)
  }
  if (institutions.length === 1) return institutions[0].source
  return collection.source
}

function clone(collection: CuratedCollection): CuratedCollection {
  const copy: CuratedCollection = {
    ...collection,
    aliases: [...collection.aliases],
    ids: [...collection.ids],
  }
  if (collection.institutions !== undefined) {
    copy.institutions = collection.institutions.map((institution) => ({
      ...institution,
      aliases: [...institution.aliases],
      ids: [...institution.ids],
    }))
  }
  return copy
}

/// All bundled collections, validated and deep-frozen at module load. For a
/// mutable copy, go through {@link PunksCollections}.
export const searchCollections: readonly CuratedCollection[] = COLLECTIONS

/// Looks up a collection by slug, case-insensitively. Returns `undefined` for
/// an unknown slug so UI code can null-check without a try/catch.
export function getSearchCollection(
  slug: string,
): CuratedCollection | undefined {
  if (typeof slug !== 'string') return undefined
  const found = COLLECTIONS_BY_SLUG.get(slug.trim().toLowerCase())
  return found === undefined ? undefined : clone(found)
}

/// Read-only lookup over the bundled curated collections. Mounted on
/// {@link PunksSdk} as `punks.collections`. When constructed with a `standard`,
/// every lookup is scoped to collections of that standard; collections of other
/// standards are invisible through this facade. The standalone
/// {@link searchCollections} / {@link getSearchCollection} exports stay global.
export class PunksCollections {
  private readonly standard?: PunkStandardValue

  constructor(standard?: PunkStandardRef) {
    this.standard =
      standard === undefined ? undefined : normalizePunkStandard(standard)
  }

  private inScope(collection: CuratedCollection): boolean {
    return this.standard === undefined || collection.standard === this.standard
  }

  /// Every in-scope collection, sorted by slug. Each call returns fresh copies.
  list(): CuratedCollection[] {
    return COLLECTIONS.filter((collection) => this.inScope(collection)).map(
      clone,
    )
  }

  /// A single collection by slug, or `undefined` if there is no such slug or it
  /// is out of scope for this facade's standard.
  get(slug: string): CuratedCollection | undefined {
    const found = getSearchCollection(slug)
    return found !== undefined && this.inScope(found) ? found : undefined
  }

  /// Whether an in-scope collection with this slug exists.
  has(slug: string): boolean {
    if (typeof slug !== 'string') return false
    const found = COLLECTIONS_BY_SLUG.get(slug.trim().toLowerCase())
    return found !== undefined && this.inScope(found)
  }

  /// Every in-scope collection this Punk belongs to, each with the sub-sets
  /// (institutions) that contain it and the best per-Punk `sourceUrl`. Returns
  /// `[]` for an id outside `0..9999` so a UI can pass route params without a
  /// guard. Each call returns fresh copies.
  forPunk(punkId: number): CuratedCollectionMembership[] {
    if (!Number.isInteger(punkId) || punkId < 0 || punkId >= PUNK_COUNT) {
      return []
    }
    const memberships: CuratedCollectionMembership[] = []
    for (const collection of COLLECTIONS) {
      if (!this.inScope(collection) || !collection.ids.includes(punkId)) {
        continue
      }
      const copy = clone(collection)
      const institutions = (copy.institutions ?? []).filter((institution) =>
        institution.ids.includes(punkId),
      )
      memberships.push({
        collection: copy,
        institutions,
        sourceUrl: resolveSourceUrl(copy, institutions, punkId),
      })
    }
    return memberships
  }

  /// Every distinct in-scope collection (optionally narrowed to one
  /// institution) whose alias appears anywhere in `text` — the same
  /// whole-phrase aliases that resolve in `query.text` search. Useful for
  /// surfacing an explainer when a search mentions a curated set. Each call
  /// returns fresh copies.
  matches(text: string): CuratedCollectionMatch[] {
    const seen = new Set<string>()
    const result: CuratedCollectionMatch[] = []
    for (const entry of matchCollectionEntries(text, this.standard)) {
      const key = `${entry.collectionSlug}/${entry.institutionSlug ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      const collection = this.get(entry.collectionSlug)
      if (collection === undefined) continue
      const institution =
        entry.institutionSlug === undefined
          ? undefined
          : collection.institutions?.find(
              (candidate) => candidate.slug === entry.institutionSlug,
            )
      result.push(institution ? { collection, institution } : { collection })
    }
    return result
  }
}

export function createPunksCollections(
  standard?: PunkStandardRef,
): PunksCollections {
  return new PunksCollections(standard)
}
