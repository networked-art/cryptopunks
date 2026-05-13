import type { Address, PublicClient, WalletClient } from 'viem'
import { createPunksDataClient, type PunksDataClient } from './client'
import { LegacyCryptoPunksDataClient } from './legacy-data'
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
import { PunksStashFacade } from './stash'
import { PunksWrappersFacade } from './wrappers'
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
  data?: Address
  legacyData?: Address
  renderer?: Address
  market?: Address
  auction?: Address
  wrappedPunks?: Address
  c721Wrapper?: Address
  stashFactory?: Address
  stash?: Address
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
  readonly data: PunksDataFacade
  readonly render: PunkImageRenderer
  readonly market: PunksMarketClient
  readonly wrappers: PunksWrappersFacade
  readonly stash: PunksStashFacade
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
    this.data = new PunksDataFacade({
      publicClient: config.publicClient,
      dataAddress: config.addresses?.data,
      legacyDataAddress: config.addresses?.legacyData,
    })
    this.wrappers = new PunksWrappersFacade({
      ...wallet,
      marketAddress: config.addresses?.market,
      legacyAddress: config.addresses?.wrappedPunks,
      c721Address: config.addresses?.c721Wrapper,
      stashFactoryAddress: config.addresses?.stashFactory,
    })
    this.stash = new PunksStashFacade({
      ...wallet,
      factoryAddress: config.addresses?.stashFactory,
      stashAddress: config.addresses?.stash,
    })
    this.auctions = new PunksAuctionClient({
      ...wallet,
      address: config.addresses?.auction,
      dataset: this.dataset,
    } satisfies PunksAuctionConfig)
    this.offers = new PunksOffersFacade(this.auctions)
    this.contracts = config.publicClient
      ? {
          data: this.data.onchain,
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

export type PunksDataFacadeConfig = {
  publicClient?: PublicClient
  dataAddress?: Address
  legacyDataAddress?: Address
}

export class PunksDataFacade {
  readonly onchain: PunksDataClient
  readonly contract: PunksDataClient
  readonly legacy: LegacyCryptoPunksDataClient

  constructor(config: PunksDataFacadeConfig = {}) {
    this.onchain = createPunksDataClient({
      publicClient: config.publicClient,
      address: config.dataAddress,
    })
    this.contract = this.onchain
    this.legacy = new LegacyCryptoPunksDataClient({
      publicClient: config.publicClient,
      address: config.legacyDataAddress,
    })
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
