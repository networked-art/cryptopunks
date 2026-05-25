import {
  punkVaultFactoryAbi,
  stashFactoryAbi,
  wrappedPunksAbi,
} from '@networked-art/punks-sdk'
import type { Address } from 'viem'
import {
  PUNKS_VAULT_FACTORY_ADDRESS,
  STASH_FACTORY_ADDRESS,
  WRAPPED_PUNKS_ADDRESS,
} from '~/utils/addresses'

const ZERO = '0x0000000000000000000000000000000000000000'

/**
 * Resolves the per-user contract addresses associated with `account` by
 * reading the factories on-chain. We deliberately do **not** trust the
 * indexer here — the deterministic vault and stash addresses are pure view
 * functions on their respective factories, so the chain is the cheapest
 * source of truth and never wrong.
 *
 *   - `vault`        — `PunksVaultFactory.predictVault(user)`
 *   - `stash`        — `StashFactory.stashAddressFor(user)`
 *   - `wrapperProxy` — `WrappedPunks.proxyInfo(user)` (null when unregistered)
 *
 * `*Deployed` flags reflect bytecode presence at the predicted address.
 */
export function useAccountAddresses(
  account: MaybeRefOrGetter<Address | undefined>,
) {
  const client = useReadClient()

  const vault = ref<Address | null>(null)
  const stash = ref<Address | null>(null)
  const wrapperProxy = ref<Address | null>(null)
  const vaultDeployed = ref(false)
  const stashDeployed = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let token = 0

  function reset() {
    vault.value = null
    stash.value = null
    wrapperProxy.value = null
    vaultDeployed.value = false
    stashDeployed.value = false
  }

  async function load() {
    const t = ++token
    const addr = toValue(account)
    const c = client.value
    // Always clear stale prior-account refs at the start of a fresh run, so
    // navigating profile A → B never renders A's vault/stash under B's
    // header while the multicall is in flight.
    reset()
    if (!addr || !c) {
      loading.value = false
      error.value = null
      return
    }
    loading.value = true
    error.value = null
    try {
      const reads = await c.multicall({
        allowFailure: true,
        contracts: [
          {
            address: PUNKS_VAULT_FACTORY_ADDRESS,
            abi: punkVaultFactoryAbi,
            functionName: 'predictVault',
            args: [addr],
          },
          {
            address: STASH_FACTORY_ADDRESS,
            abi: stashFactoryAbi,
            functionName: 'stashAddressFor',
            args: [addr],
          },
          {
            address: WRAPPED_PUNKS_ADDRESS,
            abi: wrappedPunksAbi,
            functionName: 'proxyInfo',
            args: [addr],
          },
        ],
      })
      if (t !== token) return

      const nextVault =
        reads[0]?.status === 'success' ? (reads[0].result as Address) : null
      const nextStash =
        reads[1]?.status === 'success' ? (reads[1].result as Address) : null
      const rawProxy =
        reads[2]?.status === 'success' ? (reads[2].result as Address) : null
      const nextProxy =
        rawProxy && rawProxy.toLowerCase() !== ZERO ? rawProxy : null

      const [vaultCode, stashCode] = await Promise.all([
        nextVault
          ? c.getBytecode({ address: nextVault }).catch(() => undefined)
          : undefined,
        nextStash
          ? c.getBytecode({ address: nextStash }).catch(() => undefined)
          : undefined,
      ])
      if (t !== token) return

      vault.value = nextVault
      stash.value = nextStash
      wrapperProxy.value = nextProxy
      vaultDeployed.value = !!vaultCode && vaultCode !== '0x'
      stashDeployed.value = !!stashCode && stashCode !== '0x'
    } catch (e) {
      if (t !== token) return
      error.value = (e as Error).message
    } finally {
      if (t === token) loading.value = false
    }
  }

  watch([() => toValue(account), client], () => void load(), { immediate: true })

  return {
    vault,
    stash,
    wrapperProxy,
    vaultDeployed,
    stashDeployed,
    loading,
    error,
    refresh: load,
  }
}
