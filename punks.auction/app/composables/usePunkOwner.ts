import type { Address } from 'viem'
import { cryptoPunksMarketAbi } from '@networked-art/punks-sdk'
import { CRYPTOPUNKS_ADDRESS, PUNKS_V1_ADDRESS } from '~/utils/addresses'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

/**
 * Current holder of a Punk, read straight from the relevant market contract's
 * `punkIndexToAddress`. `standard` selects the canonical `CryptoPunks` market
 * or the original V1 market.
 */
export function usePunkOwner(
  punkId: MaybeRefOrGetter<number>,
  standard: MaybeRefOrGetter<TokenStandardValue> = TokenStandard.CryptoPunks,
) {
  const client = useReadClient()

  const owner = ref<Address | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const id = toValue(punkId)
    const std = toValue(standard)
    const c = client.value
    if (!c || !Number.isInteger(id)) {
      owner.value = null
      return
    }
    pending.value = true
    error.value = null
    try {
      owner.value = await c.readContract({
        address:
          std === TokenStandard.CryptoPunksV1
            ? PUNKS_V1_ADDRESS
            : CRYPTOPUNKS_ADDRESS,
        abi: cryptoPunksMarketAbi,
        functionName: 'punkIndexToAddress',
        args: [BigInt(id)],
      })
    } catch (e) {
      error.value = (e as Error).message
      owner.value = null
    } finally {
      pending.value = false
    }
  }

  watch(
    [() => toValue(punkId), () => toValue(standard), client],
    () => void load(),
    { immediate: true },
  )

  return { owner, pending, error, refresh: load }
}
