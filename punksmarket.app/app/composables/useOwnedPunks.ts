import type { Address } from 'viem'
import { queryIndexer, IndexerNotConfigured } from '~/utils/indexer'

const OWNED_QUERY = `
  query Owned($owner: String!) {
    v1Punks(where: { owner: $owner }, orderBy: "punk_id", orderDirection: "asc", limit: 1000) {
      items { punk_id }
    }
  }
`

export function useOwnedPunks(address: MaybeRefOrGetter<Address | undefined>) {
  const ids = ref<number[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const addr = toValue(address)
    if (!addr) {
      ids.value = []
      return
    }

    loading.value = true
    error.value = null

    try {
      const data = await queryIndexer<{
        v1Punks: { items: { punk_id: string }[] }
      }>(OWNED_QUERY, { owner: addr.toLowerCase() })
      ids.value = data.v1Punks.items.map((row) => Number(row.punk_id))
    } catch (e) {
      if (e instanceof IndexerNotConfigured) {
        error.value = 'No indexer configured.'
      } else {
        error.value = (e as Error).message
      }
      ids.value = []
    } finally {
      loading.value = false
    }
  }

  watchEffect(load)

  return { ids, loading, error, refresh: load }
}
