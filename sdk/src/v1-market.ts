import type { Abi, Address, Hex, PublicClient, WalletClient } from 'viem'
import { punksV1MarketAbi } from './abi'
import { PUNKS_V1_MARKET_ADDRESS, ZERO_ADDRESS } from './constants'
import type { PunksFilter } from './query'
import { PunksDataValidationError, validatePunkId } from './utils'

// Re-exported from actions.ts so consumers don't need two imports for the
// shared write surface.
import type {
  ContractWritePlan,
  ContractWriteRequest,
  TransactionHash,
  WalletConfig,
} from './actions'
export type {
  ContractWritePlan,
  ContractWriteRequest,
  TransactionHash,
  WalletConfig,
} from './actions'

export type PunksV1MarketConfig = WalletConfig & {
  address?: Address
}

export type V1MarketBid = {
  bidId: bigint
  bidder: Address
  bidWei: bigint
  settlementWei: bigint
  criteria: PunksFilter
  includeIds: number[]
  excludeIds: number[]
}

export type BidsMatchingPunkPage = {
  bidIds: bigint[]
  nextId: bigint
}

const DEFAULT_PAGE_SIZE = 100

export class PunksV1MarketClient {
  readonly address: Address
  private readonly publicClient?: PublicClient
  private readonly walletClient?: WalletClient
  private readonly account?: Address

  constructor(config: PunksV1MarketConfig = {}) {
    this.address = config.address ?? PUNKS_V1_MARKET_ADDRESS
    this.publicClient = config.publicClient
    this.walletClient = config.walletClient
    this.account = config.account
  }

  // ─────────────────────────────── Reads ───────────────────────────────

  /// Returns the id of the most recently placed bid.
  async lastBidId(): Promise<bigint> {
    return this.read<bigint>('lastBidId')
  }

  /// Fetches a single bid hydrated with its criteria and id lists. Returns
  /// `null` when the bid does not exist (cancelled, accepted, or never created).
  async bid(bidId: bigint | number): Promise<V1MarketBid | null> {
    const id = BigInt(bidId)
    const [scalars, criteria, includeIds, excludeIds] = await Promise.all([
      this.read<readonly [bigint, bigint, Address]>('bids', [id]),
      this.read<PunksFilter>('getBidCriteria', [id]),
      this.read<readonly number[]>('getBidIncludeIds', [id]),
      this.read<readonly number[]>('getBidExcludeIds', [id]),
    ])
    const [bidWei, settlementWei, bidder] = scalars
    if (bidder === ZERO_ADDRESS) return null
    return {
      bidId: id,
      bidder,
      bidWei,
      settlementWei,
      criteria,
      includeIds: includeIds.map((n) => Number(n)),
      excludeIds: excludeIds.map((n) => Number(n)),
    }
  }

  /// Checks whether a single bid would accept the given punk. The
  /// non-reverting twin of the on-chain matcher.
  async matchesPunk(bidId: bigint | number, punkId: number): Promise<boolean> {
    validatePunkId(punkId)
    return this.read<boolean>('matchesPunk', [BigInt(bidId), punkId])
  }

  /// Reads one cursor page of bids matching `punkId`. Pass `fromId == 0` to
  /// start at the first bid; `nextId === 0n` signals end of book.
  async bidsMatchingPunkPage(
    punkId: number,
    options: { fromId?: bigint | number; count?: number | bigint } = {},
  ): Promise<BidsMatchingPunkPage> {
    validatePunkId(punkId)
    const fromId = BigInt(options.fromId ?? 0)
    const count = BigInt(options.count ?? DEFAULT_PAGE_SIZE)
    const [bidIds, nextId] = await this.read<
      readonly [readonly bigint[], bigint]
    >('bidsMatchingPunk', [punkId, fromId, count])
    return { bidIds: [...bidIds], nextId }
  }

