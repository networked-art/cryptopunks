import type { PublicClient } from 'viem'
import { isAuctionDeployed } from '~/utils/addresses'
import {
  readAuctions,
  readLots,
  readOffers,
  type AuctionRecord,
  type LotRecord,
  type OfferRecord,
} from '~/utils/auction'

/**
 * Shared loader for the three enumerable `PunksAuction` resources. Each is read
 * with a `multicall` sweep from `1..lastId`; with no indexer this is the whole
 * data layer for the list pages.
 */
function useChainResource<T>(read: (client: PublicClient) => Promise<T[]>) {
  const client = useReadClient()

  const items = ref<T[]>([]) as Ref<T[]>
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const c = client.value
    if (!c) return
    pending.value = true
    error.value = null
    try {
      items.value = await read(c)
    } catch (e) {
      error.value = (e as Error).message
      items.value = []
    } finally {
      pending.value = false
    }
  }

  watch(client, () => void load(), { immediate: true })

  return {
    items,
    pending,
    error,
    deployed: isAuctionDeployed(),
    refresh: load,
  }
}

export function useAuctions() {
  const { items, pending, error, deployed, refresh } =
    useChainResource<AuctionRecord>(readAuctions)
  return { auctions: items, pending, error, deployed, refresh }
}

export function useLots() {
  const { items, pending, error, deployed, refresh } =
    useChainResource<LotRecord>(readLots)
  return { lots: items, pending, error, deployed, refresh }
}

export function useOffers() {
  const { items, pending, error, deployed, refresh } =
    useChainResource<OfferRecord>(readOffers)
  return { offers: items, pending, error, deployed, refresh }
}
