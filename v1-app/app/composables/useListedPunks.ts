import { queryIndexer, IndexerNotConfigured } from '~/utils/indexer'
import { isLiveListingOwner } from '~/utils/listings'

const ACTIVE_LISTINGS_QUERY = `
  query ActiveListings($limit: Int!, $after: String) {
    listings(where: { active: true }, orderBy: "punk_id", orderDirection: "asc", limit: $limit, after: $after) {
      items {
        punk_id
        seller
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
    items: { punk_id: string; seller: string }[]
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
  const pending = ref(false)
  const error = ref<string | null>(null)
  const loaded = ref(false)

  async function load(force = false) {
    if (!toValue(enabled)) return
    if (pending.value || (loaded.value && !force)) return

    pending.value = true
    error.value = null

    try {
      const nextIds: number[] = []
      let after: string | null = null
      let hasNextPage = true

      while (hasNextPage) {
        const data: ActiveListingsData = await queryIndexer<ActiveListingsData>(
          ACTIVE_LISTINGS_QUERY,
          { limit: PAGE_SIZE, after },
        )
        nextIds.push(...(await liveListingIds(data.listings.items)))

        hasNextPage = data.listings.pageInfo.hasNextPage
        after = data.listings.pageInfo.endCursor
        if (hasNextPage && !after) throw new Error('Indexer pagination failed')
      }

      ids.value = nextIds
      loaded.value = true
    } catch (e) {
      if (e instanceof IndexerNotConfigured) {
        error.value = 'No indexer configured.'
      } else {
        error.value = (e as Error).message
      }
      ids.value = []
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
    pending,
    error,
    loaded,
    refresh: () => load(true),
  }
}

async function liveListingIds(
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
    .map((row) => Number(row.punk_id))
}
