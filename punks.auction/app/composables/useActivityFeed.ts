import type { Address, Hex } from 'viem'
import { queryIndexer, IndexerNotConfigured } from '~/utils/indexer'

export type ActivityKind =
  | 'assign'
  | 'transfer'
  | 'stashed'
  | 'unstashed'
  | 'vaulted'
  | 'unvaulted'
  | 'wrap'
  | 'unwrap'
  | 'listing'
  | 'listing_cancelled'
  | 'bid'
  | 'bid_cancelled'
  | 'sale'
  | 'lot_created'
  | 'lot_cancelled'
  | 'lot_cleared'
  | 'lot_updated'
  | 'auction_started'
  | 'auction_settled'
  | 'offer_placed'
  | 'offer_cancelled'
  | 'offer_adjusted'
  | 'escrow_credit'
  | 'escrow_withdrawal'

export type KnownActivitySource =
  | 'cryptopunks_v2'
  | 'wrapped_punks'
  | 'cryptopunks_721'
  | 'punks_auction'

export type ActivitySource = string

// CryptoPunks (V2), its ERC-721 wrappers, and the PunksAuction stack. V1
// activity hangs off its own profile/punk pages — this feed covers normal
// CryptoPunks market activity plus the auction house.
const ACTIVITY_SOURCES = [
  'cryptopunks_v2',
  'wrapped_punks',
  'cryptopunks_721',
  'punks_auction',
] as const satisfies readonly KnownActivitySource[]

const WRAPPED_SOURCES = new Set<ActivitySource>([
  'wrapped_punks',
  'cryptopunks_721',
])

export type OfferKind = 'collection' | 'specific' | 'selection' | 'trait'

