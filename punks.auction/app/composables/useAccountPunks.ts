import type { Address } from 'viem'
import { queryIndexer } from '~/utils/indexer'

const PUNKS_QUERY = `
  query AccountPunks($addrs: [String!]!) {
    punks(where: { owner_in: $addrs }, limit: 10000) {
      items { punk_id owner is_wrapped }
    }
    v1Punks(where: { owner_in: $addrs }, limit: 10000) {
      items { punk_id owner }
    }
  }
`

type PunkRow = { punk_id: string; owner: string; is_wrapped: boolean }
type V1PunkRow = { punk_id: string; owner: string }

export type AccountPunkBreakdown = {
  /** Native-owned by the EOA (not wrapped, not in vault/stash). */
  wallet: number
  /** Held by the user's `PunksVault`. */
  vault: number
  /** Held by the user's Yuga `Stash`. */
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
 * Single GraphQL query: one `owner_in` predicate per collection. Re-fires
 * whenever the inputs change.
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

  async function load() {
    const t = ++token
    const acct = toValue(opts.account)
    const vlt = toValue(opts.vault)
    const stsh = toValue(opts.stash)
    if (!acct) {
      ids.value = []
      v1Ids.value = []
      v2Ids.value = []
      breakdown.value = { wallet: 0, vault: 0, stash: 0, wrapped: 0 }
      return
    }

    const addrs: string[] = [acct.toLowerCase()]
    if (vlt) addrs.push(vlt.toLowerCase())
    if (stsh) addrs.push(stsh.toLowerCase())

    loading.value = true
    error.value = null
    try {
      const data = await queryIndexer<{
        punks: { items: PunkRow[] }
        v1Punks: { items: V1PunkRow[] }
      }>(PUNKS_QUERY, { addrs })
      if (t !== token) return

      const acctLower = acct.toLowerCase()
      const vltLower = vlt?.toLowerCase() ?? null
      const stshLower = stsh?.toLowerCase() ?? null

      const counts = { wallet: 0, vault: 0, stash: 0, wrapped: 0 }
      const v2Set = new Set<number>()
      for (const row of data.punks.items) {
        const id = Number(row.punk_id)
        v2Set.add(id)
        const owner = row.owner.toLowerCase()
        if (owner === acctLower) {
          if (row.is_wrapped) counts.wrapped++
          else counts.wallet++
        } else if (vltLower && owner === vltLower) counts.vault++
        else if (stshLower && owner === stshLower) counts.stash++
      }

      const v1Set = new Set<number>()
      for (const row of data.v1Punks.items) {
        v1Set.add(Number(row.punk_id))
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
