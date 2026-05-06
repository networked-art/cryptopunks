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

async function offerPunkToAuctions(
  ctx: Ctx,
  seller: any,
  punkId: bigint,
  priceWei: bigint,
  to: `0x${string}` = ctx.auctions.address,
) {
  const punksAsSeller = await ctx.viem.getContractAt(
    'MockCryptoPunksMarket',
    ctx.punks.address,
    { client: { wallet: seller } },
  )
  await punksAsSeller.write.offerPunkForSaleToAddress([punkId, priceWei, to])
}

async function offerPunkV1ToAuctions(
  ctx: Ctx,
  seller: any,
  punkId: bigint,
  priceWei: bigint,
  to: `0x${string}` = ctx.auctions.address,
) {
  const punksAsSeller = await ctx.viem.getContractAt(
    'MockCryptoPunksMarketV1Buggy',
    ctx.punksV1.address,
    { client: { wallet: seller } },
  )
  await punksAsSeller.write.offerPunkForSaleToAddress([punkId, priceWei, to])
}

async function placeStandingBid(
  ctx: Ctx,
  bidder: any,
  {
    standard = Standard.CRYPTOPUNKS,
    bidWei = parseEther('1'),
    settlementWei = parseEther('0.05'),
    receiver = zeroAddress,
    traitFilters = [],
    includeIds = [],
    excludeIds = [],
  }: {
    standard?: number
    bidWei?: bigint
    settlementWei?: bigint
    receiver?: `0x${string}`
    traitFilters?: Array<{ required: boolean; traitId: number }>
    includeIds?: number[]
    excludeIds?: number[]
  } = {},
) {
  const auctionsAsBidder = await ctx.viem.getContractAt(
    'CryptoPunksAuctions',
    ctx.auctions.address,
    { client: { wallet: bidder } },
  )
  await auctionsAsBidder.write.placeBid([
    standard,
    bidWei,
    settlementWei,
    receiver,
    traitFilters,
    includeIds,
    excludeIds,
  ], { value: bidWei + settlementWei })
  return ctx.auctions.read.lastStandingBidId() as Promise<bigint>
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

  describe('standing bids', () => {
    it('lets bidders place, adjust, inspect, and cancel native ETH standing bids', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, bidder1, other } = ctx

      const bidId = await placeStandingBid(ctx, bidder1, {
        bidWei: parseEther('1'),
        settlementWei: parseEther('0.1'),
        receiver: other.account.address,
        traitFilters: [{ required: true, traitId: 7 }],
        includeIds: [1, 2],
        excludeIds: [3],
      })

      let bid = await auctions.read.standingBids([bidId])
      assert.equal(bid[0], parseEther('1'))
      assert.equal(bid[1], parseEther('0.1'))
      assert.equal(bid[2].toLowerCase(), bidder1.account.address.toLowerCase())
      assert.equal(bid[3].toLowerCase(), other.account.address.toLowerCase())
      assert.equal(bid[4], Standard.CRYPTOPUNKS)

      const filters = await auctions.read.getBidFilters([bidId])
      assert.equal(filters[0][0].required, true)
      assert.equal(filters[0][0].traitId, 7)
      assert.deepEqual(filters[1], [1, 2])
      assert.deepEqual(filters[2], [3])

      const auctionsAsBidder = await ctx.viem.getContractAt(
        'CryptoPunksAuctions',
        auctions.address,
        { client: { wallet: bidder1 } },
      )
      await auctionsAsBidder.write.adjustBidPrice([bidId, parseEther('0.25'), true], {
        value: parseEther('0.25'),
      })
      await auctionsAsBidder.write.adjustBidSettlementPrice([bidId, parseEther('0.05'), true], {
        value: parseEther('0.05'),
      })
      await auctionsAsBidder.write.adjustBidPrice([bidId, parseEther('0.1'), false])
      await auctionsAsBidder.write.adjustBidSettlementPrice([bidId, parseEther('0.02'), false])

      bid = await auctions.read.standingBids([bidId])
      assert.equal(bid[0], parseEther('1.15'))
      assert.equal(bid[1], parseEther('0.13'))

      const publicClient = await ctx.viem.getPublicClient()
      const before = await publicClient.getBalance({ address: bidder1.account.address })
      const hash = await auctionsAsBidder.write.cancelBid([bidId])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const after = await publicClient.getBalance({ address: bidder1.account.address })
      const gas = receipt.gasUsed * receipt.effectiveGasPrice
      assert.equal(after - before + gas, parseEther('1.28'))

      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsBidder.write.cancelBid([bidId]),
        auctions,
        'StandingBidNotActive',
      )
    })

    it('accepts a canonical Punk bid through the original marketplace and refunds excess', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, seller, bidder1, other, attacker } = ctx

      await assignPunk(ctx, seller, 700n)
      await offerPunkToAuctions(ctx, seller, 700n, parseEther('0.9'))

      const bidId = await placeStandingBid(ctx, bidder1, {
        bidWei: parseEther('1'),
        settlementWei: parseEther('0.2'),
        receiver: other.account.address,
      })

      const publicClient = await ctx.viem.getPublicClient()
      const bidderBefore = await publicClient.getBalance({ address: bidder1.account.address })
      const settlerBefore = await publicClient.getBalance({ address: attacker.account.address })

      const auctionsAsSettler = await ctx.viem.getContractAt(
        'CryptoPunksAuctions',
        auctions.address,
        { client: { wallet: attacker } },
      )
      const hash = await auctionsAsSettler.write.acceptBid([bidId, 700])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      assert.equal(
        ((await punks.read.punkIndexToAddress([700n])) as string).toLowerCase(),
        other.account.address.toLowerCase(),
      )
      assert.equal(await punks.read.pendingWithdrawals([seller.account.address]), parseEther('0.9'))
      assert.equal(
        await publicClient.getBalance({ address: bidder1.account.address }) - bidderBefore,
        parseEther('0.1'),
      )

      const settlerAfter = await publicClient.getBalance({ address: attacker.account.address })
      const gas = receipt.gasUsed * receipt.effectiveGasPrice
      assert.equal(settlerAfter - settlerBefore + gas, parseEther('0.2'))

      const bid = await auctions.read.standingBids([bidId])
      assert.equal(bid[2], zeroAddress)
    })

    it('rejects immediate acceptance unless the Punk is listed to the auctions contract at or below bid max', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1, other } = ctx

      await assignPunk(ctx, seller, 701n)
      const bidId = await placeStandingBid(ctx, bidder1, {
        bidWei: parseEther('1'),
        settlementWei: 0n,
      })

      await offerPunkToAuctions(ctx, seller, 701n, parseEther('0.9'), other.account.address)
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptBid([bidId, 701]),
        auctions,
        'ListingNotValid',
      )

      await offerPunkToAuctions(ctx, seller, 701n, parseEther('1.1'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptBid([bidId, 701]),
        auctions,
        'ListingPriceTooHigh',
      )
    })

    it('enforces inclusionary, exclusionary, and trait filters', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, traits, seller, bidder1 } = ctx

      await traits.write.setTrait([800, 7, true])
      await traits.write.setTrait([801, 7, false])
      await traits.write.setTrait([802, 7, true])

      const bidId = await placeStandingBid(ctx, bidder1, {
        bidWei: parseEther('1'),
        settlementWei: 0n,
        traitFilters: [{ required: true, traitId: 7 }],
        includeIds: [800, 801, 802],
        excludeIds: [802],
      })

      await assignPunk(ctx, seller, 799n)
      await offerPunkToAuctions(ctx, seller, 799n, parseEther('0.9'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptBid([bidId, 799]),
        auctions,
        'PunkNotIncluded',
      )

      await assignPunk(ctx, seller, 802n)
      await offerPunkToAuctions(ctx, seller, 802n, parseEther('0.9'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptBid([bidId, 802]),
        auctions,
        'PunkExcluded',
      )

      await assignPunk(ctx, seller, 801n)
      await offerPunkToAuctions(ctx, seller, 801n, parseEther('0.9'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptBid([bidId, 801]),
        auctions,
        'PunkTraitMismatch',
      )

      await assignPunk(ctx, seller, 800n)
      await offerPunkToAuctions(ctx, seller, 800n, parseEther('0.9'))
      await auctions.write.acceptBid([bidId, 800])
    })

    it('accepts a V1 Punk bid through the bug-aware marketplace path', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punksV1, seller, bidder1, attacker } = ctx

      await assignPunkV1(ctx, seller, 900n)
      await offerPunkV1ToAuctions(ctx, seller, 900n, parseEther('0.8'))

      const bidId = await placeStandingBid(ctx, bidder1, {
        standard: Standard.CRYPTOPUNKS_V1,
        bidWei: parseEther('1'),
        settlementWei: parseEther('0.1'),
      })

      const publicClient = await ctx.viem.getPublicClient()
      const sellerBefore = await publicClient.getBalance({ address: seller.account.address })
      const bidderBefore = await publicClient.getBalance({ address: bidder1.account.address })

      const auctionsAsSettler = await ctx.viem.getContractAt(
        'CryptoPunksAuctions',
        auctions.address,
        { client: { wallet: attacker } },
      )
      await auctionsAsSettler.write.acceptBid([bidId, 900])

      assert.equal(
        ((await punksV1.read.punkIndexToAddress([900n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal(
        await publicClient.getBalance({ address: seller.account.address }) - sellerBefore,
        parseEther('0.8'),
      )
      assert.equal(
        await publicClient.getBalance({ address: bidder1.account.address }) - bidderBefore,
        parseEther('0.2'),
      )
      assert.equal(await punksV1.read.pendingWithdrawals([auctions.address]), 0n)
    })

    it('initializes a 24h auction from a standing bid using the seller vault path', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, escrow, punks, seller, bidder1, other } = ctx

      await assignPunk(ctx, seller, 950n)
      await depositPunk(ctx, seller, 950n)

      const bidId = await placeStandingBid(ctx, bidder1, {
        bidWei: parseEther('1'),
        settlementWei: parseEther('0.05'),
        receiver: other.account.address,
        includeIds: [950],
      })

      const publicClient = await ctx.viem.getPublicClient()
      const bidderBefore = await publicClient.getBalance({ address: bidder1.account.address })
      const auctionsAsSeller = await ctx.viem.getContractAt(
        'CryptoPunksAuctions',
        auctions.address,
        { client: { wallet: seller } },
      )
      await auctionsAsSeller.write.acceptBidToAuction([bidId, 950])

      assert.equal(
        await publicClient.getBalance({ address: bidder1.account.address }) - bidderBefore,
        parseEther('0.05'),
      )
      assert.equal(
        ((await punks.read.punkIndexToAddress([950n])) as string).toLowerCase(),
        escrow.address.toLowerCase(),
      )
      const auction = await auctions.read.auctions([1n])
      assert.equal(auction[0].toLowerCase(), seller.account.address.toLowerCase())
      assert.equal(auction[4].toLowerCase(), bidder1.account.address.toLowerCase())
      assert.equal(auction[5], parseEther('1'))
      assert.equal(
        ((await auctions.read.auctionReceivers([1n])) as string).toLowerCase(),
        other.account.address.toLowerCase(),
      )

      await ctx.connection.networkHelpers.time.increase(DAY + 1)
      await auctions.write.settle([1n])
      assert.equal(
        ((await punks.read.punkIndexToAddress([950n])) as string).toLowerCase(),
        other.account.address.toLowerCase(),
      )
    })

    it('requires vault custody when a standing bid is used to initialize an auction', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 951n)
      const bidId = await placeStandingBid(ctx, bidder1, {
        bidWei: parseEther('1'),
        settlementWei: 0n,
      })

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'CryptoPunksAuctions',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.acceptBidToAuction([bidId, 951]),
        auctions,
        'PunkNotInVault',
      )
    })
  })
})
