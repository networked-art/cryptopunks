import { queryIndexer, IndexerNotConfigured } from '~/utils/indexer'

export const WRAPPED_BG = '#a69aff'
// export const UNWRAPPED_BG = '#444444'
export const UNWRAPPED_BG = '#CDCDCD'

const WRAPPED_QUERY = `
  query WrappedPunks($limit: Int!, $after: String) {
    v1Punks(where: { is_wrapped: true }, orderBy: "punk_id", orderDirection: "asc", limit: $limit, after: $after) {
      items { punk_id }
      pageInfo { hasNextPage endCursor }
    }
  }
`

const PAGE_SIZE = 1000

type WrappedPage = {
  v1Punks: {
    items: { punk_id: string }[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  }
}

/// Module-scoped shared state — the wrapped set rarely changes, so any
/// component that asks for it on mount reuses the in-flight or already-loaded
/// result instead of re-paginating.
const wrappedIds = ref<Set<number>>(new Set())
const pending = ref(false)
const error = ref<string | null>(null)
const loaded = ref(false)
let inflight: Promise<void> | null = null

async function loadOnce(force = false): Promise<void> {
  if (!force && (loaded.value || inflight)) return inflight ?? Promise.resolve()

  pending.value = true
  error.value = null

  inflight = (async () => {
    try {
      const next = new Set<number>()
      let after: string | null = null
      let hasNextPage = true

      while (hasNextPage) {
        const data: WrappedPage = await queryIndexer<WrappedPage>(
          WRAPPED_QUERY,
          { limit: PAGE_SIZE, after },
        )
        for (const row of data.v1Punks.items) next.add(Number(row.punk_id))
        hasNextPage = data.v1Punks.pageInfo.hasNextPage
        after = data.v1Punks.pageInfo.endCursor
        if (hasNextPage && !after) throw new Error('Indexer pagination failed')
      }

      wrappedIds.value = next
      loaded.value = true
    } catch (e) {
      if (e instanceof IndexerNotConfigured) {
        error.value = 'No indexer configured.'
      } else {
        error.value = (e as Error).message
      }
      loaded.value = false
    } finally {
      pending.value = false
      inflight = null
    }
  })()

  return inflight
}

export function useWrappedPunks() {
  if (import.meta.client && !loaded.value && !inflight) void loadOnce()

  function isWrapped(id: number | undefined): boolean {
    if (id === undefined) return false
    return wrappedIds.value.has(id)
  }

  /// Optimistic local removal after an onchain unwrap — the indexer takes a
  /// few seconds to catch up, and we don't want the affected punks to keep
  /// rendering with the wrapped tint in the meantime. A background refresh
  /// converges with indexer truth.
  function markUnwrapped(ids: number[]) {
    if (ids.length === 0) return
    const next = new Set(wrappedIds.value)
    for (const id of ids) next.delete(id)
    wrappedIds.value = next
    void loadOnce(true)
  }

  return {
    wrappedIds,
    isWrapped,
    markUnwrapped,
    pending,
    error,
    loaded,
    refresh: () => loadOnce(true),
  }
}
