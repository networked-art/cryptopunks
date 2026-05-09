import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseAbiItem, parseEther, zeroAddress } from 'viem'
import {
  DAY,
  deployAuctionStack,
  emptyCriteria,
  futureTs,
  lotItem,
  type LotItemInput,
  type OfferSlotInput,
  punkSlot,
  Standard,
  WEEK,
  wildcardSlot,
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
    'PunksEscrow',
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
    'PunksEscrow',
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

async function createLotWith(
  ctx: Ctx,
  seller: any,
  items: LotItemInput[],
  reserveWei: bigint,
  expiresAt: bigint,
) {
  const auctionsAsSeller = await ctx.viem.getContractAt(
    'PunksAuction',
    ctx.auctions.address,
    { client: { wallet: seller } },
  )
  await auctionsAsSeller.write.createLot([items, reserveWei, expiresAt])
}

async function createSinglePunkLot(
  ctx: Ctx,
  seller: any,
  punkId: bigint,
  reserveWei: bigint,
  expiresAt: bigint,
) {
  await createLotWith(
    ctx,
    seller,
    [lotItem(Number(punkId))],
    reserveWei,
    expiresAt,
  )
}

async function createSinglePunkLotV1(
  ctx: Ctx,
  seller: any,
  punkId: bigint,
  reserveWei: bigint,
  expiresAt: bigint,
) {
  await createLotWith(
    ctx,
    seller,
    [lotItem(Number(punkId), 10_000, Standard.CRYPTOPUNKS_V1)],
    reserveWei,
    expiresAt,
  )
}

async function openAuction(
  ctx: Ctx,
  bidder: any,
  lotId: bigint,
  reserveWei: bigint,
) {
  const auctionsAsBidder = await ctx.viem.getContractAt(
    'PunksAuction',
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

async function placeOffer(
  ctx: Ctx,
  offerer: any,
  {
    amountWei = parseEther('1'),
    settlementWei = parseEther('0.05'),
    receiver = zeroAddress,
    slots = [wildcardSlot()],
  }: {
    amountWei?: bigint
    settlementWei?: bigint
    receiver?: `0x${string}`
    slots?: OfferSlotInput[]
  } = {},
) {
  const auctionsAsOfferer = await ctx.viem.getContractAt(
    'PunksAuction',
    ctx.auctions.address,
    { client: { wallet: offerer } },
  )
  await auctionsAsOfferer.write.placeOffer(
    [amountWei, settlementWei, receiver, slots],
    { value: amountWei + settlementWei },
  )
  return ctx.auctions.read.lastOfferId() as Promise<bigint>
}

const traitBit = (id: number): bigint => 1n << BigInt(id)

describe('PunksAuction', () => {
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
      'PunksEscrow',
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
      'PunksAuction',
      auctions.address,
      { client: { wallet: seller } },
    )

    await ctx.viem.assertions.revertWithCustomError(
      auctionsAsSeller.write.createLot([
        [lotItem(500)],
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
    await createSinglePunkLot(ctx, seller, 100n, reserveWei, expiresAt)
    await openAuction(ctx, bidder1, 1n, reserveWei)

    assert.equal(
      ((await punks.read.punkIndexToAddress([100n])) as string).toLowerCase(),
      escrow.address.toLowerCase(),
    )

    const auction = await auctions.read.auctions([1n])
    // (seller, latestBidder, latestBidWei, endTimestamp, itemCount, itemHash, settled)
    assert.equal(auction[0].toLowerCase(), seller.account.address.toLowerCase())
    assert.equal(auction[1].toLowerCase(), bidder1.account.address.toLowerCase())
    assert.equal(auction[2], reserveWei)
    assert.equal(auction[4], 1)
    assert.equal(await auctions.read.lastLotId(), 1n)

    const items = await auctions.read.getAuctionItems([1n])
    assert.equal(items.length, 1)
    assert.equal(items[0].punkId, 100)
    assert.equal(items[0].standard, Standard.CRYPTOPUNKS)
    assert.equal(items[0].weightBps, 10_000)
  })

  it('pins the reserve observed by the opener', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, seller, bidder1 } = ctx

    await assignPunk(ctx, seller, 101n)
    await depositPunk(ctx, seller, 101n)

    const originalReserve = parseEther('1')
    const raisedReserve = parseEther('2')
    const expiresAt = await futureTs(ctx.connection, WEEK)
    await createSinglePunkLot(ctx, seller, 101n, originalReserve, expiresAt)

    const auctionsAsSeller = await ctx.viem.getContractAt(
      'PunksAuction',
      auctions.address,
      { client: { wallet: seller } },
    )
    await auctionsAsSeller.write.updateLot([
      1n,
      raisedReserve,
      await futureTs(ctx.connection, WEEK),
    ])

    const auctionsAsBidder = await ctx.viem.getContractAt(
      'PunksAuction',
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
    await createSinglePunkLot(ctx, seller, 150n, reserveWei, expiresAt)
    await openAuction(ctx, bidder1, 1n, reserveWei)

    const auctionsAsBidder2 = await ctx.viem.getContractAt(
      'PunksAuction',
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
    const originalEnd = before[3] as bigint

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
    assert.equal(after[1].toLowerCase(), bidder2.account.address.toLowerCase())
    assert.equal(after[2], parseEther('1.1'))
    assert.ok((after[3] as bigint) > originalEnd)
  })

  it('settles canonical Punks with a PunkBought round-trip and zero fees', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, escrow, punks, seller, bidder1 } = ctx

    await assignPunk(ctx, seller, 200n)
    await depositPunk(ctx, seller, 200n)

    const bidWei = parseEther('1')
    const expiresAt = await futureTs(ctx.connection, WEEK)
    await createSinglePunkLot(ctx, seller, 200n, bidWei, expiresAt)
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
    assert.equal(auction[6], true)

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

  it('reverts settlement without paying the seller when delivery fails', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, escrow, punks, seller, bidder1 } = ctx

    await assignPunk(ctx, seller, 201n)
    await depositPunk(ctx, seller, 201n)

    const bidWei = parseEther('1')
    const expiresAt = await futureTs(ctx.connection, WEEK)
    await createSinglePunkLot(ctx, seller, 201n, bidWei, expiresAt)
    await openAuction(ctx, bidder1, 1n, bidWei)

    await punks.write.setBreakBuyPunk([true])
    await ctx.connection.networkHelpers.time.increase(DAY + 1)

    const publicClient = await ctx.viem.getPublicClient()
    const sellerBefore = await publicClient.getBalance({
      address: seller.account.address,
    })
    await assert.rejects(auctions.write.settle([1n]))
    const sellerAfter = await publicClient.getBalance({
      address: seller.account.address,
    })

    assert.equal(sellerAfter, sellerBefore)
    assert.equal(
      ((await punks.read.punkIndexToAddress([201n])) as string).toLowerCase(),
      escrow.address.toLowerCase(),
    )
    assert.equal(await punks.read.pendingWithdrawals([escrow.address]), 0n)

    const auction = await auctions.read.auctions([1n])
    assert.equal(auction[6], false)
  })

  it('settles V1 Punks through the bug-aware withdraw path with zero fees', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, escrowV1, punksV1, seller, bidder1 } = ctx

    await assignPunkV1(ctx, seller, 300n)
    await depositPunkV1(ctx, seller, 300n)

    const bidWei = parseEther('1')
    const expiresAt = await futureTs(ctx.connection, WEEK)
    await createSinglePunkLotV1(ctx, seller, 300n, bidWei, expiresAt)
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

  describe('lots — validation', () => {
    it('rejects empty and oversized item arrays', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx
      const expiresAt = await futureTs(ctx.connection, WEEK)
      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )

      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLot([[], parseEther('1'), expiresAt]),
        auctions,
        'InvalidItemCount',
      )

      const big = Array.from({ length: 101 }, (_, i) => lotItem(i, 0))
      // weightBps=0 also invalid; still fails on count first
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLot([big, parseEther('1'), expiresAt]),
        auctions,
        'InvalidItemCount',
      )
    })

    it('rejects weights that do not sum to 10_000 or include a zero weight', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx
      await assignPunk(ctx, seller, 10n)
      await depositPunk(ctx, seller, 10n)
      await assignPunk(ctx, seller, 11n)
      await depositPunk(ctx, seller, 11n)

      const expiresAt = await futureTs(ctx.connection, WEEK)
      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )

      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLot([
          [lotItem(10, 4_000), lotItem(11, 4_000)],
          parseEther('1'),
          expiresAt,
        ]),
        auctions,
        'InvalidWeights',
      )

      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLot([
          [lotItem(10, 0), lotItem(11, 10_000)],
          parseEther('1'),
          expiresAt,
        ]),
        auctions,
        'InvalidWeights',
      )
    })

    it('rejects duplicate (standard, punkId) entries within the same lot', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx
      await assignPunk(ctx, seller, 20n)
      await depositPunk(ctx, seller, 20n)

      const expiresAt = await futureTs(ctx.connection, WEEK)
      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )

      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLot([
          [lotItem(20, 5_000), lotItem(20, 5_000)],
          parseEther('1'),
          expiresAt,
        ]),
        auctions,
        'DuplicateLotItem',
      )
    })
  })

  describe('lots — bundle lifecycle', () => {
    it('creates a V1+V2 pair lot, opens it, and settles each item with weighted prices', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, punksV1, seller, bidder1 } = ctx

      await assignPunkV1(ctx, seller, 4156n)
      await depositPunkV1(ctx, seller, 4156n)
      await assignPunk(ctx, seller, 4156n)
      await depositPunk(ctx, seller, 4156n)

      const expiresAt = await futureTs(ctx.connection, WEEK)
      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await auctionsAsSeller.write.createLot([
        [
          lotItem(4156, 500, Standard.CRYPTOPUNKS_V1),
          lotItem(4156, 9_500, Standard.CRYPTOPUNKS),
        ],
        parseEther('10'),
        expiresAt,
      ])

      await openAuction(ctx, bidder1, 1n, parseEther('10'))
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
      assert.equal(sellerAfter - sellerBefore, parseEther('10'))

      assert.equal(
        ((await punksV1.read.punkIndexToAddress([4156n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal(
        ((await punks.read.punkIndexToAddress([4156n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )

      const punkBoughtAbi = parseAbiItem(
        'event PunkBought(uint256 indexed punkIndex, uint256 value, address indexed fromAddress, address indexed toAddress)',
      )
      const v2Logs = (await publicClient.getLogs({
        address: punks.address,
        event: punkBoughtAbi,
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        args: { punkIndex: 4156n },
      })) as Array<{ args: { value: bigint } }>
      const v1Logs = (await publicClient.getLogs({
        address: punksV1.address,
        event: punkBoughtAbi,
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        args: { punkIndex: 4156n },
      })) as Array<{ args: { value: bigint } }>
      assert.equal(v2Logs.length, 1)
      assert.equal(v1Logs.length, 1)
      assert.equal(v1Logs[0].args.value, parseEther('0.5'))
      assert.equal(v2Logs[0].args.value, parseEther('9.5'))
    })

    it('splits hammer with rounding remainder added to the last item', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, seller, bidder1 } = ctx

      const punkIds = [60, 61, 62, 63, 64, 65, 66]
      for (const id of punkIds) {
        await assignPunk(ctx, seller, BigInt(id))
        await depositPunk(ctx, seller, BigInt(id))
      }

      // 7 items × 1428 = 9996; last item picks up the +4 remainder via the math below
      const items = punkIds.map((id) => lotItem(id, 1_428))
      // adjust last item so weights sum to 10_000
      items[items.length - 1] = lotItem(punkIds[punkIds.length - 1], 1_432)

      const totalWei = parseEther('10')
      const expiresAt = await futureTs(ctx.connection, WEEK)
      await createLotWith(ctx, seller, items, totalWei, expiresAt)
      await openAuction(ctx, bidder1, 1n, totalWei)
      await ctx.connection.networkHelpers.time.increase(DAY + 1)

      const publicClient = await ctx.viem.getPublicClient()
      const hash = await auctions.write.settle([1n])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      const punkBoughtAbi = parseAbiItem(
        'event PunkBought(uint256 indexed punkIndex, uint256 value, address indexed fromAddress, address indexed toAddress)',
      )
      let observed = 0n
      for (const id of punkIds) {
        const logs = (await publicClient.getLogs({
          address: punks.address,
          event: punkBoughtAbi,
          fromBlock: receipt.blockNumber,
          toBlock: receipt.blockNumber,
          args: { punkIndex: BigInt(id) },
        })) as Array<{ args: { value: bigint } }>
        assert.equal(logs.length, 1)
        observed += logs[0].args.value
      }
      assert.equal(observed, totalWei)
    })

    it('cascades the seller token version across lots that share an item', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx
      await assignPunk(ctx, seller, 70n)
      await depositPunk(ctx, seller, 70n)
      await assignPunk(ctx, seller, 71n)
      await depositPunk(ctx, seller, 71n)

      const expiresAt = await futureTs(ctx.connection, WEEK)
      // lot #1: just punk 70
      await createSinglePunkLot(ctx, seller, 70n, parseEther('1'), expiresAt)
      // lot #2: bundle of punk 70 + punk 71
      await createLotWith(
        ctx,
        seller,
        [lotItem(70, 5_000), lotItem(71, 5_000)],
        parseEther('2'),
        expiresAt,
      )

      // Open lot #1 first; it bumps the version of punk 70.
      await openAuction(ctx, bidder1, 1n, parseEther('1'))

      // lot #2 still has punk 70 but with a stale version snapshot.
      const auctionsAsBidder = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsBidder.write.openAuction([2n, parseEther('2')], {
          value: parseEther('2'),
        }),
        auctions,
        'LotExpired',
      )
    })
  })

  describe('offers', () => {
    it('lets offerers place, adjust, inspect, and cancel native ETH offers', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, bidder1, other } = ctx

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        settlementWei: parseEther('0.1'),
        receiver: other.account.address,
        slots: [
          {
            criteria: { ...emptyCriteria(), requiredTraitMask: traitBit(7) },
            standard: Standard.CRYPTOPUNKS,
            includeIds: [1, 2],
            excludeIds: [3],
          },
        ],
      })

      let offer = await auctions.read.offers([offerId])
      assert.equal(offer[0], parseEther('1'))
      assert.equal(offer[1], parseEther('0.1'))
      assert.equal(offer[2].toLowerCase(), bidder1.account.address.toLowerCase())
      assert.equal(offer[3].toLowerCase(), other.account.address.toLowerCase())

      const slots = await auctions.read.getOfferSlots([offerId])
      assert.equal(slots.length, 1)
      assert.equal(slots[0].criteria.requiredTraitMask, traitBit(7))
      assert.equal(slots[0].standard, Standard.CRYPTOPUNKS)
      assert.deepEqual(slots[0].includeIds, [1, 2])
      assert.deepEqual(slots[0].excludeIds, [3])

      const auctionsAsOfferer = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )
      await auctionsAsOfferer.write.adjustOfferAmount([offerId, parseEther('0.25'), true], {
        value: parseEther('0.25'),
      })
      await auctionsAsOfferer.write.adjustOfferSettlement([offerId, parseEther('0.05'), true], {
        value: parseEther('0.05'),
      })
      await auctionsAsOfferer.write.adjustOfferAmount([offerId, parseEther('0.1'), false])
      await auctionsAsOfferer.write.adjustOfferSettlement([offerId, parseEther('0.02'), false])

      offer = await auctions.read.offers([offerId])
      assert.equal(offer[0], parseEther('1.15'))
      assert.equal(offer[1], parseEther('0.13'))

      const publicClient = await ctx.viem.getPublicClient()
      const before = await publicClient.getBalance({ address: bidder1.account.address })
      const hash = await auctionsAsOfferer.write.cancelOffer([offerId])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const after = await publicClient.getBalance({ address: bidder1.account.address })
      const gas = receipt.gasUsed * receipt.effectiveGasPrice
      assert.equal(after - before + gas, parseEther('1.28'))

      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.cancelOffer([offerId]),
        auctions,
        'OfferNotActive',
      )
    })

    it('rejects place-time invalid masks and color count ranges', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, bidder1 } = ctx
      const auctionsAsOfferer = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )

      // Bit beyond canonical trait range (TRAIT_COUNT = 111 in the mock).
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.placeOffer(
          [
            parseEther('1'),
            0n,
            zeroAddress,
            [
              {
                criteria: { ...emptyCriteria(), requiredTraitMask: traitBit(120) },
                standard: Standard.CRYPTOPUNKS,
                includeIds: [],
                excludeIds: [],
              },
            ],
          ],
          { value: parseEther('1') },
        ),
        auctions,
        'InvalidTraitMask',
      )

      // required & forbidden overlap.
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.placeOffer(
          [
            parseEther('1'),
            0n,
            zeroAddress,
            [
              {
                criteria: {
                  ...emptyCriteria(),
                  requiredTraitMask: traitBit(5),
                  forbiddenTraitMask: traitBit(5),
                },
                standard: Standard.CRYPTOPUNKS,
                includeIds: [],
                excludeIds: [],
              },
            ],
          ],
          { value: parseEther('1') },
        ),
        auctions,
        'InvalidTraitMask',
      )

      // forbidden & anyOf overlap.
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.placeOffer(
          [
            parseEther('1'),
            0n,
            zeroAddress,
            [
              {
                criteria: {
                  ...emptyCriteria(),
                  forbiddenTraitMask: traitBit(8),
                  anyOfTraitMask: traitBit(8),
                },
                standard: Standard.CRYPTOPUNKS,
                includeIds: [],
                excludeIds: [],
              },
            ],
          ],
          { value: parseEther('1') },
        ),
        auctions,
        'InvalidTraitMask',
      )

      // Color count range: max > COLOR_COUNT_MAX (14).
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.placeOffer(
          [
            parseEther('1'),
            0n,
            zeroAddress,
            [
              {
                criteria: { ...emptyCriteria(), minColorCount: 1, maxColorCount: 15 },
                standard: Standard.CRYPTOPUNKS,
                includeIds: [],
                excludeIds: [],
              },
            ],
          ],
          { value: parseEther('1') },
        ),
        auctions,
        'InvalidColorCountRange',
      )

      // Color count range: min > max.
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.placeOffer(
          [
            parseEther('1'),
            0n,
            zeroAddress,
            [
              {
                criteria: { ...emptyCriteria(), minColorCount: 8, maxColorCount: 4 },
                standard: Standard.CRYPTOPUNKS,
                includeIds: [],
                excludeIds: [],
              },
            ],
          ],
          { value: parseEther('1') },
        ),
        auctions,
        'InvalidColorCountRange',
      )
    })

    it('rejects place-time slot count zero and over the maximum', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, bidder1 } = ctx
      const auctionsAsOfferer = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )

      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.placeOffer(
          [parseEther('1'), 0n, zeroAddress, []],
          { value: parseEther('1') },
        ),
        auctions,
        'InvalidSlotCount',
      )

      const tooMany = Array.from({ length: 101 }, () => wildcardSlot())
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.placeOffer(
          [parseEther('1'), 0n, zeroAddress, tooMany],
          { value: parseEther('1') },
        ),
        auctions,
        'InvalidSlotCount',
      )
    })

    it('accepts a canonical Punk offer through the original marketplace and refunds excess', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, seller, bidder1, other, attacker } = ctx

      await assignPunk(ctx, seller, 700n)
      await offerPunkToAuctions(ctx, seller, 700n, parseEther('0.9'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        settlementWei: parseEther('0.2'),
        receiver: other.account.address,
      })

      const publicClient = await ctx.viem.getPublicClient()
      const bidderBefore = await publicClient.getBalance({ address: bidder1.account.address })
      const settlerBefore = await publicClient.getBalance({ address: attacker.account.address })

      const auctionsAsSettler = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: attacker } },
      )
      const hash = await auctionsAsSettler.write.acceptOffer([offerId, 700])
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

      const offer = await auctions.read.offers([offerId])
      assert.equal(offer[2], zeroAddress)
    })

    it('rejects acceptOffer when the offer has more than one slot', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, bidder1 } = ctx

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        settlementWei: 0n,
        slots: [wildcardSlot(), wildcardSlot()],
      })

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 1]),
        auctions,
        'MultiSlotOfferRequiresLot',
      )
    })

    it('rejects immediate acceptance unless the Punk is listed to the auctions contract at or below the offer amount', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1, other } = ctx

      await assignPunk(ctx, seller, 701n)
      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        settlementWei: 0n,
      })

      await offerPunkToAuctions(ctx, seller, 701n, parseEther('0.9'), other.account.address)
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 701]),
        auctions,
        'ListingNotValid',
      )

      await offerPunkToAuctions(ctx, seller, 701n, parseEther('1.1'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 701]),
        auctions,
        'ListingPriceTooHigh',
      )
    })

    it('enforces inclusionary, exclusionary, mask, and color predicates', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punksData, seller, bidder1 } = ctx

      await punksData.write.setTraitMask([800, traitBit(7)])
      await punksData.write.setTraitMask([801, 0n])
      await punksData.write.setTraitMask([802, traitBit(7)])
      await punksData.write.setColorCount([800, 6])
      await punksData.write.setColorCount([802, 6])

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        settlementWei: 0n,
        slots: [
          {
            criteria: {
              ...emptyCriteria(),
              requiredTraitMask: traitBit(7),
              minColorCount: 4,
              maxColorCount: 8,
            },
            standard: Standard.CRYPTOPUNKS,
            includeIds: [800, 801, 802],
            excludeIds: [802],
          },
        ],
      })

      await assignPunk(ctx, seller, 799n)
      await offerPunkToAuctions(ctx, seller, 799n, parseEther('0.9'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 799]),
        auctions,
        'PunkNotIncluded',
      )

      await assignPunk(ctx, seller, 802n)
      await offerPunkToAuctions(ctx, seller, 802n, parseEther('0.9'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 802]),
        auctions,
        'PunkExcluded',
      )

      await assignPunk(ctx, seller, 801n)
      await offerPunkToAuctions(ctx, seller, 801n, parseEther('0.9'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 801]),
        auctions,
        'PunkTraitMismatch',
      )

      await assignPunk(ctx, seller, 800n)
      await offerPunkToAuctions(ctx, seller, 800n, parseEther('0.9'))
      await auctions.write.acceptOffer([offerId, 800])
    })

    it('rejects offers when the matched Punk is outside the color count range', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punksData, seller, bidder1 } = ctx

      await punksData.write.setColorCount([900, 3])

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        settlementWei: 0n,
        slots: [
          {
            criteria: {
              ...emptyCriteria(),
              minColorCount: 5,
              maxColorCount: 10,
            },
            standard: Standard.CRYPTOPUNKS,
            includeIds: [900],
            excludeIds: [],
          },
        ],
      })

      await assignPunk(ctx, seller, 900n)
      await offerPunkToAuctions(ctx, seller, 900n, parseEther('0.9'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 900]),
        auctions,
        'PunkVisualMismatch',
      )
    })

    it('accepts a V1 Punk offer through the bug-aware marketplace path', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punksV1, seller, bidder1, attacker } = ctx

      await assignPunkV1(ctx, seller, 905n)
      await offerPunkV1ToAuctions(ctx, seller, 905n, parseEther('0.8'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        settlementWei: parseEther('0.1'),
        slots: [wildcardSlot(Standard.CRYPTOPUNKS_V1)],
      })

      const publicClient = await ctx.viem.getPublicClient()
      const sellerBefore = await publicClient.getBalance({ address: seller.account.address })
      const bidderBefore = await publicClient.getBalance({ address: bidder1.account.address })

      const auctionsAsSettler = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: attacker } },
      )
      await auctionsAsSettler.write.acceptOffer([offerId, 905])

      assert.equal(
        ((await punksV1.read.punkIndexToAddress([905n])) as string).toLowerCase(),
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

    it('initializes a 24h auction from an offer using a stored lot', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, escrow, punks, seller, bidder1, other } = ctx

      await assignPunk(ctx, seller, 950n)
      await depositPunk(ctx, seller, 950n)

      const expiresAt = await futureTs(ctx.connection, WEEK)
      await createSinglePunkLot(ctx, seller, 950n, parseEther('1'), expiresAt)

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        settlementWei: parseEther('0.05'),
        receiver: other.account.address,
        slots: [punkSlot(950)],
      })

      const publicClient = await ctx.viem.getPublicClient()
      const bidderBefore = await publicClient.getBalance({ address: bidder1.account.address })
      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await auctionsAsSeller.write.startAuctionFromOffer([offerId, 1n])

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
      assert.equal(auction[1].toLowerCase(), bidder1.account.address.toLowerCase())
      assert.equal(auction[2], parseEther('1'))
      assert.equal(
        ((await auctions.read.winnerReceivers([1n])) as string).toLowerCase(),
        other.account.address.toLowerCase(),
      )

      await ctx.connection.networkHelpers.time.increase(DAY + 1)
      await auctions.write.settle([1n])
      assert.equal(
        ((await punks.read.punkIndexToAddress([950n])) as string).toLowerCase(),
        other.account.address.toLowerCase(),
      )
    })

    it('requires the lot to exist when starting an auction from an offer', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, bidder1 } = ctx

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        settlementWei: 0n,
        slots: [punkSlot(951)],
      })

      const auctionsAsCaller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsCaller.write.startAuctionFromOffer([offerId, 999n]),
        auctions,
        'LotNotFound',
      )
    })

    it('accepts a V1+V2 pair offer against a stored lot and pays seller the offer amount', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, punksV1, seller, bidder1, attacker } = ctx

      await assignPunkV1(ctx, seller, 1000n)
      await depositPunkV1(ctx, seller, 1000n)
      await assignPunk(ctx, seller, 1000n)
      await depositPunk(ctx, seller, 1000n)

      const expiresAt = await futureTs(ctx.connection, WEEK)
      await createLotWith(
        ctx,
        seller,
        [
          lotItem(1000, 5_000, Standard.CRYPTOPUNKS_V1),
          lotItem(1000, 5_000, Standard.CRYPTOPUNKS),
        ],
        parseEther('5'),
        expiresAt,
      )

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('5'),
        settlementWei: parseEther('0.1'),
        slots: [
          punkSlot(1000, Standard.CRYPTOPUNKS_V1),
          punkSlot(1000, Standard.CRYPTOPUNKS),
        ],
      })

      const publicClient = await ctx.viem.getPublicClient()
      const sellerBefore = await publicClient.getBalance({ address: seller.account.address })
      const settlerBefore = await publicClient.getBalance({ address: attacker.account.address })

      const auctionsAsSettler = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: attacker } },
      )
      const hash = await auctionsAsSettler.write.acceptOfferFromLot([offerId, 1n])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      assert.equal(
        await publicClient.getBalance({ address: seller.account.address }) - sellerBefore,
        parseEther('5'),
      )
      const settlerAfter = await publicClient.getBalance({ address: attacker.account.address })
      const gas = receipt.gasUsed * receipt.effectiveGasPrice
      assert.equal(settlerAfter - settlerBefore + gas, parseEther('0.1'))

      assert.equal(
        ((await punks.read.punkIndexToAddress([1000n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal(
        ((await punksV1.read.punkIndexToAddress([1000n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
    })

    it('rejects acceptOfferFromLot when slot count differs from the lot', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 1100n)
      await depositPunk(ctx, seller, 1100n)
      const expiresAt = await futureTs(ctx.connection, WEEK)
      await createSinglePunkLot(ctx, seller, 1100n, parseEther('1'), expiresAt)

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        settlementWei: 0n,
        slots: [punkSlot(1100), punkSlot(1101)],
      })

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOfferFromLot([offerId, 1n]),
        auctions,
        'SlotItemCountMismatch',
      )
    })

    it('rejects acceptOfferFromLot when slot standard does not match item standard', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 1200n)
      await depositPunk(ctx, seller, 1200n)
      const expiresAt = await futureTs(ctx.connection, WEEK)
      await createSinglePunkLot(ctx, seller, 1200n, parseEther('1'), expiresAt)

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        settlementWei: 0n,
        slots: [punkSlot(1200, Standard.CRYPTOPUNKS_V1)],
      })

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOfferFromLot([offerId, 1n]),
        auctions,
        'OfferStandardMismatch',
      )
    })
  })
})
