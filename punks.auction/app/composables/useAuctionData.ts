import type { PublicClient } from 'viem'
import { isAuctionDeployed } from '~/utils/addresses'
import {
  minNextBidWei,
  readAuction,
  readAuctionForLot,
  readAuctions,
  readOffer,
  readLot,
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

function resourceId(value: MaybeRefOrGetter<bigint | number | undefined>) {
  const id = toValue(value)
  if (id === undefined) return null
  if (typeof id === 'number' && (!Number.isInteger(id) || id < 1)) return null
  if (typeof id === 'bigint' && id < 1n) return null
  return BigInt(id)
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

export function useOffer(id: MaybeRefOrGetter<bigint | number | undefined>) {
  const client = useReadClient()
  const offer = ref<OfferRecord | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const c = client.value
    const offerId = resourceId(id)
    if (!c || offerId === null) {
      offer.value = null
      return
    }

    pending.value = true
    error.value = null
    try {
      offer.value = await readOffer(c, offerId)
    } catch (e) {
      error.value = (e as Error).message
      offer.value = null
    } finally {
      pending.value = false
    }
  }

  watch([() => resourceId(id)?.toString(), client], () => void load(), {
    immediate: true,
  })

  return {
    offer,
    pending,
    error,
    deployed: isAuctionDeployed(),
    refresh: load,
  }
}

export function useAuction(id: MaybeRefOrGetter<bigint | number | undefined>) {
  const client = useReadClient()
  const auction = ref<AuctionRecord | null>(null)
  const pending = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    const auctionId = resourceId(id)
    if (auctionId === null) {
      auction.value = null
      pending.value = false
      return
    }
    const c = client.value
    if (!c) return

    pending.value = true
    error.value = null
    try {
      auction.value = await readAuction(c, auctionId)
    } catch (e) {
      error.value = (e as Error).message
      auction.value = null
    } finally {
      pending.value = false
    }
  }

  watch([() => resourceId(id)?.toString(), client], () => void load(), {
    immediate: true,
  })

  const minimumBidWei = computed(() => {
    const current = auction.value
    return current ? minNextBidWei(current.latestBidWei) : null
  })

  return {
    auction,
    minimumBidWei,
    pending,
    error,
    deployed: isAuctionDeployed(),
    refresh: load,
  }
}

export function useLot(id: MaybeRefOrGetter<bigint | number | undefined>) {
  const client = useReadClient()
  const lot = ref<LotRecord | null>(null)
  const sourceAuction = ref<AuctionRecord | null>(null)
  const pending = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    const lotId = resourceId(id)
    if (lotId === null) {
      lot.value = null
      sourceAuction.value = null
      pending.value = false
      return
    }
    const c = client.value
    if (!c) return

    pending.value = true
    error.value = null
    try {
      const [nextLot, nextAuction] = await Promise.all([
        readLot(c, lotId),
        readAuctionForLot(c, lotId),
      ])
      lot.value = nextLot
      sourceAuction.value = nextAuction
    } catch (e) {
      error.value = (e as Error).message
      lot.value = null
      sourceAuction.value = null
    } finally {
      pending.value = false
    }
  }

  watch([() => resourceId(id)?.toString(), client], () => void load(), {
    immediate: true,
  })

  return {
    lot,
    sourceAuction,
    pending,
    error,
    deployed: isAuctionDeployed(),
    refresh: load,
  }
}
