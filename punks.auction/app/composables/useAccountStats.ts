import type { Address } from 'viem'
import { fetchIndexer, IndexerNotConfigured } from '~/utils/indexer'

export type AccountStats = {
  totalSpentWei: bigint
  totalSpentUsdCents: bigint
  totalEarnedWei: bigint
  totalEarnedUsdCents: bigint
  salesBoughtCount: number
  salesSoldCount: number
  punksClaimedCount: number
  lastActiveAt: number | null
  firstSeenAt: number | null
}

type RawStats = {
  totalSpentWei: string
  totalSpentUsdCents: string
  totalEarnedWei: string
  totalEarnedUsdCents: string
  salesBoughtCount: number
  salesSoldCount: number
  punksClaimedCount: number
  lastActiveAt: string | null
  firstSeenAt: string | null
}

const EMPTY: AccountStats = {
  totalSpentWei: 0n,
  totalSpentUsdCents: 0n,
  totalEarnedWei: 0n,
  totalEarnedUsdCents: 0n,
  salesBoughtCount: 0,
  salesSoldCount: 0,
  punksClaimedCount: 0,
  lastActiveAt: null,
  firstSeenAt: null,
}

/**
 * Lifetime aggregates for the profile address — sum of sale wei the user has
 * spent (as buyer) and earned (as seller) across the canonical CryptoPunks
 * market (CryptoPunksMarket + PunksMarket), plus the indexer's
 * `accounts.last_interaction_at` for the EOA. The `*UsdCents` totals are
 * stamped at indexing time using the daily ETH/USD close, so they reflect
 * dollar value at the moment of each trade rather than today's price. Sales
 * on the original C̷̢̛͙ryptoPunks market are intentionally excluded; the
 * `punksClaimedCount` is the only stat sourced from C̷̢̛͙ryptoPunks (the
 * original assigns).
 *
 * `addresses` is the custody set (EOA + vault + stash). `eoa` is just the
 * signing address; the indexer uses it for the last-active lookup, which
 * tracks tx-from rather than event-participation.
 */
export function useAccountStats(opts: {
  addresses: MaybeRefOrGetter<Address[]>
  eoa: MaybeRefOrGetter<Address | undefined>
}) {
  const stats = ref<AccountStats>(EMPTY)
  const pending = ref(false)
  const error = ref<string | null>(null)
  let token = 0

  async function load() {
    const t = ++token
    const eoa = toValue(opts.eoa)
    const addresses = toValue(opts.addresses)

    if (!eoa || !addresses.length) {
      stats.value = EMPTY
      pending.value = false
      error.value = null
      return
    }

    pending.value = true
    error.value = null
    try {
      const raw = await fetchIndexer<RawStats>('/accounts/stats', {
        addresses: addresses.join(','),
        eoa,
        scope: 'v2',
      })
      if (t !== token) return
      stats.value = {
        totalSpentWei: BigInt(raw.totalSpentWei),
        totalSpentUsdCents: BigInt(raw.totalSpentUsdCents),
        totalEarnedWei: BigInt(raw.totalEarnedWei),
        totalEarnedUsdCents: BigInt(raw.totalEarnedUsdCents),
        salesBoughtCount: raw.salesBoughtCount,
        salesSoldCount: raw.salesSoldCount,
        punksClaimedCount: raw.punksClaimedCount,
        lastActiveAt: raw.lastActiveAt == null ? null : Number(raw.lastActiveAt),
        firstSeenAt: raw.firstSeenAt == null ? null : Number(raw.firstSeenAt),
      }
    } catch (e) {
      if (t !== token) return
      error.value =
        e instanceof IndexerNotConfigured
          ? 'No indexer configured.'
          : (e as Error).message
      stats.value = EMPTY
    } finally {
      if (t === token) pending.value = false
    }
  }

  watch(
    [() => toValue(opts.addresses), () => toValue(opts.eoa)],
    () => void load(),
    { immediate: true },
  )

  return { stats, pending, error, refresh: load }
}
