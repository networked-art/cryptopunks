import type { Address } from 'viem'
import { isAddress } from 'viem'
import { fetchIndexerAt, getIndexerUrl, queryIndexerAt } from '~/utils/indexer'

const OWNED_PUNKS_PAGE_SIZE = 1000

const RESOLVE_PROFILE_ADDRESS_QUERY = `
  query ResolveProfileAddress($address: String!) {
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

const ACCOUNT_CUSTODY_QUERY = `
  query AccountCustody($address: String!) {
    account(address: $address) {
      vault
      stash
    }
  }
`

const V2_PUNKS_QUERY = `
  query AccountV2Punks($addrs: [String!]!, $limit: Int!, $after: String) {
    punks(
      where: { owner_in: $addrs }
      orderBy: "punk_id"
      orderDirection: "asc"
      limit: $limit
      after: $after
    ) {
      items { punk_id }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

type EnsProfile = {
  address?: string | null
}

type AccountCustody = {
  vault: string | null
  stash: string | null
}

type PunkRow = { punk_id: string }

type PunkConnection = {
  items: PunkRow[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

export type ProfileOgData = {
  address: Address
  ids: number[]
}

export type ProfileOgPresence = {
  address: Address
  hasPunks: boolean
}

export async function loadProfileOgData(
  handle: string,
): Promise<ProfileOgData | null> {
  try {
    const indexerUrl = getIndexerUrl()
    return await loadProfileOgDataAt(handle, indexerUrl)
  } catch {
    return null
  }
}

export async function loadProfileOgDataAt(
  handle: string,
  indexerUrl: string,
): Promise<ProfileOgData | null> {
  const profile = await resolveProfileOgAddresses(handle, indexerUrl)
  if (!profile) return null

  const ids = await fetchAllV2PunkIds(indexerUrl, profile.addrs)
  return { address: profile.address, ids }
}

export async function loadProfileOgPresence(
  handle: string,
): Promise<ProfileOgPresence | null> {
  try {
    const indexerUrl = getIndexerUrl()
    return await loadProfileOgPresenceAt(handle, indexerUrl)
  } catch {
    return null
  }
}

export async function loadProfileOgPresenceAt(
  handle: string,
  indexerUrl: string,
): Promise<ProfileOgPresence | null> {
  const profile = await resolveProfileOgAddresses(handle, indexerUrl)
  if (!profile) return null

  return {
    address: profile.address,
    hasPunks: await hasAnyV2Punk(indexerUrl, profile.addrs),
  }
}

async function resolveProfileOgAddress(
  handle: string,
  indexerUrl: string,
): Promise<Address | null> {
  const value = handle.trim()
  if (!value) return null

  if (isAddress(value)) {
    return await canonicalizeProfileAddress(value as Address, indexerUrl)
  }

  try {
    const profile = await fetchIndexerAt<EnsProfile>(
      indexerUrl,
      `/profiles/${encodeURIComponent(value)}`,
    )
    if (!profile.address || !isAddress(profile.address)) return null
    return await canonicalizeProfileAddress(
      profile.address as Address,
      indexerUrl,
    )
  } catch {
    return null
  }
}

async function canonicalizeProfileAddress(
  address: Address,
  indexerUrl: string,
): Promise<Address> {
  const normalized = address.toLowerCase() as Address

  try {
    const data = await queryIndexerAt<{
      accounts: { items: { address: string }[] }
    }>(indexerUrl, RESOLVE_PROFILE_ADDRESS_QUERY, { address: normalized })
    const match = data.accounts.items[0]
    if (match?.address && isAddress(match.address)) {
      return match.address.toLowerCase() as Address
    }
  } catch {
    // Leave the address as-is when the indexer can't resolve custody metadata.
  }

  return normalized
}

async function resolveProfileOgAddresses(
  handle: string,
  indexerUrl: string,
): Promise<{ address: Address; addrs: Address[] } | null> {
  const address = await resolveProfileOgAddress(handle, indexerUrl)
  if (!address) return null

  const custody = await fetchAccountCustody(indexerUrl, address)
  const addrs = [address]
  if (custody?.vault) addrs.push(custody.vault.toLowerCase() as Address)
  if (custody?.stash) addrs.push(custody.stash.toLowerCase() as Address)

  return { address, addrs }
}

async function fetchAccountCustody(
  indexerUrl: string,
  address: Address,
): Promise<AccountCustody | null> {
  const data = await queryIndexerAt<{ account: AccountCustody | null }>(
    indexerUrl,
    ACCOUNT_CUSTODY_QUERY,
    { address: address.toLowerCase() },
  )
  return data.account
}

async function fetchAllV2PunkIds(
  indexerUrl: string,
  addrs: Address[],
): Promise<number[]> {
  const ids = new Set<number>()
  let after: string | null = null

  do {
    const data: { punks: PunkConnection } = await queryIndexerAt<{
      punks: PunkConnection
    }>(
      indexerUrl,
      V2_PUNKS_QUERY,
      {
        addrs: addrs.map((addr) => addr.toLowerCase()),
        limit: OWNED_PUNKS_PAGE_SIZE,
        after,
      },
    )
    const page: PunkConnection = data.punks
    for (const row of page.items) ids.add(Number(row.punk_id))
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
  } while (after)

  return Array.from(ids).sort((a, b) => a - b)
}

async function hasAnyV2Punk(
  indexerUrl: string,
  addrs: Address[],
): Promise<boolean> {
  const data: { punks: PunkConnection } = await queryIndexerAt<{
    punks: PunkConnection
  }>(
    indexerUrl,
    V2_PUNKS_QUERY,
    {
      addrs: addrs.map((addr) => addr.toLowerCase()),
      limit: 1,
      after: null,
    },
  )
  return data.punks.items.length > 0
}
