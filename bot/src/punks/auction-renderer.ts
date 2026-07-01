import type { Post, Renderer } from '../core'
import type {
  AuctionEvent,
  AuctionOpened,
  BidPlaced,
  LotListed,
} from './auction-source'
import { formatEth, formatUsd, plural, PUNKS_AUCTION_URL } from './format'
import { punkGrid } from './image'
import type { LotItem } from './indexer'
import type { NameResolver } from './names'

export interface AuctionRendererOptions {
  names: NameResolver
  /// Forwarded to the grid renderer as its target width in pixels.
  maxWidth?: number
  /// How many lot punk ids to spell out in the caption before summarizing the
  /// rest as "+N more". Defaults to 6.
  maxListedIds?: number
}

const DEFAULT_MAX_LISTED_IDS = 6

/// Turns punks.auction lifecycle events into tweets: a lot getting listed, the
/// first bid taking it live, or a further bid — always linking to the lot and
/// showing its punks. Every event posts — this bot doesn't filter bids.
export class AuctionRenderer implements Renderer<AuctionEvent> {
  constructor(private readonly options: AuctionRendererOptions) {}

  async render(event: AuctionEvent): Promise<Post | null> {
    const post: Post = { text: await this.caption(event) }
    // A missed lot lookup leaves no punks to draw; the post still goes out,
    // carried by the caption and link alone.
    if (event.items.length > 0) {
      post.media = {
        data: await punkGrid(
          event.items.map((item) => ({ id: item.punkId, v1: item.v1 })),
          { maxWidth: this.options.maxWidth },
        ),
        mimeType: 'image/png',
        alt: this.altText(event),
      }
    }
    return post
  }

  private async caption(event: AuctionEvent): Promise<string> {
    switch (event.kind) {
      case 'listed':
        return this.listedCaption(event)
      case 'opened':
        return this.openedCaption(event)
      case 'bid':
        return this.bidCaption(event)
    }
  }

  private async listedCaption(event: LotListed): Promise<string> {
    const name = await this.options.names.resolve(event.seller)
    const subject =
      event.items.length > 0 ? this.punksText(event.items) : 'a lot'
    const lines = [`${name} listed ${subject} for auction`]
    if (event.reserveWei !== null && event.reserveWei > 0n) {
      const usd =
        event.reserveUsdCents !== null
          ? ` (${formatUsd(event.reserveUsdCents)})`
          : ''
      lines.push(`Reserve ${formatEth(event.reserveWei)}${usd}`)
    }
    lines.push(`${PUNKS_AUCTION_URL}/lots/${event.lotId}`)
    return lines.join('\n')
  }

  /// A lot goes live the moment its first bid lands, so the opening is the
  /// bidder's act, not the seller's.
  private async openedCaption(event: AuctionOpened): Promise<string> {
    const subject =
      event.items.length > 0
        ? `the auction for ${this.punksText(event.items)}`
        : 'an auction'
    const lines = [
      event.bidder
        ? `${await this.options.names.resolve(event.bidder)} opened ${subject}`
        : `${subject[0].toUpperCase()}${subject.slice(1)} opened`,
    ]
    if (event.openingBidWei !== null) {
      const usd =
        event.openingBidUsdCents !== null
          ? ` (${formatUsd(event.openingBidUsdCents)})`
          : ''
      lines.push(`Opening bid ${formatEth(event.openingBidWei)}${usd}`)
    }
    lines.push(`${PUNKS_AUCTION_URL}/auctions/${event.auctionId}`)
    return lines.join('\n')
  }

  private async bidCaption(event: BidPlaced): Promise<string> {
    const name = await this.options.names.resolve(event.bidder)
    const usd = event.usdCents !== null ? ` (${formatUsd(event.usdCents)})` : ''
    const subject =
      event.items.length > 0 ? ` on ${this.punksText(event.items)}` : ''
    return [
      `New ${formatEth(event.bidWei)}${usd} bid from ${name}${subject}`,
      `${PUNKS_AUCTION_URL}/auctions/${event.auctionId}`,
    ].join('\n')
  }

  /// Mirrors the app's lot labeling: a punk and its V1 twin read as one
  /// "Punk Pair", anything else lists ids with V1 tokens tagged.
  private punksText(items: LotItem[]): string {
    if (items.length === 1) return `CryptoPunk ${label(items[0])}`
    if (isPunkPair(items)) return `Punk Pair #${items[0].punkId}`

    const limit = this.options.maxListedIds ?? DEFAULT_MAX_LISTED_IDS
    const listed = items.slice(0, limit).map(label).join(', ')
    const more = items.length > limit ? `, +${items.length - limit} more` : ''
    return `${items.length} CryptoPunks (${listed}${more})`
  }

  private altText(event: AuctionEvent): string {
    if (isPunkPair(event.items)) {
      return `Punk Pair #${event.items[0].punkId} — the CryptoPunk and its V1 token — on punks.auction.`
    }
    const count = event.items.length
    if (count === 1) {
      return `CryptoPunk ${label(event.items[0])}, up for auction on punks.auction.`
    }
    return `Grid of the ${count} ${plural(count, 'CryptoPunk')} in this punks.auction lot.`
  }
}

/// `#6980` for the canonical token, `#6980 (V1)` for its V1 counterpart — the
/// same labeling the punks.auction app uses.
function label(item: LotItem): string {
  return item.v1 ? `#${item.punkId} (V1)` : `#${item.punkId}`
}

/// A CryptoPunk and its V1 twin (same id) read as a single "Punk Pair" — the
/// app's `isPunkPair`.
function isPunkPair(items: LotItem[]): boolean {
  return (
    items.length === 2 &&
    items[0].punkId === items[1].punkId &&
    items[0].v1 !== items[1].v1
  )
}
