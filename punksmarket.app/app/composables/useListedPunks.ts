import { queryIndexer, IndexerNotConfigured } from '~/utils/indexer'
import { PUNKS_MARKET_ADDRESS } from '~/utils/addresses'

/// Only listings whose `onlySellTo` is the punksmarket.eth contract can be
/// executed through this site — anything else (zero address open listings or
/// listings privately directed elsewhere) is unreachable from our UI, so we
/// drop them at the source instead of showing dead rows in the grid.
const ONLY_SELL_TO = PUNKS_MARKET_ADDRESS.toLowerCase()

const ACTIVE_LISTINGS_QUERY = `
  query ActiveListings($onlySellTo: String!, $limit: Int!, $after: String) {
    v1Listings(where: { active: true, only_sell_to: $onlySellTo }, orderBy: "min_value_wei", orderDirection: "asc", limit: $limit, after: $after) {
      items {
        punk_id
        min_value_wei
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

const PAGE_SIZE = 1000

type ActiveListingsData = {
  v1Listings: {
    items: { punk_id: string; min_value_wei: string }[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
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
      const nextIds: number[] = []
      const nextPrices = new Map<number, string>()
      let after: string | null = null
      let hasNextPage = true

      while (hasNextPage) {
        const data: ActiveListingsData = await queryIndexer<ActiveListingsData>(
          ACTIVE_LISTINGS_QUERY,
          { onlySellTo: ONLY_SELL_TO, limit: PAGE_SIZE, after },
        )
        for (const row of data.v1Listings.items) {
          const id = Number(row.punk_id)
          nextIds.push(id)
          nextPrices.set(id, row.min_value_wei)
        }

        hasNextPage = data.v1Listings.pageInfo.hasNextPage
        after = data.v1Listings.pageInfo.endCursor
        if (hasNextPage && !after) throw new Error('Indexer pagination failed')
      }

      ids.value = nextIds
      priceById.value = nextPrices
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
