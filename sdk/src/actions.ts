import type { Abi, Address, Hex, PublicClient, WalletClient } from 'viem'
import {
  CRYPTOPUNKS_MARKET_ADDRESS,
  PunkStandard,
  ZERO_ADDRESS,
  type PunkStandardValue,
} from './constants'
import {
  cryptoPunksMarketAbi,
  punksAuctionAbi,
  punkVaultAbi,
  punkVaultFactoryAbi,
} from './abi'
import type { PunksDataset } from './dataset'
import type { PunkQuery } from './types'
import {
  type CompiledOfferSlot,
  type CompileOfferSlotInput,
  type PunkStandardRef,
  compileOfferSlot,
  normalizePunkStandard,
} from './query'
import {
  PunksDataValidationError,
  assertIntegerInRange,
  validatePunkId,
} from './utils'

export type ContractWriteRequest = {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
  value?: bigint
}

export type ContractWritePlan = {
  description: string
  request: ContractWriteRequest
}

export type TransactionHash = Hex

export type WalletConfig = {
  publicClient?: PublicClient
  walletClient?: WalletClient
  account?: Address
}

export type PunkListing = {
  punkId: number
  isForSale: boolean
  seller: Address
  priceWei: bigint
  onlySellTo: Address
}

export type PunkBid = {
  punkId: number
  hasBid: boolean
  bidder: Address
  valueWei: bigint
}

export type PunksMarketConfig = WalletConfig & {
  address?: Address
}

export class PunksMarketClient {
  readonly address: Address
  private readonly publicClient?: PublicClient
  private readonly walletClient?: WalletClient
  private readonly account?: Address

  constructor(config: PunksMarketConfig = {}) {
    this.address = config.address ?? CRYPTOPUNKS_MARKET_ADDRESS
    this.publicClient = config.publicClient
    this.walletClient = config.walletClient
    this.account = config.account
  }

  async name(): Promise<string> {
    return this.read<string>('name')
  }

  async symbol(): Promise<string> {
    return this.read<string>('symbol')
  }

  async imageHash(): Promise<string> {
    return this.read<string>('imageHash')
  }

  async totalSupply(): Promise<bigint> {
    return this.read<bigint>('totalSupply')
  }

  async punksRemainingToAssign(): Promise<bigint> {
    return this.read<bigint>('punksRemainingToAssign')
  }

  async nextPunkIndexToAssign(): Promise<bigint> {
    return this.read<bigint>('nextPunkIndexToAssign')
  }

  async balanceOf(owner: Address): Promise<bigint> {
    return this.read<bigint>('balanceOf', [owner])
  }

  async ownerOf(punkId: number): Promise<Address> {
    validatePunkId(punkId)
    return this.read<Address>('punkIndexToAddress', [BigInt(punkId)])
  }

  async listing(punkId: number): Promise<PunkListing> {
    validatePunkId(punkId)
    const [isForSale, punkIndex, seller, minValue, onlySellTo] = await this.read<
      readonly [boolean, bigint, Address, bigint, Address]
    >('punksOfferedForSale', [BigInt(punkId)])
    return {
      punkId: Number(punkIndex),
      isForSale,
      seller,
      priceWei: minValue,
      onlySellTo,
    }
  }

  async bidFor(punkId: number): Promise<PunkBid> {
    validatePunkId(punkId)
    const [hasBid, punkIndex, bidder, value] = await this.read<
      readonly [boolean, bigint, Address, bigint]
    >('punkBids', [BigInt(punkId)])
    return {
      punkId: Number(punkIndex),
      hasBid,
      bidder,
      valueWei: value,
    }
  }

  async pendingWithdrawal(owner: Address): Promise<bigint> {
    return this.read<bigint>('pendingWithdrawals', [owner])
  }

  prepareList(params: {
    punkId: number
    priceWei: bigint
    onlySellTo?: Address
  }): ContractWritePlan {
    validatePunkId(params.punkId)
    assertWei('priceWei', params.priceWei)
    const privateListing = params.onlySellTo !== undefined && params.onlySellTo !== ZERO_ADDRESS
    return {
      description: privateListing
        ? `List CryptoPunk ${params.punkId} to one buyer`
        : `List CryptoPunk ${params.punkId}`,
      request: {
        address: this.address,
        abi: cryptoPunksMarketAbi,
        functionName: privateListing ? 'offerPunkForSaleToAddress' : 'offerPunkForSale',
        args: privateListing
          ? [BigInt(params.punkId), params.priceWei, params.onlySellTo]
          : [BigInt(params.punkId), params.priceWei],
      },
    }
  }

