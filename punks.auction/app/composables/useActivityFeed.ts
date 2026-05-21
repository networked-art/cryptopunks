import type { Address, Hex } from 'viem'
import { punksAuctionAbi } from '@networked-art/punks-sdk'
import {
  PUNKS_AUCTION_ADDRESS,
  PUNKS_AUCTION_DEPLOY_BLOCK,
  isAuctionDeployed,
} from '~/utils/addresses'

export type ActivityEvent = {
  id: string
  eventName: string
  label: string
  from?: Address
  to?: Address
  amountWei?: bigint
  auctionId?: bigint
  lotId?: bigint
  offerId?: bigint
  punkId?: number
  /// Every address the event touches — used to scope the feed to a profile.
  parties: Address[]
  txHash: Hex
  blockNumber: bigint
  logIndex: number
  timestamp?: number
}

/// Per-Punk and other high-volume detail events are folded into their parent
/// (e.g. `LotItemDetail` into `LotCreated`), so they never show as rows.
const SKIPPED = new Set([
  'LotItemDetail',
  'OfferSlotDetail',
  'AuctionItemDelivered',
])

type RawLog = {
  eventName: string
  args: Record<string, unknown>
  transactionHash: Hex | null
  blockNumber: bigint | null
  logIndex: number | null
}

function addr(value: unknown): Address | undefined {
  return typeof value === 'string' ? (value as Address) : undefined
}

function big(value: unknown): bigint | undefined {
  return typeof value === 'bigint' ? value : undefined
}

/// Maps one decoded log to a feed row, or `null` to drop it.
function mapLog(log: RawLog): ActivityEvent | null {
  if (SKIPPED.has(log.eventName)) return null

  const a = log.args
  const base = {
    id: `${log.transactionHash}-${log.logIndex}`,
    eventName: log.eventName,
    txHash: (log.transactionHash ?? '0x') as Hex,
    blockNumber: log.blockNumber ?? 0n,
    logIndex: log.logIndex ?? 0,
  }

  const lotId = big(a.lotId)
  const auctionId = big(a.auctionId)
  const offerId = big(a.offerId)

  let label = log.eventName
  let from: Address | undefined
  let to: Address | undefined
  let amountWei: bigint | undefined
  let punkId: number | undefined

  switch (log.eventName) {
    case 'LotCreated':
      label = 'Lot created'
      from = addr(a.seller)
      amountWei = big(a.reserveWei)
      break
    case 'LotUpdated':
      label = 'Lot updated'
      amountWei = big(a.reserveWei)
      break
    case 'LotCancelled':
      label = 'Lot cancelled'
      break
    case 'LotCleared':
      label = 'Lot cleared'
      from = addr(a.cleaner)
      break
    case 'AuctionInitialised':
      label = 'Auction started'
      from = addr(a.seller)
      break
    case 'Bid':
      label = 'Bid placed'
      from = addr(a.bidder)
      amountWei = big(a.amountWei)
      break
    case 'AuctionExtended':
      label = 'Auction extended'
      break
    case 'AuctionSettled':
      label = 'Auction settled'
      from = addr(a.seller)
      to = addr(a.winner)
      amountWei = big(a.finalWei)
      break
    case 'OfferPlaced':
      label = 'Offer placed'
      from = addr(a.offerer)
      amountWei = big(a.amountWei)
      break
    case 'OfferAmountAdjusted':
      label = 'Offer adjusted'
      amountWei = big(a.newAmountWei)
      break
    case 'OfferCancelled':
      label = 'Offer cancelled'
      break
    case 'OfferAccepted':
      label = 'Offer accepted'
      from = addr(a.seller)
      to = addr(a.offerer)
      amountWei = big(a.amountWei)
      punkId = a.punkId !== undefined ? Number(a.punkId) : undefined
      break
    case 'OfferAcceptedFromLot':
      label = 'Offer accepted'
      from = addr(a.seller)
      to = addr(a.offerer)
      amountWei = big(a.amountWei)
      break
    case 'OfferAuctionInitialised':
      label = 'Auction started from offer'
      from = addr(a.seller)
      to = addr(a.offerer)
      amountWei = big(a.amountWei)
      break
    case 'Credited':
      label = 'Escrow credit'
      to = addr(a.account)
      amountWei = big(a.amount)
      break
    case 'Withdrawal':
      label = 'Escrow withdrawal'
      from = addr(a.account)
      amountWei = big(a.amount)
      break
    default:
      return null
  }

  const parties = [from, to].filter((p): p is Address => p !== undefined)

  return {
    ...base,
    label,
    from,
    to,
    amountWei,
    auctionId,
    lotId,
    offerId,
    punkId,
    parties,
  }
}

/**
 * `PunksAuction` activity, built from `eth_getLogs` over the contract's events.
 * Optionally scoped to a single address for the profile page.
 */
export function useActivityFeed(
  opts: { address?: MaybeRefOrGetter<Address | undefined> } = {},
) {
  const client = useReadClient()

  const all = ref<ActivityEvent[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const c = client.value
    if (!c) return
    if (!isAuctionDeployed()) {
      all.value = []
      return
    }

    pending.value = true
    error.value = null
    try {
      const logs = (await c.getContractEvents({
        address: PUNKS_AUCTION_ADDRESS,
        abi: punksAuctionAbi,
        fromBlock: PUNKS_AUCTION_DEPLOY_BLOCK,
        toBlock: 'latest',
      })) as unknown as RawLog[]

      const mapped = logs
        .map(mapLog)
        .filter((e): e is ActivityEvent => e !== null)

      const blockNumbers = [...new Set(mapped.map((e) => e.blockNumber))]
      const blocks = await Promise.all(
        blockNumbers.map((blockNumber) =>
          c
            .getBlock({ blockNumber })
            .then((b) => [blockNumber, Number(b.timestamp)] as const)
            .catch(() => [blockNumber, undefined] as const),
        ),
      )
      const timestamps = new Map(blocks)
      for (const event of mapped) {
        event.timestamp = timestamps.get(event.blockNumber)
      }

      mapped.sort(
        (a, b) =>
          Number(b.blockNumber - a.blockNumber) || b.logIndex - a.logIndex,
      )
      all.value = mapped
    } catch (e) {
      error.value = (e as Error).message
      all.value = []
    } finally {
      pending.value = false
    }
  }

  watch(client, () => void load(), { immediate: true })

  /// `address`, when supplied, filters the loaded feed client-side rather than
  /// re-querying — the full log set is small for a young contract.
  const events = computed(() => {
    const scope = toValue(opts.address)?.toLowerCase()
    if (!scope) return all.value
    return all.value.filter((e) =>
      e.parties.some((p) => p.toLowerCase() === scope),
    )
  })

  return { events, pending, error, refresh: load }
}
