import type { Address } from 'viem'
import type { Source } from '../core'
import { PunksIndexer, type AuctionActivity, type LotItem } from './indexer'
import type { PunksCursor, PunksSourceOptions } from './source'

/// A seller listing a lot on punks.auction — up for auction, but not live
/// until someone places the first bid.
export interface LotListed {
  kind: 'listed'
  lotId: string
  seller: Address
  /// The lot's tokens, in lot order — the same punk can appear as both its V1
  /// and V2 token. Empty when the lot lookup missed; the renderer then posts
  /// without listing punks.
  items: LotItem[]
  reserveWei: bigint | null
  reserveUsdCents: bigint | null
}

/// A lot becoming a live auction. That happens when the first bid lands, so
/// the event belongs to the bidder — the bid arrives in the same transaction
/// and is folded in here rather than posted separately.
export interface AuctionOpened {
  kind: 'opened'
  auctionId: string
  /// Null only if the opening bid ended up in a different pull — see `pull`.
  bidder: Address | null
  items: LotItem[]
  openingBidWei: bigint | null
  openingBidUsdCents: bigint | null
}

/// A bid on a running auction.
export interface BidPlaced {
  kind: 'bid'
  auctionId: string
  bidder: Address
  bidWei: bigint
  usdCents: bigint | null
  items: LotItem[]
}

export type AuctionEvent = LotListed | AuctionOpened | BidPlaced

/// Watches punks.auction lifecycle events — lot listings, auctions going live
/// and every bid — the sibling of PunksSource's sales feed.
export class AuctionSource implements Source<PunksCursor, AuctionEvent> {
  readonly name = 'punk-auctions'

  constructor(
    private readonly indexer: PunksIndexer,
    private readonly options: PunksSourceOptions = {},
  ) {}

  async start(): Promise<PunksCursor> {
    return {
      timestamp: this.options.startTimestamp ?? Math.floor(Date.now() / 1000),
    }
  }

  async pull(
    cursor: PunksCursor,
  ): Promise<{ subjects: AuctionEvent[]; cursor: PunksCursor }> {
    const rows = await this.indexer.auctionActivitySince(cursor.timestamp)
    if (rows.length === 0) return { subjects: [], cursor }

    // The opening bid shares its transaction with the auction_started event;
    // match by tx hash so it enriches the "opened" post instead of doubling as
    // a bid post. If the per-tick cap ever splits the pair across pulls, the
    // opening bid just posts as an ordinary bid — harmless.
    const opened = new Map(
      rows
        .filter((row) => row.type === 'auction_started')
        .map((row) => [row.txHash, row]),
    )

    const lots = new Map<string, LotItem[]>()
    const subjects: AuctionEvent[] = []
    for (const row of rows) {
      if (row.type === 'lot_created') {
        // A lot reserved for a single buyer isn't a public listing — nobody
        // else can act on it, so there's nothing to announce.
        if (!row.seller || !row.lotId || row.onlySellTo) continue
        subjects.push({
          kind: 'listed',
          lotId: row.lotId,
          seller: row.seller,
          items: await this.items(row, lots),
          reserveWei: row.listingWei,
          reserveUsdCents: row.usdCents,
        })
      } else if (row.type === 'auction_started') {
        if (!row.auctionId) continue
        const openingBid = rows.find(
          (bid) => bid.type === 'bid' && bid.txHash === row.txHash,
        )
        subjects.push({
          kind: 'opened',
          auctionId: row.auctionId,
          bidder: openingBid?.bidder ?? null,
          items: await this.items(row, lots),
          openingBidWei: openingBid?.bidWei ?? null,
          openingBidUsdCents: openingBid?.usdCents ?? null,
        })
      } else {
        if (
          !row.auctionId ||
          !row.bidder ||
          row.bidWei === null ||
          opened.has(row.txHash)
        ) {
          continue
        }
        subjects.push({
          kind: 'bid',
          auctionId: row.auctionId,
          bidder: row.bidder,
          bidWei: row.bidWei,
          usdCents: row.usdCents,
          items: await this.items(row, lots),
        })
      }
    }

    const newest = Math.max(...rows.map((row) => row.timestamp))
    return { subjects, cursor: { timestamp: newest } }
  }

  /// The tokens in the event's lot, memoized per pull — a lot's listing,
  /// opening and bid war are many rows against the same tokens. Bid rows don't
  /// carry the lot id, so they resolve it through the auction first.
  private async items(
    row: AuctionActivity,
    cache: Map<string, LotItem[]>,
  ): Promise<LotItem[]> {
    const lotId =
      row.lotId ??
      (row.auctionId ? await this.indexer.auctionLotId(row.auctionId) : null)
    if (lotId === null) return []

    const cached = cache.get(lotId)
    if (cached) return cached

    const items = await this.indexer.lotItems(lotId)
    cache.set(lotId, items)
    return items
  }
}
