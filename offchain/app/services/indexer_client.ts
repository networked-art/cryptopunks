import env from '#start/env'
import { HttpError } from '#exceptions/http_error'

/**
 * Event kinds emitted by the in-repo Ponder indexer for CryptoPunks markets
 * and the punks-auction stack. Names mirror
 * `punks.auction/app/composables/useActivityFeed.ts`.
 */
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

export type ActivitySource =
  | 'cryptopunks_v2'
  | 'wrapped_punks'
  | 'cryptopunks_721'
  | 'punks_auction'

export type IndexerEvent = {
  id: string
  type: ActivityKind
  source: ActivitySource
  punkId: number | null
  actor: string | null
  from: string | null
  to: string | null
  buyer: string | null
  seller: string | null
  bidder: string | null
  weiAmount: bigint | null
  listingWei: bigint | null
  txHash: string
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
  tx_hash: string
  block_number: string
  log_index: number
  timestamp: string
}

const EVENTS_QUERY = `
  query Events($where: eventFilter, $limit: Int!, $after: String) {
    events(where: $where, orderBy: "timestamp", orderDirection: "asc", limit: $limit, after: $after) {
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

export class IndexerNotConfigured extends Error {
  constructor() {
    super('INDEXER_GRAPHQL_URL is not configured')
    this.name = 'IndexerNotConfigured'
  }
}

export type FetchEventsArgs = {
  kinds: ActivityKind[]
  sources: ActivitySource[]
  afterBlockNumber: bigint
  limit?: number
  cursor?: string | null
}

export type FetchEventsResult = {
  events: IndexerEvent[]
  hasNextPage: boolean
  endCursor: string | null
}

export async function fetchEvents(args: FetchEventsArgs): Promise<FetchEventsResult> {
  const url = env.get('INDEXER_GRAPHQL_URL')
  if (!url) throw new IndexerNotConfigured()

  const where: Record<string, unknown> = {}
  if (args.kinds.length > 0) where.type_in = args.kinds
  if (args.sources.length > 0) where.source_in = args.sources
  if (args.afterBlockNumber > 0n) where.block_number_gt = args.afterBlockNumber.toString()

  const variables = { where, limit: args.limit ?? 100, after: args.cursor ?? null }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: EVENTS_QUERY, variables }),
  })
  if (!response.ok) {
    throw new HttpError(response.status, `Indexer request failed: ${response.statusText}`)
  }
  const body = (await response.json()) as {
    data?: { events: { items: RawEvent[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }
    errors?: Array<{ message: string }>
  }
  if (body.errors?.length) {
    throw new HttpError(502, `Indexer error: ${body.errors.map((e) => e.message).join('; ')}`)
  }
  const data = body.data?.events
  if (!data) throw new HttpError(502, 'Indexer returned no data')

  return {
    events: data.items.map(mapEvent),
    hasNextPage: data.pageInfo.hasNextPage,
    endCursor: data.pageInfo.endCursor,
  }
}

function mapEvent(row: RawEvent): IndexerEvent {
  return {
    id: row.id,
    type: row.type,
    source: row.source,
    punkId: row.punk_id != null ? Number(row.punk_id) : null,
    actor: row.actor,
    from: row.from,
    to: row.to,
    buyer: row.buyer,
    seller: row.seller,
    bidder: row.bidder,
    weiAmount: row.wei_amount != null ? BigInt(row.wei_amount) : null,
    listingWei: row.listing_wei != null ? BigInt(row.listing_wei) : null,
    txHash: row.tx_hash,
    blockNumber: BigInt(row.block_number),
    logIndex: row.log_index,
    timestamp: Number(row.timestamp),
  }
}
