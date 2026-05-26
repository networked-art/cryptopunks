import type { Abi, Address } from 'viem'
import {
  CRYPTOPUNKS_721_ADDRESS,
  PUNKS_V1_WRAPPER_ADDRESS,
  PUNKS_VAULT_FACTORY_ADDRESS,
  WRAPPED_PUNKS_ADDRESS,
  ZERO_ADDRESS,
  cryptoPunks721Abi,
  cryptoPunksMarketAbi,
  punkVaultAbi,
  punkVaultFactoryAbi,
  punksV1WrapperAbi,
  wrappedPunksAbi,
} from '@networked-art/punks-sdk'
import { CRYPTOPUNKS_ADDRESS, PUNKS_V1_ADDRESS } from '~/utils/addresses'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

/**
 * Current holder of a Punk. Reads the market's `punkIndexToAddress`, then
 * resolves the beneficial holder when the punk is custodied:
 *   - known ERC-721 wrappers (`WrappedPunks`, `CryptoPunks721`,
 *     `PunksV1Wrapper`) — via `wrapper.ownerOf(id)`.
 *   - a `PunksVault` clone — verified by `predictVault(owner) === native`.
 * `nativeOwner` still surfaces the raw market owner — wrapper, vault, or EOA —
 * for callers that need it to gate native-market interactions.
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
      const native = (await c.readContract({
        address: marketAddress,
        abi: cryptoPunksMarketAbi,
        functionName: 'punkIndexToAddress',
        args: [tokenId],
      })) as Address
      nativeOwner.value = native

      const knownWrapperIdx = wrappers.findIndex((w) =>
        sameAddress(w.address, native),
      )

      // Fan out resolution candidates in parallel. For known wrappers we read
      // `ownerOf`; for unknown V2 owners we probe `PunksVault.owner()` (a
      // vault clone returns the EOA, any non-vault contract reverts).
      const [wrapperOwners, vaultCandidate] = await Promise.all([
        Promise.all(
          wrappers.map((w, i) =>
            i === knownWrapperIdx
              ? c
                  .readContract({
                    address: w.address,
                    abi: w.abi,
                    functionName: 'ownerOf',
                    args: [tokenId],
                  })
                  .then((r) => r as Address)
                  .catch(() => null)
              : Promise.resolve<Address | null>(null),
          ),
        ),
        !isV1 && knownWrapperIdx < 0 && !sameAddress(native, ZERO_ADDRESS)
          ? c
              .readContract({
                address: native,
                abi: punkVaultAbi,
                functionName: 'owner',
              })
              .then((r) => r as Address)
              .catch(() => null)
          : Promise.resolve<Address | null>(null),
      ])

      const wrapperHit =
        knownWrapperIdx >= 0 ? wrapperOwners[knownWrapperIdx] : null
      if (wrapperHit) {
        owner.value = wrapperHit
        isWrapped.value = true
        return
      }

      if (vaultCandidate && !sameAddress(vaultCandidate, ZERO_ADDRESS)) {
        // Verify the claim by re-deriving the deterministic vault address.
        const predicted = await c
          .readContract({
            address: PUNKS_VAULT_FACTORY_ADDRESS,
            abi: punkVaultFactoryAbi,
            functionName: 'predictVault',
            args: [vaultCandidate],
          })
          .then((r) => r as Address)
          .catch(() => null)

        if (predicted && sameAddress(predicted, native)) {
          owner.value = vaultCandidate
          isWrapped.value = true
          return
        }
      }

      owner.value = native
      isWrapped.value = false
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
