import type { Address } from 'viem'

type IndexerPunk = { punk_id: string | number; owner: string }

/**
 * Best-effort owned-punks lookup. When `runtimeConfig.public.indexerUrl` is set
 * we hit the v1-punks-indexer GraphQL endpoint; otherwise we report an error so
 * the UI can prompt to configure indexing.
 */
export function useOwnedPunks(address: MaybeRefOrGetter<Address | undefined>) {
  const config = useRuntimeConfig()
  const indexerUrl = (config.public.indexerUrl as string) || ''

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

    if (!indexerUrl) {
      error.value = 'No indexer configured.'
      ids.value = []
      loading.value = false
      return
    }

    try {
      const res = await fetch(indexerUrl.replace(/\/$/, '') + '/sql/punk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          where: { owner: addr.toLowerCase() },
          orderBy: { punk_id: 'asc' },
          limit: 500,
        }),
      })
      if (!res.ok) throw new Error(`Indexer ${res.status}`)
      const data = (await res.json()) as IndexerPunk[]
      ids.value = data.map((row) => Number(row.punk_id))
    } catch (e) {
      error.value = (e as Error).message
      ids.value = []
    } finally {
      loading.value = false
    }
  }

  watchEffect(load)

  return { ids, loading, error, refresh: load }
}
