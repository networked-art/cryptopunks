import type { Address, Hex } from 'viem'
import { queryIndexer, IndexerNotConfigured } from '~/utils/indexer'

export type ActivityKind =
  | 'assign'
  | 'transfer'
  | 'wrap'
  | 'unwrap'
  | 'listing'
  | 'listing_cancelled'
  | 'bid'
  | 'bid_adjusted'
  | 'bid_cancelled'
  | 'sale'
  | 'escrow_credit'
  | 'escrow_withdrawal'

export type ActivitySource =
  | 'cryptopunks_v1'
  | 'v1_wrapper'
  | 'punks_market'
  | string

const V1_ACTIVITY_SOURCES = ['cryptopunks_v1', 'v1_wrapper', 'punks_market']

export type ActivityEvent = {
  id: string
  kind: ActivityKind
  source: ActivitySource
  punkId?: number
  wrapped?: boolean
  from?: Address
  to?: Address
  amountWei?: bigint
  bidId?: bigint
  txHash: Hex
  blockNumber: bigint
  logIndex: number
  timestamp: number
}

type RawEvent = {
  id: string
  type: ActivityKind
  source: ActivitySource
  punk_id: string | null
  actor: string | null
  from: string | null
  to: string | null
  buyer: string | null
  seller: string | null
  bidder: string | null
  wei_amount: string | null
  listing_wei: string | null
  bid_wei: string | null
  bid_id: string | null
  tx_hash: string
  block_number: string
  log_index: number
  timestamp: string
}

const EVENTS_QUERY = `
  query Events($where: eventFilter, $limit: Int!, $after: String) {
    events(where: $where, orderBy: "timestamp", orderDirection: "desc", limit: $limit, after: $after) {
      items {
        id
        type
        source
        punk_id
        actor
        from
        to
        buyer
        seller
        bidder
        wei_amount
        listing_wei
        bid_wei
        bid_id
        tx_hash
        block_number
        log_index
        timestamp
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

export function useActivityFeed(
  opts: {
    punkId?: MaybeRefOrGetter<number | undefined>
    address?: MaybeRefOrGetter<Address | undefined>
    kinds?: MaybeRefOrGetter<ActivityKind[] | undefined>
    limit?: number
  } = {},
) {
  const pageSize = opts.limit ?? 50
  const events = ref<ActivityEvent[]>([])
  const pending = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const hasMore = ref(false)
  let cursor: string | null = null

  function buildWhere() {
    const where: Record<string, unknown> = {
      source_in: V1_ACTIVITY_SOURCES,
    }

    const punkId = toValue(opts.punkId)
    if (punkId !== undefined) where.punk_id = String(punkId)

    const kinds = toValue(opts.kinds)
    if (kinds && kinds.length) where.type_in = kinds

    // Hide 0-wei `listing` rows — the V1 contract's `offerPunkForSaleToAddress`
    // with minValue=0 is how punks get gifted/privately transferred, not a real
    // listing. Cancellations are kept (they carry no listing_wei).
    const hideZeroListings = {
      OR: [{ type_not_in: ['listing'] }, { listing_wei_gt: '0' }],
    }

    const address = toValue(opts.address)?.toLowerCase()
    if (address) {
      where.AND = [
        {
          OR: [
            { actor: address },
            { from: address },
            { to: address },
            { buyer: address },
            { seller: address },
            { bidder: address },
          ],
        },
        hideZeroListings,
      ]
    } else {
      where.OR = hideZeroListings.OR
    }

    return Object.keys(where).length ? where : undefined
  }

  async function fetchPage(after: string | null) {
    const data = await queryIndexer<{
      events: {
        items: RawEvent[]
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
      }
    }>(EVENTS_QUERY, {
      where: buildWhere(),
      limit: pageSize,
      after,
    })

    const mapped = data.events.items.map(mapEvent)

    return { mapped, pageInfo: data.events.pageInfo }
  }

  async function load() {
    pending.value = true
    error.value = null
    cursor = null
    try {
      const { mapped, pageInfo } = await fetchPage(null)
      events.value = mapped
      cursor = pageInfo.endCursor
      hasMore.value = pageInfo.hasNextPage
    } catch (e) {
      if (e instanceof IndexerNotConfigured) {
        error.value = 'No indexer configured.'
      } else {
        error.value = (e as Error).message
      }
      events.value = []
      hasMore.value = false
    } finally {
      pending.value = false
    }
  }

  async function loadMore() {
    if (loadingMore.value || !hasMore.value || !cursor) return
    loadingMore.value = true
    error.value = null
    try {
      const { mapped, pageInfo } = await fetchPage(cursor)
      events.value = [...events.value, ...mapped]
      cursor = pageInfo.endCursor
      hasMore.value = pageInfo.hasNextPage
    } catch (e) {
      if (e instanceof IndexerNotConfigured) {
        error.value = 'No indexer configured.'
      } else {
        error.value = (e as Error).message
      }
    } finally {
      loadingMore.value = false
    }
  }

  watchEffect(() => {
    void toValue(opts.punkId)
    void toValue(opts.address)
    void toValue(opts.kinds)
    load()
  })

  return {
    events,
    pending,
    loadingMore,
    error,
    hasMore,
    refresh: load,
    loadMore,
  }
}

function mapEvent(row: RawEvent): ActivityEvent {
  return {
    id: row.id,
    kind: row.type,
    source: row.source,
    punkId: row.punk_id != null ? Number(row.punk_id) : undefined,
    wrapped: isWrappedEvent(row),
    from: pickFrom(row),
    to: pickTo(row),
    amountWei: pickAmount(row),
    bidId: row.bid_id != null ? BigInt(row.bid_id) : undefined,
    txHash: row.tx_hash as Hex,
    blockNumber: BigInt(row.block_number),
    logIndex: row.log_index,
    timestamp: Number(row.timestamp),
  }
}

/// Tag rows that operate on the wrapped ERC-721. `wrap` / `unwrap` rows
/// already say so in their kind label, so we leave the tag off there to avoid
/// the dupe.
function isWrappedEvent(row: RawEvent): boolean {
  if (row.type === 'wrap' || row.type === 'unwrap') return false
  return row.source === 'v1_wrapper'
}

function pickFrom(row: RawEvent): Address | undefined {
  // Sales: prefer the explicit seller field; otherwise fall back to the
  // generic from / actor.
  if (row.type === 'sale')
    return (row.seller ?? row.from) as Address | undefined
  if (
    row.type === 'bid' ||
    row.type === 'bid_adjusted' ||
    row.type === 'bid_cancelled'
  ) {
    return (row.bidder ?? row.actor) as Address | undefined
  }
  if (row.type === 'listing' || row.type === 'listing_cancelled') {
    return (row.actor ?? row.from) as Address | undefined
  }
  return (row.from ?? row.actor) as Address | undefined
}

function pickTo(row: RawEvent): Address | undefined {
  if (row.type === 'sale') return (row.buyer ?? row.to) as Address | undefined
  return (row.to ?? undefined) as Address | undefined
}

function pickAmount(row: RawEvent): bigint | undefined {
  const raw = row.wei_amount ?? row.listing_wei ?? row.bid_wei
  return raw != null ? BigInt(raw) : undefined
}
