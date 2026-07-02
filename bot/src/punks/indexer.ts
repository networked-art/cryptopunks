import type { Address } from 'viem'

/// A purchase pulled from the indexer's activity feed: one punk changing hands
/// for ETH. Auction deliveries, marketplace buys and V1/V2 sales all surface
/// here as `type: 'sale'`, with the new owner in `buyer`.
export interface PunkSale {
  punkId: number
  buyer: Address
  weiAmount: bigint
  usdCents: bigint | null
  timestamp: number
  source: string
  txHash: string
  logIndex: number
  /// Set on punks.auction settlement deliveries, null elsewhere.
  auctionId: string | null
}

/// One token in an auction lot. The same punk id can appear twice — once as
/// the V2 token and once as its V1 counterpart — so items carry their standard
/// instead of being collapsed to ids.
export interface LotItem {
  punkId: number
  v1: boolean
}

/// A punks.auction lifecycle event: a lot getting listed (`lot_created`), the
/// first bid making it a live auction (`auction_started`) or a further bid
/// landing (`bid`). Ids stay strings — they're only used for URLs and lookups.
/// Which fields are set depends on the type: listings carry `lotId`,
/// `listingWei` and `onlySellTo`; auction/bid rows carry `auctionId`; only
/// bids carry `bidder`/`bidWei`.
export interface AuctionActivity {
  type: 'lot_created' | 'auction_started' | 'bid'
  txHash: string
  auctionId: string | null
  lotId: string | null
  seller: Address | null
  bidder: Address | null
  bidWei: bigint | null
  listingWei: bigint | null
  onlySellTo: string | null
  usdCents: bigint | null
  timestamp: number
}