  list(params: { punkId: number; priceWei: bigint; onlySellTo?: Address }): Promise<TransactionHash> {
    return this.write(this.prepareList(params))
  }

  prepareUnlist(punkId: number): ContractWritePlan {
    validatePunkId(punkId)
    return {
      description: `Remove CryptoPunk ${punkId} listing`,
      request: {
        address: this.address,
        abi: cryptoPunksMarketAbi,
        functionName: 'punkNoLongerForSale',
        args: [BigInt(punkId)],
      },
    }
  }

  unlist(punkId: number): Promise<TransactionHash> {
    return this.write(this.prepareUnlist(punkId))
  }

  prepareBuy(params: { punkId: number; priceWei: bigint }): ContractWritePlan {
    validatePunkId(params.punkId)
    assertWei('priceWei', params.priceWei)
    return {
      description: `Buy CryptoPunk ${params.punkId}`,
      request: {
        address: this.address,
        abi: cryptoPunksMarketAbi,
        functionName: 'buyPunk',
        args: [BigInt(params.punkId)],
        value: params.priceWei,
      },
    }
  }

  async buy(params: {
    punkId: number
    priceWei?: bigint
    maxPriceWei?: bigint
  }): Promise<TransactionHash> {
    const listing = params.priceWei === undefined ? await this.listing(params.punkId) : undefined
    if (listing !== undefined && !listing.isForSale) {
      throw new PunksDataValidationError(`CryptoPunk ${params.punkId} is not listed for sale`)
    }
    const priceWei = params.priceWei ?? listing?.priceWei ?? 0n
    if (params.maxPriceWei !== undefined && priceWei > params.maxPriceWei) {
      throw new PunksDataValidationError('listing price exceeds maxPriceWei')
    }
    return this.write(this.prepareBuy({ punkId: params.punkId, priceWei }))
  }

  prepareEnterBid(params: { punkId: number; amountWei: bigint }): ContractWritePlan {
    validatePunkId(params.punkId)
    assertWei('amountWei', params.amountWei)
    return {
      description: `Enter bid for CryptoPunk ${params.punkId}`,
      request: {
        address: this.address,
        abi: cryptoPunksMarketAbi,
        functionName: 'enterBidForPunk',
        args: [BigInt(params.punkId)],
        value: params.amountWei,
      },
    }
  }

  enterBid(params: { punkId: number; amountWei: bigint }): Promise<TransactionHash> {
    return this.write(this.prepareEnterBid(params))
  }

  prepareAcceptBid(params: { punkId: number; minPriceWei: bigint }): ContractWritePlan {
    validatePunkId(params.punkId)
    assertWei('minPriceWei', params.minPriceWei)
    return {
      description: `Accept bid for CryptoPunk ${params.punkId}`,
      request: {
        address: this.address,
        abi: cryptoPunksMarketAbi,
        functionName: 'acceptBidForPunk',
        args: [BigInt(params.punkId), params.minPriceWei],
      },
    }
  }

  acceptBid(params: { punkId: number; minPriceWei: bigint }): Promise<TransactionHash> {
    return this.write(this.prepareAcceptBid(params))
  }

  prepareWithdrawBid(punkId: number): ContractWritePlan {
    validatePunkId(punkId)
    return {
      description: `Withdraw bid for CryptoPunk ${punkId}`,
      request: {
        address: this.address,
        abi: cryptoPunksMarketAbi,
        functionName: 'withdrawBidForPunk',
        args: [BigInt(punkId)],
      },
    }
  }

  withdrawBid(punkId: number): Promise<TransactionHash> {
    return this.write(this.prepareWithdrawBid(punkId))
  }

  prepareTransfer(params: { punkId: number; to: Address }): ContractWritePlan {
    validatePunkId(params.punkId)
    return {
      description: `Transfer CryptoPunk ${params.punkId}`,
      request: {
        address: this.address,
        abi: cryptoPunksMarketAbi,
        functionName: 'transferPunk',
        args: [params.to, BigInt(params.punkId)],
      },
    }
  }

  transfer(params: { punkId: number; to: Address }): Promise<TransactionHash> {
    return this.write(this.prepareTransfer(params))
  }

