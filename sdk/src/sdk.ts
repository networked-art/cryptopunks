import type { Address, PublicClient, WalletClient } from 'viem'
import { createPunksDataClient, type PunksDataClient } from './client'
import { createPunksRendererClient, type PunksRendererClient } from './renderer'
import {
  PunksAuctionClient,
  PunksMarketClient,
  type ContractWritePlan,
  type OfferSlotInput,
  type PlaceOfferInput,
  type PunksAuctionConfig,
  type PunksMarketConfig,
  type TransactionHash,
} from './actions'
import {
  PunksDataset,
  type PunksDatasetConfig,
} from './dataset'
import { PunkImageRenderer } from './render'
import type {
  PunkQuery,
  PunkSummary,
  PunkSummaryOptions,
} from './types'

export type PunksSdkAddresses = {
  renderer?: Address
  market?: Address
  auction?: Address
}

export type PunksSdkConfig = PunksDatasetConfig & {
  publicClient?: PublicClient
  walletClient?: WalletClient
  account?: Address
  addresses?: PunksSdkAddresses
}

export type PunksContractClients = {
  data?: PunksDataClient
  renderer?: PunksRendererClient
}

export class PunksSdk {
  readonly dataset: PunksDataset
  readonly render: PunkImageRenderer
  readonly market: PunksMarketClient
  readonly auctions: PunksAuctionClient
  readonly offers: PunksOffersFacade
  readonly contracts: PunksContractClients

  constructor(config: PunksSdkConfig = {}) {
    this.dataset = new PunksDataset({ dataset: config.dataset })
    this.render = new PunkImageRenderer(this.dataset)

    const wallet = {
      publicClient: config.publicClient,
      walletClient: config.walletClient,
      account: config.account,
    }

    this.market = new PunksMarketClient({
      ...wallet,
      address: config.addresses?.market,
    } satisfies PunksMarketConfig)
    this.auctions = new PunksAuctionClient({
      ...wallet,
      address: config.addresses?.auction,
      dataset: this.dataset,
    } satisfies PunksAuctionConfig)
    this.offers = new PunksOffersFacade(this.auctions)
    this.contracts = config.publicClient
      ? {
          data: createPunksDataClient({ publicClient: config.publicClient }),
          renderer: createPunksRendererClient({
            publicClient: config.publicClient,
            address: config.addresses?.renderer,
          }),
        }
      : {}
  }

  search(query: PunkQuery = {}): number[] {
    return this.dataset.search(query)
  }

  count(query: PunkQuery = {}): number {
    return this.dataset.count(query)
  }

  facets(query: PunkQuery = {}) {
    return this.dataset.facets(query)
  }

  get(punkId: number, options: PunkSummaryOptions = {}): PunkSummary {
    return this.dataset.get(punkId, options)
  }

  getMany(punkIds: readonly number[], options: PunkSummaryOptions = {}): PunkSummary[] {
    return this.dataset.getMany(punkIds, options)
  }
}

export class PunksOffersFacade {
  private readonly auctions: PunksAuctionClient

  constructor(auctions: PunksAuctionClient) {
    this.auctions = auctions
  }

  slot(input: OfferSlotInput = {}) {
    return this.auctions.slot(input)
  }

  preparePlace(input: PlaceOfferInput): ContractWritePlan {
    return this.auctions.preparePlaceOffer(input)
  }

  place(input: PlaceOfferInput): Promise<TransactionHash> {
    return this.auctions.placeOffer(input)
  }

  prepareCancel(offerId: bigint | number): ContractWritePlan {
    return this.auctions.prepareCancelOffer(offerId)
  }

  cancel(offerId: bigint | number): Promise<TransactionHash> {
    return this.auctions.cancelOffer(offerId)
  }

  prepareAdjustAmount(params: {
    offerId: bigint | number
    amountWei: bigint
    increase: boolean
  }): ContractWritePlan {
    return this.auctions.prepareAdjustOfferAmount(params)
  }

  adjustAmount(params: {
    offerId: bigint | number
    amountWei: bigint
    increase: boolean
  }): Promise<TransactionHash> {
    return this.auctions.adjustOfferAmount(params)
  }

  prepareAdjustSettlement(params: {
    offerId: bigint | number
    amountWei: bigint
    increase: boolean
  }): ContractWritePlan {
    return this.auctions.prepareAdjustOfferSettlement(params)
  }

  adjustSettlement(params: {
    offerId: bigint | number
    amountWei: bigint
    increase: boolean
  }): Promise<TransactionHash> {
    return this.auctions.adjustOfferSettlement(params)
  }

  prepareAccept(params: { offerId: bigint | number; punkId: number }): ContractWritePlan {
    return this.auctions.prepareAcceptOffer(params)
  }

  accept(params: { offerId: bigint | number; punkId: number }): Promise<TransactionHash> {
    return this.auctions.acceptOffer(params)
  }

  prepareAcceptFromLot(params: {
    offerId: bigint | number
    lotId: bigint | number
  }): ContractWritePlan {
    return this.auctions.prepareAcceptOfferFromLot(params)
  }

  acceptFromLot(params: {
    offerId: bigint | number
    lotId: bigint | number
  }): Promise<TransactionHash> {
    return this.auctions.acceptOfferFromLot(params)
  }
}

export function createPunksSdk(config: PunksSdkConfig = {}): PunksSdk {
  return new PunksSdk(config)
}

export const createPunks = createPunksSdk
