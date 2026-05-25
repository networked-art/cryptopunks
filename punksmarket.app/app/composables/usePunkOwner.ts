import type { Address } from 'viem'
import { isAddressEqual } from 'viem'
import { queryIndexer } from '~/utils/indexer'

/**
 * Canonical owner of a V1 Punk. The indexer normalizes wrap state so a single
 * read returns the human holder regardless of wrap status (`owner` = native V1
 * owner when unwrapped, ERC-721 holder when wrapped — see
 * indexer/ponder.schema.ts).
 *
 * Falls back to onchain reads if the indexer is unreachable: V1
 * `punkIndexToAddress` first, then `wrapper.ownerOf` whenever the raw owner is
 * the wrapper itself.
 */

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

/// `useAsyncData` so Nuxt blocks SSR until the wrap status resolves —
/// otherwise `isWrapped` stays `false` through the initial render and the
/// "(Wrapped)" label / wrapped background only appear after client hydration.
export function usePunkOwner(punkId: MaybeRefOrGetter<number>) {
  const { sdk } = usePunksSdk()
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
        // Punk row missing — fall through to onchain.
      } catch {
        // Indexer down / unreachable / not configured — fall through.
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
  const isWrapped = computed(() => data.value?.isWrapped ?? false)
  const source = computed(() => data.value?.source ?? null)

  return { owner, isWrapped, pending, source, refresh }
}
