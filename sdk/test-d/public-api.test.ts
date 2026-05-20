import type { Address, Hex, WalletClient } from 'viem'
import {
  createPunksSimilarity,
  createPunksDataClient,
  createPunksSdk,
  createStashClient,
  createStashFactoryClient,
  stashPunkBidTypedData,
  type ContractWritePlan,
  type PunkMarketBid,
  type PunkSimilarityExplanation,
  type PunkSimilarityResult,
  type StashOwnerStatus,
  type StashPunkBid,
  type TransactionHash,
} from '../src/index.ts'
import {
  createPunksSimilarity as createPunksSimilaritySubpath,
  type PunkSimilarityOptions,
} from '../src/similarity.ts'

declare const owner: Address
declare const receiver: Address
declare const operator: Address
declare const stashAddress: Address
declare const auction: Address
declare const walletClient: WalletClient

const bid: StashPunkBid = {
  order: {
    numberOfUnits: 1,
    pricePerUnit: 10n,
    auction,
  },
  accountNonce: 0n,
  bidNonce: 1n,
  expiration: 0n,
  root: `0x${'00'.repeat(32)}` as Hex,
}

const typedData = stashPunkBidTypedData({ stash: stashAddress, bid })
const typedDataChainId: 1 = typedData.domain.chainId
const typedDataVerifyingContract: Address = typedData.domain.verifyingContract
const typedDataPrimaryType: 'PunkBid' = typedData.primaryType
const typedDataMessage: StashPunkBid = typedData.message

// @ts-expect-error Stash Punk bid typed data is always Ethereum mainnet.
stashPunkBidTypedData({ stash: stashAddress, chainId: 1, bid })

const stash = createStashClient({ address: stashAddress })
const stashBidTypedData = stash.typedDataForPunkBid({ bid })
const stashBidTypedDataChainId: 1 = stashBidTypedData.domain.chainId
const signedBid: Promise<Hex> = stash.signPunkBid({ bid })
const stashOwner: Promise<Address> = stash.owner()

// @ts-expect-error Stash Punk bid typed data no longer accepts a chainId option.
stash.typedDataForPunkBid({ chainId: 1, bid })

// @ts-expect-error Stash Punk bid signing no longer accepts a chainId option.
stash.signPunkBid({ chainId: 1, bid })

// @ts-expect-error Stash initialization is not part of the public SDK client.
stash.prepareInitialize
// @ts-expect-error Stash initialization is not part of the public SDK client.
stash.initialize

const factory = createStashFactoryClient()
const factoryCurrentVersion: Promise<bigint> = factory.currentVersion()
const factoryImplementation: Promise<Address> = factory.implementation(1n)
const factoryImplementationAlias: Promise<Address> = factory.implementations(1n)
const factoryStashAddress: Promise<Address> = factory.stashAddressFor(owner)
const factoryDeployed: Promise<boolean> = factory.ownerHasDeployed(owner)
const factoryOwnerStatus: Promise<StashOwnerStatus> =
  factory.statusForOwner(owner)
const factoryIsStash: Promise<boolean> = factory.isStash(stashAddress)
const factoryIsAuction: Promise<boolean> = factory.isAuction(auction)
const factoryDeployPlan: ContractWritePlan = factory.prepareDeployStash(owner)
const factoryDeployTx: Promise<TransactionHash> = factory.deployStash(owner)
const factoryUpgradePlan: ContractWritePlan = factory.prepareUpgradeStash()
const factoryUpgradeTx: Promise<TransactionHash> = factory.upgradeStash()

// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.stashVerifier
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.owner
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.ownershipHandoverExpiresAt
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.rolesOf
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.hasAllRoles
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.hasAnyRole
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.prepareAddVersion
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.addVersion
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.prepareSetAuction
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.setAuction
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.prepareTransferOwnership
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.transferOwnership
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.prepareRenounceOwnership
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.renounceOwnership
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.prepareRequestOwnershipHandover
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.requestOwnershipHandover
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.prepareCompleteOwnershipHandover
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.completeOwnershipHandover
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.prepareCancelOwnershipHandover
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.cancelOwnershipHandover
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.prepareGrantRoles
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.grantRoles
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.prepareRevokeRoles
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.revokeRoles
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.prepareRenounceRoles
// @ts-expect-error Protocol-owner helper is intentionally not public.
factory.renounceRoles

const punks = createPunksSdk()
const punksData = createPunksDataClient({})
const punksDataHash: Promise<Hex> = punksData.datasetHash()
const offerPlan: ContractWritePlan = punks.offers.preparePlace({
  amountWei: 10n,
  includeIds: [8348],
})
const marketBid: Promise<PunkMarketBid> = punks.market.bid(8348)
const marketBidPlan: ContractWritePlan = punks.market.prepareEnterBid({
  punkId: 8348,
  amountWei: 10n,
})
const marketAcceptBidPlan: ContractWritePlan = punks.market.prepareAcceptBid({
  punkId: 8348,
  minPriceWei: 10n,
})
const marketWithdrawBidPlan: ContractWritePlan =
  punks.market.prepareWithdrawBid(8348)

