import hiddenTraitsJson from './hidden-traits.json'
import { PUNK_COUNT, PUNKS_DATA_DATASET_HASH, TRAIT_COUNT } from './constants'
import {
  PunksDataValidationError,
  validatePunkId,
  validateTraitId,
} from './utils'

export type HiddenTraitCatalog = {
  version: 1
  sources: {
    originalCryptoPunksData: {
      address: string
      chainId: number
      blockNumber: number
      blockHash: string
      extcodehash: string
    }
    punksData: {
      address: string
      datasetHash: string
    }
  }
  counts: {
    punks: number
    punksWithHiddenTraits: number
    hiddenOccurrences: number
    hiddenTraits: number
  }
  allIds: readonly number[]
  traits: readonly HiddenTraitCatalogTrait[]
}

export type HiddenTraitCatalogTrait = {
  traitId: number
  name: string
  ids: readonly number[]
}

const CATALOG = freezeHiddenTraitCatalog(
  validateHiddenTraitCatalog(hiddenTraitsJson),
)
const IDS_BY_TRAIT_ID = new Map(
  CATALOG.traits.map((trait) => [trait.traitId, trait.ids] as const),
)

export const hiddenTraitCatalog: HiddenTraitCatalog = CATALOG
export const allHiddenTraitIds: readonly number[] = CATALOG.allIds
export const hiddenTraitRecords: readonly HiddenTraitCatalogTrait[] =
  CATALOG.traits

export function hiddenIdsForTraitId(traitId: number): readonly number[] {
  validateTraitId(traitId)
  return IDS_BY_TRAIT_ID.get(traitId) ?? []
}

export function hiddenIdsForTraitIds(
  traitIds: readonly number[],
): readonly number[] {
  const ids = new Set<number>()
  for (const traitId of traitIds) {
    for (const punkId of hiddenIdsForTraitId(traitId)) ids.add(punkId)
  }
  return [...ids].sort((a, b) => a - b)
}

function validateHiddenTraitCatalog(value: unknown): HiddenTraitCatalog {
  if (!isRecord(value)) {
    throw new PunksDataValidationError(
      'hidden traits catalog must be an object',
    )
  }
  if (value.version !== 1) {
    throw new PunksDataValidationError(
      'hidden traits catalog version must be 1',
    )
  }
  const sources = value.sources
  if (!isRecord(sources) || !isRecord(sources.punksData)) {
    throw new PunksDataValidationError(
      'hidden traits catalog is missing sources',
    )
  }
  if (
    sources.punksData.datasetHash !== undefined &&
    String(sources.punksData.datasetHash).toLowerCase() !==
      PUNKS_DATA_DATASET_HASH.toLowerCase()
  ) {
    throw new PunksDataValidationError(
      'hidden traits catalog was generated from another PunksData dataset',
    )
  }
  if (!isRecord(value.counts) || value.counts.punks !== PUNK_COUNT) {
    throw new PunksDataValidationError(
      'hidden traits catalog punk count mismatch',
    )
  }
  const allIds = asIdList(value.allIds, 'hidden traits allIds')
  const traits = asTraitList(value.traits)
  const union = uniqueSortedIds(traits.flatMap((trait) => trait.ids))
  if (!sameIds(allIds, union)) {
    throw new PunksDataValidationError(
      'hidden traits allIds must equal trait union',
    )
  }
  if (value.counts.punksWithHiddenTraits !== allIds.length) {
    throw new PunksDataValidationError(
      'hidden traits catalog punks-with-hidden-traits count mismatch',
    )
  }
  return {
    version: 1,
    sources: value.sources as HiddenTraitCatalog['sources'],
    counts: value.counts as HiddenTraitCatalog['counts'],
    allIds,
    traits,
  }
}

function asTraitList(value: unknown): HiddenTraitCatalogTrait[] {
  if (!Array.isArray(value)) {
    throw new PunksDataValidationError(
      'hidden traits catalog traits must be an array',
    )
  }
  const seen = new Set<number>()
  return value.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new PunksDataValidationError(
        `hidden traits entry ${index} must be an object`,
      )
    }
    if (typeof raw.traitId !== 'number') {
      throw new PunksDataValidationError(
        `hidden traits entry ${index} is missing traitId`,
      )
    }
    validateTraitId(raw.traitId)
    if (seen.has(raw.traitId)) {
      throw new PunksDataValidationError(
        `hidden traits duplicate trait ${raw.traitId}`,
      )
    }
    seen.add(raw.traitId)
    if (typeof raw.name !== 'string' || raw.name.trim() === '') {
      throw new PunksDataValidationError(
        `hidden traits entry ${index} is missing name`,
      )
    }
    return {
      traitId: raw.traitId,
      name: raw.name,
      ids: asIdList(raw.ids, `hidden traits ${raw.name}`),
    }
  })
}

function asIdList(value: unknown, label: string): number[] {
  if (!Array.isArray(value)) {
    throw new PunksDataValidationError(`${label} must be an array`)
  }
  for (const id of value) validatePunkId(id as number)
  const ids = value as number[]
  if (!sameIds(ids, uniqueSortedIds(ids))) {
    throw new PunksDataValidationError(`${label} must be unique and sorted`)
  }
  return [...ids]
}

function uniqueSortedIds(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b)
}

function sameIds(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

function freezeHiddenTraitCatalog(
  catalog: HiddenTraitCatalog,
): HiddenTraitCatalog {
  for (const trait of catalog.traits) {
    Object.freeze(trait.ids)
    Object.freeze(trait)
  }
  Object.freeze(catalog.traits)
  Object.freeze(catalog.allIds)
  Object.freeze(catalog.sources.originalCryptoPunksData)
  Object.freeze(catalog.sources.punksData)
  Object.freeze(catalog.sources)
  Object.freeze(catalog.counts)
  return Object.freeze(catalog)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
