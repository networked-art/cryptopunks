import { parseAbiItem, type Address, type Hex, type PublicClient } from 'viem'
import type { ActivityEvent } from '~/composables/useActivityFeed'
import { queryIndexer } from '~/utils/indexer'
import {
  PUNKS_AUCTION_ADDRESS,
  PUNKS_AUCTION_START_BLOCK,
} from '~/utils/addresses'

const BID_EVENT = parseAbiItem(
  'event Bid(uint256 indexed auctionId, address indexed bidder, uint256 amountWei)',
)

async function readAuctionBids(
  client: PublicClient,
  auctionId: bigint,
): Promise<ActivityEvent[]> {
  const logs = await client.getLogs({
    address: PUNKS_AUCTION_ADDRESS,
    event: BID_EVENT,
    args: { auctionId },
    fromBlock: PUNKS_AUCTION_START_BLOCK,
    toBlock: 'latest',
  })
  if (!logs.length) return []

  const uniqueBlocks = [...new Set(logs.map((log) => log.blockNumber))]
  const blocks = await Promise.all(
    uniqueBlocks.map((blockNumber) => client.getBlock({ blockNumber })),
  )
  const blockTimes = new Map(
    blocks.map((block) => [block.number, Number(block.timestamp)]),
  )

  return logs
    .map((log): ActivityEvent => {
      const { bidder, amountWei } = log.args as {
        bidder: Address
        amountWei: bigint
      }
      return {
        id: `${log.transactionHash}-${log.logIndex}`,
        kind: 'bid',
        source: 'punks_auction',
        from: bidder,
        amountWei,
        txHash: log.transactionHash as Hex,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        timestamp: blockTimes.get(log.blockNumber) ?? 0,
      }
    })
    .reverse()
}

async function loadBidUsd(
  bids: ActivityEvent[],
  cachedPrices: Map<string, bigint>,
) {
  const unpriced = bids.filter(
    (bid) => !cachedPrices.has(`${bid.blockNumber}-${bid.logIndex}`),
  )
  for (let offset = 0; offset < unpriced.length; offset += 1000) {
    const batch = unpriced.slice(offset, offset + 1000)
    const ids = batch.map((bid) => `${bid.blockNumber}-${bid.logIndex}`)
    const data = await queryIndexer<{
      events: { items: { id: string; usd_value_cents: string | null }[] }
    }>(
      `query BidUsd($ids: [String!]!) {
        events(where: { id_in: $ids }, limit: 1000) {
          items { id usd_value_cents }
        }
      }`,
      { ids },
    )
    const prices = new Map(
      data.events.items.map((event) => [event.id, event.usd_value_cents]),
    )
    for (const bid of batch) {
      const eventId = `${bid.blockNumber}-${bid.logIndex}`
      const cents = prices.get(eventId)
      if (cents != null) {
        const value = BigInt(cents)
        cachedPrices.set(eventId, value)
        bid.usdValueCents = value
      }
    }
  }
}

/** Bid log history for a single `PunksAuction` auction, newest first. */
export function useAuctionBids(
  id: MaybeRefOrGetter<bigint | number | undefined>,
) {
  const client = useReadClient()
  const bids = ref<ActivityEvent[]>([])
  const pending = ref(true)
  const error = ref<string | null>(null)
  const usdPrices = new Map<string, bigint>()

  function applyCachedUsd(items: ActivityEvent[]) {
    for (const bid of items) {
      const cents = usdPrices.get(`${bid.blockNumber}-${bid.logIndex}`)
      if (cents != null) bid.usdValueCents = cents
    }
  }

  async function load() {
    const raw = toValue(id)
    if (raw === undefined) {
      bids.value = []
      pending.value = false
      return
    }
    const auctionId = BigInt(raw)
    if (auctionId < 1n) {
      bids.value = []
      pending.value = false
      return
    }
    const c = client.value
    if (!c) return

    pending.value = true
    error.value = null
    try {
      const nextBids = await readAuctionBids(c, auctionId)
      applyCachedUsd(nextBids)
      bids.value = nextBids
      void loadBidUsd(bids.value, usdPrices)
        .finally(() => applyCachedUsd(bids.value))
        .catch(() => undefined)
    } catch (e) {
      error.value = (e as Error).message
      bids.value = []
    } finally {
      pending.value = false
    }
  }

  watch([() => toValue(id), client], () => void load(), { immediate: true })

  return { bids, pending, error, refresh: load }
}