export type ActivityEvent = {
  id: string
  kind: ActivityKind
  source: ActivitySource
  punkId?: number
  wrapped?: boolean
  from?: Address
  to?: Address
  amountWei?: bigint
  offerKind?: OfferKind
  offerId?: bigint
  lotId?: bigint
  auctionId?: bigint
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
  offer_kind: OfferKind | null
  offer_id: string | null
  lot_id: string | null
  auction_id: string | null
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
        offer_kind
        offer_id
        lot_id
        auction_id
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

export type KindFilter = {
  kinds: readonly ActivityKind[]
  sources?: readonly KnownActivitySource[]
}

export function useActivityFeed(
  opts: {
    punkId?: MaybeRefOrGetter<number | undefined>
    punkIds?: MaybeRefOrGetter<readonly number[] | undefined>
    address?: MaybeRefOrGetter<Address | undefined>
    kindFilters?: MaybeRefOrGetter<KindFilter[] | undefined>
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

  // Bumped on every `load()`. Each in-flight fetch checks its token before
  // writing back, so a slow earlier request (e.g. the unscoped feed kicked
  // off before an ENS handle resolves) can't clobber a newer scoped one.
  let requestToken = 0

  function buildWhere(): Record<string, unknown> | null {
    const punkWhere = buildPunkWhere(
      toValue(opts.punkId),
      toValue(opts.punkIds),
    )
    if (!punkWhere) return null

    const and: Record<string, unknown>[] = [hideZeroListingsWhere()]
    const kindWhere = buildKindFilterWhere(toValue(opts.kindFilters))
    const addressWhere = buildAddressWhere(toValue(opts.address))

    if (kindWhere) and.push(kindWhere)
    if (addressWhere) and.push(addressWhere)

    return {
      source_in: ACTIVITY_SOURCES,
      ...punkWhere,
      AND: and,
    }
  }

  async function fetchPage(after: string | null) {
    const where = buildWhere()
    if (!where) {
      return {
        mapped: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      }
    }

    const data = await queryIndexer<{
      events: {
        items: RawEvent[]
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
      }
    }>(EVENTS_QUERY, {
      where,
      limit: pageSize,
      after,
    })

    return {
      mapped: data.events.items.map(mapEvent),
      pageInfo: data.events.pageInfo,
    }
  }

  async function load() {
    const token = ++requestToken
    pending.value = true
    error.value = null
    cursor = null
    try {
      const { mapped, pageInfo } = await fetchPage(null)
      if (token !== requestToken) return
      events.value = mapped
      cursor = pageInfo.endCursor
      hasMore.value = pageInfo.hasNextPage
    } catch (e) {
      if (token !== requestToken) return
      error.value =
        e instanceof IndexerNotConfigured
          ? 'No indexer configured.'
          : (e as Error).message
      events.value = []
      hasMore.value = false
    } finally {
      if (token === requestToken) pending.value = false
    }
  }

  async function loadMore() {
    if (loadingMore.value || !hasMore.value || !cursor) return
    const token = requestToken
    loadingMore.value = true
    error.value = null
    try {
      const { mapped, pageInfo } = await fetchPage(cursor)
      if (token !== requestToken) return
      events.value = [...events.value, ...mapped]
      cursor = pageInfo.endCursor
      hasMore.value = pageInfo.hasNextPage
    } catch (e) {
      if (token !== requestToken) return
      error.value =
        e instanceof IndexerNotConfigured
          ? 'No indexer configured.'
          : (e as Error).message
    } finally {
      loadingMore.value = false
    }
  }

  watchEffect(() => {
    void toValue(opts.punkId)
    void toValue(opts.punkIds)
    void toValue(opts.address)
    void toValue(opts.kindFilters)
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

function buildPunkWhere(
  punkId: number | undefined,
  punkIds: readonly number[] | undefined,
): Record<string, unknown> | null {
  const where: Record<string, unknown> = {}
  if (punkId !== undefined) {
    where.punk_id = String(punkId)
    return where
  }

  if (!punkIds) return where
  if (!punkIds.length) return null

  where.punk_id_in = [...new Set(punkIds)].map(String)
  return where
}

function hideZeroListingsWhere(): Record<string, unknown> {
  // Hide 0-wei `listing` rows — `offerPunkForSaleToAddress` with minValue=0
  // is how punks get gifted/privately transferred, not a real listing.
  // Cancellations are kept (they carry no listing_wei).
  return {
    OR: [{ type_not_in: ['listing'] }, { listing_wei_gt: '0' }],
  }
}

function buildKindFilterWhere(
  kindFilters: readonly KindFilter[] | undefined,
): Record<string, unknown> | undefined {
  if (!kindFilters?.length) return undefined

  return {
    // Ponder OR's the keys within each clause, so a clause that needs both
    // `type_in` and `source_in` has to be wrapped in an explicit AND.
    OR: kindFilters.map((filter) =>
      filter.sources
        ? { AND: [{ type_in: filter.kinds }, { source_in: filter.sources }] }
        : { type_in: filter.kinds },
    ),
  }
}

function buildAddressWhere(
  address: Address | undefined,
): Record<string, unknown> | undefined {
  const normalized = address?.toLowerCase()
  if (!normalized) return undefined

  return {
    OR: [
      { actor: normalized },
      { from: normalized },
      { to: normalized },
      { buyer: normalized },
      { seller: normalized },
      { bidder: normalized },
    ],
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
    offerKind: row.offer_kind ?? undefined,
    offerId: row.offer_id != null ? BigInt(row.offer_id) : undefined,
    lotId: row.lot_id != null ? BigInt(row.lot_id) : undefined,
    auctionId: row.auction_id != null ? BigInt(row.auction_id) : undefined,
    txHash: row.tx_hash as Hex,
    blockNumber: BigInt(row.block_number),
    logIndex: row.log_index,
    timestamp: Number(row.timestamp),
  }
}

/// Tag rows that operate on a wrapped ERC-721 Punk. `wrap` / `unwrap` rows
/// already say so in their kind label, so the tag is left off there.
function isWrappedEvent(row: RawEvent): boolean {
  if (row.type === 'wrap' || row.type === 'unwrap') return false
  return WRAPPED_SOURCES.has(row.source)
}

function pickFrom(row: RawEvent): Address | undefined {
  if (row.type === 'sale')
    return (row.seller ?? row.from) as Address | undefined
  if (
    row.type === 'bid' ||
    row.type === 'bid_cancelled' ||
    row.type === 'offer_placed' ||
    row.type === 'offer_cancelled' ||
    row.type === 'offer_adjusted'
  )
    return (row.bidder ?? row.actor) as Address | undefined
  if (
    row.type === 'listing' ||
    row.type === 'listing_cancelled' ||
    row.type === 'lot_created' ||
    row.type === 'lot_cancelled' ||
    row.type === 'lot_cleared' ||
    row.type === 'lot_updated' ||
    row.type === 'auction_started'
  )
    return (row.seller ?? row.actor ?? row.from) as Address | undefined
  if (row.type === 'auction_settled')
    return (row.seller ?? row.from) as Address | undefined
  return (row.from ?? row.actor) as Address | undefined
}

function pickTo(row: RawEvent): Address | undefined {
  if (row.type === 'sale' || row.type === 'auction_settled')
    return (row.buyer ?? row.to) as Address | undefined
  return (row.to ?? undefined) as Address | undefined
}

function pickAmount(row: RawEvent): bigint | undefined {
  const raw = row.wei_amount ?? row.listing_wei
  return raw != null ? BigInt(raw) : undefined
}
