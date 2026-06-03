import {
  createPunksSimilarity,
  type PunkSimilarityIndex,
  type PunksSimilarityConfig,
} from '@networked-art/punks-sdk'

// Building the index scans all 10k Punks, so it's shared across every detail
// page rather than rebuilt per visit. The bundled dataset is immutable and the
// index is read-only, so a single instance is safe to reuse (incl. across SSR).
let index: PunkSimilarityIndex | null = null

/**
 * Similarity index over the bundled offline dataset. Returns a getter so the
 * heavy first build only runs when similar Punks are actually rendered
 * (client-side), not during component setup or SSR.
 */
export function usePunkSimilarity(): () => PunkSimilarityIndex {
  const nuxtApp = useNuxtApp()
  const dataset = nuxtApp.$punksDataset as PunksSimilarityConfig['dataset']
  return () => {
    if (!index) index = createPunksSimilarity({ dataset })
    return index
  }
}
