import type { Address } from 'viem'
import { isAddressEqual } from 'viem'
import { V1_WRAPPER_ADDRESS } from '~/utils/addresses'
import { queryIndexer } from '~/utils/indexer'

/**
 * Canonical owner of a V1 Punk. The indexer normalizes wrap state so a single
 * read returns the human holder regardless of wrap status (`owner` = native V1
 * owner when unwrapped, ERC-721 holder when wrapped — see
 * v1-punks-indexer/ponder.schema.ts).
 *
 * Falls back to onchain reads if the indexer is unreachable: V1
 * `punkIndexToAddress` first, then `wrapper.ownerOf` whenever the raw owner is
 * the wrapper itself.
 */

const PUNK_OWNER_QUERY = `
  query PunkOwner($id: BigInt!) {
    punk(punk_id: $id) {
      owner
      is_wrapped
    }
  }
`

type PunkOwnerRow = {
  punk: { owner: Address | null; is_wrapped: boolean } | null
}

export function usePunkOwner(punkId: MaybeRefOrGetter<number>) {
  const { sdk } = usePunksSdk()

  const owner = ref<Address | null>(null)
  const isWrapped = ref(false)
  const pending = ref(false)
  const source = ref<'indexer' | 'onchain' | null>(null)

  async function load() {
    const id = toValue(punkId)
    pending.value = true
    try {
      try {
        const data = await queryIndexer<PunkOwnerRow>(PUNK_OWNER_QUERY, {
          id: String(id),
        })
        if (data.punk) {
          owner.value = data.punk.owner
          isWrapped.value = data.punk.is_wrapped
          source.value = 'indexer'
          return
        }
        // Punk row missing — fall through to onchain.
      } catch {
        // Indexer down / unreachable / not configured — fall through.
      }

      try {
        const raw = (await sdk.value.market.ownerOf(id)) as Address | null
        if (raw && isAddressEqual(raw, V1_WRAPPER_ADDRESS)) {
          owner.value = (await sdk.value.wrappers.legacy.ownerOf(
            id,
          )) as Address
          isWrapped.value = true
        } else {
          owner.value = raw
          isWrapped.value = false
        }
        source.value = 'onchain'
      } catch {
        owner.value = null
        isWrapped.value = false
        source.value = null
      }
    } finally {
      pending.value = false
    }
  }

  watch(() => toValue(punkId), load, { immediate: true })

  return { owner, isWrapped, pending, source, refresh: load }
}
