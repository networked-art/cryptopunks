import type { Address } from 'viem'
import { queryIndexer } from '~/utils/indexer'

/**
 * Per-EOA account state — vault, stash and wrapper-proxy addresses plus their
 * deployment flags — sourced from the indexer's `account(address:)` GraphQL
 * query. Components that *interact* with these contracts (e.g. the stash
 * deposit/reclaim UI) should read chain state directly via the SDK so they
 * keep working through indexer downtime; this composable is for display.
 */
const ACCOUNT_QUERY = `
  query AccountDetails($address: String!) {
    account(address: $address) {
      vault
      stash
      vault_deployed
      stash_deployed
      user_proxy
    }
  }
`

type AccountRow = {
  vault: string | null
  stash: string | null
  vault_deployed: boolean
  stash_deployed: boolean
  user_proxy: string | null
}

export function useAccountAddresses(
  account: MaybeRefOrGetter<Address | undefined>,
) {
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
    // Clear stale prior-account refs at the start of a fresh run so navigating
    // profile A → B never renders A's vault/stash under B's header while the
    // request is in flight.
    reset()
    if (!addr) {
      loading.value = false
      error.value = null
      return
    }
    loading.value = true
    error.value = null
    try {
      const data = await queryIndexer<{ account: AccountRow | null }>(
        ACCOUNT_QUERY,
        { address: addr.toLowerCase() },
      )
      if (t !== token) return
      const row = data.account
      vault.value = (row?.vault ?? null) as Address | null
      stash.value = (row?.stash ?? null) as Address | null
      wrapperProxy.value = (row?.user_proxy ?? null) as Address | null
      vaultDeployed.value = !!row?.vault_deployed
      stashDeployed.value = !!row?.stash_deployed
    } catch (e) {
      if (t !== token) return
      error.value = (e as Error).message
    } finally {
      if (t === token) loading.value = false
    }
  }

  watch(() => toValue(account), () => void load(), { immediate: true })

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
