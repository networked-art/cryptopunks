import type { Address } from 'viem'
import type { PunksFilter, PunkQuery } from '@networked-art/punks-sdk'
import { getIndexerUrl, IndexerNotConfigured } from '~/utils/indexer'

export type CollectionBid = {
  id: bigint
  bidder: Address
  bidWei: bigint
  settlementWei: bigint
  criteria: PunksFilter
  includeIds: number[]
  excludeIds: number[]
  active: boolean
  placedAtBlock: bigint
}

/// Shape returned by the indexer's `/bids` + `/bids/matching/*` endpoints.
export type IndexerBid = {
  bidId: string
  bidder: string
  bidWei: string
  settlementWei: string
  active: boolean
  blockNumber: string
  criteria: IndexerBidCriteria
  includeIds: number[]
  excludeIds: number[]
}

export type IndexerBidCriteria = {
  requiredTraitMask: string
  forbiddenTraitMask: string
  anyOfTraitMask: string
  requiredColorMask: string
  forbiddenColorMask: string
  anyOfColorMask: string
  minPixelCount: number
  maxPixelCount: number
  minColorCount: number
  maxColorCount: number
}

const DEFAULT_LIMIT = 200

export function usePunksMarketBids(
  opts: {
    bidder?: MaybeRefOrGetter<Address | undefined>
    /// Whether to include inactive bids. Defaults to active-only.
    activeOnly?: boolean
    limit?: number
  } = {},
) {
  const bids = ref<CollectionBid[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const url = getIndexerUrl()
    pending.value = true
    error.value = null
    try {
      if (!url) throw new IndexerNotConfigured()

      const params = new URLSearchParams()
      params.set('limit', String(opts.limit ?? DEFAULT_LIMIT))
      if (opts.activeOnly !== false) params.set('active', 'true')

      const bidder = toValue(opts.bidder)
      if (bidder) params.set('bidder', bidder)

      const res = await fetch(`${url}/bids?${params.toString()}`)
      if (!res.ok) throw new Error(`Indexer ${res.status}`)
      const json = (await res.json()) as { items: IndexerBid[] }
      bids.value = json.items.map(mapIndexerBid)
    } catch (e) {
      if (e instanceof IndexerNotConfigured) {
        error.value = 'No indexer configured.'
      } else {
        error.value = (e as Error).message
      }
      bids.value = []
    } finally {
      pending.value = false
    }
  }

  watchEffect(() => {
    void toValue(opts.bidder)
    load()
  })

  return { bids, pending, error, refresh: load }
}

export function mapIndexerBid(row: IndexerBid): CollectionBid {
  return {
    id: BigInt(row.bidId),
    bidder: row.bidder as Address,
    bidWei: BigInt(row.bidWei),
    settlementWei: BigInt(row.settlementWei),
    criteria: parseCriteria(row.criteria),
    includeIds: row.includeIds.map(Number),
    excludeIds: row.excludeIds.map(Number),
    active: row.active,
    placedAtBlock: BigInt(row.blockNumber),
  }
}

/// Rebuild the offline `PunkQuery` for a bid so we can count matches or
/// link to the corresponding search page.
export function bidToQuery(bid: CollectionBid): PunkQuery {
  const c = bid.criteria
  const query: PunkQuery = {}
  if (
    c.requiredTraitMask !== 0n ||
    c.forbiddenTraitMask !== 0n ||
    c.anyOfTraitMask !== 0n
  ) {
    query.attributes = {
      requiredMask: c.requiredTraitMask,
      forbiddenMask: c.forbiddenTraitMask,
      anyOfMask: c.anyOfTraitMask,
    }
  }
  if (
    c.requiredColorMask !== 0n ||
    c.forbiddenColorMask !== 0n ||
    c.anyOfColorMask !== 0n
  ) {
    query.colors = {
      requiredMask: c.requiredColorMask,
      forbiddenMask: c.forbiddenColorMask,
      anyOfMask: c.anyOfColorMask,
    }
  }
  /// `max === 0` means "no constraint" in the on-chain `PunksFilter`.
  if (c.maxPixelCount > 0) {
    query.pixelCount = { min: c.minPixelCount, max: c.maxPixelCount }
  }
  if (c.maxColorCount > 0) {
    query.colorCount = { min: c.minColorCount, max: c.maxColorCount }
  }
  if (bid.includeIds.length) query.ids = bid.includeIds
  if (bid.excludeIds.length) query.excludeIds = bid.excludeIds
  return query
}

function parseCriteria(raw: IndexerBidCriteria | undefined): PunksFilter {
  return {
    requiredTraitMask: BigInt(raw?.requiredTraitMask ?? '0'),
    forbiddenTraitMask: BigInt(raw?.forbiddenTraitMask ?? '0'),
    anyOfTraitMask: BigInt(raw?.anyOfTraitMask ?? '0'),
    requiredColorMask: BigInt(raw?.requiredColorMask ?? '0'),
    forbiddenColorMask: BigInt(raw?.forbiddenColorMask ?? '0'),
    anyOfColorMask: BigInt(raw?.anyOfColorMask ?? '0'),
    minPixelCount: raw?.minPixelCount ?? 0,
    maxPixelCount: raw?.maxPixelCount ?? 0,
    minColorCount: raw?.minColorCount ?? 0,
    maxColorCount: raw?.maxColorCount ?? 0,
  }
}
