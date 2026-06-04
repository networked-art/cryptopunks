export interface WatchItem {
  id: number
  source: string
  label: string | null
  scope: {
    contract_address: string
    token_id: string | null
    search: string | null
  }
  criteria: { token_ids: string[] } | null
  events: string[]
  description: string
  token_url: string | null
  confirmed_at: string | null
  created_at: string | null
}

/**
 * The authenticated user's networked.art watchlist (confirmed, active watch
 * subscriptions). Reads/removes go through the bearer-authenticated client from
 * useNetworkedArt, so this only returns data once signed in.
 */
export const useWatchlist = () => {
  const { api, isAuthenticated } = useNetworkedArt()

  const items = ref<WatchItem[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  const load = async () => {
    if (!isAuthenticated.value) {
      items.value = []
      return
    }
    pending.value = true
    error.value = null
    try {
      const { data } = await api<{ data: WatchItem[] }>('/watch/subscriptions')
      items.value = data
    } catch {
      error.value = 'Could not load your watchlist.'
    } finally {
      pending.value = false
    }
  }

  const remove = async (id: number) => {
    const previous = items.value
    items.value = items.value.filter((item) => item.id !== id)
    try {
      await api(`/watch/subscriptions/${id}`, { method: 'DELETE' })
    } catch {
      items.value = previous
      error.value = 'Could not remove that alert.'
    }
  }

  /** Reset to the signed-out baseline so no stale list/error survives. */
  const clear = () => {
    items.value = []
    pending.value = false
    error.value = null
  }

  return { items, pending, error, load, remove, clear }
}
