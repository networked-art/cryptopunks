import type { Address } from 'viem'
import { isAddressEqual } from 'viem'
import { queryIndexer } from '~/utils/indexer'

const PUNK_OWNER_QUERY = `
  query PunkOwner($id: BigInt!) {
    v1Punk(punk_id: $id) {
      owner
      is_wrapped
    }
  }
`

type PunkOwnerRow = {
  v1Punk: { owner: Address | null; is_wrapped: boolean } | null
}

type Source = 'indexer' | 'onchain' | null
type PunkOwnerState = {
  owner: Address | null
  isWrapped: boolean
  source: Source
}

/// `useAsyncData` blocks SSR until wrap state resolves; the shared
/// `useWrappedPunks` fallback covers the brief client-nav pending window.
export function usePunkOwner(punkId: MaybeRefOrGetter<number>) {
  const { sdk } = usePunksSdk()
  const { isWrapped: isWrappedInSet } = useWrappedPunks()
  const id = computed(() => toValue(punkId))

  const { data, pending, refresh } = useAsyncData<PunkOwnerState>(
    () => `punk-owner-${id.value}`,
    async () => {
      const punkIdNum = id.value
      try {
        const result = await queryIndexer<PunkOwnerRow>(PUNK_OWNER_QUERY, {
          id: String(punkIdNum),
        })
        if (result.v1Punk) {
          return {
            owner: result.v1Punk.owner,
            isWrapped: result.v1Punk.is_wrapped,
            source: 'indexer',
          }
        }
      } catch {
        // Indexer unreachable — fall through to onchain.
      }

      try {
        const raw = (await sdk.value.market.ownerOf(punkIdNum)) as
          | Address
          | null
        if (raw && isAddressEqual(raw, sdk.value.v1Wrapper.address)) {
          return {
            owner: await sdk.value.v1Wrapper.ownerOf(punkIdNum),
            isWrapped: true,
            source: 'onchain',
          }
        }
        return { owner: raw, isWrapped: false, source: 'onchain' }
      } catch {
        return { owner: null, isWrapped: false, source: null }
      }
    },
    {
      watch: [id],
      default: () => ({ owner: null, isWrapped: false, source: null }),
    },
  )

  const owner = computed(() => data.value?.owner ?? null)
  const isWrapped = computed(() =>
    data.value?.source ? data.value.isWrapped : isWrappedInSet(id.value),
  )
  const source = computed(() => data.value?.source ?? null)

  return { owner, isWrapped, pending, source, refresh }
}
