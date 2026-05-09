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

export type OfferCriteriaInput = {
  requiredTraitMask: bigint
  forbiddenTraitMask: bigint
  anyOfTraitMask: bigint
  minColorCount: number
  maxColorCount: number
}

export type OfferSlotInput = {
  criteria: OfferCriteriaInput
  standard: number
  includeIds: number[]
  excludeIds: number[]
}

export const emptyCriteria = (): OfferCriteriaInput => ({
  requiredTraitMask: 0n,
  forbiddenTraitMask: 0n,
  anyOfTraitMask: 0n,
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
  const auctions = await viem.deployContract('PunksAuction', [
    punks.address,
    punksV1.address,
    punksData.address,
  ])

  const escrow = await viem.getContractAt(
    'PunksEscrow',
    (await auctions.read.PUNKS_ESCROW()) as `0x${string}`,
  )

  return {
    connection,
    viem,
    punks,
    punksV1,
    punksData,
    auctions,
    escrow,
    deployer,
    seller,
    bidder1,
    bidder2,
    other,
    attacker,
  }
}
