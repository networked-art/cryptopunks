import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseAbiItem, parseEther, zeroAddress } from 'viem'
import {
  DAY,
  deployAuctionStack,
  futureTs,
  Standard,
  WEEK,
} from './helpers/fixtures.js'

type Ctx = Awaited<ReturnType<typeof deployAuctionStack>>

async function assignPunk(ctx: Ctx, to: any, punkId: bigint) {
  await ctx.punks.write.setInitialOwner([to.account.address, punkId])
}

async function assignPunkV1(ctx: Ctx, to: any, punkId: bigint) {
  await ctx.punksV1.write.setInitialOwner([to.account.address, punkId])
}

async function depositPunk(ctx: Ctx, owner: any, punkId: bigint) {
  const escrowAsOwner = await ctx.viem.getContractAt(
    'CryptoPunksEscrow',
    ctx.escrow.address,
    { client: { wallet: owner } },
  )
  await escrowAsOwner.write.ensureVault([owner.account.address])
  const vault = (await ctx.escrow.read.vaults([
    owner.account.address,
  ])) as `0x${string}`

  const punksAsOwner = await ctx.viem.getContractAt(
    'MockCryptoPunksMarket',
    ctx.punks.address,
    { client: { wallet: owner } },
  )
  await punksAsOwner.write.transferPunk([vault, punkId])
  return vault
}

async function depositPunkV1(ctx: Ctx, owner: any, punkId: bigint) {
  const escrowAsOwner = await ctx.viem.getContractAt(
    'CryptoPunksEscrow',
    ctx.escrowV1.address,
    { client: { wallet: owner } },
  )
  await escrowAsOwner.write.ensureVault([owner.account.address])
  const vault = (await ctx.escrowV1.read.vaults([
    owner.account.address,
  ])) as `0x${string}`

  const punksAsOwner = await ctx.viem.getContractAt(
    'MockCryptoPunksMarketV1Buggy',
    ctx.punksV1.address,
    { client: { wallet: owner } },
  )
  await punksAsOwner.write.transferPunk([vault, punkId])
  return vault
}

async function createLot(
  ctx: Ctx,
  seller: any,
  punkId: bigint,
  reserveWei: bigint,
  expiresAt: bigint,
) {
  const auctionsAsSeller = await ctx.viem.getContractAt(
    'CryptoPunksAuctions',
    ctx.auctions.address,
    { client: { wallet: seller } },
  )
  await auctionsAsSeller.write.createLot([
    ctx.punks.address,
    punkId,
    Standard.CRYPTOPUNKS,
    reserveWei,
    expiresAt,
  ])
}

async function createLotV1(
  ctx: Ctx,
  seller: any,
  punkId: bigint,
  reserveWei: bigint,
  expiresAt: bigint,
) {
  const auctionsAsSeller = await ctx.viem.getContractAt(
    'CryptoPunksAuctions',
    ctx.auctions.address,
    { client: { wallet: seller } },
  )
  await auctionsAsSeller.write.createLot([
    ctx.punksV1.address,
    punkId,
    Standard.CRYPTOPUNKS_V1,
    reserveWei,
    expiresAt,
  ])
}

async function openAuction(
  ctx: Ctx,
  bidder: any,
  lotId: bigint,
  reserveWei: bigint,
) {
  const auctionsAsBidder = await ctx.viem.getContractAt(
    'CryptoPunksAuctions',
    ctx.auctions.address,
    { client: { wallet: bidder } },
  )
  await auctionsAsBidder.write.openAuction([lotId, reserveWei], {
    value: reserveWei,
  })
}