  /// Async iterator that drains the on-chain cursor.
  async *bidsMatchingPunk(
    punkId: number,
    options: { pageSize?: number } = {},
  ): AsyncIterableIterator<bigint> {
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
    let cursor: bigint = 0n
    while (true) {
      const page = await this.bidsMatchingPunkPage(punkId, {
        fromId: cursor,
        count: pageSize,
      })
      for (const id of page.bidIds) yield id
      if (page.nextId === 0n) return
      cursor = page.nextId
    }
  }

  /// Convenience: drains the cursor into an array. Prefer the async iterator
  /// when you might exit early.
  async findBidsMatchingPunk(
    punkId: number,
    options: { pageSize?: number } = {},
  ): Promise<bigint[]> {
    const out: bigint[] = []
    for await (const id of this.bidsMatchingPunk(punkId, options)) out.push(id)
    return out
  }

  /// Pending push/pull escrow balance — credited proceeds awaiting withdraw.
  async pendingWithdrawal(account: Address): Promise<bigint> {
    return this.read<bigint>('balances', [account])
  }

  // ────────────────────────────── Writes ──────────────────────────────

  prepareBuyPunk(params: {
    punkId: number
    expectedListingWei: bigint
    recipient: Address
  }): ContractWritePlan {
    validatePunkId(params.punkId)
    assertWei('expectedListingWei', params.expectedListingWei)
    return {
      kind: 'buy-punk-v1',
      description: `Buy CryptoPunk ${params.punkId} via the V1 market`,
      request: {
        address: this.address,
        abi: punksV1MarketAbi as unknown as Abi,
        functionName: 'buyPunk',
        args: [params.punkId, params.expectedListingWei, params.recipient],
        value: params.expectedListingWei,
      },
    }
  }
  buyPunk(params: {
    punkId: number
    expectedListingWei: bigint
    recipient: Address
  }): Promise<TransactionHash> {
    return this.write(this.prepareBuyPunk(params))
  }

  preparePlaceBid(params: {
    bidWei: bigint
    settlementWei?: bigint
    criteria: PunksFilter
    includeIds?: readonly number[]
    excludeIds?: readonly number[]
  }): ContractWritePlan {
    assertWei('bidWei', params.bidWei)
    if (params.bidWei === 0n) {
      throw new PunksDataValidationError('bidWei must be positive')
    }
    const settlementWei = params.settlementWei ?? 0n
    assertWei('settlementWei', settlementWei)
    const includeIds = sanitizeIds(params.includeIds, 'includeIds')
    const excludeIds = sanitizeIds(params.excludeIds, 'excludeIds')
    return {
      kind: 'place-v1-collection-bid',
      description: 'Place CryptoPunks V1 collection bid',
      request: {
        address: this.address,
        abi: punksV1MarketAbi as unknown as Abi,
        functionName: 'placeBid',
        args: [
          params.bidWei,
          settlementWei,
          params.criteria,
          includeIds,
          excludeIds,
        ],
        value: params.bidWei + settlementWei,
      },
    }
  }
  placeBid(params: {
    bidWei: bigint
    settlementWei?: bigint
    criteria: PunksFilter
    includeIds?: readonly number[]
    excludeIds?: readonly number[]
  }): Promise<TransactionHash> {
    return this.write(this.preparePlaceBid(params))
  }

  prepareCancelBid(bidId: bigint | number): ContractWritePlan {
    return {
      kind: 'cancel-v1-bid',
      description: `Cancel CryptoPunks V1 bid ${bidId.toString()}`,
      request: {
        address: this.address,
        abi: punksV1MarketAbi as unknown as Abi,
        functionName: 'cancelBid',
        args: [BigInt(bidId)],
      },
    }
  }
  cancelBid(bidId: bigint | number): Promise<TransactionHash> {
    return this.write(this.prepareCancelBid(bidId))
  }

