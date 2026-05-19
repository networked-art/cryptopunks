import { queryIndexer, IndexerNotConfigured } from '~/utils/indexer'
import { isLiveListingOwner } from '~/utils/listings'

const ACTIVE_LISTINGS_QUERY = `
  query ActiveListings($limit: Int!, $after: String) {
    listings(where: { active: true }, orderBy: "min_value_wei", orderDirection: "asc", limit: $limit, after: $after) {
      items {
        punk_id
        seller
        min_value_wei
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

const OWNERS_QUERY = `
  query Owners($ids: [BigInt!]!) {
    punks(where: { punk_id_in: $ids }, orderBy: "punk_id", orderDirection: "asc", limit: 1000) {
      items {
        punk_id
        owner
      }
    }
  }
`

const PAGE_SIZE = 1000

type ActiveListingsData = {
  listings: {
    items: { punk_id: string; seller: string; min_value_wei: string }[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  }
}

type ListingOwnersData = {
  punks: {
    items: { punk_id: string; owner: string | null }[]
  }
}

export function useListedPunks(enabled: MaybeRefOrGetter<boolean> = true) {
  const ids = ref<number[]>([])
  const priceById = ref(new Map<number, string>())
  const pending = ref(false)
  const error = ref<string | null>(null)
  const loaded = ref(false)

  async function load(force = false) {
    if (!toValue(enabled)) return
    if (pending.value || (loaded.value && !force)) return

    pending.value = true
    error.value = null

    try {
      const nextListings: LiveListing[] = []
      let after: string | null = null
      let hasNextPage = true

      while (hasNextPage) {
        const data: ActiveListingsData = await queryIndexer<ActiveListingsData>(
          ACTIVE_LISTINGS_QUERY,
          { limit: PAGE_SIZE, after },
        )
        nextListings.push(...(await liveListings(data.listings.items)))

        hasNextPage = data.listings.pageInfo.hasNextPage
        after = data.listings.pageInfo.endCursor
        if (hasNextPage && !after) throw new Error('Indexer pagination failed')
      }

      ids.value = nextListings.map((listing) => listing.id)
      priceById.value = new Map(
        nextListings.map((listing) => [listing.id, listing.priceWei]),
      )
      loaded.value = true
    } catch (e) {
      if (e instanceof IndexerNotConfigured) {
        error.value = 'No indexer configured.'
      } else {
        error.value = (e as Error).message
      }
      ids.value = []
      priceById.value = new Map()
      loaded.value = false
    } finally {
      pending.value = false
    }
  }

  watchEffect(() => {
    if (toValue(enabled)) void load()
  })

  return {
    ids,
    priceById,
    pending,
    error,
    loaded,
    refresh: () => load(true),
  }
}

type LiveListing = {
  id: number
  priceWei: string
}

async function liveListings(
  listings: ActiveListingsData['listings']['items'],
) {
  if (!listings.length) return []

  const data: ListingOwnersData = await queryIndexer<ListingOwnersData>(
    OWNERS_QUERY,
    { ids: listings.map((row) => row.punk_id) },
  )
  const ownerById = new Map<string, string>()
  for (const row of data.punks.items) {
    if (row.owner) ownerById.set(row.punk_id, row.owner)
  }

  return listings
    .filter((row) => isLiveListingOwner(row.seller, ownerById.get(row.punk_id)))
    .map((row) => ({
      id: Number(row.punk_id),
      priceWei: row.min_value_wei,
    }))
}
