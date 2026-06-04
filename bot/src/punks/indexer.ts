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
}

interface PunkRow {
  punk_id: string
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
      }
      pageInfo {
        hasNextPage
        endCursor
      }
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
        })
      }

      if (!events.pageInfo.hasNextPage || !events.pageInfo.endCursor) break
      after = events.pageInfo.endCursor
    }

    return sales
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
