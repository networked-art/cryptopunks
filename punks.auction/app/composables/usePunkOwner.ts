import type { Abi, Address } from 'viem'
import {
  CRYPTOPUNKS_721_ADDRESS,
  PUNKS_V1_WRAPPER_ADDRESS,
  WRAPPED_PUNKS_ADDRESS,
  cryptoPunks721Abi,
  cryptoPunksMarketAbi,
  punksV1WrapperAbi,
  wrappedPunksAbi,
} from '@networked-art/punks-sdk'
import { CRYPTOPUNKS_ADDRESS, PUNKS_V1_ADDRESS } from '~/utils/addresses'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

/**
 * Current holder of a Punk. Reads the market's `punkIndexToAddress` and, when
 * that returns a known wrapper contract, follows `ownerOf` on the wrapper so
 * `owner` reflects the beneficial holder. `nativeOwner` still surfaces the raw
 * market owner — wrapper contract or otherwise — for callers that need it to
 * gate native-market interactions.
 */
export function usePunkOwner(
  punkId: MaybeRefOrGetter<number>,
  standard: MaybeRefOrGetter<TokenStandardValue> = TokenStandard.CryptoPunks,
) {
  const client = useReadClient()

  const owner = ref<Address | null>(null)
  const nativeOwner = ref<Address | null>(null)
  const isWrapped = ref(false)
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const id = toValue(punkId)
    const std = toValue(standard)
    const c = client.value
    if (!c || !Number.isInteger(id)) {
      owner.value = null
      nativeOwner.value = null
      isWrapped.value = false
      return
    }
    pending.value = true
    error.value = null
    try {
      const isV1 = std === TokenStandard.CryptoPunksV1
      const marketAddress = isV1 ? PUNKS_V1_ADDRESS : CRYPTOPUNKS_ADDRESS
      const wrappers: { address: Address; abi: Abi }[] = isV1
        ? [{ address: PUNKS_V1_WRAPPER_ADDRESS, abi: punksV1WrapperAbi }]
        : [
            { address: WRAPPED_PUNKS_ADDRESS, abi: wrappedPunksAbi },
            { address: CRYPTOPUNKS_721_ADDRESS, abi: cryptoPunks721Abi },
          ]

      const tokenId = BigInt(id)
      const [native, ...wrapperOwners] = await Promise.all([
        c.readContract({
          address: marketAddress,
          abi: cryptoPunksMarketAbi,
          functionName: 'punkIndexToAddress',
          args: [tokenId],
        }),
        ...wrappers.map((w) =>
          c
            .readContract({
              address: w.address,
              abi: w.abi,
              functionName: 'ownerOf',
              args: [tokenId],
            })
            .then((r) => r as Address)
            .catch(() => null),
        ),
      ])

      nativeOwner.value = native

      const wrapperIndex = wrappers.findIndex((w) =>
        sameAddress(w.address, native),
      )
      const resolved = wrapperIndex >= 0 ? wrapperOwners[wrapperIndex] : null
      owner.value = resolved ?? native
      isWrapped.value = !!resolved
    } catch (e) {
      error.value = (e as Error).message
      owner.value = null
      nativeOwner.value = null
      isWrapped.value = false
    } finally {
      pending.value = false
    }
  }

  watch(
    [() => toValue(punkId), () => toValue(standard), client],
    () => void load(),
    { immediate: true },
  )

  return { owner, nativeOwner, isWrapped, pending, error, refresh: load }
}

function sameAddress(a?: Address | string | null, b?: Address | string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}
