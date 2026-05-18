import type { Address } from 'viem'
import type { PunksFilter } from '@networked-art/punks-sdk'
import { queryIndexer, IndexerNotConfigured } from '~/utils/indexer'

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

type RawMarketBid = {
  bid_id: string
  bidder: string
  bid_wei: string
  settlement_wei: string
  active: boolean
  block_number: string
  criteria_json: string
  include_ids_json: string
  exclude_ids_json: string
}

const BIDS_QUERY = `
  query MarketBids($where: marketBidFilter, $limit: Int!) {
    marketBids(where: $where, orderBy: "bid_wei", orderDirection: "desc", limit: $limit) {
      items {
        bid_id
        bidder
        bid_wei
        settlement_wei
        active
        block_number
        criteria_json
        include_ids_json
        exclude_ids_json
      }
    }
  }
`

export function usePunksMarketBids(
  opts: {
    bidder?: MaybeRefOrGetter<Address | undefined>
    activeOnly?: boolean
    limit?: number
  } = {},
) {
  const bids = ref<CollectionBid[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    pending.value = true
    error.value = null
    try {
      const where: Record<string, unknown> = {}
      if (opts.activeOnly !== false) where.active = true

      const bidder = toValue(opts.bidder)?.toLowerCase()
      if (bidder) where.bidder = bidder

      const data = await queryIndexer<{ marketBids: { items: RawMarketBid[] } }>(
        BIDS_QUERY,
        {
          where: Object.keys(where).length ? where : undefined,
          limit: opts.limit ?? 200,
        },
      )

      bids.value = data.marketBids.items.map(mapBid)
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

function mapBid(row: RawMarketBid): CollectionBid {
  return {
    id: BigInt(row.bid_id),
    bidder: row.bidder as Address,
    bidWei: BigInt(row.bid_wei),
    settlementWei: BigInt(row.settlement_wei),
    criteria: parseCriteria(row.criteria_json),
    includeIds: parseIds(row.include_ids_json),
    excludeIds: parseIds(row.exclude_ids_json),
    active: row.active,
    placedAtBlock: BigInt(row.block_number),
  }
}

function parseIds(raw: string | null | undefined): number[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map((n) => Number(n)) : []
  } catch {
    return []
  }
}

function parseCriteria(raw: string | null | undefined): PunksFilter {
  const empty: PunksFilter = {
    requiredTraitMask: 0n,
    forbiddenTraitMask: 0n,
    anyOfTraitMask: 0n,
    requiredColorMask: 0n,
    forbiddenColorMask: 0n,
    anyOfColorMask: 0n,
    minPixelCount: 0,
    maxPixelCount: 0,
    minColorCount: 0,
    maxColorCount: 0,
  }
  if (!raw) return empty
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      requiredTraitMask: toBig(parsed.requiredTraitMask),
      forbiddenTraitMask: toBig(parsed.forbiddenTraitMask),
      anyOfTraitMask: toBig(parsed.anyOfTraitMask),
      requiredColorMask: toBig(parsed.requiredColorMask),
      forbiddenColorMask: toBig(parsed.forbiddenColorMask),
      anyOfColorMask: toBig(parsed.anyOfColorMask),
      minPixelCount: toInt(parsed.minPixelCount),
      maxPixelCount: toInt(parsed.maxPixelCount),
      minColorCount: toInt(parsed.minColorCount),
      maxColorCount: toInt(parsed.maxColorCount),
    }
  } catch {
    return empty
  }
}

function toBig(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(value)
  if (typeof value === 'string' && value.length > 0) {
    try {
      return BigInt(value)
    } catch {
      return 0n
    }
  }
  return 0n
}

function toInt(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.length > 0) {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}
