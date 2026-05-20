import { mapIndexerBid, type CollectionBid, type IndexerBid } from './usePunksMarketBids'
import { getIndexerUrl, IndexerNotConfigured } from '~/utils/indexer'

type IndexerResponse = {
  punkId: string
  items: IndexerBid[]
}

/// Server-side, criteria-correct list of active PunksMarket bids that would
/// accept `punkId`, ordered by `bid_wei DESC`. The first item is the top bid.
export function useBidsMatchingPunk(
  punkId: MaybeRefOrGetter<number>,
  opts: { limit?: number } = {},
) {
  const bids = ref<CollectionBid[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const id = toValue(punkId)
    const url = getIndexerUrl()
    pending.value = true
    error.value = null
    try {
      if (!url) throw new IndexerNotConfigured()
      const res = await fetch(
        `${url}/bids/matching/punk/${id}?limit=${opts.limit ?? 50}`,
      )
      if (!res.ok) throw new Error(`Indexer ${res.status}`)
      const json = (await res.json()) as IndexerResponse
      bids.value = json.items.map(mapIndexerBid)
    } catch (e) {
      error.value =
        e instanceof IndexerNotConfigured
          ? 'No indexer configured.'
          : (e as Error).message
      bids.value = []
    } finally {
      pending.value = false
    }
  }

  watch(() => toValue(punkId), load, { immediate: true })

  return { bids, pending, error, refresh: load }
}
