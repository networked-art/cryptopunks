import type { Address } from 'viem'
import type { PunksFilter } from '@networked-art/punks-sdk'
import type { CollectionBid } from './usePunksMarketBids'
import { getIndexerUrl, IndexerNotConfigured } from '~/utils/indexer'

type IndexerResponse = {
  punkId: string
  items: IndexerBid[]
}

type IndexerBid = {
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

type IndexerBidCriteria = {
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

/// Server-side, criteria-correct list of active PunksMarket bids that would
/// accept `punkId`, ordered by `bid_wei DESC`. The first item is the top bid.
export function useBidsMatchingPunk(
  punkId: MaybeRefOrGetter<number>,
  opts: { limit?: number } = {},
) {
  const bids = ref<CollectionBid[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const id = toValue(punkId)
    const url = getIndexerUrl()
    pending.value = true
    error.value = null
    try {
      if (!url) throw new IndexerNotConfigured()
      const res = await fetch(
        `${url}/bids/matching/punk/${id}?limit=${opts.limit ?? 50}`,
      )
      if (!res.ok) throw new Error(`Indexer ${res.status}`)
      const json = (await res.json()) as IndexerResponse
      bids.value = json.items.map(mapBid)
    } catch (e) {
      error.value =
        e instanceof IndexerNotConfigured
          ? 'No indexer configured.'
          : (e as Error).message
      bids.value = []
    } finally {
      pending.value = false
    }
  }

  watch(() => toValue(punkId), load, { immediate: true })

  return { bids, pending, error, refresh: load }
}

function mapBid(row: IndexerBid): CollectionBid {
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
