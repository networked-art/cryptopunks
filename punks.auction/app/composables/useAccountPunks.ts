import type { Address } from 'viem'
import { queryIndexer } from '~/utils/indexer'

const OWNED_PUNKS_PAGE_SIZE = 1000

const PUNKS_QUERY = `
  query AccountPunks($addrs: [String!]!, $limit: Int!, $after: String) {
    punks(
      where: { owner_in: $addrs }
      orderBy: "punk_id"
      orderDirection: "asc"
      limit: $limit
      after: $after
    ) {
      items { punk_id owner is_wrapped }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

const V1_PUNKS_QUERY = `
  query AccountV1Punks($addrs: [String!]!, $limit: Int!, $after: String) {
    v1Punks(
      where: { owner_in: $addrs }
      orderBy: "punk_id"
      orderDirection: "asc"
      limit: $limit
      after: $after
    ) {
      items { punk_id owner is_wrapped }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

type PunkRow = { punk_id: string; owner: string; is_wrapped: boolean }
type PunkConnection = {
  items: PunkRow[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
}
type PunkQueryKey = 'punks' | 'v1Punks'
type PunkQueryData = Partial<Record<PunkQueryKey, PunkConnection>>

export type AccountPunkBreakdown = {
  /** Native-owned by the EOA (not wrapped, not in vault/stash). */
  wallet: number
  /** Held by the user's `PunksVault`. Custody dominates wrap state. */
  vault: number
  /** Held by the user's Yuga `Stash`. Custody dominates wrap state. */
  stash: number
  /** Wrapped — ERC-721 token owned by the EOA. */
  wrapped: number
}

/**
 * Aggregates a user's CryptoPunks across every custody the indexer tracks:
 * the EOA itself (native + wrapped ERC-721s), the `PunksVault`, and the
 * Yuga `Stash`. Returns a deduplicated sorted union plus a per-custody
 * breakdown for the count sublabel.
 *
 * Pages through V1 and V2 with one `owner_in` predicate per collection.
 * Re-fires whenever the inputs change.
 */
export function useAccountPunks(opts: {
  account: MaybeRefOrGetter<Address | undefined>
  vault: MaybeRefOrGetter<Address | null>
  stash: MaybeRefOrGetter<Address | null>
}) {
  const ids = ref<number[]>([])
  const v1Ids = ref<number[]>([])
  const v2Ids = ref<number[]>([])
  const breakdown = ref<AccountPunkBreakdown>({
    wallet: 0,
    vault: 0,
    stash: 0,
    wrapped: 0,
  })
  const loading = ref(false)
  const error = ref<string | null>(null)
  let token = 0

  function reset() {
    ids.value = []
    v1Ids.value = []
    v2Ids.value = []
    breakdown.value = { wallet: 0, vault: 0, stash: 0, wrapped: 0 }
  }

  async function load() {
    const t = ++token
    const acct = toValue(opts.account)
    const vlt = toValue(opts.vault)
    const stsh = toValue(opts.stash)
    // Clear stale prior-profile data before any await, so navigating A → B
    // never shows A's grid + breakdown under B's header.
    reset()
    if (!acct) {
      loading.value = false
      error.value = null
      return
    }

    const addrs: string[] = [acct.toLowerCase()]
    if (vlt) addrs.push(vlt.toLowerCase())
    if (stsh) addrs.push(stsh.toLowerCase())

    loading.value = true
    error.value = null
    try {
      const [punks, v1Punks] = await Promise.all([
        fetchAllPunkRows(PUNKS_QUERY, 'punks', addrs, () => t === token),
        fetchAllPunkRows(V1_PUNKS_QUERY, 'v1Punks', addrs, () => t === token),
      ])
      if (t !== token) return

      const acctLower = acct.toLowerCase()
      const vltLower = vlt?.toLowerCase() ?? null
      const stshLower = stsh?.toLowerCase() ?? null

      const counts = { wallet: 0, vault: 0, stash: 0, wrapped: 0 }
      // Custody dominates wrap state: a wrapped token held by the vault is
      // counted as "vault", not "wrapped". The "wrapped" bucket only reflects
      // wrapper ERC-721s sitting in the EOA's own wallet.
      const classify = (row: PunkRow) => {
        const owner = row.owner.toLowerCase()
        if (owner === acctLower) {
          if (row.is_wrapped) counts.wrapped++
          else counts.wallet++
        } else if (vltLower && owner === vltLower) counts.vault++
        else if (stshLower && owner === stshLower) counts.stash++
      }

      const v2Set = new Set<number>()
      for (const row of punks) {
        v2Set.add(Number(row.punk_id))
        classify(row)
      }
      const v1Set = new Set<number>()
      for (const row of v1Punks) {
        v1Set.add(Number(row.punk_id))
        classify(row)
      }

      v2Ids.value = Array.from(v2Set).sort((a, b) => a - b)
      v1Ids.value = Array.from(v1Set).sort((a, b) => a - b)
      // Union across V1/V2 dedupes punk IDs that exist in both worlds — a
      // single `id` lookup in the grid covers both, since wrapped/native and
      // V1/V2 share the 0..9999 id space.
      const union = new Set<number>([...v2Set, ...v1Set])
      ids.value = Array.from(union).sort((a, b) => a - b)
      breakdown.value = counts
    } catch (e) {
      if (t !== token) return
      error.value = (e as Error).message
      ids.value = []
      v1Ids.value = []
      v2Ids.value = []
      breakdown.value = { wallet: 0, vault: 0, stash: 0, wrapped: 0 }
    } finally {
      if (t === token) loading.value = false
    }
  }

  watch(
    [() => toValue(opts.account), () => toValue(opts.vault), () => toValue(opts.stash)],
    () => void load(),
    { immediate: true },
  )

  return { ids, v1Ids, v2Ids, breakdown, loading, error, refresh: load }
}

async function fetchAllPunkRows(
  query: string,
  key: PunkQueryKey,
  addrs: string[],
  isCurrent: () => boolean,
): Promise<PunkRow[]> {
  const rows: PunkRow[] = []
  let after: string | null = null

  while (isCurrent()) {
    const data: PunkQueryData = await queryIndexer<PunkQueryData>(query, {
      addrs,
      limit: OWNED_PUNKS_PAGE_SIZE,
      after,
    })
    const page = data[key]
    if (!page) {
      throw new Error('Indexer returned no punk page')
    }
    rows.push(...page.items)

    if (!page.pageInfo.hasNextPage) break
    if (!page.pageInfo.endCursor) {
      throw new Error('Indexer pagination cursor missing')
    }
    after = page.pageInfo.endCursor
  }

  return rows
}