  prepareWithdraw(): ContractWritePlan {
    return {
      description: 'Withdraw CryptoPunks market balance',
      request: {
        address: this.address,
        abi: cryptoPunksMarketAbi,
        functionName: 'withdraw',
      },
    }
  }

  withdraw(): Promise<TransactionHash> {
    return this.write(this.prepareWithdraw())
  }

  private async read<T>(functionName: string, args: readonly unknown[] = []): Promise<T> {
    if (!this.publicClient) throw new PunksDataValidationError('publicClient is required for reads')
    return readContract<T>(this.publicClient, {
      address: this.address,
      abi: cryptoPunksMarketAbi,
      functionName,
      args,
    })
  }

  private write(plan: ContractWritePlan): Promise<TransactionHash> {
    return writeContract(plan, this.walletClient, this.account)
  }
}

export type LotItemInput = {
  punkId: number
  standard?: PunkStandardRef
  weightBps?: number
}

export type LotItem = {
  punkId: number
  standard: PunkStandardValue
  weightBps: number
}

export type OfferSlotInput = CompileOfferSlotInput

export type PlaceOfferInput = {
  amountWei: bigint
  query?: PunkQuery
  standard?: PunkStandardRef
  includeIds?: Iterable<number>
  excludeIds?: Iterable<number>
  slots?: readonly OfferSlotInput[]
}

export type PunksAuctionConfig = WalletConfig & {
  address?: Address
  dataset: PunksDataset
}

export class PunksAuctionClient {
  readonly address?: Address
  private readonly dataset: PunksDataset
  private readonly publicClient?: PublicClient
  private readonly walletClient?: WalletClient
  private readonly account?: Address

  constructor(config: PunksAuctionConfig) {
    this.address = config.address
    this.dataset = config.dataset
    this.publicClient = config.publicClient
    this.walletClient = config.walletClient
    this.account = config.account
  }

  slot(input: OfferSlotInput = {}): CompiledOfferSlot {
    return compileOfferSlot(this.dataset.source, input)
  }

  async vaultFactoryAddress(): Promise<Address> {
    return this.read<Address>('PUNK_VAULTS')
  }

  async canonicalMarketAddress(): Promise<Address> {
    return this.read<Address>('PUNKS')
  }

  async v1MarketAddress(): Promise<Address> {
    return this.read<Address>('PUNKS_V1')
  }

  /// Returns the deterministic vault address for `user`. Same value whether
  /// the vault is already deployed or not — safe to deposit to before deploy.
  async vaultFor(user: Address): Promise<Address> {
    const factory = await this.vaultFactoryAddress()
    return readContract<Address>(this.requirePublicClient(), {
      address: factory,
      abi: punkVaultFactoryAbi,
      functionName: 'predictVault',
      args: [user],
    })
  }

  async prepareDeposit(params: {
    owner: Address
    punkId: number
    standard?: PunkStandardRef
  }): Promise<ContractWritePlan> {
    validatePunkId(params.punkId)
    const standard = normalizePunkStandard(params.standard ?? 'cryptopunks')
    const [vault, market] = await Promise.all([
      this.vaultFor(params.owner),
      this.marketAddressFor(standard),
    ])
    return {
      description: `Deposit CryptoPunk ${params.punkId} to auction vault`,
      request: {
        address: market,
        abi: cryptoPunksMarketAbi,
        functionName: 'transferPunk',
        args: [vault, BigInt(params.punkId)],
      },
    }
  }

  async deposit(params: {
    owner: Address
    punkId: number
    standard?: PunkStandardRef
  }): Promise<TransactionHash> {
    return this.write(await this.prepareDeposit(params))
  }

  /// Open deploy path: anyone may call. Produces a clean vault with no
  /// approvals — the owner sets approvals afterwards.
  async prepareEnsureVault(user: Address): Promise<ContractWritePlan> {
    return {
      description: 'Deploy auction vault',
      request: {
        address: await this.vaultFactoryAddress(),
        abi: punkVaultFactoryAbi,
        functionName: 'ensureVault',
        args: [user],
      },
    }
  }

  async ensureVault(user: Address): Promise<TransactionHash> {
    return this.write(await this.prepareEnsureVault(user))
  }

  /// Owner-only deploy path: bundles deploy + one-shot operator pre-approval
  /// in one tx. msg.sender becomes the immutable owner.
  async prepareEnsureMyVault(operators: readonly Address[]): Promise<ContractWritePlan> {
    return {
      description: 'Deploy your vault and pre-approve operators',
      request: {
        address: await this.vaultFactoryAddress(),
        abi: punkVaultFactoryAbi,
        functionName: 'ensureMyVault',
        args: [operators],
      },
    }
  }

