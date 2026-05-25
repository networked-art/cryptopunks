import type { Address } from 'viem'
import { queryIndexer } from '~/utils/indexer'

const RESOLVE_QUERY = `
  query ResolveProfile($address: String!) {
    accounts(
      where: {
        OR: [
          { vault: $address }
          { stash: $address }
          { user_proxy: $address }
        ]
      }
      limit: 1
    ) {
      items { address }
    }
  }
`

type ResolveResult = {
  /** The canonical EOA to display the profile for. */
  canonical: Address
  /**
   * True when `address` was a known `PunksVault`/`Stash`/`WrapperProxy` and the
   * profile page should redirect to the owner EOA via
   * `navigateTo('/profile/' + canonical, { replace: true })`.
   */
  redirect: boolean
}

/**
 * Given a resolved EOA-or-contract address, asks the indexer whether it is a
 * known per-user contract (PunksVault / Stash / WrapperProxy). If so, returns
 * the owning EOA and `redirect: true`. Otherwise returns the input address
 * as-is.
 *
 * Used by `/profile/[handle]` to canonicalize URLs like
 * `/profile/<vaultAddress>` → `/profile/<ownerAddress>`.
 */
export async function resolveProfileAddress(
  address: Address,
): Promise<ResolveResult> {
  try {
    const data = await queryIndexer<{
      accounts: { items: { address: string }[] }
    }>(RESOLVE_QUERY, { address: address.toLowerCase() })
    const match = data.accounts.items[0]
    if (match && match.address.toLowerCase() !== address.toLowerCase()) {
      return { canonical: match.address as Address, redirect: true }
    }
  } catch {
    // Fall through — leave the address as-is when the indexer is unreachable.
  }
  return { canonical: address, redirect: false }
}
