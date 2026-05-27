import { parseAbiItem, type Address, type Hex, type PublicClient } from 'viem'
import type { ActivityEvent } from '~/composables/useActivityFeed'
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

/**
 * Bid log history for a single `PunksAuction` auction, newest first.
 * Sourced from on-chain `Bid` events — the indexer doesn't cover
 * `PunksAuction` yet.
 */
export function useAuctionBids(
  id: MaybeRefOrGetter<bigint | number | undefined>,
) {
  const client = useReadClient()
  const bids = ref<ActivityEvent[]>([])
  const pending = ref(true)
  const error = ref<string | null>(null)

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
      bids.value = await readAuctionBids(c, auctionId)
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
