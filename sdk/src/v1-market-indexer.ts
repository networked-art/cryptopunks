import type { Address, Hex } from 'viem'
import { getAddress } from 'viem'
import type { PunksFilter } from './query'
import { PunksDataSdkError, PunksDataValidationError } from './utils'
import { PunksV1MarketClient } from './v1-market'

// Bid as returned by the indexer's V1 market Hono routes. All bigints are
// strings on the wire; consumers should convert to `bigint` when needed
// (or use `MarketBid`, which has bigints already coerced).
export type IndexerMarketBidWire = {
  bidId: string
  bidder: Address
  bidWei: string
  settlementWei: string
  active: boolean
  acceptedPunkId: string | null
  criteria: {
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
  includeIds: number[]
  excludeIds: number[]
  txHash: Hex
  blockNumber: string
  logIndex: number
  timestamp: string
  updatedAt: string
}

// Bid hydrated for SDK consumers — bigints decoded, addresses checksummed.
export type MarketBid = {
  bidId: bigint
  bidder: Address
  bidWei: bigint
  settlementWei: bigint
  active: boolean
  acceptedPunkId: bigint | null
  criteria: PunksFilter
  includeIds: number[]
  excludeIds: number[]
  txHash: Hex
  blockNumber: bigint
  logIndex: number
  timestamp: bigint
  updatedAt: bigint
}

export type BidSort =
  | 'bid_wei-desc'
  | 'bid_wei-asc'
  | 'timestamp-desc'
  | 'timestamp-asc'
  | 'bid_id-desc'
  | 'bid_id-asc'

export type BidsQuery = {
  active?: boolean
  bidder?: Address
  limit?: number
  offset?: number
  sort?: BidSort
}

export type BidsListResponse = {
  items: MarketBid[]
  total: number
  limit: number
  offset: number
}

export type PaginatedBidsResponse = {
  items: MarketBid[]
  limit: number
  offset: number
}

export type PunksV1MarketIndexerConfig = {
  /// Base URL of the indexer HTTP API. Bids routes are mounted at
  /// `${baseUrl}/bids`.
  baseUrl: string
  /// Optional fetch implementation override (e.g., for Node < 18 or tests).
  fetch?: typeof fetch
  /// Optional default request headers (auth tokens, etc.).
  headers?: Record<string, string>
}

export class PunksV1MarketIndexerClient {
  readonly baseUrl: string
  private readonly fetcher: typeof fetch
  private readonly headers: Record<string, string>

  constructor(config: PunksV1MarketIndexerConfig) {
    if (!config.baseUrl) {
      throw new PunksDataValidationError('baseUrl is required')
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.fetcher = config.fetch ?? globalThis.fetch
    this.headers = config.headers ?? {}
    if (typeof this.fetcher !== 'function') {
      throw new PunksDataValidationError(
        'fetch is not available; pass config.fetch',
      )
    }
  }

  async bids(query: BidsQuery = {}): Promise<BidsListResponse> {
    const params = new URLSearchParams()
    if (query.active !== undefined) params.set('active', String(query.active))
    if (query.bidder !== undefined) params.set('bidder', query.bidder)
    if (query.limit !== undefined) params.set('limit', String(query.limit))
    if (query.offset !== undefined) params.set('offset', String(query.offset))
    if (query.sort !== undefined) params.set('sort', query.sort)
    const json = await this.get<{
      items: IndexerMarketBidWire[]
      total: number
      limit: number
      offset: number
    }>(`/bids${params.size > 0 ? `?${params.toString()}` : ''}`)
    return {
      items: json.items.map(parseBid),
      total: json.total,
      limit: json.limit,
      offset: json.offset,
    }
  }

  async bid(bidId: bigint | number): Promise<MarketBid | null> {
    const id = BigInt(bidId).toString()
    const res = await this.fetchRaw(`/bids/${id}`)
    if (res.status === 404) return null
    if (!res.ok) throw await indexerError(res, `/bids/${id}`)
    const json = (await res.json()) as IndexerMarketBidWire
    return parseBid(json)
  }

  async bidsMatchingPunk(
    punkId: number,
    options: { limit?: number; offset?: number } = {},
  ): Promise<PaginatedBidsResponse> {
    return this.bidsMatchingScoped('punk', BigInt(punkId).toString(), options)
  }

  async bidsMatchingTrait(
    traitId: number,
    options: { limit?: number; offset?: number } = {},
  ): Promise<PaginatedBidsResponse> {
    return this.bidsMatchingScoped('trait', String(traitId), options)
  }

  async bidsMatchingColor(
    colorId: number,
    options: { limit?: number; offset?: number } = {},
  ): Promise<PaginatedBidsResponse> {
    return this.bidsMatchingScoped('color', String(colorId), options)
  }

  private async bidsMatchingScoped(
    scope: 'punk' | 'trait' | 'color',
    id: string,
    options: { limit?: number; offset?: number },
  ): Promise<PaginatedBidsResponse> {
    const params = new URLSearchParams()
    if (options.limit !== undefined) params.set('limit', String(options.limit))
    if (options.offset !== undefined)
      params.set('offset', String(options.offset))
    const json = await this.get<{
      items: IndexerMarketBidWire[]
      limit: number
      offset: number
    }>(
      `/bids/matching/${scope}/${id}${params.size > 0 ? `?${params.toString()}` : ''}`,
    )
    return {
      items: json.items.map(parseBid),
      limit: json.limit,
      offset: json.offset,
    }
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchRaw(path)
    if (!res.ok) throw await indexerError(res, path)
    return res.json() as Promise<T>
  }

  private async fetchRaw(path: string): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    return this.fetcher(url, {
      method: 'GET',
      headers: { accept: 'application/json', ...this.headers },
    })
  }
}

/// Composes the contract and indexer clients. The unified API prefers the
/// indexer (richer, faster for filter-shaped queries) and falls back to the
/// contract for endpoints that exist there (per-punk matching).
export type PunksV1MarketFacadeConfig = {
  contract: PunksV1MarketClient
  indexer?: PunksV1MarketIndexerClient
}

export class PunksV1MarketFacade {
  readonly contract: PunksV1MarketClient
  readonly indexer?: PunksV1MarketIndexerClient

  constructor(config: PunksV1MarketFacadeConfig) {
    this.contract = config.contract
    this.indexer = config.indexer
  }

  /// Hydrated list of active bids accepting `punkId`. Uses the indexer when
  /// configured; otherwise enumerates the on-chain cursor and hydrates per id
  /// (slower).
  async bidsMatchingPunk(
    punkId: number,
    options: { limit?: number; offset?: number; pageSize?: number } = {},
  ): Promise<MarketBid[]> {
    if (this.indexer) {
      const page = await this.indexer.bidsMatchingPunk(punkId, {
        limit: options.limit,
        offset: options.offset,
      })
      return page.items
    }
    const ids = await this.contract.findBidsMatchingPunk(punkId, {
      pageSize: options.pageSize,
    })
    const bids = await Promise.all(ids.map((id) => this.contract.bid(id)))
    return bids
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .map(contractBidToFacadeBid)
  }

  /// Per-trait matching is indexer-only — the chain has no view for it.
  async bidsMatchingTrait(
    traitId: number,
    options: { limit?: number; offset?: number } = {},
  ): Promise<MarketBid[]> {
    this.requireIndexer('bidsMatchingTrait')
    const page = await this.indexer!.bidsMatchingTrait(traitId, options)
    return page.items
  }

  /// Per-color matching is indexer-only.
  async bidsMatchingColor(
    colorId: number,
    options: { limit?: number; offset?: number } = {},
  ): Promise<MarketBid[]> {
    this.requireIndexer('bidsMatchingColor')
    const page = await this.indexer!.bidsMatchingColor(colorId, options)
    return page.items
  }

  /// Global list — indexer-only (the chain has no global enumerator).
  async bids(query: BidsQuery = {}): Promise<BidsListResponse> {
    this.requireIndexer('bids')
    return this.indexer!.bids(query)
  }

  /// Single bid by id. Prefers the indexer (one HTTP roundtrip), falls back
  /// to the contract (four parallel RPC calls).
  async bid(bidId: bigint | number): Promise<MarketBid | null> {
    if (this.indexer) return this.indexer.bid(bidId)
    const contractBid = await this.contract.bid(bidId)
    return contractBid ? contractBidToFacadeBid(contractBid) : null
  }

  private requireIndexer(method: string): void {
    if (!this.indexer) {
      throw new PunksDataValidationError(
        `${method} requires an indexer client; pass one to PunksV1MarketFacade`,
      )
    }
  }
}

function parseBid(wire: IndexerMarketBidWire): MarketBid {
  return {
    bidId: BigInt(wire.bidId),
    bidder: getAddress(wire.bidder),
    bidWei: BigInt(wire.bidWei),
    settlementWei: BigInt(wire.settlementWei),
    active: wire.active,
    acceptedPunkId:
      wire.acceptedPunkId == null ? null : BigInt(wire.acceptedPunkId),
    criteria: {
      requiredTraitMask: BigInt(wire.criteria.requiredTraitMask),
      forbiddenTraitMask: BigInt(wire.criteria.forbiddenTraitMask),
      anyOfTraitMask: BigInt(wire.criteria.anyOfTraitMask),
      requiredColorMask: BigInt(wire.criteria.requiredColorMask),
      forbiddenColorMask: BigInt(wire.criteria.forbiddenColorMask),
      anyOfColorMask: BigInt(wire.criteria.anyOfColorMask),
      minPixelCount: wire.criteria.minPixelCount,
      maxPixelCount: wire.criteria.maxPixelCount,
      minColorCount: wire.criteria.minColorCount,
      maxColorCount: wire.criteria.maxColorCount,
    },
    includeIds: [...wire.includeIds],
    excludeIds: [...wire.excludeIds],
    txHash: wire.txHash,
    blockNumber: BigInt(wire.blockNumber),
    logIndex: wire.logIndex,
    timestamp: BigInt(wire.timestamp),
    updatedAt: BigInt(wire.updatedAt),
  }
}

function contractBidToFacadeBid(b: {
  bidId: bigint
  bidder: Address
  bidWei: bigint
  settlementWei: bigint
  criteria: PunksFilter
  includeIds: number[]
  excludeIds: number[]
}): MarketBid {
  return {
    bidId: b.bidId,
    bidder: b.bidder,
    bidWei: b.bidWei,
    settlementWei: b.settlementWei,
    active: true,
    acceptedPunkId: null,
    criteria: b.criteria,
    includeIds: b.includeIds,
    excludeIds: b.excludeIds,
    // Contract-fetched bids lack indexer metadata; surface neutral defaults.
    txHash: '0x',
    blockNumber: 0n,
    logIndex: 0,
    timestamp: 0n,
    updatedAt: 0n,
  }
}

async function indexerError(res: Response, path: string): Promise<Error> {
  let body: string
  try {
    body = await res.text()
  } catch {
    body = ''
  }
  return new PunksDataSdkError(
    `Indexer request failed (${res.status}) at ${path}${body ? `: ${body}` : ''}`,
  )
}
