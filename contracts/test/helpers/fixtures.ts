import { network } from 'hardhat'

export const DAY = 24 * 60 * 60
export const WEEK = 7 * DAY

export const Standard = {
  ERC721: 0,
  ERC1155: 1,
  CRYPTOPUNKS: 2,
  CRYPTOPUNKS_V1: 3,
} as const

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
  const traits = await viem.deployContract('MockCryptoPunksTraits')
  const auctions = await viem.deployContract('PunksAuction', [
    punks.address,
    punksV1.address,
    traits.address,
  ])

  const escrow = await viem.getContractAt(
    'PunksEscrow',
    (await auctions.read.PUNKS_ESCROW()) as `0x${string}`,
  )
  const escrowV1 = await viem.getContractAt(
    'PunksEscrow',
    (await auctions.read.PUNKS_ESCROW_V1()) as `0x${string}`,
  )

  return {
    connection,
    viem,
    punks,
    punksV1,
    traits,
    auctions,
    escrow,
    escrowV1,
    deployer,
    seller,
    bidder1,
    bidder2,
    other,
    attacker,
  }
}
