import type { Address } from 'viem'
import { queryIndexer } from '~/utils/indexer'

export type PunkListingInfo = {
  seller: Address
  priceWei: bigint
  /// Set when the listing is private (restricted to a single buyer).
  onlySellTo: Address | null
}

type ListingRow = {
  punk_id: string
  seller: Address
  min_value_wei: string
  only_sell_to: Address | null
}

const LISTINGS_QUERY = `
  query PunkListings($ids: [BigInt!]!, $limit: Int!) {
    listings(
      where: { punk_id_in: $ids, active: true }
      orderBy: "punk_id"
      orderDirection: "asc"
      limit: $limit
    ) {
      items {
        punk_id
        seller
        min_value_wei
        only_sell_to
      }
    }
  }
`

/// Bounded so each `punk_id_in` page comes back in a single request (the chunk
/// can never exceed the `limit`, so the connection never paginates).
const CHUNK_SIZE = 500

async function fetchListingChunk(
  ids: number[],
): Promise<[number, PunkListingInfo][]> {
  const data = await queryIndexer<{ listings: { items: ListingRow[] } }>(
    LISTINGS_QUERY,
    { ids: ids.map((id) => id.toString()), limit: CHUNK_SIZE },
  )
  return data.listings.items.map((row) => [
    Number(row.punk_id),
    {
      seller: row.seller,
      priceWei: BigInt(row.min_value_wei),
      onlySellTo: row.only_sell_to,
    },
  ])
}

/**
 * Seller + exact ask (in wei) for the given listed Punks, resolved against the
 * indexer's marketplace `listings`. Feed it the market-state `listed` ids: each
 * of those has a canonical active listing whose seller is the current owner, so
 * the seller doubles as the row's owner.
 *
 * Fetches incrementally — only ids not already resolved (or in flight) hit the
 * indexer — and shares its store across the session, so re-entering the listed
 * view never refetches a seller it already knows.
 */
export function usePunkListings(ids: MaybeRefOrGetter<number[]>) {
  const store = useState<Map<number, PunkListingInfo>>(
    'punk-listings',
    () => new Map(),
  )
  const requested = useState<Set<number>>(
    'punk-listings-requested',
    () => new Set(),
  )
  const loading = ref(false)

  async function load() {
    if (import.meta.server) return
    const wanted = toValue(ids)
    const missing = wanted.filter((id) => !requested.value.has(id))
    if (!missing.length) return

    // Mark as in flight before awaiting so overlapping loads don't double-fetch.
    for (const id of missing) requested.value.add(id)

    loading.value = true
    try {
      const chunks: number[][] = []
      for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
        chunks.push(missing.slice(i, i + CHUNK_SIZE))
      }
      const results = await Promise.all(chunks.map(fetchListingChunk))
      const next = new Map(store.value)
      for (const entries of results) {
        for (const [id, info] of entries) next.set(id, info)
      }
      store.value = next
    } catch {
      // Allow a later attempt to retry the ids this run failed to resolve.
      for (const id of missing) requested.value.delete(id)
    } finally {
      loading.value = false
    }
  }

  watch(
    () => toValue(ids),
    () => void load(),
    { immediate: true },
  )

  return { listings: store, loading }
}
