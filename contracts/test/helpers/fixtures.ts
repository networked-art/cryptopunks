import { network } from 'hardhat'

// Canonical ENS L1 Reverse Registrar; `PunksVaultFactory`'s constructor
// unconditionally calls `setName` on it, so local networks need code at
// this address before the factory is deployed.
export const REVERSE_REGISTRAR =
  '0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb' as const

export const PUNKS_V1_MARKET =
  '0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D' as const

export const PUNKS_V1_WRAPPER =
  '0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D' as const

export const PUNKS_DATA = '0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C' as const

export async function etchReverseRegistrar(connection: any): Promise<void> {
  const { viem } = connection
  const mock = await viem.deployContract('ReverseRegistrarMock')
  const publicClient = await viem.getPublicClient()
  const code = await publicClient.getCode({ address: mock.address })
  await connection.networkHelpers.setCode(REVERSE_REGISTRAR, code)
}

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

export async function futureTs(
  connection: any,
  seconds: number,
): Promise<bigint> {
  const publicClient = await connection.viem.getPublicClient()
  const block = await publicClient.getBlock()
  return block.timestamp + BigInt(seconds)
}

export async function deployCollectionBidsStack() {
  const connection: any = await network.create()
  const { viem } = connection
  const [deployer, seller, bidder, settler, other, attacker] =
    await viem.getWalletClients()

  const punks = await viem.deployContract('MockCryptoPunksMarket')
  const punksData = await viem.deployContract('MockPunksData')
  const bids = await viem.deployContract('PunksCollectionBids', [
    punks.address,
    punksData.address,
  ])

  return {
    connection,
    viem,
    punks,
    punksData,
    bids,
    deployer,
    seller,
    bidder,
    settler,
    other,
    attacker,
  }
}

export async function deployPunksMarketStack() {
  const connection: any = await network.create()
  const { viem } = connection
  const [deployer, seller, bidder, buyer, settler, other, attacker] =
    await viem.getWalletClients()

  const punksV1Mock = await viem.deployContract('MockCryptoPunksMarketV1Buggy')
  const punksDataMock = await viem.deployContract('MockPunksData')
  const publicClient = await viem.getPublicClient()
  await connection.networkHelpers.setCode(
    PUNKS_V1_MARKET,
    await publicClient.getCode({ address: punksV1Mock.address }),
  )
  await connection.networkHelpers.setCode(
    PUNKS_DATA,
    await publicClient.getCode({ address: punksDataMock.address }),
  )
  const punksV1 = await viem.getContractAt(
    'MockCryptoPunksMarketV1Buggy',
    PUNKS_V1_MARKET,
  )
  const punksData = await viem.getContractAt('MockPunksData', PUNKS_DATA)
  await etchReverseRegistrar(connection)
  const market = await viem.deployContract('PunksMarket')

  return {
    connection,
    viem,
    punksV1,
    punksData,
    market,
    deployer,
    seller,
    bidder,
    buyer,
    settler,
    other,
    attacker,
  }
}

export async function deployUnwrapV1PunksStack() {
  const connection: any = await network.create()
  const { viem } = connection
  const [deployer, alice, bob, settler, other] = await viem.getWalletClients()

  const punksV1Mock = await viem.deployContract('MockCryptoPunksMarketV1Buggy')
  const publicClient = await viem.getPublicClient()
  await connection.networkHelpers.setCode(
    PUNKS_V1_MARKET,
    await publicClient.getCode({ address: punksV1Mock.address }),
  )
  const punksV1 = await viem.getContractAt(
    'MockCryptoPunksMarketV1Buggy',
    PUNKS_V1_MARKET,
  )

  const wrapperMock = await viem.deployContract('MockPunksV1Wrapper')
  await connection.networkHelpers.setCode(
    PUNKS_V1_WRAPPER,
    await publicClient.getCode({ address: wrapperMock.address }),
  )
  const wrapper = await viem.getContractAt(
    'MockPunksV1Wrapper',
    PUNKS_V1_WRAPPER,
  )

  await etchReverseRegistrar(connection)
  const unwrapper = await viem.deployContract('UnwrapV1Punks')

  return {
    connection,
    viem,
    publicClient,
    punksV1,
    wrapper,
    unwrapper,
    deployer,
    alice,
    bob,
    settler,
    other,
  }
}

export async function deployAuctionStack() {
  const connection: any = await network.create()
  const { viem } = connection
  const [deployer, seller, bidder1, bidder2, other, attacker] =
    await viem.getWalletClients()

  const punks = await viem.deployContract('MockCryptoPunksMarket')
  const punksV1 = await viem.deployContract('MockCryptoPunksMarketV1Buggy')
  const punksData = await viem.deployContract('MockPunksData')
  await etchReverseRegistrar(connection)
  const vaultFactory = await viem.deployContract('PunksVaultFactory')
  const auctions = await viem.deployContract('PunksAuction', [
    punks.address,
    punksV1.address,
    punksData.address,
    vaultFactory.address,
  ])
  const escrowAddress = (await auctions.read.ESCROW()) as `0x${string}`
  const escrow = await viem.getContractAt('PunksAuctionEscrow', escrowAddress)

  return {
    connection,
    viem,
    punks,
    punksV1,
    punksData,
    auctions,
    escrow,
    vaultFactory,
    deployer,
    seller,
    bidder1,
    bidder2,
    other,
    attacker,
  }
}