  prepareAdjustBidPrice(params: {
    bidId: bigint | number
    weiToAdjust: bigint
    increase: boolean
  }): ContractWritePlan {
    assertWei('weiToAdjust', params.weiToAdjust)
    if (params.weiToAdjust === 0n) {
      throw new PunksDataValidationError('weiToAdjust must be positive')
    }
    return {
      kind: 'adjust-v1-bid',
      description: `${params.increase ? 'Increase' : 'Decrease'} CryptoPunks V1 bid ${params.bidId.toString()} by ${params.weiToAdjust.toString()} wei`,
      request: {
        address: this.address,
        abi: punksV1MarketAbi as unknown as Abi,
        functionName: 'adjustBidPrice',
        args: [BigInt(params.bidId), params.weiToAdjust, params.increase],
        value: params.increase ? params.weiToAdjust : 0n,
      },
    }
  }
  adjustBidPrice(params: {
    bidId: bigint | number
    weiToAdjust: bigint
    increase: boolean
  }): Promise<TransactionHash> {
    return this.write(this.prepareAdjustBidPrice(params))
  }

  prepareAcceptBid(params: {
    bidId: bigint | number
    punkId: number
    expectedListingWei: bigint
  }): ContractWritePlan {
    validatePunkId(params.punkId)
    assertWei('expectedListingWei', params.expectedListingWei)
    return {
      kind: 'accept-v1-bid',
      description: `Accept CryptoPunks V1 bid ${params.bidId.toString()} against punk ${params.punkId}`,
      request: {
        address: this.address,
        abi: punksV1MarketAbi as unknown as Abi,
        functionName: 'acceptBid',
        args: [BigInt(params.bidId), params.punkId, params.expectedListingWei],
      },
    }
  }
  acceptBid(params: {
    bidId: bigint | number
    punkId: number
    expectedListingWei: bigint
  }): Promise<TransactionHash> {
    return this.write(this.prepareAcceptBid(params))
  }

  prepareWithdraw(): ContractWritePlan {
    return {
      kind: 'withdraw-v1-balance',
      description: 'Withdraw CryptoPunks V1 market balance',
      request: {
        address: this.address,
        abi: punksV1MarketAbi as unknown as Abi,
        functionName: 'withdraw',
      },
    }
  }
  withdraw(): Promise<TransactionHash> {
    return this.write(this.prepareWithdraw())
  }

  // ───────────────────────────── Internals ─────────────────────────────

  private async read<T>(
    functionName: string,
    args: readonly unknown[] = [],
  ): Promise<T> {
    if (!this.publicClient) {
      throw new PunksDataValidationError('publicClient is required for reads')
    }
    return (
      this.publicClient.readContract as unknown as (
        value: ContractWriteRequest,
      ) => Promise<T>
    )({
      address: this.address,
      abi: punksV1MarketAbi as unknown as Abi,
      functionName,
      args,
    })
  }

  private write(plan: ContractWritePlan): Promise<TransactionHash> {
    if (!this.walletClient) {
      throw new PunksDataValidationError('walletClient is required for writes')
    }
    const resolvedAccount = this.account ?? this.walletClient.account?.address
    const request =
      resolvedAccount === undefined
        ? plan.request
        : { ...plan.request, account: resolvedAccount }
    return (
      this.walletClient.writeContract as unknown as (
        value: typeof request,
      ) => Promise<TransactionHash>
    )(request)
  }
}

function sanitizeIds(
  ids: readonly number[] | undefined,
  label: string,
): number[] {
  if (!ids) return []
  const seen = new Set<number>()
  const out: number[] = []
  for (const raw of ids) {
    validatePunkId(raw)
    if (seen.has(raw)) continue
    seen.add(raw)
    out.push(raw)
  }
  if (out.length > 64) {
    throw new PunksDataValidationError(`${label} cannot exceed 64 entries`)
  }
  return out
}

function assertWei(label: string, value: bigint): void {
  if (typeof value !== 'bigint' || value < 0n) {
    throw new PunksDataValidationError(`${label} must be a non-negative bigint`)
  }
}
