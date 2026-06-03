import { TokenStandard, type TokenStandardValue } from '~/utils/auction'
import { fetchPunkValues } from '~/utils/predictions'

export type EstimateItem = { standard: TokenStandardValue; punkId: number }

// Coalesce rapid `request()` bursts (a scroll, a lot's items) into one batched
// fetch per standard.
const FLUSH_DELAY_MS = 120

function keyFor(standard: TokenStandardValue, punkId: number): string {
  return `${standard === TokenStandard.CryptoPunksV1 ? 'v1' : 'v2'}-${punkId}`
}

// Viewport-driven cache of model value estimates (fair value, wei), shared
// across the app via `useState`. Consumers `request()` the ids they're showing;
// uncached ids are debounced, chunked, and fetched from the indexer
// `/predictions/values` endpoint, so each id is fetched at most once and
// scrolling back is instant.
export function usePunkValueEstimates() {
  const estimates = useState<Map<string, bigint>>(
    'punk-value-estimates',
    () => new Map(),
  )
  // ids already fetched or in flight, keyed identically to the cache.
  const requested = useState<Set<string>>(
    'punk-value-estimates-requested',
    () => new Set(),
  )

  let queue: EstimateItem[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  function estimateFor(
    standard: TokenStandardValue,
    punkId: number,
  ): bigint | undefined {
    return estimates.value.get(keyFor(standard, punkId))
  }

  function request(items: readonly EstimateItem[]) {
    if (import.meta.server) return
    let added = false
    for (const item of items) {
      const key = keyFor(item.standard, item.punkId)
      if (requested.value.has(key)) continue
      requested.value.add(key)
      queue.push(item)
      added = true
    }
    if (added && !timer) timer = setTimeout(flush, FLUSH_DELAY_MS)
  }

  async function flush() {
    timer = null
    const batch = queue
    queue = []
    if (batch.length === 0) return

    const idsByStandard = new Map<TokenStandardValue, number[]>()
    for (const item of batch) {
      const ids = idsByStandard.get(item.standard) ?? []
      ids.push(item.punkId)
      idsByStandard.set(item.standard, ids)
    }

    const fetched: [string, bigint][] = []
    for (const [standard, ids] of idsByStandard) {
      try {
        const values = await fetchPunkValues(standard, ids)
        for (const [punkId, wei] of values) {
          fetched.push([keyFor(standard, punkId), wei])
        }
      } catch {
        // Indexer unreachable for this batch: forget these ids so the next
        // viewport pass retries them instead of leaving them permanently blank.
        for (const id of ids) requested.value.delete(keyFor(standard, id))
      }
    }

    if (fetched.length === 0) return
    // Read the cache AFTER the awaits and merge — flushes triggered by a fast
    // scroll overlap, so a snapshot taken before awaiting would be stale and
    // clobber another flush's results.
    const next = new Map(estimates.value)
    for (const [key, wei] of fetched) next.set(key, wei)
    estimates.value = next
  }

  return { estimates, estimateFor, request }
}
