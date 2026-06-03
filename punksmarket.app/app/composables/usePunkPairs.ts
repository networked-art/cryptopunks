import type { Address } from 'viem'
import { getIndexerUrl, IndexerNotConfigured } from '~/utils/indexer'

/// Per-collection custody snapshot for one side of a pair. `owner` is the
/// public holder (the ERC-721 holder when wrapped); `nativeOwner` is the
/// underlying punk owner the wrapper holds on their behalf.
export type PairCollectionState = {
  owner: Address | null
  nativeOwner: Address | null
  isWrapped: boolean
  wrapper: string | null
  updatedAt: number
  blockNumber: bigint
}

/// A punk id held by the same wallet in both collections — the canonical
/// CryptoPunks (the indexer's `v2`) and the original June 9th 2017 deploy
/// (its `v1`).
export type PunkPair = {
  punkId: number
  owner: Address
  canonical: PairCollectionState
  original: PairCollectionState
}

type IndexerCollectionState = {
  owner: string | null
  native_owner: string | null
  is_wrapped: boolean
  wrapper: string | null
  updated_at: string
  block_number: string
}

type IndexerPair = {
  punk_id: string
  owner: string
  v2: IndexerCollectionState
  v1: IndexerCollectionState
}

type PairsResponse = {
  items: IndexerPair[]
  total: number
  limit: number
  offset: number
}

/// Card-sized pages — the pair set is small enough that a "load more" button
/// reads better than infinite scroll, and the indexer orders by punk id so
/// offset paging stays stable across requests.
const PAGE_SIZE = 60

function mapState(state: IndexerCollectionState): PairCollectionState {
  return {
    owner: (state.owner as Address | null) ?? null,
    nativeOwner: (state.native_owner as Address | null) ?? null,
    isWrapped: state.is_wrapped,
    wrapper: state.wrapper,
    updatedAt: Number(state.updated_at),
    blockNumber: BigInt(state.block_number),
  }
}

function mapPair(row: IndexerPair): PunkPair {
  return {
    punkId: Number(row.punk_id),
    owner: row.owner as Address,
    canonical: mapState(row.v2),
    original: mapState(row.v1),
  }
}

export function usePunkPairs(
  owner: MaybeRefOrGetter<Address | undefined> = undefined,
) {
  const pairs = ref<PunkPair[]>([])
  const total = ref(0)
  const pending = ref(false)
  const error = ref<string | null>(null)

  const hasMore = computed(() => pairs.value.length < total.value)

  async function fetchPage(offset: number): Promise<PairsResponse> {
    const url = getIndexerUrl()
    if (!url) throw new IndexerNotConfigured()

    const params = new URLSearchParams()
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(offset))
    const ownerValue = toValue(owner)
    if (ownerValue) params.set('owner', ownerValue)

    const res = await fetch(`${url}/punks/pairs?${params.toString()}`)
    if (!res.ok) throw new Error(`Indexer ${res.status}`)
    return (await res.json()) as PairsResponse
  }

  async function load() {
    pending.value = true
    error.value = null
    try {
      const data = await fetchPage(0)
      pairs.value = data.items.map(mapPair)
      total.value = data.total
    } catch (e) {
      error.value =
        e instanceof IndexerNotConfigured
          ? 'No indexer configured.'
          : (e as Error).message
      pairs.value = []
      total.value = 0
    } finally {
      pending.value = false
    }
  }

  async function loadMore() {
    if (pending.value || !hasMore.value) return
    pending.value = true
    try {
      const data = await fetchPage(pairs.value.length)
      pairs.value = [...pairs.value, ...data.items.map(mapPair)]
      total.value = data.total
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      pending.value = false
    }
  }

  /// Reading `owner` synchronously registers it as a dependency, so changing
  /// the wallet filter resets the list back to the first page.
  watchEffect(() => {
    void toValue(owner)
    void load()
  })

  return { pairs, total, pending, error, hasMore, loadMore, refresh: load }
}
