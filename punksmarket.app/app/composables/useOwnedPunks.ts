import type { Address } from 'viem'
import { queryIndexer, IndexerNotConfigured } from '~/utils/indexer'

const OWNED_QUERY = `
  query Owned($owner: String!, $limit: Int!, $after: String) {
    v1Punks(where: { owner: $owner }, orderBy: "punk_id", orderDirection: "asc", limit: $limit, after: $after) {
      items { punk_id }
      pageInfo { hasNextPage endCursor }
    }
  }
`

const PAGE_SIZE = 1000

type OwnedPunksPage = {
  v1Punks: {
    items: { punk_id: string }[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  }
}

export function useOwnedPunks(address: MaybeRefOrGetter<Address | undefined>) {
  const ids = ref<number[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let requestToken = 0

  async function load() {
    const token = ++requestToken
    const addr = toValue(address)
    if (!addr) {
      ids.value = []
      loading.value = false
      error.value = null
      return
    }

    loading.value = true
    error.value = null
    const owner = addr.toLowerCase()

    try {
      const nextIds: number[] = []
      let after: string | null = null
      let hasNextPage = true

      while (hasNextPage) {
        const data: OwnedPunksPage = await queryIndexer<OwnedPunksPage>(
          OWNED_QUERY,
          {
            owner,
            limit: PAGE_SIZE,
            after,
          },
        )
        nextIds.push(...data.v1Punks.items.map((row) => Number(row.punk_id)))

        hasNextPage = data.v1Punks.pageInfo.hasNextPage
        after = data.v1Punks.pageInfo.endCursor
        if (hasNextPage && !after) throw new Error('Indexer pagination failed')
      }

      if (token !== requestToken) return
      ids.value = nextIds
    } catch (e) {
      if (token !== requestToken) return
      if (e instanceof IndexerNotConfigured) {
        error.value = 'No indexer configured.'
      } else {
        error.value = (e as Error).message
      }
      ids.value = []
    } finally {
      if (token === requestToken) loading.value = false
    }
  }

  watchEffect(load)

  return { ids, loading, error, refresh: load }
}
