import { network } from 'hardhat'

export const DAY = 24 * 60 * 60
export const WEEK = 7 * DAY

export const Standard = {
  CRYPTOPUNKS: 0,
  CRYPTOPUNKS_V1: 1,
} as const

export const TOTAL_WEIGHT_BPS = 10_000

export type LotItemInput = {
  standard: number
  punkId: number
  weightBps: number
}

export type FilterInput = {
  requiredTraitMask: bigint
  forbiddenTraitMask: bigint
  anyOfTraitMask: bigint
  requiredColorMask: bigint
  forbiddenColorMask: bigint
  anyOfColorMask: bigint
  minPixelCount: number
  maxPixelCount: number
  minColorCount: number
  maxColorCount: number
}

export type OfferSlotInput = {
  criteria: FilterInput
  standard: number
  includeIds: number[]
  excludeIds: number[]
}

export const emptyCriteria = (): FilterInput => ({
  requiredTraitMask: 0n,
  forbiddenTraitMask: 0n,
  anyOfTraitMask: 0n,
  requiredColorMask: 0n,
  forbiddenColorMask: 0n,
  anyOfColorMask: 0n,
  minPixelCount: 0,
  maxPixelCount: 0,
  minColorCount: 0,
  maxColorCount: 0,
})

export const punkSlot = (
  punkId: number,
  standard: number = Standard.CRYPTOPUNKS,
): OfferSlotInput => ({
  criteria: emptyCriteria(),
  standard,
  includeIds: [punkId],
  excludeIds: [],
})

export const wildcardSlot = (
  standard: number = Standard.CRYPTOPUNKS,
): OfferSlotInput => ({
  criteria: emptyCriteria(),
  standard,
  includeIds: [],
  excludeIds: [],
})

export const lotItem = (
  punkId: number,
  weightBps: number = TOTAL_WEIGHT_BPS,
  standard: number = Standard.CRYPTOPUNKS,
): LotItemInput => ({ standard, punkId, weightBps })

export async function futureTs(connection: any, seconds: number): Promise<bigint> {
  const publicClient = await connection.viem.getPublicClient()
  const block = await publicClient.getBlock()
  return block.timestamp + BigInt(seconds)
}

export async function deployAuctionStack() {
  const connection: any = await network.create()
  const { viem } = connection
  const [deployer, seller, bidder1, bidder2, other, attacker] =
    await viem.getWalletClients()

  const punks = await viem.deployContract('MockCryptoPunksMarket')
  const punksV1 = await viem.deployContract('MockCryptoPunksMarketV1Buggy')
  const punksData = await viem.deployContract('MockPunksData')
  const vaultFactory = await viem.deployContract('PunksVaultFactory')
  const auctions = await viem.deployContract('PunksAuction', [
    punks.address,
    punksV1.address,
    punksData.address,
    vaultFactory.address,
  ])

  return {
    connection,
    viem,
    punks,
    punksV1,
    punksData,
    auctions,
    vaultFactory,
    deployer,
    seller,
    bidder1,
    bidder2,
    other,
    attacker,
  }
}
