import type { Address } from 'viem'
import type { Source } from '../core'
import { PunksIndexer, type LotItem, type PunkSale } from './indexer'

/// What a single account bought in one tick, plus the collection it now sits
/// on. The renderer turns this into a grid: every `owned` punk at base scale,
/// the `acquired` ones blown up to 2×.
export interface Acquisition {
  account: Address
  /// Punk ids acquired in this batch (deduped, ascending). Rendered at 2×.
  acquired: number[]
  /// Every punk id the account currently holds, including `acquired`.
  owned: number[]
  /// Total spent across `acquired` this batch.
  spentWei: bigint
  /// USD total, or null if any sale lacked a USD price.
  spentUsdCents: bigint | null
  /// True when this batch is the account's entire collection — a debut.
  newCollector: boolean
}

/// Cursor is the unix timestamp of the newest sale already handled.
export type PunksCursor = { timestamp: number }

export interface PunksSourceOptions {
  /// Unix timestamp (seconds) to begin from on the very first run, instead of
  /// "now". Lets a fresh deploy backfill recent sales (e.g. the last few days)
  /// rather than only reacting to future activity. Ignored once a cursor is
  /// stored, so it's a one-time seed.
  startTimestamp?: number
}

/// Watches the indexer's sales feed and turns it into per-buyer acquisitions —
/// the punk analogue of the EVM bot's "group sales by buyer" step.
export class PunksSource implements Source<PunksCursor, Acquisition> {
  readonly name = 'punk-sales'

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
  ): Promise<{ subjects: Acquisition[]; cursor: PunksCursor }> {
    const sales = await this.indexer.salesSince(cursor.timestamp)
    if (sales.length === 0) return { subjects: [], cursor }

    const byBuyer = groupByBuyer(await this.dropV1Deliveries(sales))
    const subjects = await Promise.all(
      [...byBuyer].map(([buyer, buyerSales]) =>
        this.buildAcquisition(buyer as Address, buyerSales),
      ),
    )

    // Advance only as far as the sales we actually pulled; the next tick
    // continues from here (the feed is read oldest-first).
    const newest = Math.max(...sales.map((sale) => sale.timestamp))
    return { subjects, cursor: { timestamp: newest } }
  }

  /// Auction settlements deliver every lot token as its own `sale` row, V1
  /// tokens included — this bot is canonical-only, so those are dropped. The
  /// feed doesn't carry the token standard, but deliveries land in lot order,
  /// so per punk id the rows line up with the lot's items.
  private async dropV1Deliveries(sales: PunkSale[]): Promise<PunkSale[]> {
    const byPunk = new Map<string, PunkSale[]>()
    for (const sale of sales) {
      if (sale.source !== 'punks_auction' || sale.auctionId === null) continue
      const key = `${sale.txHash}:${sale.punkId}`
      const existing = byPunk.get(key)
      if (existing) existing.push(sale)
      else byPunk.set(key, [sale])
    }
    if (byPunk.size === 0) return sales

    const lots = new Map<string, LotItem[]>()
    const dropped = new Set<PunkSale>()
    for (const group of byPunk.values()) {
      const { auctionId, punkId } = group[0]
      let items = lots.get(auctionId as string)
      if (!items) {
        const lotId = await this.indexer.auctionLotId(auctionId as string)
        items = lotId ? await this.indexer.lotItems(lotId) : []
        lots.set(auctionId as string, items)
      }

      const punkItems = items.filter((item) => item.punkId === punkId)
      if (!punkItems.some((item) => item.v1)) continue
      group.sort((a, b) => a.logIndex - b.logIndex)
      group.forEach((sale, index) => {
        if (punkItems[index]?.v1) dropped.add(sale)
      })
    }

    return sales.filter((sale) => !dropped.has(sale))
  }

  private async buildAcquisition(
    account: Address,
    sales: PunkSale[],
  ): Promise<Acquisition> {
    const acquired = [...new Set(sales.map((sale) => sale.punkId))].sort(
      (a, b) => a - b,
    )

    const owned = new Set(await this.indexer.ownedPunks([account]))
    // Force-include just-bought punks even if they were flipped back out before
    // the holdings read landed — the post is about this acquisition.
    for (const id of acquired) owned.add(id)
    const ownedAll = [...owned].sort((a, b) => a - b)

    const spentWei = sales.reduce((total, sale) => total + sale.weiAmount, 0n)
    const hasUsd = sales.every((sale) => sale.usdCents !== null)
    const spentUsdCents = hasUsd
      ? sales.reduce((total, sale) => total + (sale.usdCents ?? 0n), 0n)
      : null

    return {
      account,
      acquired,
      owned: ownedAll,
      spentWei,
      spentUsdCents,
      newCollector: acquired.length === ownedAll.length,
    }
  }
}

function groupByBuyer(sales: PunkSale[]): Map<string, PunkSale[]> {
  const groups = new Map<string, PunkSale[]>()
  for (const sale of sales) {
    const key = sale.buyer.toLowerCase()
    const existing = groups.get(key)
    if (existing) existing.push(sale)
    else groups.set(key, [sale])
  }
  return groups
}
