import { getPublicClient } from '@wagmi/core'
import { useConfig } from '@wagmi/vue'
import { cryptoPunksMarketAbi } from '@networked-art/punks-sdk'
import { punksMarketAbi } from '~/utils/punksMarketAbi'
import { PUNKS_V1_ADDRESS, usePunksMarketAddress } from '~/utils/addresses'
import type { Address, Hex, Log, PublicClient } from 'viem'

export type ActivityKind =
  | 'v1-listed'
  | 'v1-unlisted'
  | 'v1-sold'
  | 'v1-bid-placed'
  | 'v1-bid-withdrawn'
  | 'pm-purchased'
  | 'pm-bid-placed'
  | 'pm-bid-cancelled'
  | 'pm-bid-adjusted'
  | 'pm-bid-accepted'

export type ActivityEvent = {
  kind: ActivityKind
  blockNumber: bigint
  txHash: Hex
  logIndex: number
  timestamp?: number
  punkId?: number
  amountWei?: bigint
  from?: Address
  to?: Address
  bidId?: bigint
}

const LOOKBACK_BLOCKS = 50_000n // ~1 week of mainnet

export function useActivityFeed(
  opts: {
    punkId?: MaybeRefOrGetter<number | undefined>
    bidder?: MaybeRefOrGetter<Address | undefined>
    seller?: MaybeRefOrGetter<Address | undefined>
  } = {},
) {
  const config = useConfig()
  const punksMarket = usePunksMarketAddress()

  const events = ref<ActivityEvent[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const client = getPublicClient(config) as PublicClient | undefined
    if (!client) return
    pending.value = true
    error.value = null

    try {
      const head = await client.getBlockNumber()
      const from = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n

      const v1Events = (
        cryptoPunksMarketAbi as readonly { type: string }[]
      ).filter((x) => x.type === 'event') as never
      const v1Logs = await client.getLogs({
        address: PUNKS_V1_ADDRESS,
        fromBlock: from,
        toBlock: head,
        events: v1Events,
      })

      const pmEvents = (punksMarketAbi as readonly { type: string }[]).filter(
        (x) => x.type === 'event',
      ) as never
      const pmLogs = punksMarket.value
        ? await client.getLogs({
            address: punksMarket.value,
            fromBlock: from,
            toBlock: head,
            events: pmEvents,
          })
        : []

      const punkFilter = toValue(opts.punkId)
      const bidderFilter = toValue(opts.bidder)?.toLowerCase()
      const sellerFilter = toValue(opts.seller)?.toLowerCase()

      const mapped: ActivityEvent[] = []
      for (const log of v1Logs) mapMaybe(mapped, mapV1Log(log as never))
      for (const log of pmLogs) mapMaybe(mapped, mapPmLog(log as never))

      const filtered = mapped.filter((e) => {
        if (punkFilter !== undefined && e.punkId !== punkFilter) return false
        if (bidderFilter && e.from?.toLowerCase() !== bidderFilter) return false
        if (sellerFilter && e.to?.toLowerCase() !== sellerFilter) return false
        return true
      })

      filtered.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber)
          return Number(b.blockNumber - a.blockNumber)
        return b.logIndex - a.logIndex
      })

      events.value = filtered.slice(0, 200)
    } catch (e) {
      error.value = (e as Error).message
      events.value = []
    } finally {
      pending.value = false
    }
  }

  watchEffect(() => {
    // re-trigger when any of the filter refs change
    void toValue(opts.punkId)
    void toValue(opts.bidder)
    void toValue(opts.seller)
    load()
  })

  return { events, pending, error, refresh: load }
}

function mapMaybe(out: ActivityEvent[], value: ActivityEvent | null) {
  if (value) out.push(value)
}

function mapV1Log(
  log: Log & { eventName?: string; args?: Record<string, unknown> },
): ActivityEvent | null {
  const args = log.args ?? {}
  const base = {
    blockNumber: log.blockNumber!,
    txHash: log.transactionHash!,
    logIndex: log.logIndex!,
  }
  switch (log.eventName) {
    case 'PunkOffered':
      return {
        ...base,
        kind: 'v1-listed',
        punkId: Number(args.punkIndex),
        amountWei: args.minValue as bigint,
        to: args.toAddress as Address,
      }
    case 'PunkNoLongerForSale':
      return { ...base, kind: 'v1-unlisted', punkId: Number(args.punkIndex) }
    case 'PunkBought':
      return {
        ...base,
        kind: 'v1-sold',
        punkId: Number(args.punkIndex),
        amountWei: args.value as bigint,
        from: args.fromAddress as Address,
        to: args.toAddress as Address,
      }
    case 'PunkBidEntered':
      return {
        ...base,
        kind: 'v1-bid-placed',
        punkId: Number(args.punkIndex),
        amountWei: args.value as bigint,
        from: args.fromAddress as Address,
      }
    case 'PunkBidWithdrawn':
      return {
        ...base,
        kind: 'v1-bid-withdrawn',
        punkId: Number(args.punkIndex),
        amountWei: args.value as bigint,
        from: args.fromAddress as Address,
      }
    default:
      return null
  }
}

function mapPmLog(
  log: Log & { eventName?: string; args?: Record<string, unknown> },
): ActivityEvent | null {
  const args = log.args ?? {}
  const base = {
    blockNumber: log.blockNumber!,
    txHash: log.transactionHash!,
    logIndex: log.logIndex!,
  }
  switch (log.eventName) {
    case 'PunkPurchased':
      return {
        ...base,
        kind: 'pm-purchased',
        punkId: Number(args.punkId),
        amountWei: args.listingWei as bigint,
        from: args.seller as Address,
        to: args.recipient as Address,
      }
    case 'BidPlaced':
      return {
        ...base,
        kind: 'pm-bid-placed',
        bidId: args.bidId as bigint,
        amountWei: args.bidWei as bigint,
        from: args.bidder as Address,
      }
    case 'BidCancelled':
      return { ...base, kind: 'pm-bid-cancelled', bidId: args.bidId as bigint }
    case 'BidAdjusted':
      return {
        ...base,
        kind: 'pm-bid-adjusted',
        bidId: args.bidId as bigint,
        amountWei: args.newBidWei as bigint,
      }
    case 'BidAccepted':
      return {
        ...base,
        kind: 'pm-bid-accepted',
        bidId: args.bidId as bigint,
        punkId: Number(args.punkId),
        amountWei: args.bidWei as bigint,
        from: args.seller as Address,
        to: args.bidder as Address,
      }
    default:
      return null
  }
}