const similarity = createPunksSimilarity()
const similarityScore: number = similarity.score(8348, 7804)
const similarityExplanation: PunkSimilarityExplanation = similarity.explain(
  8348,
  7804,
)
const similarityResults: PunkSimilarityResult[] = similarity.similar(8348, {
  limit: 12,
})
const similarityRecommendations: PunkSimilarityResult[] = similarity.recommend({
  liked: [8348, 7804],
  disliked: [1234],
  limit: 20,
})
const similarityOptions: PunkSimilarityOptions = {
  profile: 'colors',
  weights: { colors: 0.7 },
  filter: { type: 'Zombie' },
}
const similarityFromSubpath = createPunksSimilaritySubpath()
const subpathSimilarityScore: number = similarityFromSubpath.score(8348, 7804)

// @ts-expect-error Offers always deliver to the offerer; custom receivers are not supported.
punks.offers.preparePlace({ amountWei: 10n, receiver, includeIds: [8348] })

// @ts-expect-error PunksData contract client is read-only and does not accept wallet clients.
createPunksDataClient({ walletClient })

// @ts-expect-error PunksData loader writes are not part of the public SDK client.
punks.data.contract.prepareLoadBlobChunk
// @ts-expect-error PunksData sealing writes are not part of the public SDK client.
punks.data.contract.prepareSeal
// @ts-expect-error PunksData sealing status is not part of the public SDK client.
punks.data.contract.isSealed
// @ts-expect-error PunksData loader owner is not part of the public SDK client.
punks.data.contract.owner

const c721TransferPlan: ContractWritePlan =
  punks.wrappers.modern.prepareTransferFrom({
    from: owner,
    to: receiver,
    punkId: 8348,
  })
const c721TransferTx: Promise<TransactionHash> =
  punks.wrappers.modern.transferFrom({
    from: owner,
    to: receiver,
    punkId: 8348,
  })
const c721SafeTransferPlan: ContractWritePlan =
  punks.wrappers.modern.prepareSafeTransferFrom({
    from: owner,
    to: receiver,
    punkId: 8348,
    data: '0x',
  })

const legacyTransferPlan: ContractWritePlan =
  punks.wrappers.legacy.prepareTransferFrom({
    from: owner,
    to: receiver,
    punkId: 8348,
  })
const legacyTransferTx: Promise<TransactionHash> =
  punks.wrappers.legacy.transferFrom({
    from: owner,
    to: receiver,
    punkId: 8348,
  })
const legacySafeTransferPlan: ContractWritePlan =
  punks.wrappers.legacy.prepareSafeTransferFrom({
    from: owner,
    to: receiver,
    punkId: 8348,
    data: '0x',
  })
const legacyOwner: Promise<Address> = punks.wrappers.legacy.owner()
const legacyPaused: Promise<boolean> = punks.wrappers.legacy.paused()
const legacyApprovalPlan: ContractWritePlan =
  punks.wrappers.legacy.prepareApprove({
    operator,
    punkId: 8348,
  })

// @ts-expect-error Legacy wrapper metadata admin write is intentionally not public.
punks.wrappers.legacy.prepareSetBaseURI
// @ts-expect-error Legacy wrapper metadata admin write is intentionally not public.
punks.wrappers.legacy.setBaseURI
// @ts-expect-error Legacy wrapper pause admin write is intentionally not public.
punks.wrappers.legacy.preparePause
// @ts-expect-error Legacy wrapper pause admin write is intentionally not public.
punks.wrappers.legacy.pause
// @ts-expect-error Legacy wrapper pause admin write is intentionally not public.
punks.wrappers.legacy.prepareUnpause
// @ts-expect-error Legacy wrapper pause admin write is intentionally not public.
punks.wrappers.legacy.unpause
// @ts-expect-error Legacy wrapper ownership admin write is intentionally not public.
punks.wrappers.legacy.prepareTransferOwnership
// @ts-expect-error Legacy wrapper ownership admin write is intentionally not public.
punks.wrappers.legacy.transferOwnership
// @ts-expect-error Legacy wrapper ownership admin write is intentionally not public.
punks.wrappers.legacy.prepareRenounceOwnership
// @ts-expect-error Legacy wrapper ownership admin write is intentionally not public.
punks.wrappers.legacy.renounceOwnership

// V1 wrapper surface — third-party PunksV1Wrapper + UnwrapV1Punks batch helper.
const v1WrapperOwner: Promise<Address> = punks.v1Wrapper.ownerOf(4156)
const v1WrapperApproved: Promise<boolean> = punks.v1Wrapper.isApprovedForAll(
  owner,
  operator,
)
const v1WrapperBatchReady: Promise<boolean> =
  punks.v1Wrapper.isBatchUnwrapApproved(owner)
const v1WrapPlan: ContractWritePlan = punks.v1Wrapper.prepareWrap(4156)
const v1UnwrapPlan: ContractWritePlan = punks.v1Wrapper.prepareUnwrap(4156)
const v1UnwrapTx: Promise<TransactionHash> = punks.v1Wrapper.unwrap(4156)
const v1BatchApprovePlan: ContractWritePlan =
  punks.v1Wrapper.prepareApproveBatchUnwrap()
const v1BatchUnwrapPlan: ContractWritePlan = punks.v1Wrapper.prepareUnwrapBatch(
  [4156, 7804],
)
const v1BatchFlow: Promise<ContractWritePlan[]> =
  punks.v1Wrapper.prepareUnwrapBatchFlow({ owner, punkIds: [4156, 7804] })
const v1BatchFlowTxs: Promise<TransactionHash[]> =
  punks.v1Wrapper.unwrapBatchFlow({ owner, punkIds: [4156, 7804] })
