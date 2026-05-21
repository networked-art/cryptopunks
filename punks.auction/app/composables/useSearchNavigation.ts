import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'

export function useSearchNavigation() {
  const lastQuery = useState<string | null>('last-search-query', () => null)

  const backToSearchHref = computed<RouteLocationRaw>(() =>
    lastQuery.value ? { path: '/', query: { q: lastQuery.value } } : '/',
  )

  function rememberSearchFrom(from: RouteLocationNormalized) {
    if (from.path !== '/') {
      lastQuery.value = null
      return
    }

    const q = typeof from.query.q === 'string' ? from.query.q.trim() : ''
    lastQuery.value = q || null
  }

  return { lastQuery, backToSearchHref, rememberSearchFrom }
}
