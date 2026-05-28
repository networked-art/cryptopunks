import searchCollectionsJson from './search-collections.json'
import type { PunkStandardRef, PunkStandardValue } from './constants'
import type { CuratedCollection, CuratedCollectionInstitution } from './types'
import {
  PunksDataValidationError,
  normalizePunkStandard,
  validatePunkId,
} from './utils'

/// The bundled JSON shape, before validation/normalization. The slug is the
/// object key; everything else lives in the value.
type RawCuratedCollection = {
  title?: unknown
  description?: unknown
  aliases?: unknown
  source?: unknown
  standard?: unknown
  ids?: unknown
  institutions?: unknown
}

type RawInstitution = {
  title?: unknown
  aliases?: unknown
  source?: unknown
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
    institutions.push({
      slug: instSlug,
      title: asString(raw.title, label, 'title'),
      aliases: asAliases(raw.aliases, label),
      source: asString(raw.source, label, 'source'),
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
    collections.push({
      slug,
      title: asString(entry.title, slug, 'title'),
      description: asString(entry.description, slug, 'description'),
      aliases: asAliases(entry.aliases, slug),
      source: asString(entry.source, slug, 'source'),
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
}

export function createPunksCollections(
  standard?: PunkStandardRef,
): PunksCollections {
  return new PunksCollections(standard)
}
