import { auctionStatus, type AuctionRecord } from '~/utils/auction'
import { queryIndexer } from '~/utils/indexer'

export function useAuctionUsd(
  auctions: MaybeRefOrGetter<readonly AuctionRecord[]>,
) {
  const prices = useState<Record<string, string>>('auction-bid-usd', () => ({}))
  const pending = new Set<string>()
  const now = useSeconds()
  const key = (auction: AuctionRecord) =>
    `${auction.id}-${auction.latestBidWei}`
  const priceFor = (auction: AuctionRecord) => prices.value[key(auction)]
  const closed = () =>
    toValue(auctions).filter(
      (auction) => auctionStatus(auction, now.value) !== 'live',
    )

  async function load() {
    const missing = closed().filter(
      (auction) => priceFor(auction) == null && !pending.has(key(auction)),
    )
    missing.forEach((auction) => pending.add(key(auction)))
    try {
      for (let offset = 0; offset < missing.length; offset += 1000) {
        const batch = missing.slice(offset, offset + 1000)
        const data = await queryIndexer<{
          events: {
            items: {
              auction_id: string
              wei_amount: string
              usd_value_cents: string | null
            }[]
          }
        }>(
          `query AuctionBidUsd($where: eventFilter!) {
            events(where: $where, limit: 1000) {
              items { auction_id wei_amount usd_value_cents }
            }
          }`,
          {
            where: {
              source: 'punks_auction',
              type: 'bid',
              OR: batch.map((auction) => ({
                AND: [
                  { auction_id: auction.id.toString() },
                  { wei_amount: auction.latestBidWei.toString() },
                ],
              })),
            },
          },
        )
        for (const event of data.events.items) {
          if (event.usd_value_cents != null)
            prices.value[`${event.auction_id}-${event.wei_amount}`] =
              event.usd_value_cents
        }
      }
    } finally {
      missing.forEach((auction) => pending.delete(key(auction)))
    }
  }

  if (import.meta.client) {
    watch(
      [() => toValue(auctions), () => closed().map(key).join(',')],
      () => void load().catch(() => undefined),
      { immediate: true },
    )
  }

  return priceFor
}