  async ensureMyVault(operators: readonly Address[]): Promise<TransactionHash> {
    return this.write(await this.prepareEnsureMyVault(operators))
  }

  /// Reclaim is a direct `vault.transferPunk(market, idx, owner)` — works
  /// because the vault's owner is implicitly authorized.
  async prepareReclaim(params: {
    punkId: number
    standard?: PunkStandardRef
  }): Promise<ContractWritePlan> {
    validatePunkId(params.punkId)
    const owner = this.requireAccount()
    const standard = normalizePunkStandard(params.standard ?? 'cryptopunks')
    const [vault, market] = await Promise.all([
      this.vaultFor(owner),
      this.marketAddressFor(standard),
    ])
    return {
      description: `Reclaim CryptoPunk ${params.punkId} from auction vault`,
      request: {
        address: vault,
        abi: punkVaultAbi,
        functionName: 'transferPunk',
        args: [market, BigInt(params.punkId), owner],
      },
    }
  }

  async reclaim(params: { punkId: number; standard?: PunkStandardRef }): Promise<TransactionHash> {
    return this.write(await this.prepareReclaim(params))
  }

  prepareCreateLot(params: {
    items: readonly LotItemInput[]
    reserveWei: bigint
  }): ContractWritePlan {
    const items = normalizeLotItems(params.items)
    assertWei('reserveWei', params.reserveWei)
    return {
      description: 'Create CryptoPunks auction lot',
      request: {
        address: this.requireAddress(),
        abi: punksAuctionAbi,
        functionName: 'createLot',
        args: [items, params.reserveWei],
      },
    }
  }

  createLot(params: {
    items: readonly LotItemInput[]
    reserveWei: bigint
  }): Promise<TransactionHash> {
    return this.write(this.prepareCreateLot(params))
  }

  prepareUpdateLot(params: {
    lotId: bigint | number
    reserveWei: bigint
  }): ContractWritePlan {
    assertWei('reserveWei', params.reserveWei)
    return {
      description: `Update CryptoPunks lot ${params.lotId.toString()}`,
      request: {
        address: this.requireAddress(),
        abi: punksAuctionAbi,
        functionName: 'updateLot',
        args: [BigInt(params.lotId), params.reserveWei],
      },
    }
  }

  updateLot(params: {
    lotId: bigint | number
    reserveWei: bigint
  }): Promise<TransactionHash> {
    return this.write(this.prepareUpdateLot(params))
  }

  prepareCancelLot(lotId: bigint | number): ContractWritePlan {
    return simpleAuctionWrite(this.requireAddress(), 'Cancel CryptoPunks lot', 'cancelLot', [
      BigInt(lotId),
    ])
  }

  cancelLot(lotId: bigint | number): Promise<TransactionHash> {
    return this.write(this.prepareCancelLot(lotId))
  }

  prepareClearStaleLot(lotId: bigint | number): ContractWritePlan {
    return simpleAuctionWrite(this.requireAddress(), 'Clear stale CryptoPunks lot', 'clearStaleLot', [
      BigInt(lotId),
    ])
  }

  clearStaleLot(lotId: bigint | number): Promise<TransactionHash> {
    return this.write(this.prepareClearStaleLot(lotId))
  }

  prepareOpenAuction(params: {
    lotId: bigint | number
    reserveWei: bigint
    bidWei?: bigint
  }): ContractWritePlan {
    assertWei('reserveWei', params.reserveWei)
    const value = params.bidWei ?? params.reserveWei
    assertWei('bidWei', value)
    return {
      description: `Open CryptoPunks auction lot ${params.lotId.toString()}`,
      request: {
        address: this.requireAddress(),
        abi: punksAuctionAbi,
        functionName: 'openAuction',
        args: [BigInt(params.lotId), params.reserveWei],
        value,
      },
    }
  }

  openAuction(params: {
    lotId: bigint | number
    reserveWei: bigint
    bidWei?: bigint
  }): Promise<TransactionHash> {
    return this.write(this.prepareOpenAuction(params))
  }

  prepareBid(params: { auctionId: bigint | number; amountWei: bigint }): ContractWritePlan {
    assertWei('amountWei', params.amountWei)
    return {
      description: `Bid on CryptoPunks auction ${params.auctionId.toString()}`,
      request: {
        address: this.requireAddress(),
        abi: punksAuctionAbi,
        functionName: 'bid',
        args: [BigInt(params.auctionId)],
        value: params.amountWei,
      },
    }
  }

