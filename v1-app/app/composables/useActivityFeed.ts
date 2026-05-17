import type { Address, Hex } from 'viem'
import { queryIndexer, IndexerNotConfigured } from '~/utils/indexer'

export type ActivityKind =
  | 'assign'
  | 'transfer'
  | 'wrap'
  | 'unwrap'
  | 'listing'
  | 'listing_cancelled'
  | 'bid'
  | 'bid_adjusted'
  | 'bid_cancelled'
  | 'sale'
  | 'escrow_credit'
  | 'escrow_withdrawal'

export type ActivitySource =
  | 'cryptopunks_v1'
  | 'v1_wrapper'
  | 'punks_market'
  | string

export type ActivityEvent = {
  id: string
  kind: ActivityKind
  source: ActivitySource
  punkId?: number
  from?: Address
  to?: Address
  amountWei?: bigint
  bidId?: bigint
  txHash: Hex
  blockNumber: bigint
  logIndex: number
  timestamp: number
}

type RawEvent = {
  id: string
  type: ActivityKind
  source: ActivitySource
  punk_id: string | null
  actor: string | null
  from: string | null
  to: string | null
  buyer: string | null
  seller: string | null
  bidder: string | null
  wei_amount: string | null
  listing_wei: string | null
  bid_wei: string | null
  bid_id: string | null
  tx_hash: string
  block_number: string
  log_index: number
  timestamp: string
}

const EVENTS_QUERY = `
  query Events($where: eventFilter, $limit: Int!) {
    events(where: $where, orderBy: "timestamp", orderDirection: "desc", limit: $limit) {
      items {
        id
        type
        source
        punk_id
        actor
        from
        to
        buyer
        seller
        bidder
        wei_amount
        listing_wei
        bid_wei
        bid_id
        tx_hash
        block_number
        log_index
        timestamp
      }
    }
  }
`

export function useActivityFeed(
  opts: {
    punkId?: MaybeRefOrGetter<number | undefined>
    address?: MaybeRefOrGetter<Address | undefined>
    limit?: number
  } = {},
) {
  const events = ref<ActivityEvent[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    pending.value = true
    error.value = null
    try {
      const where: Record<string, unknown> = {}

      const punkId = toValue(opts.punkId)
      if (punkId !== undefined) where.punk_id = String(punkId)

      const address = toValue(opts.address)?.toLowerCase()
      if (address) {
        where.OR = [
          { actor: address },
          { from: address },
          { to: address },
          { buyer: address },
          { seller: address },
          { bidder: address },
        ]
      }

      const data = await queryIndexer<{ events: { items: RawEvent[] } }>(
        EVENTS_QUERY,
        {
          where: Object.keys(where).length ? where : undefined,
          limit: opts.limit ?? 200,
        },
      )

      events.value = data.events.items.map(mapEvent)
    } catch (e) {
      if (e instanceof IndexerNotConfigured) {
        error.value = 'No indexer configured.'
      } else {
        error.value = (e as Error).message
      }
      events.value = []
    } finally {
      pending.value = false
    }
  }

  watchEffect(() => {
    void toValue(opts.punkId)
    void toValue(opts.address)
    load()
  })

  return { events, pending, error, refresh: load }
}

function mapEvent(row: RawEvent): ActivityEvent {
  return {
    id: row.id,
    kind: row.type,
    source: row.source,
    punkId: row.punk_id != null ? Number(row.punk_id) : undefined,
    from: pickFrom(row),
    to: pickTo(row),
    amountWei: pickAmount(row),
    bidId: row.bid_id != null ? BigInt(row.bid_id) : undefined,
    txHash: row.tx_hash as Hex,
    blockNumber: BigInt(row.block_number),
    logIndex: row.log_index,
    timestamp: Number(row.timestamp),
  }
}

function pickFrom(row: RawEvent): Address | undefined {
  // Sales: prefer the explicit seller field; otherwise fall back to the
  // generic from / actor.
  if (row.type === 'sale') return (row.seller ?? row.from) as Address | undefined
  if (row.type === 'bid' || row.type === 'bid_adjusted' || row.type === 'bid_cancelled') {
    return (row.bidder ?? row.actor) as Address | undefined
  }
  if (row.type === 'listing' || row.type === 'listing_cancelled') {
    return (row.actor ?? row.from) as Address | undefined
  }
  return (row.from ?? row.actor) as Address | undefined
}

function pickTo(row: RawEvent): Address | undefined {
  if (row.type === 'sale') return (row.buyer ?? row.to) as Address | undefined
  return (row.to ?? undefined) as Address | undefined
}

function pickAmount(row: RawEvent): bigint | undefined {
  const raw = row.wei_amount ?? row.listing_wei ?? row.bid_wei
  return raw != null ? BigInt(raw) : undefined
}
