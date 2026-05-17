import { getPublicClient } from '@wagmi/core'
import { useConfig } from '@wagmi/vue'
import type { Address, PublicClient } from 'viem'
import { punksMarketAbi } from '~/utils/punksMarketAbi'
import { usePunksMarketAddress } from '~/utils/addresses'

export type CollectionBid = {
  id: bigint
  bidder: Address
  bidWei: bigint
  settlementWei: bigint
  includeIds: number[]
  excludeIds: number[]
  active: boolean
  placedAtBlock: bigint
}

const LOOKBACK_BLOCKS = 200_000n

/**
 * Reconstructs the active collection-bid book from `BidPlaced` / `BidCancelled`
 * / `BidAccepted` events on the PunksMarket contract.
 *
 * For production scale this should hit the indexer (`runtimeConfig.indexerUrl`)
 * instead — kept here as a zero-dependency fallback.
 */
export function usePunksMarketBids(opts: { bidder?: MaybeRefOrGetter<Address | undefined> } = {}) {
  const config = useConfig()
  const punksMarket = usePunksMarketAddress()

  const bids = ref<CollectionBid[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const client = getPublicClient(config) as PublicClient | undefined
    const address = punksMarket.value
    if (!client || !address) {
      bids.value = []
      return
    }

    pending.value = true
    error.value = null
    try {
      const head = await client.getBlockNumber()
      const from = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n

      const events = (punksMarketAbi as readonly { type: string }[]).filter(
        (x) => x.type === 'event',
      ) as never
      const logs = await client.getLogs({ address, fromBlock: from, toBlock: head, events })

      const state = new Map<string, CollectionBid>()

      for (const raw of logs) {
        const log = raw as unknown as {
          eventName?: string
          args?: Record<string, unknown>
          blockNumber: bigint
        }
        const args = log.args ?? {}
        if (log.eventName === 'BidPlaced') {
          const id = args.bidId as bigint
          state.set(String(id), {
            id,
            bidder: args.bidder as Address,
            bidWei: args.bidWei as bigint,
            settlementWei: args.settlementWei as bigint,
            includeIds: (args.includeIds as number[] | undefined)?.map((n) => Number(n)) ?? [],
            excludeIds: (args.excludeIds as number[] | undefined)?.map((n) => Number(n)) ?? [],
            active: true,
            placedAtBlock: log.blockNumber,
          })
        } else if (log.eventName === 'BidAdjusted') {
          const existing = state.get(String(args.bidId))
          if (existing) existing.bidWei = args.newBidWei as bigint
        } else if (log.eventName === 'BidCancelled' || log.eventName === 'BidAccepted') {
          const existing = state.get(String(args.bidId))
          if (existing) existing.active = false
        }
      }

      const bidder = toValue(opts.bidder)?.toLowerCase()
      const all = [...state.values()].filter((b) => {
        if (!b.active) return false
        if (bidder && b.bidder.toLowerCase() !== bidder) return false
        return true
      })

      all.sort((a, b) => Number(b.bidWei - a.bidWei))
      bids.value = all
    } catch (e) {
      error.value = (e as Error).message
      bids.value = []
    } finally {
      pending.value = false
    }
  }

  watchEffect(() => {
    void toValue(opts.bidder)
    load()
  })

  return { bids, pending, error, refresh: load }
}