  bid(params: { auctionId: bigint | number; amountWei: bigint }): Promise<TransactionHash> {
    return this.write(this.prepareBid(params))
  }

  preparePlaceOffer(input: PlaceOfferInput): ContractWritePlan {
    assertWei('amountWei', input.amountWei)
    const slots =
      input.slots?.map((slot) => this.slot(slot)) ??
      [this.slot({
        query: input.query,
        standard: input.standard,
        includeIds: input.includeIds,
        excludeIds: input.excludeIds,
      })]
    if (slots.length === 0) throw new PunksDataValidationError('offer must contain at least one slot')
    return {
      description: 'Place CryptoPunks offer',
      request: {
        address: this.requireAddress(),
        abi: punksAuctionAbi,
        functionName: 'placeOffer',
        args: [input.amountWei, slots],
        value: input.amountWei,
      },
    }
  }

  placeOffer(input: PlaceOfferInput): Promise<TransactionHash> {
    return this.write(this.preparePlaceOffer(input))
  }

  prepareCancelOffer(offerId: bigint | number): ContractWritePlan {
    return simpleAuctionWrite(this.requireAddress(), 'Cancel CryptoPunks offer', 'cancelOffer', [
      BigInt(offerId),
    ])
  }

  cancelOffer(offerId: bigint | number): Promise<TransactionHash> {
    return this.write(this.prepareCancelOffer(offerId))
  }

  prepareAdjustOfferAmount(params: {
    offerId: bigint | number
    amountWei: bigint
    increase: boolean
  }): ContractWritePlan {
    assertWei('amountWei', params.amountWei)
    return {
      description: 'Adjust CryptoPunks offer amount',
      request: {
        address: this.requireAddress(),
        abi: punksAuctionAbi,
        functionName: 'adjustOfferAmount',
        args: [BigInt(params.offerId), params.amountWei, params.increase],
        value: params.increase ? params.amountWei : 0n,
      },
    }
  }

  adjustOfferAmount(params: {
    offerId: bigint | number
    amountWei: bigint
    increase: boolean
  }): Promise<TransactionHash> {
    return this.write(this.prepareAdjustOfferAmount(params))
  }

  prepareAcceptOffer(params: {
    offerId: bigint | number
    punkId: number
    expectedListingWei: bigint
  }): ContractWritePlan {
    validatePunkId(params.punkId)
    assertWei('expectedListingWei', params.expectedListingWei)
    return simpleAuctionWrite(this.requireAddress(), 'Accept CryptoPunks offer', 'acceptOffer', [
      BigInt(params.offerId),
      params.punkId,
      params.expectedListingWei,
    ])
  }

  acceptOffer(params: {
    offerId: bigint | number
    punkId: number
    expectedListingWei: bigint
  }): Promise<TransactionHash> {
    return this.write(this.prepareAcceptOffer(params))
  }

  prepareAcceptOfferFromLot(params: {
    offerId: bigint | number
    lotId: bigint | number
    minAmountWei: bigint
  }): ContractWritePlan {
    assertWei('minAmountWei', params.minAmountWei)
    return simpleAuctionWrite(
      this.requireAddress(),
      'Accept CryptoPunks offer from lot',
      'acceptOfferFromLot',
      [BigInt(params.offerId), BigInt(params.lotId), params.minAmountWei],
    )
  }

  acceptOfferFromLot(params: {
    offerId: bigint | number
    lotId: bigint | number
    minAmountWei: bigint
  }): Promise<TransactionHash> {
    return this.write(this.prepareAcceptOfferFromLot(params))
  }

  prepareStartAuctionFromOffer(params: {
    offerId: bigint | number
    lotId: bigint | number
    minAmountWei: bigint
  }): ContractWritePlan {
    assertWei('minAmountWei', params.minAmountWei)
    return simpleAuctionWrite(
      this.requireAddress(),
      'Start CryptoPunks auction from offer',
      'startAuctionFromOffer',
      [BigInt(params.offerId), BigInt(params.lotId), params.minAmountWei],
    )
  }

  startAuctionFromOffer(params: {
    offerId: bigint | number
    lotId: bigint | number
    minAmountWei: bigint
  }): Promise<TransactionHash> {
    return this.write(this.prepareStartAuctionFromOffer(params))
  }

