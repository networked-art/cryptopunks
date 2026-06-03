import type { Abi, Address, PublicClient } from 'viem'
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
  stashAbi,
  stashFactoryAbi,
  wrappedPunksAbi,
} from '@networked-art/punks-sdk'
import {
  CRYPTOPUNKS_ADDRESS,
  PUNKS_V1_ADDRESS,
  STASH_FACTORY_ADDRESS,
} from '~/utils/addresses'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

/**
 * Current holder of a Punk. Reads the market's `punkIndexToAddress`, then
 * resolves the beneficial holder when the punk is custodied:
 *   - known ERC-721 wrappers (`WrappedPunks`, `CryptoPunks721`,
 *     `PunksV1Wrapper`) — via `wrapper.ownerOf(id)`; when the wrapper token is
 *     itself held by a `Stash` clone, pierces to the EOA behind the stash.
 *   - a `PunksVault` clone — verified by `predictVault(owner) === native`.
 * `isWrapped` only reflects an ERC-721 wrapper directly controlled by the
 * resolved owner — vault and stash custody dominate and read as not wrapped.
 * `nativeOwner` still surfaces the raw market owner — wrapper, vault, or EOA —
 * for callers that need it to gate native-market interactions.
 */
export function usePunkOwner(
  punkId: MaybeRefOrGetter<number>,
  standard: MaybeRefOrGetter<TokenStandardValue> = TokenStandard.CryptoPunks,
  opts: { immediate?: boolean } = {},
) {
  const client = useReadClient()

  const owner = ref<Address | null>(null)
  const nativeOwner = ref<Address | null>(null)
  const isWrapped = ref(false)
  const isVaulted = ref(false)
  const isStashed = ref(false)
  const pending = ref(false)
  const error = ref<string | null>(null)

  function resetCustody() {
    isWrapped.value = false
    isVaulted.value = false
    isStashed.value = false
  }

  async function load() {
    const id = toValue(punkId)
    const std = toValue(standard)
    const c = client.value
    if (!c || !Number.isInteger(id)) {
      owner.value = null
      nativeOwner.value = null
      resetCustody()
      return
    }
    pending.value = true
    error.value = null
    resetCustody()
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
        // A `Stash` clone may hold the wrapper token — pierce to its EOA so
        // stash custody dominates wrap state.
        const stashEoa = await resolveStashOwner(c, wrapperHit)
        if (stashEoa) {
          owner.value = stashEoa
          isStashed.value = true
          return
        }
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
          isVaulted.value = true
          return
        }
      }

      owner.value = native
    } catch (e) {
      error.value = (e as Error).message
      owner.value = null
      nativeOwner.value = null
      resetCustody()
    } finally {
      pending.value = false
    }
  }

  watch(
    [() => toValue(punkId), () => toValue(standard), client],
    () => {
      if (opts.immediate ?? true) void load()
    },
    { immediate: opts.immediate ?? true },
  )

  return {
    owner,
    nativeOwner,
    isWrapped,
    isVaulted,
    isStashed,
    pending,
    error,
    refresh: load,
  }
}

function sameAddress(a?: Address | string | null, b?: Address | string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

// Treat `candidate` as a `Stash` clone if its `owner()` round-trips through
// `StashFactory.stashAddressFor(owner)` back to `candidate`.
async function resolveStashOwner(
  client: PublicClient,
  candidate: Address,
): Promise<Address | null> {
  const eoa = await client
    .readContract({
      address: candidate,
      abi: stashAbi,
      functionName: 'owner',
    })
    .then((r) => r as Address)
    .catch(() => null)
  if (!eoa || sameAddress(eoa, ZERO_ADDRESS)) return null
  const predicted = await client
    .readContract({
      address: STASH_FACTORY_ADDRESS,
      abi: stashFactoryAbi,
      functionName: 'stashAddressFor',
      args: [eoa],
    })
    .then((r) => r as Address)
    .catch(() => null)
  return predicted && sameAddress(predicted, candidate) ? eoa : null
}
