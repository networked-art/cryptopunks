import {
  createPunksDataset,
  PunksDataValidationError,
  type PunkQuery,
  type PunksDataset,
} from '@networked-art/punks-sdk'
import { HttpError } from '#exceptions/http_error'

/**
 * The shape we store on `searches.criteria`. We persist the user-facing
 * `PunkQuery` form (text, attributes, colors, type, head, skinTone,
 * attributeCount, pixelCount, colorCount, ids, excludeIds) and recompile on
 * the fly at match time.
 */
export type CriteriaInput = PunkQuery

let cachedDataset: PunksDataset | null = null
function dataset(): PunksDataset {
  if (!cachedDataset) cachedDataset = createPunksDataset()
  return cachedDataset
}

/**
 * Parses raw user input into a vetted CriteriaInput. Validates by running it
 * once through the SDK's offline normalizer; rejects with HttpError 422 on
 * any validation failure.
 */
export function parseCriteria(raw: unknown): CriteriaInput {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpError(422, 'criteria must be a JSON object')
  }
  const candidate = raw as PunkQuery
  try {
    // dataset.search runs every normalizer, so an unknown type name / trait
    // / color throws PunksDataValidationError here rather than silently
    // matching nothing in the matcher later.
    dataset().search(candidate)
  } catch (e) {
    if (e instanceof PunksDataValidationError) {
      throw new HttpError(422, `Invalid criteria: ${e.message}`)
    }
    throw e
  }
  return candidate
}

/**
 * Returns the set of punk ids matching `criteria`. The result is recomputed
 * per call — callers that need to evaluate many events against the same
 * search should cache the result themselves (the matcher does this per tick).
 */
export function searchMatchingIds(criteria: CriteriaInput): number[] {
  return dataset().search(criteria)
}

export function criteriaMatchesPunk(criteria: CriteriaInput, punkId: number): boolean {
  return searchMatchingIds(criteria).includes(punkId)
}