  prepareSettle(auctionId: bigint | number): ContractWritePlan {
    return simpleAuctionWrite(this.requireAddress(), 'Settle CryptoPunks auction', 'settle', [
      BigInt(auctionId),
    ])
  }

  settle(auctionId: bigint | number): Promise<TransactionHash> {
    return this.write(this.prepareSettle(auctionId))
  }

  async minimumBid(auctionId: bigint | number): Promise<bigint> {
    return this.read<bigint>('currentMinBidWei', [BigInt(auctionId)])
  }

  async isActive(auctionId: bigint | number): Promise<boolean> {
    return this.read<boolean>('auctionActive', [BigInt(auctionId)])
  }

  private async marketAddressFor(standard: PunkStandardValue): Promise<Address> {
    return standard === PunkStandard.CryptoPunks
      ? this.canonicalMarketAddress()
      : this.v1MarketAddress()
  }

  private async read<T>(functionName: string, args: readonly unknown[] = []): Promise<T> {
    return readContract<T>(this.requirePublicClient(), {
      address: this.requireAddress(),
      abi: punksAuctionAbi,
      functionName,
      args,
    })
  }

  private write(plan: ContractWritePlan): Promise<TransactionHash> {
    return writeContract(plan, this.walletClient, this.account)
  }

  private requireAddress(): Address {
    if (!this.address) {
      throw new PunksDataValidationError('auction address is required for auction actions')
    }
    return this.address
  }

  private requirePublicClient(): PublicClient {
    if (!this.publicClient) throw new PunksDataValidationError('publicClient is required for reads')
    return this.publicClient
  }

  private requireAccount(): Address {
    if (!this.account) {
      throw new PunksDataValidationError('account is required for owner-scoped actions')
    }
    return this.account
  }
}

function normalizeLotItems(items: readonly LotItemInput[]): LotItem[] {
  if (items.length === 0) throw new PunksDataValidationError('lot must contain at least one item')
  const anyWeight = items.some((item) => item.weightBps !== undefined)
  const allWeight = items.every((item) => item.weightBps !== undefined)
  if (anyWeight && !allWeight) {
    throw new PunksDataValidationError('provide weightBps for every lot item or none of them')
  }

  const defaultWeights = splitWeights(items.length)
  const normalized = items.map((item, index) => {
    validatePunkId(item.punkId)
    const weightBps = item.weightBps ?? defaultWeights[index]
    assertIntegerInRange('weightBps', weightBps, 1, 10_000)
    return {
      punkId: item.punkId,
      standard: normalizePunkStandard(item.standard ?? 'cryptopunks'),
      weightBps,
    }
  })
  const totalWeight = normalized.reduce((sum, item) => sum + item.weightBps, 0)
  if (totalWeight !== 10_000) {
    throw new PunksDataValidationError('lot item weights must sum to 10000 basis points')
  }
  return normalized
}

function splitWeights(count: number): number[] {
  assertIntegerInRange('item count', count, 1, 100)
  const base = Math.floor(10_000 / count)
  const remainder = 10_000 - base * count
  return Array.from({ length: count }, (_, index) => base + (index === 0 ? remainder : 0))
}

function simpleAuctionWrite(
  address: Address,
  description: string,
  functionName: string,
  args: readonly unknown[],
): ContractWritePlan {
  return {
    description,
    request: {
      address,
      abi: punksAuctionAbi,
      functionName,
      args,
    },
  }
}

async function readContract<T>(
  publicClient: PublicClient,
  request: ContractWriteRequest,
): Promise<T> {
  return (publicClient.readContract as unknown as (value: ContractWriteRequest) => Promise<T>)(
    request,
  )
}

async function writeContract(
  plan: ContractWritePlan,
  walletClient: WalletClient | undefined,
  account: Address | undefined,
): Promise<TransactionHash> {
  if (!walletClient) throw new PunksDataValidationError('walletClient is required for writes')
  const resolvedAccount = account ?? walletClient.account?.address
  const request = resolvedAccount === undefined
    ? plan.request
    : { ...plan.request, account: resolvedAccount }
  return (walletClient.writeContract as unknown as (value: typeof request) => Promise<TransactionHash>)(
    request,
  )
}

function assertWei(label: string, value: bigint): void {
  if (typeof value !== 'bigint' || value < 0n) {
    throw new PunksDataValidationError(`${label} must be a non-negative bigint`)
  }
}