describe('CryptoPunksAuctions', () => {
  it('deploys canonical and V1 escrows with deterministic user vaults', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, escrow, escrowV1, punks, punksV1, seller, other } = ctx

    assert.notEqual(escrow.address.toLowerCase(), escrowV1.address.toLowerCase())

    assert.equal(
      ((await escrow.read.AUCTIONS()) as string).toLowerCase(),
      auctions.address.toLowerCase(),
    )
    assert.equal(
      ((await escrow.read.PUNKS()) as string).toLowerCase(),
      punks.address.toLowerCase(),
    )
    assert.equal(
      ((await escrowV1.read.PUNKS()) as string).toLowerCase(),
      punksV1.address.toLowerCase(),
    )

    const predicted = (await escrow.read.predictVault([
      seller.account.address,
    ])) as `0x${string}`
    const escrowAsOther = await ctx.viem.getContractAt(
      'CryptoPunksEscrow',
      escrow.address,
      { client: { wallet: other } },
    )
    await escrowAsOther.write.ensureVault([seller.account.address])

    const stored = (await escrow.read.vaults([
      seller.account.address,
    ])) as `0x${string}`
    assert.equal(stored.toLowerCase(), predicted.toLowerCase())
  })

  it('requires the seller vault to hold the punk before lot creation', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, seller } = ctx
    await assignPunk(ctx, seller, 500n)

    const expiresAt = await futureTs(ctx.connection, WEEK)
    const auctionsAsSeller = await ctx.viem.getContractAt(
      'CryptoPunksAuctions',
      auctions.address,
      { client: { wallet: seller } },
    )

    await ctx.viem.assertions.revertWithCustomError(
      auctionsAsSeller.write.createLot([
        ctx.punks.address,
        500n,
        Standard.CRYPTOPUNKS,
        parseEther('1'),
        expiresAt,
      ]),
      auctions,
      'PunkNotInVault',
    )
  })

  it('opens an auction by pulling the punk from the seller vault into escrow', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, escrow, punks, seller, bidder1 } = ctx

    await assignPunk(ctx, seller, 100n)
    const vault = await depositPunk(ctx, seller, 100n)
    assert.equal(
      ((await punks.read.punkIndexToAddress([100n])) as string).toLowerCase(),
      vault.toLowerCase(),
    )

    const reserveWei = parseEther('1')
    const expiresAt = await futureTs(ctx.connection, WEEK)
    await createLot(ctx, seller, 100n, reserveWei, expiresAt)
    await openAuction(ctx, bidder1, 1n, reserveWei)

    assert.equal(
      ((await punks.read.punkIndexToAddress([100n])) as string).toLowerCase(),
      escrow.address.toLowerCase(),
    )

    const auction = await auctions.read.auctions([1n])
    assert.equal(auction[0].toLowerCase(), seller.account.address.toLowerCase())
    assert.equal(auction[4].toLowerCase(), bidder1.account.address.toLowerCase())
    assert.equal(auction[5], reserveWei)
    assert.equal(await auctions.read.lastLotId(), 1n)
  })

  it('pins the reserve observed by the opener', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, seller, bidder1 } = ctx

    await assignPunk(ctx, seller, 101n)
    await depositPunk(ctx, seller, 101n)

    const originalReserve = parseEther('1')
    const raisedReserve = parseEther('2')
    const expiresAt = await futureTs(ctx.connection, WEEK)
    await createLot(ctx, seller, 101n, originalReserve, expiresAt)

    const auctionsAsSeller = await ctx.viem.getContractAt(
      'CryptoPunksAuctions',
      auctions.address,
      { client: { wallet: seller } },
    )
    await auctionsAsSeller.write.updateLot([
      1n,
      raisedReserve,
      await futureTs(ctx.connection, WEEK),
    ])

    const auctionsAsBidder = await ctx.viem.getContractAt(
      'CryptoPunksAuctions',
      auctions.address,
      { client: { wallet: bidder1 } },
    )
    await ctx.viem.assertions.revertWithCustomError(
      auctionsAsBidder.write.openAuction([1n, originalReserve], {
        value: raisedReserve,
      }),
      auctions,
      'ReserveMismatch',
    )
  })

  it('requires 10% bid increments, refunds the previous bidder, and extends late bids', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, seller, bidder1, bidder2 } = ctx

    await assignPunk(ctx, seller, 150n)
    await depositPunk(ctx, seller, 150n)

    const reserveWei = parseEther('1')
    const expiresAt = await futureTs(ctx.connection, WEEK)
    await createLot(ctx, seller, 150n, reserveWei, expiresAt)
    await openAuction(ctx, bidder1, 1n, reserveWei)

    const auctionsAsBidder2 = await ctx.viem.getContractAt(
      'CryptoPunksAuctions',
      auctions.address,
      { client: { wallet: bidder2 } },
    )
    await ctx.viem.assertions.revertWithCustomError(
      auctionsAsBidder2.write.bid([1n], { value: parseEther('1.09') }),
      auctions,
      'MinimumBidNotMet',
    )

    await ctx.connection.networkHelpers.time.increase(23 * 60 * 60 + 55 * 60)
    const before = await auctions.read.auctions([1n])
    const originalEnd = before[6] as bigint

    const publicClient = await ctx.viem.getPublicClient()
    const bidder1Before = await publicClient.getBalance({
      address: bidder1.account.address,
    })
    await auctionsAsBidder2.write.bid([1n], { value: parseEther('1.1') })
    const bidder1After = await publicClient.getBalance({
      address: bidder1.account.address,
    })

    assert.equal(bidder1After - bidder1Before, reserveWei)

    const after = await auctions.read.auctions([1n])
    assert.equal(after[4].toLowerCase(), bidder2.account.address.toLowerCase())
    assert.equal(after[5], parseEther('1.1'))
    assert.ok((after[6] as bigint) > originalEnd)
  })

  it('settles canonical Punks with a PunkBought round-trip and zero fees', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, escrow, punks, seller, bidder1 } = ctx

    await assignPunk(ctx, seller, 200n)
    await depositPunk(ctx, seller, 200n)

    const bidWei = parseEther('1')
    const expiresAt = await futureTs(ctx.connection, WEEK)
    await createLot(ctx, seller, 200n, bidWei, expiresAt)
    await openAuction(ctx, bidder1, 1n, bidWei)

    await ctx.connection.networkHelpers.time.increase(DAY + 1)

    const publicClient = await ctx.viem.getPublicClient()
    const sellerBefore = await publicClient.getBalance({
      address: seller.account.address,
    })
    const hash = await auctions.write.settle([1n])
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    const sellerAfter = await publicClient.getBalance({
      address: seller.account.address,
    })

    assert.equal(sellerAfter - sellerBefore, bidWei)
    assert.equal(
      ((await punks.read.punkIndexToAddress([200n])) as string).toLowerCase(),
      bidder1.account.address.toLowerCase(),
    )

    const auction = await auctions.read.auctions([1n])
    assert.equal(auction[7], true)

    const punkBoughtAbi = parseAbiItem(
      'event PunkBought(uint256 indexed punkIndex, uint256 value, address indexed fromAddress, address indexed toAddress)',
    )
    const bought = (await publicClient.getLogs({
      address: punks.address,
      event: punkBoughtAbi,
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
      args: { punkIndex: 200n },
    })) as Array<{ args: { value: bigint; fromAddress: string; toAddress: string } }>
    assert.equal(bought.length, 1)
    assert.equal(bought[0].args.value, bidWei)
    assert.equal(bought[0].args.fromAddress.toLowerCase(), escrow.address.toLowerCase())
    assert.equal(bought[0].args.toAddress.toLowerCase(), auctions.address.toLowerCase())

    assert.equal(await publicClient.getBalance({ address: auctions.address }), 0n)
    assert.equal(await publicClient.getBalance({ address: escrow.address }), 0n)
    assert.equal(await punks.read.pendingWithdrawals([escrow.address]), 0n)
  })

  it('pays the seller and allows direct winner claim when settlement delivery is deferred', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, escrow, punks, seller, bidder1 } = ctx

    await assignPunk(ctx, seller, 201n)
    await depositPunk(ctx, seller, 201n)

    const bidWei = parseEther('1')
    const expiresAt = await futureTs(ctx.connection, WEEK)
    await createLot(ctx, seller, 201n, bidWei, expiresAt)
    await openAuction(ctx, bidder1, 1n, bidWei)

    await punks.write.setBreakBuyPunk([true])
    await ctx.connection.networkHelpers.time.increase(DAY + 1)

    const publicClient = await ctx.viem.getPublicClient()
    const sellerBefore = await publicClient.getBalance({
      address: seller.account.address,
    })
    await auctions.write.settle([1n])
    const sellerAfter = await publicClient.getBalance({
      address: seller.account.address,
    })

    assert.equal(sellerAfter - sellerBefore, bidWei)
    assert.equal(await auctions.read.pendingDelivery([1n]), true)
    assert.equal(
      ((await punks.read.punkIndexToAddress([201n])) as string).toLowerCase(),
      escrow.address.toLowerCase(),
    )

    const auctionsAsWinner = await ctx.viem.getContractAt(
      'CryptoPunksAuctions',
      auctions.address,
      { client: { wallet: bidder1 } },
    )
    await auctionsAsWinner.write.claimSettledToken([1n, zeroAddress])

    assert.equal(await auctions.read.pendingDelivery([1n]), false)
    assert.equal(
      ((await punks.read.punkIndexToAddress([201n])) as string).toLowerCase(),
      bidder1.account.address.toLowerCase(),
    )
  })

  it('settles V1 Punks through the bug-aware withdraw path with zero fees', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, escrowV1, punksV1, seller, bidder1 } = ctx

    await assignPunkV1(ctx, seller, 300n)
    await depositPunkV1(ctx, seller, 300n)

    const bidWei = parseEther('1')
    const expiresAt = await futureTs(ctx.connection, WEEK)
    await createLotV1(ctx, seller, 300n, bidWei, expiresAt)
    await openAuction(ctx, bidder1, 1n, bidWei)

    await ctx.connection.networkHelpers.time.increase(DAY + 1)

    const publicClient = await ctx.viem.getPublicClient()
    const sellerBefore = await publicClient.getBalance({
      address: seller.account.address,
    })
    await auctions.write.settle([1n])
    const sellerAfter = await publicClient.getBalance({
      address: seller.account.address,
    })

    assert.equal(sellerAfter - sellerBefore, bidWei)
    assert.equal(
      ((await punksV1.read.punkIndexToAddress([300n])) as string).toLowerCase(),
      bidder1.account.address.toLowerCase(),
    )
    assert.equal(await punksV1.read.pendingWithdrawals([auctions.address]), 0n)
    assert.equal(await publicClient.getBalance({ address: escrowV1.address }), 0n)
  })

  it('rejects arbitrary ETH sends outside bidding and Punk settlement', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, other } = ctx

    await assert.rejects(
      other.sendTransaction({
        to: auctions.address,
        value: 1n,
      }),
    )
  })
})