interface Connection<T> {
  items: T[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

interface SaleRow {
  punk_id: string | null
  buyer: string | null
  wei_amount: string | null
  usd_value_cents: string | null
  timestamp: string
  source: string
  tx_hash: string
  log_index: string
  auction_id: string | null
}

interface PunkRow {
  punk_id: string
}

interface AuctionRow {
  type: string
  tx_hash: string
  auction_id: string | null
  lot_id: string | null
  seller: string | null
  bidder: string | null
  bid_wei: string | null
  listing_wei: string | null
  only_sell_to: string | null
  usd_value_cents: string | null
  timestamp: string
}

const SALES_QUERY = `
  query Sales($where: eventFilter, $limit: Int!, $after: String) {
    events(
      where: $where
      orderBy: "timestamp"
      orderDirection: "asc"
      limit: $limit
      after: $after
    ) {
      items {
        punk_id
        buyer
        wei_amount
        usd_value_cents
        timestamp
        source
        tx_hash
        log_index
        auction_id
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

const AUCTION_ACTIVITY_QUERY = `
  query AuctionActivity($where: eventFilter, $limit: Int!, $after: String) {
    events(
      where: $where
      orderBy: "timestamp"
      orderDirection: "asc"
      limit: $limit
      after: $after
    ) {
      items {
        type
        tx_hash
        auction_id
        lot_id
        seller
        bidder
        bid_wei
        listing_wei
        only_sell_to
        usd_value_cents
        timestamp
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

const LOT_ITEMS_QUERY = `
  query LotItems($lotId: BigInt!) {
    auctionLotItems(
      where: { lot_id: $lotId }
      orderBy: "item_index"
      orderDirection: "asc"
      limit: 100
    ) {
      items { punk_id standard }
    }
  }
`

const AUCTION_LOT_QUERY = `
  query AuctionLot($auctionId: BigInt!) {
    auctionAuctions(where: { auction_id: $auctionId }) {
      items { lot_id }
    }
  }
`

const PUNKS_QUERY = `
  query OwnedPunks($addrs: [String!]!, $limit: Int!, $after: String) {
    punks(
      where: { owner_in: $addrs }
      orderBy: "punk_id"
      orderDirection: "asc"
      limit: $limit
      after: $after
    ) {
      items { punk_id }
      pageInfo { hasNextPage endCursor }
    }
  }
`

// Canonical (V2) event sources — the same set the punks.auction activity feed
// uses. Excludes the V1-native markets (cryptopunks_v1, v1_wrapper, punks_market).
const CANONICAL_SOURCES = [
  'cryptopunks_v2',
  'wrapped_punks',
  'cryptopunks_721',
  'punks_auction',
]

const SALES_PAGE_SIZE = 100
const HOLDINGS_PAGE_SIZE = 1000

/// Client for the deployed Ponder indexer. The bot reads three things: the
/// canonical (V2) sales feed (what just got bought), an account's canonical
/// holdings (the grid), and an address's ENS name (the caption).
export class PunksIndexer {
  constructor(
    private readonly url: string,
    /// Caps sales fetched per tick. Because the feed is read oldest-first and
    /// the cursor advances to the newest row returned, a cap just spreads a
    /// large backlog across ticks — it never skips sales.
    private readonly maxSalesPerTick = 300,
  ) {}

  /// Sales with `timestamp` strictly greater than `since` (a unix timestamp),
  /// oldest first.
  async salesSince(since: number): Promise<PunkSale[]> {
    const where = {
      type_in: ['sale'],
      source_in: CANONICAL_SOURCES,
      timestamp_gt: String(since),
    }
    const sales: PunkSale[] = []
    let after: string | null = null

    while (sales.length < this.maxSalesPerTick) {
      const result: { events: Connection<SaleRow> } = await this.request(
        SALES_QUERY,
        {
          where,
          limit: SALES_PAGE_SIZE,
          after,
        },
      )
      const events = result.events

      for (const row of events.items) {
        if (row.punk_id === null || row.buyer === null) continue
        sales.push({
          punkId: Number(row.punk_id),
          buyer: row.buyer.toLowerCase() as Address,
          weiAmount: row.wei_amount ? BigInt(row.wei_amount) : 0n,
          usdCents: row.usd_value_cents ? BigInt(row.usd_value_cents) : null,
          timestamp: Number(row.timestamp),
          source: row.source,
          txHash: row.tx_hash,
          logIndex: Number(row.log_index),
          auctionId: row.auction_id,
        })
      }

      if (!events.pageInfo.hasNextPage || !events.pageInfo.endCursor) break
      after = events.pageInfo.endCursor
    }

    return sales
  }

  /// Auction lifecycle events (lot listings, lots going live and bids) with
  /// `timestamp` strictly greater than `since`, oldest first. Same
  /// cap-as-backpressure behavior as `salesSince`.
  async auctionActivitySince(since: number): Promise<AuctionActivity[]> {
    const where = {
      type_in: ['lot_created', 'auction_started', 'bid'],
      source_in: ['punks_auction'],
      timestamp_gt: String(since),
    }
    const activity: AuctionActivity[] = []
    let after: string | null = null

    while (activity.length < this.maxSalesPerTick) {
      const result: { events: Connection<AuctionRow> } = await this.request(
        AUCTION_ACTIVITY_QUERY,
        { where, limit: SALES_PAGE_SIZE, after },
      )
      const events = result.events

      for (const row of events.items) {
        if (
          row.type !== 'lot_created' &&
          row.type !== 'auction_started' &&
          row.type !== 'bid'
        ) {
          continue
        }
        activity.push({
          type: row.type,
          txHash: row.tx_hash,
          auctionId: row.auction_id,
          lotId: row.lot_id,
          seller: row.seller ? (row.seller.toLowerCase() as Address) : null,
          bidder: row.bidder ? (row.bidder.toLowerCase() as Address) : null,
          bidWei: row.bid_wei ? BigInt(row.bid_wei) : null,
          listingWei: row.listing_wei ? BigInt(row.listing_wei) : null,
          onlySellTo: row.only_sell_to,
          usdCents: row.usd_value_cents ? BigInt(row.usd_value_cents) : null,
          timestamp: Number(row.timestamp),
        })
      }

      if (!events.pageInfo.hasNextPage || !events.pageInfo.endCursor) break
      after = events.pageInfo.endCursor
    }

    return activity
  }

  /// The tokens in an auction lot, in the lot's own order.
  async lotItems(lotId: string): Promise<LotItem[]> {
    const data: {
      auctionLotItems: { items: { punk_id: string; standard: string }[] }
    } = await this.request(LOT_ITEMS_QUERY, { lotId })
    return data.auctionLotItems.items.map((row) => ({
      punkId: Number(row.punk_id),
      v1: row.standard === 'cryptopunks_v1',
    }))
  }

  /// The lot behind an auction, or null if the auction is unknown.
  async auctionLotId(auctionId: string): Promise<string | null> {
    const data: { auctionAuctions: { items: { lot_id: string }[] } } =
      await this.request(AUCTION_LOT_QUERY, { auctionId })
    return data.auctionAuctions.items[0]?.lot_id ?? null
  }

  /// Every canonical (V2) punk id held across the given addresses. V1 holdings
  /// are intentionally not queried — this bot is canonical-only.
  async ownedPunks(addresses: Address[]): Promise<number[]> {
    const addrs = addresses.map((address) => address.toLowerCase())
    const ids = await this.allPunkIds(addrs)
    return [...new Set(ids)].sort((a, b) => a - b)
  }

  /// The ENS name for an address from the indexer's profiles API, or null.
  async ensName(address: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.url}/profiles/${address}`)
      if (!response.ok) return null
      const json = (await response.json()) as { ens?: string | null }
      return json.ens ?? null
    } catch {
      return null
    }
  }

  private async allPunkIds(addrs: string[]): Promise<number[]> {
    const ids: number[] = []
    let after: string | null = null

    do {
      const data: { punks: Connection<PunkRow> } = await this.request(
        PUNKS_QUERY,
        { addrs, limit: HOLDINGS_PAGE_SIZE, after },
      )
      const page = data.punks
      for (const row of page.items) ids.push(Number(row.punk_id))
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
    } while (after)

    return ids
  }

  private async request<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (!response.ok) throw new Error(`Indexer responded ${response.status}`)

    const json = (await response.json()) as {
      data?: T
      errors?: { message: string }[]
    }
    if (json.errors?.length) {
      throw new Error(json.errors.map((error) => error.message).join('; '))
    }
    if (!json.data) throw new Error('Indexer returned no data')
    return json.data
  }
}
