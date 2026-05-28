import searchCollectionsJson from './search-collections.json'
import type { PunkStandardRef } from './constants'
import type { CuratedCollection } from './types'
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

function asIds(value: unknown, slug: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PunksDataValidationError(
      `collection ${slug} must list at least one id`,
    )
  }
  for (const id of value) validatePunkId(id as number)
  return [...new Set(value as number[])].sort((a, b) => a - b)
}

/// Deep-freezes a collection so the shared bundle, and the `searchCollections`
/// export that aliases it, can't be mutated. The facade still hands out clones.
function freeze(collection: CuratedCollection): CuratedCollection {
  Object.freeze(collection.aliases)
  Object.freeze(collection.ids)
  return Object.freeze(collection)
}

function buildCollections(
  raw: Record<string, RawCuratedCollection>,
): CuratedCollection[] {
  const collections: CuratedCollection[] = []
  for (const [slug, entry] of Object.entries(raw)) {
    if (slug.trim() === '') continue
    collections.push({
      slug,
      title: asString(entry.title, slug, 'title'),
      description: asString(entry.description, slug, 'description'),
      aliases: asAliases(entry.aliases, slug),
      source: asString(entry.source, slug, 'source'),
      standard: normalizePunkStandard(entry.standard as PunkStandardRef),
      ids: asIds(entry.ids, slug),
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
  return {
    ...collection,
    aliases: [...collection.aliases],
    ids: [...collection.ids],
  }
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
/// {@link PunksSdk} as `punks.collections`.
export class PunksCollections {
  /// Every collection, sorted by slug. Each call returns fresh copies.
  list(): CuratedCollection[] {
    return COLLECTIONS.map(clone)
  }

  /// A single collection by slug, or `undefined` if there is no such slug.
  get(slug: string): CuratedCollection | undefined {
    return getSearchCollection(slug)
  }

  /// Whether a collection with this slug exists.
  has(slug: string): boolean {
    return (
      typeof slug === 'string' &&
      COLLECTIONS_BY_SLUG.has(slug.trim().toLowerCase())
    )
  }
}

export function createPunksCollections(): PunksCollections {
  return new PunksCollections()
}
