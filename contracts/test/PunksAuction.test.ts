import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseAbiItem, parseEther, zeroAddress } from 'viem'
import {
  DAY,
  deployAuctionStack,
  emptyCriteria,
  lotItem,
  REVERSE_REGISTRAR,
  type LotItemInput,
  type OfferSlotInput,
  punkSlot,
  Standard,
  wildcardSlot,
} from './helpers/fixtures.js'

type Ctx = Awaited<ReturnType<typeof deployAuctionStack>>

async function assignPunk(ctx: Ctx, to: any, punkId: bigint) {
  await ctx.punks.write.setInitialOwner([to.account.address, punkId])
}

async function assignPunkV1(ctx: Ctx, to: any, punkId: bigint) {
  await ctx.punksV1.write.setInitialOwner([to.account.address, punkId])
}

async function ensureVaultApprovingAuctions(ctx: Ctx, owner: any) {
  const vault = (await ctx.vaultFactory.read.predictVault([
    owner.account.address,
  ])) as `0x${string}`

  const publicClient = await ctx.viem.getPublicClient()
  const code = await publicClient.getCode({ address: vault })
  const deployed = !!code && code !== '0x'

  if (!deployed) {
    // First-time setup: deploy + approve auctions in one tx.
    const factoryAsOwner = await ctx.viem.getContractAt(
      'PunksVaultFactory',
      ctx.vaultFactory.address,
      { client: { wallet: owner } },
    )
    await factoryAsOwner.write.ensureMyVault([[ctx.auctions.address]])
    return vault
  }

  // Already deployed — confirm the auction is approved as operator.
  const vaultContract = await ctx.viem.getContractAt('PunksVault', vault)
  const approved = (await vaultContract.read.isOperator([
    ctx.auctions.address,
  ])) as boolean
  if (!approved) {
    const vaultAsOwner = await ctx.viem.getContractAt('PunksVault', vault, {
      client: { wallet: owner },
    })
    await vaultAsOwner.write.setOperator([ctx.auctions.address, true])
  }
  return vault
}

async function depositPunk(ctx: Ctx, owner: any, punkId: bigint) {
  const vault = await ensureVaultApprovingAuctions(ctx, owner)
  const punksAsOwner = await ctx.viem.getContractAt(
    'MockCryptoPunksMarket',
    ctx.punks.address,
    { client: { wallet: owner } },
  )
  await punksAsOwner.write.transferPunk([vault, punkId])
  return vault
}

async function depositPunkV1(ctx: Ctx, owner: any, punkId: bigint) {
  const vault = await ensureVaultApprovingAuctions(ctx, owner)
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
  onlySellTo: `0x${string}` = zeroAddress,
) {
  const auctionsAsSeller = await ctx.viem.getContractAt(
    'PunksAuction',
    ctx.auctions.address,
    { client: { wallet: seller } },
  )
  await auctionsAsSeller.write.createLot([items, reserveWei, onlySellTo])
}

async function createSinglePunkLot(
  ctx: Ctx,
  seller: any,
  punkId: bigint,
  reserveWei: bigint,
  onlySellTo: `0x${string}` = zeroAddress,
) {
  await createLotWith(
    ctx,
    seller,
    [lotItem(Number(punkId))],
    reserveWei,
    onlySellTo,
  )
}

async function createSinglePunkLotV1(
  ctx: Ctx,
  seller: any,
  punkId: bigint,
  reserveWei: bigint,
) {
  await createLotWith(
    ctx,
    seller,
    [lotItem(Number(punkId), 10_000, Standard.CRYPTOPUNKS_V1)],
    reserveWei,
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

async function offerPunkPublic(
  ctx: Ctx,
  seller: any,
  punkId: bigint,
  priceWei: bigint,
) {
  const punksAsSeller = await ctx.viem.getContractAt(
    'MockCryptoPunksMarket',
    ctx.punks.address,
    { client: { wallet: seller } },
  )
  await punksAsSeller.write.offerPunkForSale([punkId, priceWei])
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
    slots = [wildcardSlot()],
  }: {
    amountWei?: bigint
    slots?: OfferSlotInput[]
  } = {},
) {
  const auctionsAsOfferer = await ctx.viem.getContractAt(
    'PunksAuction',
    ctx.auctions.address,
    { client: { wallet: offerer } },
  )
  await auctionsAsOfferer.write.placeOffer([amountWei, slots], {
    value: amountWei,
  })
  return ctx.auctions.read.lastOfferId() as Promise<bigint>
}

const traitBit = (id: number): bigint => 1n << BigInt(id)

describe('PunksAuction', () => {
  it('exposes both markets and the vault factory through the auction immutables', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, punks, punksV1, vaultFactory } = ctx

    assert.equal(
      ((await auctions.read.PUNKS()) as string).toLowerCase(),
      punks.address.toLowerCase(),
    )
    assert.equal(
      ((await auctions.read.PUNKS_V1()) as string).toLowerCase(),
      punksV1.address.toLowerCase(),
    )
    assert.equal(
      ((await auctions.read.VAULTS()) as string).toLowerCase(),
      vaultFactory.address.toLowerCase(),
    )
  })

  it('sets ENS reverse names for the auction and escrow', async () => {
    const ctx = await deployAuctionStack()
    const reverse = await ctx.viem.getContractAt(
      'ReverseRegistrarMock',
      REVERSE_REGISTRAR,
    )

    assert.equal(await reverse.read.calls(), 3n)
    assert.equal(
      await reverse.read.nameOf([ctx.auctions.address]),
      'punksauction.eth',
    )
    assert.equal(
      await reverse.read.nameOf([ctx.escrow.address]),
      'escrow.punksauction.eth',
    )
  })

  it('deploys a single deterministic vault per user via the factory', async () => {
    const ctx = await deployAuctionStack()
    const { vaultFactory, seller, other } = ctx

    const predicted = (await vaultFactory.read.predictVault([
      seller.account.address,
    ])) as `0x${string}`

    // Anyone can deploy a user's vault — the salt is the user's address.
    const factoryAsOther = await ctx.viem.getContractAt(
      'PunksVaultFactory',
      vaultFactory.address,
      { client: { wallet: other } },
    )
    await factoryAsOther.write.ensureVault([seller.account.address])

    const publicClient = await ctx.viem.getPublicClient()
    const code = await publicClient.getCode({ address: predicted })
    assert.ok(code && code !== '0x', 'vault should have code after ensureVault')

    // Predicted address stays the same after deploy.
    assert.equal(
      (
        (await vaultFactory.read.predictVault([
          seller.account.address,
        ])) as string
      ).toLowerCase(),
      predicted.toLowerCase(),
    )
  })

  it('rejects createLot when the seller vault is not yet deployed', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, seller } = ctx
    await assignPunk(ctx, seller, 500n)
    const auctionsAsSeller = await ctx.viem.getContractAt(
      'PunksAuction',
      auctions.address,
      { client: { wallet: seller } },
    )

    await ctx.viem.assertions.revertWithCustomError(
      auctionsAsSeller.write.createLot([
        [lotItem(500)],
        parseEther('1'),
        zeroAddress,
      ]),
      auctions,
      'VaultNotDeployed',
    )
  })

  it('rejects createLot when the seller vault has not approved the auction', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, vaultFactory, seller } = ctx
    await assignPunk(ctx, seller, 501n)

    // Deploy the vault without approving the auction.
    const factoryAsSeller = await ctx.viem.getContractAt(
      'PunksVaultFactory',
      vaultFactory.address,
      { client: { wallet: seller } },
    )
    await factoryAsSeller.write.ensureMyVault([[]])
    const auctionsAsSeller = await ctx.viem.getContractAt(
      'PunksAuction',
      auctions.address,
      { client: { wallet: seller } },
    )

    await ctx.viem.assertions.revertWithCustomError(
      auctionsAsSeller.write.createLot([
        [lotItem(501)],
        parseEther('1'),
        zeroAddress,
      ]),
      auctions,
      'AuctionNotApproved',
    )
  })

  it('requires the seller vault to hold the punk before lot creation', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, seller } = ctx
    await assignPunk(ctx, seller, 502n)
    await ensureVaultApprovingAuctions(ctx, seller)
    const auctionsAsSeller = await ctx.viem.getContractAt(
      'PunksAuction',
      auctions.address,
      { client: { wallet: seller } },
    )

    await ctx.viem.assertions.revertWithCustomError(
      auctionsAsSeller.write.createLot([
        [lotItem(502)],
        parseEther('1'),
        zeroAddress,
      ]),
      auctions,
      'PunkNotInVault',
    )
  })

  it('opens an auction by pulling the punk from the seller vault into the auction escrow', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, escrow, punks, seller, bidder1 } = ctx

    await assignPunk(ctx, seller, 100n)
    const vault = await depositPunk(ctx, seller, 100n)
    assert.equal(
      ((await punks.read.punkIndexToAddress([100n])) as string).toLowerCase(),
      vault.toLowerCase(),
    )

    const reserveWei = parseEther('1')
    await createSinglePunkLot(ctx, seller, 100n, reserveWei)
    await openAuction(ctx, bidder1, 1n, reserveWei)

    assert.equal(
      ((await punks.read.punkIndexToAddress([100n])) as string).toLowerCase(),
      escrow.address.toLowerCase(),
    )

    const auction = await auctions.read.auctions([1n])
    // (seller, latestBidder, latestBidWei, endTimestamp, settled)
    assert.equal(auction[0].toLowerCase(), seller.account.address.toLowerCase())
    assert.equal(
      auction[1].toLowerCase(),
      bidder1.account.address.toLowerCase(),
    )
    assert.equal(auction[2], reserveWei)
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
    await createSinglePunkLot(ctx, seller, 101n, originalReserve)

    const auctionsAsSeller = await ctx.viem.getContractAt(
      'PunksAuction',
      auctions.address,
      { client: { wallet: seller } },
    )
    await auctionsAsSeller.write.updateLot([1n, raisedReserve, zeroAddress])

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
    await createSinglePunkLot(ctx, seller, 150n, reserveWei)
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

  it('credits the previous bidder when their refund receiver rejects ETH', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, seller, bidder2 } = ctx

    await assignPunk(ctx, seller, 151n)
    await depositPunk(ctx, seller, 151n)

    const reserveWei = parseEther('1')
    await createSinglePunkLot(ctx, seller, 151n, reserveWei)

    const rejectingBidder = await ctx.viem.deployContract(
      'ToggleEtherReceiver',
    )
    await rejectingBidder.write.openAuction(
      [auctions.address, 1n, reserveWei],
      { value: reserveWei },
    )
    await rejectingBidder.write.setRejectEther([true])

    const auctionsAsBidder2 = await ctx.viem.getContractAt(
      'PunksAuction',
      auctions.address,
      { client: { wallet: bidder2 } },
    )
    await auctionsAsBidder2.write.bid([1n], { value: parseEther('1.1') })

    assert.equal(
      await auctions.read.balances([rejectingBidder.address]),
      reserveWei,
    )

    const publicClient = await ctx.viem.getPublicClient()
    assert.equal(
      await publicClient.getBalance({ address: rejectingBidder.address }),
      0n,
    )

    await rejectingBidder.write.setRejectEther([false])
    await rejectingBidder.write.withdrawCredit([auctions.address])

    assert.equal(await auctions.read.balances([rejectingBidder.address]), 0n)
    assert.equal(
      await publicClient.getBalance({ address: rejectingBidder.address }),
      reserveWei,
    )
  })

  it('settles canonical Punks with a PunkBought round-trip and zero fees', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, escrow, punks, seller, bidder1 } = ctx

    await assignPunk(ctx, seller, 200n)
    await depositPunk(ctx, seller, 200n)

    const bidWei = parseEther('1')
    await createSinglePunkLot(ctx, seller, 200n, bidWei)
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
    assert.equal(auction[4], true)

    const punkBoughtAbi = parseAbiItem(
      'event PunkBought(uint256 indexed punkIndex, uint256 value, address indexed fromAddress, address indexed toAddress)',
    )
    const bought = (await publicClient.getLogs({
      address: punks.address,
      event: punkBoughtAbi,
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
      args: { punkIndex: 200n },
    })) as Array<{
      args: { value: bigint; fromAddress: string; toAddress: string }
    }>
    assert.equal(bought.length, 1)
    assert.equal(bought[0].args.value, bidWei)
    // Settlement routes through the dedicated escrow, so the canonical
    // PunkBought records the escrow as the seller and the auction as
    // the buyer.
    assert.equal(
      bought[0].args.fromAddress.toLowerCase(),
      escrow.address.toLowerCase(),
    )
    assert.equal(
      bought[0].args.toAddress.toLowerCase(),
      auctions.address.toLowerCase(),
    )

    assert.equal(
      await publicClient.getBalance({ address: auctions.address }),
      0n,
    )
    assert.equal(await publicClient.getBalance({ address: escrow.address }), 0n)
    assert.equal(await punks.read.pendingWithdrawals([auctions.address]), 0n)
    assert.equal(await punks.read.pendingWithdrawals([escrow.address]), 0n)
  })

  it('reverts atomically without paying the seller when the Punk market buy fails', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, escrow, punks, seller, bidder1 } = ctx

    await assignPunk(ctx, seller, 201n)
    await depositPunk(ctx, seller, 201n)

    const bidWei = parseEther('1')
    await createSinglePunkLot(ctx, seller, 201n, bidWei)
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
    assert.equal(await punks.read.pendingWithdrawals([auctions.address]), 0n)
    assert.equal(await punks.read.pendingWithdrawals([escrow.address]), 0n)

    const auction = await auctions.read.auctions([1n])
    assert.equal(auction[4], false)
  })

  it('settles V1 Punks through the bug-aware withdraw path with zero fees', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, escrow, punksV1, seller, bidder1 } = ctx

    await assignPunkV1(ctx, seller, 300n)
    await depositPunkV1(ctx, seller, 300n)

    const bidWei = parseEther('1')
    await createSinglePunkLotV1(ctx, seller, 300n, bidWei)
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
    assert.equal(await punksV1.read.pendingWithdrawals([escrow.address]), 0n)
    assert.equal(await publicClient.getBalance({ address: escrow.address }), 0n)
  })

  it('accepts settlement ETH only from the two Punk markets and the escrow', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, escrow, punks, punksV1, other, connection, viem } = ctx
    const publicClient = await viem.getPublicClient()

    // A random sender cannot push ETH into the auction.
    await assert.rejects(
      other.sendTransaction({ to: auctions.address, value: 1n }),
    )

    // Settlement proceeds round-trip back through the two Punk markets and
    // the escrow, so receive() accepts ETH from exactly those three.
    for (const sender of [punks.address, punksV1.address, escrow.address]) {
      await connection.networkHelpers.impersonateAccount(sender)
      await connection.networkHelpers.setBalance(sender, parseEther('1'))
      const senderClient = await viem.getWalletClient(sender)

      const before = await publicClient.getBalance({
        address: auctions.address,
      })
      const hash = await senderClient.sendTransaction({
        to: auctions.address,
        value: 1n,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      assert.equal(
        await publicClient.getBalance({ address: auctions.address }),
        before + 1n,
      )

      await connection.networkHelpers.stopImpersonatingAccount(sender)
    }
  })

  describe('auctions — lifecycle guards', () => {
    it('bid and settle revert for an unknown auction id', async () => {
      const ctx = await deployAuctionStack()
      const { auctions } = ctx

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.bid([999n], { value: parseEther('1') }),
        auctions,
        'AuctionDoesNotExist',
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.settle([999n]),
        auctions,
        'AuctionDoesNotExist',
      )
    })

    it('bid reverts once the auction has ended', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1, bidder2 } = ctx
      await assignPunk(ctx, seller, 250n)
      await depositPunk(ctx, seller, 250n)
      await createSinglePunkLot(ctx, seller, 250n, parseEther('1'))
      await openAuction(ctx, bidder1, 1n, parseEther('1'))

      await ctx.connection.networkHelpers.time.increase(DAY + 1)

      const auctionsAsBidder2 = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder2 } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsBidder2.write.bid([1n], { value: parseEther('2') }),
        auctions,
        'AuctionNotActive',
      )
    })

    it('settle reverts before the auction has ended', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx
      await assignPunk(ctx, seller, 251n)
      await depositPunk(ctx, seller, 251n)
      await createSinglePunkLot(ctx, seller, 251n, parseEther('1'))
      await openAuction(ctx, bidder1, 1n, parseEther('1'))

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.settle([1n]),
        auctions,
        'AuctionNotComplete',
      )
    })

    it('settle and bid revert once the auction is settled', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1, bidder2 } = ctx
      await assignPunk(ctx, seller, 252n)
      await depositPunk(ctx, seller, 252n)
      await createSinglePunkLot(ctx, seller, 252n, parseEther('1'))
      await openAuction(ctx, bidder1, 1n, parseEther('1'))

      await ctx.connection.networkHelpers.time.increase(DAY + 1)
      await auctions.write.settle([1n])

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.settle([1n]),
        auctions,
        'AuctionAlreadySettled',
      )
      const auctionsAsBidder2 = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder2 } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsBidder2.write.bid([1n], { value: parseEther('2') }),
        auctions,
        'AuctionAlreadySettled',
      )
    })

    it('cancelOffer and adjustOfferAmount reject callers that are not the offerer', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, bidder1, other } = ctx
      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
      })

      const auctionsAsOther = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: other } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOther.write.cancelOffer([offerId]),
        auctions,
        'NotOfferer',
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOther.write.adjustOfferAmount([offerId, parseEther('2')]),
        auctions,
        'NotOfferer',
      )
    })
  })

  describe('lots — validation', () => {
    it('rejects empty and oversized item arrays', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx
      // Setup the seller's vault + approval so item-array validation, not
      // the vault pre-check, is what fires.
      await ensureVaultApprovingAuctions(ctx, seller)
      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )

      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLot([[], parseEther('1'), zeroAddress]),
        auctions,
        'InvalidItemCount',
      )

      const big = Array.from({ length: 81 }, (_, i) => lotItem(i, 0))
      // weightBps=0 also invalid; still fails on count first
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLot([big, parseEther('1'), zeroAddress]),
        auctions,
        'InvalidItemCount',
      )
    })

    it('accepts exactly 80 lot items', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx
      const items: LotItemInput[] = []

      for (let i = 0; i < 80; i++) {
        const punkId = 2_000 + i
        await assignPunk(ctx, seller, BigInt(punkId))
        await depositPunk(ctx, seller, BigInt(punkId))
        items.push(lotItem(punkId, 125))
      }
      await createLotWith(ctx, seller, items, parseEther('1'))

      const storedItems = await auctions.read.getLotItems([1n])
      assert.equal(storedItems.length, 80)
    })

    it('settles an 80-item canonical lot without retaining ETH or Punks', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, escrow, punks, seller, bidder1 } = ctx
      const items: LotItemInput[] = []

      for (let i = 0; i < 80; i++) {
        const punkId = 3_000 + i
        await assignPunk(ctx, seller, BigInt(punkId))
        await depositPunk(ctx, seller, BigInt(punkId))
        items.push(lotItem(punkId, 125))
      }

      const bidWei = parseEther('10')
      await createLotWith(ctx, seller, items, bidWei)
      await openAuction(ctx, bidder1, 1n, bidWei)
      await ctx.connection.networkHelpers.time.increase(DAY + 1)

      const publicClient = await ctx.viem.getPublicClient()
      const sellerBefore = await publicClient.getBalance({
        address: seller.account.address,
      })
      // Pin the gas to a fixed ceiling well under the 16,777,216 EIP-7825
      // per-tx cap: an 80-item (MAX_LOT_ITEMS) settle must fit in one
      // transaction. PunksAuction.gas.test.ts measures the real-fork cost;
      // this guards the mock-based ceiling so a regression fails here too.
      const hash = await auctions.write.settle([1n], { gas: 16_000_000n })
      await publicClient.waitForTransactionReceipt({ hash })
      const sellerAfter = await publicClient.getBalance({
        address: seller.account.address,
      })

      assert.equal(sellerAfter - sellerBefore, bidWei)
      for (let i = 0; i < 80; i++) {
        assert.equal(
          (
            (await punks.read.punkIndexToAddress([BigInt(3_000 + i)])) as string
          ).toLowerCase(),
          bidder1.account.address.toLowerCase(),
        )
      }
      assert.equal(
        await publicClient.getBalance({ address: auctions.address }),
        0n,
      )
      assert.equal(
        await publicClient.getBalance({ address: escrow.address }),
        0n,
      )
    })

    it('rejects weights that do not sum to 10_000 or include a zero weight', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx
      await assignPunk(ctx, seller, 10n)
      await depositPunk(ctx, seller, 10n)
      await assignPunk(ctx, seller, 11n)
      await depositPunk(ctx, seller, 11n)
      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )

      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLot([
          [lotItem(10, 4_000), lotItem(11, 4_000)],
          parseEther('1'),
          zeroAddress,
        ]),
        auctions,
        'InvalidWeights',
      )

      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLot([
          [lotItem(10, 0), lotItem(11, 10_000)],
          parseEther('1'),
          zeroAddress,
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
      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )

      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLot([
          [lotItem(20, 5_000), lotItem(20, 5_000)],
          parseEther('1'),
          zeroAddress,
        ]),
        auctions,
        'DuplicateLotItem',
      )
    })
  })

  describe('lots — bundle lifecycle', () => {
    it('creates a V1+V2 pair lot, opens it, and settles each item with weighted prices', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, escrow, punks, punksV1, seller, bidder1 } = ctx

      await assignPunkV1(ctx, seller, 4156n)
      await depositPunkV1(ctx, seller, 4156n)
      await assignPunk(ctx, seller, 4156n)
      await depositPunk(ctx, seller, 4156n)
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
        zeroAddress,
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
        (
          (await punksV1.read.punkIndexToAddress([4156n])) as string
        ).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal(
        (
          (await punks.read.punkIndexToAddress([4156n])) as string
        ).toLowerCase(),
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
      })) as Array<{
        args: { value: bigint; fromAddress: string; toAddress: string }
      }>
      const v1Logs = (await publicClient.getLogs({
        address: punksV1.address,
        event: punkBoughtAbi,
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        args: { punkIndex: 4156n },
      })) as Array<{
        args: { value: bigint; fromAddress: string; toAddress: string }
      }>
      assert.equal(v2Logs.length, 1)
      assert.equal(v1Logs.length, 1)
      assert.equal(v1Logs[0].args.value, parseEther('0.5'))
      assert.equal(v2Logs[0].args.value, parseEther('9.5'))
      // V2 reports the escrow as seller and the auction as buyer.
      assert.equal(
        v2Logs[0].args.fromAddress.toLowerCase(),
        escrow.address.toLowerCase(),
      )
      assert.equal(
        v2Logs[0].args.toAddress.toLowerCase(),
        auctions.address.toLowerCase(),
      )
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
      await createLotWith(ctx, seller, items, totalWei)
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

    it('rejects creating a lot whose Punk is already in another active lot', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx
      await assignPunk(ctx, seller, 70n)
      await depositPunk(ctx, seller, 70n)
      await assignPunk(ctx, seller, 71n)
      await depositPunk(ctx, seller, 71n)
      await createSinglePunkLot(ctx, seller, 70n, parseEther('1'))

      // A second lot that re-uses Punk 70 reverts up front, naming the active lot.
      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomErrorWithArgs(
        auctionsAsSeller.write.createLot([
          [lotItem(70, 5_000), lotItem(71, 5_000)],
          parseEther('2'),
          zeroAddress,
        ]),
        auctions,
        'PunkAlreadyInLot',
        [1n],
      )
    })

    it('frees a Punk slot on cancelLot so the seller can re-list it', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx
      await assignPunk(ctx, seller, 80n)
      await depositPunk(ctx, seller, 80n)
      await createSinglePunkLot(ctx, seller, 80n, parseEther('1'))
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          80,
        ]),
        1n,
      )

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await auctionsAsSeller.write.cancelLot([1n])
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          80,
        ]),
        0n,
      )

      // Re-listing the same Punk now succeeds.
      await createSinglePunkLot(ctx, seller, 80n, parseEther('2'))
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          80,
        ]),
        2n,
      )
    })

    it('frees every Punk slot in a multi-item lot on cancelLot so the seller can regroup them', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx
      for (const id of [110n, 111n, 112n]) {
        await assignPunk(ctx, seller, id)
        await depositPunk(ctx, seller, id)
      }

      // A three-Punk bundle reserves all three slots at once.
      await createLotWith(
        ctx,
        seller,
        [lotItem(110, 3_000), lotItem(111, 3_000), lotItem(112, 4_000)],
        parseEther('5'),
      )
      for (const id of [110, 111, 112]) {
        assert.equal(
          await auctions.read.activeLotFor([
            seller.account.address,
            Standard.CRYPTOPUNKS,
            id,
          ]),
          1n,
        )
      }

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      // While bundled, an item in the middle of the lot cannot be re-listed.
      await ctx.viem.assertions.revertWithCustomErrorWithArgs(
        auctionsAsSeller.write.createLot([
          [lotItem(111)],
          parseEther('1'),
          zeroAddress,
        ]),
        auctions,
        'PunkAlreadyInLot',
        [1n],
      )

      // Cancelling the bundle frees every one of its slots.
      await auctionsAsSeller.write.cancelLot([1n])
      for (const id of [110, 111, 112]) {
        assert.equal(
          await auctions.read.activeLotFor([
            seller.account.address,
            Standard.CRYPTOPUNKS,
            id,
          ]),
          0n,
        )
      }

      // Every freed Punk can be re-listed in a fresh grouping: one on its
      // own, the other two together as a new bundle.
      await createSinglePunkLot(ctx, seller, 110n, parseEther('2'))
      await createLotWith(
        ctx,
        seller,
        [lotItem(111, 5_000), lotItem(112, 5_000)],
        parseEther('3'),
      )
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          110,
        ]),
        2n,
      )
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          111,
        ]),
        3n,
      )
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          112,
        ]),
        3n,
      )
    })

    it('updateLot and cancelLot reject callers that do not own the lot', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, attacker } = ctx
      await assignPunk(ctx, seller, 120n)
      await depositPunk(ctx, seller, 120n)
      await createSinglePunkLot(ctx, seller, 120n, parseEther('1'))

      const auctionsAsAttacker = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: attacker } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsAttacker.write.updateLot([1n, parseEther('2'), zeroAddress]),
        auctions,
        'NotSeller',
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsAttacker.write.cancelLot([1n]),
        auctions,
        'NotSeller',
      )
    })

    it('updateLot and cancelLot revert for an unknown lot id', async () => {
      const ctx = await deployAuctionStack()
      const { auctions } = ctx
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.updateLot([999n, parseEther('1'), zeroAddress]),
        auctions,
        'LotNotFound',
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.cancelLot([999n]),
        auctions,
        'LotNotFound',
      )
    })

    it('updateLot rejects a zero reserve', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx
      await assignPunk(ctx, seller, 121n)
      await depositPunk(ctx, seller, 121n)
      await createSinglePunkLot(ctx, seller, 121n, parseEther('1'))

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.updateLot([1n, 0n, zeroAddress]),
        auctions,
        'InvalidAmount',
      )
    })

    it('does not make a valid lot stale just because time passes', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx
      await assignPunk(ctx, seller, 81n)
      await depositPunk(ctx, seller, 81n)
      await createSinglePunkLot(ctx, seller, 81n, parseEther('1'))

      await ctx.connection.networkHelpers.time.increase(DAY + 1)
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.clearStaleLot([1n]),
        auctions,
        'LotNotStale',
      )

      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          81,
        ]),
        1n,
      )

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomErrorWithArgs(
        auctionsAsSeller.write.createLot([
          [lotItem(81)],
          parseEther('2'),
          zeroAddress,
        ]),
        auctions,
        'PunkAlreadyInLot',
        [1n],
      )
    })

    it('frees a Punk slot when a lot is cleared after the seller reclaims the Punk', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, seller } = ctx
      await assignPunk(ctx, seller, 82n)
      const vaultAddress = await depositPunk(ctx, seller, 82n)
      await createSinglePunkLot(ctx, seller, 82n, parseEther('1'))

      // Seller pulls the Punk back out of the vault, invalidating the lot.
      const vaultAsSeller = await ctx.viem.getContractAt(
        'PunksVault',
        vaultAddress,
        { client: { wallet: seller } },
      )
      await vaultAsSeller.write.transferPunk([
        punks.address,
        82n,
        seller.account.address,
      ])

      // Anyone can now clear the stale lot, which frees the slot.
      await auctions.write.clearStaleLot([1n])
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          82,
        ]),
        0n,
      )
    })

    it('frees a Punk slot when a lot is cleared after auction approval is revoked', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx
      await assignPunk(ctx, seller, 85n)
      const vaultAddress = await depositPunk(ctx, seller, 85n)
      await createSinglePunkLot(ctx, seller, 85n, parseEther('1'))

      const vaultAsSeller = await ctx.viem.getContractAt(
        'PunksVault',
        vaultAddress,
        { client: { wallet: seller } },
      )
      await vaultAsSeller.write.setOperator([auctions.address, false])

      await auctions.write.clearStaleLot([1n])
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          85,
        ]),
        0n,
      )
    })

    it('clearStaleLot reverts when the lot is still valid', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx
      await assignPunk(ctx, seller, 83n)
      await depositPunk(ctx, seller, 83n)
      await createSinglePunkLot(ctx, seller, 83n, parseEther('1'))

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.clearStaleLot([1n]),
        auctions,
        'LotNotStale',
      )
    })

    it('clearStaleLots clears a batch of stale lots so the seller can re-list every Punk', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx
      for (const id of [100n, 101n, 102n]) {
        await assignPunk(ctx, seller, id)
        await depositPunk(ctx, seller, id)
      }

      // Lot 1 bundles two Punks; lot 2 holds a third on its own.
      await createLotWith(
        ctx,
        seller,
        [lotItem(100, 5_000), lotItem(101, 5_000)],
        parseEther('2'),
      )
      await createSinglePunkLot(ctx, seller, 102n, parseEther('1'))

      // Revoking the auction operator turns every lot on the vault stale.
      const vaultAddress = (await ctx.vaultFactory.read.predictVault([
        seller.account.address,
      ])) as `0x${string}`
      const vaultAsSeller = await ctx.viem.getContractAt(
        'PunksVault',
        vaultAddress,
        { client: { wallet: seller } },
      )
      await vaultAsSeller.write.setOperator([auctions.address, false])

      // One batch call clears both lots — every item of the bundle included.
      await auctions.write.clearStaleLots([[1n, 2n]])
      for (const id of [100, 101, 102]) {
        assert.equal(
          await auctions.read.activeLotFor([
            seller.account.address,
            Standard.CRYPTOPUNKS,
            id,
          ]),
          0n,
        )
      }

      // With every slot freed, the seller can re-list all three Punks.
      await vaultAsSeller.write.setOperator([auctions.address, true])
      await createLotWith(
        ctx,
        seller,
        [lotItem(100, 3_000), lotItem(101, 3_000), lotItem(102, 4_000)],
        parseEther('4'),
      )
      for (const id of [100, 101, 102]) {
        assert.equal(
          await auctions.read.activeLotFor([
            seller.account.address,
            Standard.CRYPTOPUNKS,
            id,
          ]),
          3n,
        )
      }
    })

    it('clearStaleLots reverts atomically when any lot in the batch is still valid', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, seller } = ctx
      await assignPunk(ctx, seller, 103n)
      const vaultAddress = await depositPunk(ctx, seller, 103n)
      await assignPunk(ctx, seller, 104n)
      await depositPunk(ctx, seller, 104n)
      await createSinglePunkLot(ctx, seller, 103n, parseEther('1'))
      await createSinglePunkLot(ctx, seller, 104n, parseEther('1'))

      // Only lot 1 goes stale: the seller pulls Punk 103 back out of the vault.
      const vaultAsSeller = await ctx.viem.getContractAt(
        'PunksVault',
        vaultAddress,
        { client: { wallet: seller } },
      )
      await vaultAsSeller.write.transferPunk([
        punks.address,
        103n,
        seller.account.address,
      ])

      // Batching the still-valid lot 2 reverts the whole call: the stale lot 1
      // is left intact rather than half-cleared.
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.clearStaleLots([[1n, 2n]]),
        auctions,
        'LotNotStale',
      )
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          103,
        ]),
        1n,
      )
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          104,
        ]),
        2n,
      )

      // Retrying with only the stale lot clears it and leaves lot 2 alone.
      await auctions.write.clearStaleLots([[1n]])
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          103,
        ]),
        0n,
      )
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          104,
        ]),
        2n,
      )
    })

    it('frees a Punk slot when an auction opens, allowing the seller to list other Punks', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx
      await assignPunk(ctx, seller, 84n)
      await depositPunk(ctx, seller, 84n)
      await createSinglePunkLot(ctx, seller, 84n, parseEther('1'))
      await openAuction(ctx, bidder1, 1n, parseEther('1'))

      // Once auction opens, the lot slot is released. (The Punk itself is now
      // in auction custody, so re-listing the same Punk would revert at the
      // vault-custody check.)
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          84,
        ]),
        0n,
      )
    })
  })

  describe('offers', () => {
    it('lets offerers place, adjust, inspect, and cancel native ETH offers', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, bidder1 } = ctx

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
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
      assert.equal(
        offer[1].toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )

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
      // 1.0 -> 1.25 (top up), 1.25 -> 1.15 (decrease).
      await auctionsAsOfferer.write.adjustOfferAmount(
        [offerId, parseEther('1.25')],
        {
          value: parseEther('0.25'),
        },
      )
      await auctionsAsOfferer.write.adjustOfferAmount([
        offerId,
        parseEther('1.15'),
      ])

      offer = await auctions.read.offers([offerId])
      assert.equal(offer[0], parseEther('1.15'))

      const publicClient = await ctx.viem.getPublicClient()
      const before = await publicClient.getBalance({
        address: bidder1.account.address,
      })
      const hash = await auctionsAsOfferer.write.cancelOffer([offerId])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const after = await publicClient.getBalance({
        address: bidder1.account.address,
      })
      const gas = receipt.gasUsed * receipt.effectiveGasPrice
      assert.equal(after - before + gas, parseEther('1.15'))

      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.cancelOffer([offerId]),
        auctions,
        'OfferNotActive',
      )
    })

    it('rejects setting the offer amount to zero or with mismatched payment', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, bidder1 } = ctx

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
      })

      const auctionsAsOfferer = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )

      // Zero is rejected — mirrors placeOffer's `InvalidAmount` guard.
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.adjustOfferAmount([offerId, 0n]),
        auctions,
        'InvalidAmount',
      )

      // Increases require `msg.value` to equal the delta exactly.
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.adjustOfferAmount([offerId, parseEther('2')], {
          value: parseEther('0.5'),
        }),
        auctions,
        'IncorrectPayment',
      )

      // Decreases must be zero-value calls.
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.adjustOfferAmount(
          [offerId, parseEther('0.5')],
          { value: 1n },
        ),
        auctions,
        'IncorrectPayment',
      )

      // Sanity: the offer is still active with its original amount.
      const offer = await auctions.read.offers([offerId])
      assert.equal(offer[0], parseEther('1'))
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
            [
              {
                criteria: {
                  ...emptyCriteria(),
                  requiredTraitMask: traitBit(120),
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

      // required & forbidden overlap.
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.placeOffer(
          [
            parseEther('1'),
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
            [
              {
                criteria: {
                  ...emptyCriteria(),
                  minColorCount: 1,
                  maxColorCount: 15,
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
        'InvalidColorCountRange',
      )

      // Color count range: min > max.
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.placeOffer(
          [
            parseEther('1'),
            [
              {
                criteria: {
                  ...emptyCriteria(),
                  minColorCount: 8,
                  maxColorCount: 4,
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
        auctionsAsOfferer.write.placeOffer([parseEther('1'), []], {
          value: parseEther('1'),
        }),
        auctions,
        'InvalidSlotCount',
      )

      const tooMany = Array.from({ length: 81 }, () => wildcardSlot())
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.placeOffer([parseEther('1'), tooMany], {
          value: parseEther('1'),
        }),
        auctions,
        'InvalidSlotCount',
      )

      const maxSlots = Array.from({ length: 80 }, () => wildcardSlot())
      await auctionsAsOfferer.write.placeOffer([parseEther('1'), maxSlots], {
        value: parseEther('1'),
      })
      const storedSlots = await auctions.read.getOfferSlots([1n])
      assert.equal(storedSlots.length, 80)
    })

    it('accepts a canonical Punk offer through the original marketplace and pays the full offer amount', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, seller, bidder1, attacker } = ctx

      await assignPunk(ctx, seller, 700n)
      await offerPunkToAuctions(ctx, seller, 700n, parseEther('0.9'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
      })

      const publicClient = await ctx.viem.getPublicClient()
      const bidderBefore = await publicClient.getBalance({
        address: bidder1.account.address,
      })
      const settlerBefore = await publicClient.getBalance({
        address: attacker.account.address,
      })

      const auctionsAsSettler = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: attacker } },
      )
      const hash = await auctionsAsSettler.write.acceptOffer([
        offerId,
        700,
        parseEther('0.9'),
      ])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      assert.equal(
        ((await punks.read.punkIndexToAddress([700n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal(
        await punks.read.pendingWithdrawals([seller.account.address]),
        parseEther('1'),
      )
      assert.equal(
        (await publicClient.getBalance({ address: bidder1.account.address })) -
          bidderBefore,
        0n,
      )

      const settlerAfter = await publicClient.getBalance({
        address: attacker.account.address,
      })
      const gas = receipt.gasUsed * receipt.effectiveGasPrice
      assert.equal(settlerAfter - settlerBefore + gas, 0n)

      const offer = await auctions.read.offers([offerId])
      assert.equal(offer[1], zeroAddress)
    })

    it('accepts a canonical Punk offer from a public marketplace listing', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, seller, bidder1, attacker } = ctx

      await assignPunk(ctx, seller, 710n)
      await offerPunkPublic(ctx, seller, 710n, parseEther('0.9'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
      })

      const auctionsAsSettler = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: attacker } },
      )
      await auctionsAsSettler.write.acceptOffer([
        offerId,
        710,
        parseEther('0.9'),
      ])

      assert.equal(
        ((await punks.read.punkIndexToAddress([710n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal(
        await punks.read.pendingWithdrawals([seller.account.address]),
        parseEther('1'),
      )

      const offer = await auctions.read.offers([offerId])
      assert.equal(offer[1], zeroAddress)
    })

    it('rejects acceptOffer when the offer has more than one slot', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, bidder1 } = ctx

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [wildcardSlot(), wildcardSlot()],
      })

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 1, parseEther('1')]),
        auctions,
        'MultiSlotOfferRequiresLot',
      )
    })

    it('rejects immediate acceptance when the listing is directed elsewhere or above the offer amount', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1, other } = ctx

      await assignPunk(ctx, seller, 701n)
      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
      })

      await offerPunkToAuctions(
        ctx,
        seller,
        701n,
        parseEther('0.9'),
        other.account.address,
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 701, parseEther('0.9')]),
        auctions,
        'ListingNotValid',
      )

      await offerPunkToAuctions(ctx, seller, 701n, parseEther('1.1'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 701, parseEther('1.1')]),
        auctions,
        'ListingPriceTooHigh',
      )
    })

    it('rejects immediate acceptance when the listing price changed from the caller expectation', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 702n)
      await offerPunkToAuctions(ctx, seller, 702n, parseEther('0.9'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
      })

      await offerPunkToAuctions(ctx, seller, 702n, parseEther('1'))

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 702, parseEther('0.9')]),
        auctions,
        'ListingPriceMismatch',
      )
    })

    it('lets includes extend criteria while excludes still override', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punksData, seller, bidder1 } = ctx

      await punksData.write.setTraitMask([800, traitBit(7)])
      await punksData.write.setTraitMask([801, 0n])
      await punksData.write.setTraitMask([802, traitBit(7)])
      await punksData.write.setColorCount([800, 6])
      await punksData.write.setColorCount([802, 6])

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [
          {
            criteria: {
              ...emptyCriteria(),
              requiredTraitMask: traitBit(7),
              minColorCount: 4,
              maxColorCount: 8,
            },
            standard: Standard.CRYPTOPUNKS,
            includeIds: [801, 802],
            excludeIds: [802],
          },
        ],
      })

      await assignPunk(ctx, seller, 799n)
      await offerPunkToAuctions(ctx, seller, 799n, parseEther('0.9'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 799, parseEther('0.9')]),
        auctions,
        'PunkNotMatched',
      )

      await assignPunk(ctx, seller, 802n)
      await offerPunkToAuctions(ctx, seller, 802n, parseEther('0.9'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 802, parseEther('0.9')]),
        auctions,
        'PunkExcluded',
      )

      await assignPunk(ctx, seller, 801n)
      await offerPunkToAuctions(ctx, seller, 801n, parseEther('0.9'))
      await auctions.write.acceptOffer([offerId, 801, parseEther('0.9')])
    })

    it('keeps include-only offer slots exact when criteria is empty', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, seller, bidder1 } = ctx

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(900)],
      })

      await assignPunk(ctx, seller, 901n)
      await offerPunkToAuctions(ctx, seller, 901n, parseEther('0.9'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 901, parseEther('0.9')]),
        auctions,
        'PunkNotMatched',
      )

      await assignPunk(ctx, seller, 900n)
      await offerPunkToAuctions(ctx, seller, 900n, parseEther('0.9'))
      await auctions.write.acceptOffer([offerId, 900, parseEther('0.9')])
      assert.equal(
        ((await punks.read.punkIndexToAddress([900n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
    })

    it('rejects offers when the matched Punk is outside the color count range', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punksData, seller, bidder1 } = ctx

      await punksData.write.setColorCount([900, 3])

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [
          {
            criteria: {
              ...emptyCriteria(),
              minColorCount: 5,
              maxColorCount: 10,
            },
            standard: Standard.CRYPTOPUNKS,
            includeIds: [],
            excludeIds: [],
          },
        ],
      })

      await assignPunk(ctx, seller, 900n)
      await offerPunkToAuctions(ctx, seller, 900n, parseEther('0.9'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 900, parseEther('0.9')]),
        auctions,
        'PunkNotMatched',
      )
    })

    it('accepts a V1 Punk offer through the bug-aware marketplace path and pays the full offer amount', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punksV1, seller, bidder1, attacker } = ctx

      await assignPunkV1(ctx, seller, 905n)
      await offerPunkV1ToAuctions(ctx, seller, 905n, parseEther('0.8'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [wildcardSlot(Standard.CRYPTOPUNKS_V1)],
      })

      const publicClient = await ctx.viem.getPublicClient()
      const sellerBefore = await publicClient.getBalance({
        address: seller.account.address,
      })
      const bidderBefore = await publicClient.getBalance({
        address: bidder1.account.address,
      })

      const auctionsAsSettler = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: attacker } },
      )
      await auctionsAsSettler.write.acceptOffer([
        offerId,
        905,
        parseEther('0.8'),
      ])

      assert.equal(
        (
          (await punksV1.read.punkIndexToAddress([905n])) as string
        ).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal(
        (await publicClient.getBalance({ address: seller.account.address })) -
          sellerBefore,
        parseEther('1'),
      )
      assert.equal(
        (await publicClient.getBalance({ address: bidder1.account.address })) -
          bidderBefore,
        0n,
      )
      assert.equal(
        await punksV1.read.pendingWithdrawals([auctions.address]),
        0n,
      )
    })

    it('initializes a 24h auction from an offer using a stored lot', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, seller, bidder1, bidder2 } = ctx

      await assignPunk(ctx, seller, 950n)
      await depositPunk(ctx, seller, 950n)
      await createSinglePunkLot(ctx, seller, 950n, parseEther('1'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(950)],
      })

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await auctionsAsSeller.write.startAuctionFromOffer([
        offerId,
        1n,
        parseEther('1'),
      ])

      const publicClient = await ctx.viem.getPublicClient()
      assert.equal(
        ((await punks.read.punkIndexToAddress([950n])) as string).toLowerCase(),
        ctx.escrow.address.toLowerCase(),
      )
      const auction = await auctions.read.auctions([1n])
      assert.equal(
        auction[0].toLowerCase(),
        seller.account.address.toLowerCase(),
      )
      assert.equal(
        auction[1].toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal(auction[2], parseEther('1'))

      const auctionsAsBidder2 = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder2 } },
      )
      await auctionsAsBidder2.write.bid([1n], { value: parseEther('1.1') })

      const auctionsAsBidder1 = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )
      await auctionsAsBidder1.write.bid([1n], { value: parseEther('1.21') })

      await ctx.connection.networkHelpers.time.increase(DAY + 1)
      await auctions.write.settle([1n])
      assert.equal(
        ((await punks.read.punkIndexToAddress([950n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
    })

    it('requires the lot to exist when starting an auction from an offer', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, bidder1 } = ctx

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(951)],
      })

      const auctionsAsCaller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsCaller.write.startAuctionFromOffer([
          offerId,
          999n,
          parseEther('1'),
        ]),
        auctions,
        'LotNotFound',
      )
    })

    it('rejects starting an auction from an offer below the lot reserve', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 952n)
      await depositPunk(ctx, seller, 952n)
      await createSinglePunkLot(ctx, seller, 952n, parseEther('2'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(952)],
      })

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.startAuctionFromOffer([offerId, 1n, parseEther('1')]),
        auctions,
        'ReserveNotMet',
      )
    })

    it('rejects starting an auction when the offer was lowered below the caller minimum', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 953n)
      await depositPunk(ctx, seller, 953n)
      await createSinglePunkLot(ctx, seller, 953n, parseEther('1'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('5'),
        slots: [punkSlot(953)],
      })

      const auctionsAsOfferer = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )
      await auctionsAsOfferer.write.adjustOfferAmount([
        offerId,
        parseEther('1'),
      ])

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.startAuctionFromOffer([offerId, 1n, parseEther('5')]),
        auctions,
        'OfferAmountBelowMinimum',
      )
    })

    it('accepts a V1+V2 pair offer against a stored lot and pays seller the offer amount', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, punksV1, seller, bidder1 } = ctx

      await assignPunkV1(ctx, seller, 1000n)
      await depositPunkV1(ctx, seller, 1000n)
      await assignPunk(ctx, seller, 1000n)
      await depositPunk(ctx, seller, 1000n)
      await createLotWith(
        ctx,
        seller,
        [
          lotItem(1000, 5_000, Standard.CRYPTOPUNKS_V1),
          lotItem(1000, 5_000, Standard.CRYPTOPUNKS),
        ],
        parseEther('5'),
      )

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('5'),
        slots: [
          punkSlot(1000, Standard.CRYPTOPUNKS_V1),
          punkSlot(1000, Standard.CRYPTOPUNKS),
        ],
      })

      const publicClient = await ctx.viem.getPublicClient()
      const sellerBefore = await publicClient.getBalance({
        address: seller.account.address,
      })

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      const hash = await auctionsAsSeller.write.acceptOfferFromLot([
        offerId,
        1n,
        parseEther('5'),
      ])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      const gas = receipt.gasUsed * receipt.effectiveGasPrice
      assert.equal(
        (await publicClient.getBalance({ address: seller.account.address })) -
          sellerBefore +
          gas,
        parseEther('5'),
      )

      assert.equal(
        (
          (await punks.read.punkIndexToAddress([1000n])) as string
        ).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal(
        (
          (await punksV1.read.punkIndexToAddress([1000n])) as string
        ).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
    })

    it('rejects accepting an offer below the lot reserve', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 1001n)
      await depositPunk(ctx, seller, 1001n)
      await createSinglePunkLot(ctx, seller, 1001n, parseEther('2'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(1001)],
      })

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.acceptOfferFromLot([
          offerId,
          1n,
          parseEther('1'),
        ]),
        auctions,
        'ReserveNotMet',
      )
    })

    it('rejects accepting a lot offer that was lowered below the seller minimum', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 1002n)
      await depositPunk(ctx, seller, 1002n)
      await createSinglePunkLot(ctx, seller, 1002n, parseEther('1'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('5'),
        slots: [punkSlot(1002)],
      })

      const auctionsAsOfferer = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )
      await auctionsAsOfferer.write.adjustOfferAmount([
        offerId,
        parseEther('1'),
      ])

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.acceptOfferFromLot([
          offerId,
          1n,
          parseEther('5'),
        ]),
        auctions,
        'OfferAmountBelowMinimum',
      )
    })

    it('rejects acceptOfferFromLot when slot count differs from the lot', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 1100n)
      await depositPunk(ctx, seller, 1100n)
      await createSinglePunkLot(ctx, seller, 1100n, parseEther('1'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(1100), punkSlot(1101)],
      })

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.acceptOfferFromLot([
          offerId,
          1n,
          parseEther('1'),
        ]),
        auctions,
        'SlotItemCountMismatch',
      )
    })

    it('rejects acceptOfferFromLot when slot standard does not match item standard', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 1200n)
      await depositPunk(ctx, seller, 1200n)
      await createSinglePunkLot(ctx, seller, 1200n, parseEther('1'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(1200, Standard.CRYPTOPUNKS_V1)],
      })

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.acceptOfferFromLot([
          offerId,
          1n,
          parseEther('1'),
        ]),
        auctions,
        'OfferStandardMismatch',
      )
    })

    it('rejects acceptOfferFromLot when the caller is not the lot seller', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1, other } = ctx

      await assignPunk(ctx, seller, 1300n)
      await depositPunk(ctx, seller, 1300n)
      await createSinglePunkLot(ctx, seller, 1300n, parseEther('1'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(1300)],
      })

      // The offerer must not be able to self-execute the instant sale and
      // skip the 24h auction.
      const auctionsAsOfferer = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.acceptOfferFromLot([
          offerId,
          1n,
          parseEther('1'),
        ]),
        auctions,
        'NotSeller',
      )

      const auctionsAsOther = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: other } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOther.write.acceptOfferFromLot([
          offerId,
          1n,
          parseEther('1'),
        ]),
        auctions,
        'NotSeller',
      )
    })
  })

  describe('lots — private listings', () => {
    it('stores onlySellTo on the lot when created with a non-zero address', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx
      await assignPunk(ctx, seller, 5000n)
      await depositPunk(ctx, seller, 5000n)

      await createSinglePunkLot(
        ctx,
        seller,
        5000n,
        parseEther('1'),
        bidder1.account.address,
      )

      const lot = await auctions.read.lots([1n])
      // (seller, reserveWei, onlySellTo)
      assert.equal(
        (lot[2] as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
    })

    it('updateLot can change onlySellTo on an existing lot', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1, bidder2 } = ctx
      await assignPunk(ctx, seller, 5001n)
      await depositPunk(ctx, seller, 5001n)
      await createSinglePunkLot(
        ctx,
        seller,
        5001n,
        parseEther('1'),
        bidder1.account.address,
      )

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await auctionsAsSeller.write.updateLot([
        1n,
        parseEther('1'),
        bidder2.account.address,
      ])

      const lot = await auctions.read.lots([1n])
      assert.equal(
        (lot[2] as string).toLowerCase(),
        bidder2.account.address.toLowerCase(),
      )
    })

    it('allows the designated buyer to openAuction on a private lot', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx
      await assignPunk(ctx, seller, 5002n)
      await depositPunk(ctx, seller, 5002n)
      await createSinglePunkLot(
        ctx,
        seller,
        5002n,
        parseEther('1'),
        bidder1.account.address,
      )

      await openAuction(ctx, bidder1, 1n, parseEther('1'))

      const auction = await auctions.read.auctions([1n])
      assert.equal(
        (auction[1] as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
    })

    it('rejects openAuction from a non-designated buyer on a private lot', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1, other } = ctx
      await assignPunk(ctx, seller, 5003n)
      await depositPunk(ctx, seller, 5003n)
      await createSinglePunkLot(
        ctx,
        seller,
        5003n,
        parseEther('1'),
        bidder1.account.address,
      )

      const auctionsAsOther = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: other } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOther.write.openAuction([1n, parseEther('1')], {
          value: parseEther('1'),
        }),
        auctions,
        'BuyerNotAllowed',
      )
    })

    it('accepts acceptOfferFromLot only when the offer comes from onlySellTo', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, seller, bidder1, other } = ctx
      await assignPunk(ctx, seller, 5004n)
      await depositPunk(ctx, seller, 5004n)
      await createSinglePunkLot(
        ctx,
        seller,
        5004n,
        parseEther('1'),
        bidder1.account.address,
      )

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )

      const otherOfferId = await placeOffer(ctx, other, {
        amountWei: parseEther('1'),
        slots: [punkSlot(5004)],
      })
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.acceptOfferFromLot([
          otherOfferId,
          1n,
          parseEther('1'),
        ]),
        auctions,
        'BuyerNotAllowed',
      )

      const goodOfferId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(5004)],
      })
      await auctionsAsSeller.write.acceptOfferFromLot([
        goodOfferId,
        1n,
        parseEther('1'),
      ])

      assert.equal(
        (
          (await punks.read.punkIndexToAddress([5004n])) as string
        ).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
    })

    it('starts a lot auction from an offer only when the offer comes from onlySellTo', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1, other } = ctx
      await assignPunk(ctx, seller, 5005n)
      await depositPunk(ctx, seller, 5005n)
      await createSinglePunkLot(
        ctx,
        seller,
        5005n,
        parseEther('1'),
        bidder1.account.address,
      )

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )

      const otherOfferId = await placeOffer(ctx, other, {
        amountWei: parseEther('1'),
        slots: [punkSlot(5005)],
      })
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.startAuctionFromOffer([
          otherOfferId,
          1n,
          parseEther('1'),
        ]),
        auctions,
        'BuyerNotAllowed',
      )

      const goodOfferId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(5005)],
      })
      await auctionsAsSeller.write.startAuctionFromOffer([
        goodOfferId,
        1n,
        parseEther('1'),
      ])

      const auction = await auctions.read.auctions([1n])
      assert.equal(
        (auction[1] as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
    })

    it('does not restrict bidding once a private lot becomes a live auction', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1, other } = ctx
      await assignPunk(ctx, seller, 5006n)
      await depositPunk(ctx, seller, 5006n)
      await createSinglePunkLot(
        ctx,
        seller,
        5006n,
        parseEther('1'),
        bidder1.account.address,
      )

      await openAuction(ctx, bidder1, 1n, parseEther('1'))

      const auctionsAsOther = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: other } },
      )
      await auctionsAsOther.write.bid([1n], { value: parseEther('2') })

      const auction = await auctions.read.auctions([1n])
      assert.equal(
        (auction[1] as string).toLowerCase(),
        other.account.address.toLowerCase(),
      )
      assert.equal(auction[2], parseEther('2'))
    })
  })

  describe('lots — create and settle in one transaction', () => {
    it('createLotAndAcceptOffer settles a single Punk in one transaction', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, escrow, punks, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 6000n)
      await depositPunk(ctx, seller, 6000n)

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('3'),
        slots: [punkSlot(6000)],
      })

      const publicClient = await ctx.viem.getPublicClient()
      const sellerBefore = await publicClient.getBalance({
        address: seller.account.address,
      })

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      const hash = await auctionsAsSeller.write.createLotAndAcceptOffer([
        [lotItem(6000)],
        offerId,
        parseEther('3'),
      ])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const gas = receipt.gasUsed * receipt.effectiveGasPrice

      // The Punk is delivered to the offerer and the seller is paid the full
      // offer amount — all from one transaction.
      assert.equal(
        ((await punks.read.punkIndexToAddress([6000n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal(
        (await publicClient.getBalance({ address: seller.account.address })) -
          sellerBefore +
          gas,
        parseEther('3'),
      )

      // The transient lot was created and consumed in the same transaction,
      // leaving no lingering lot, offer, or per-Punk reservation.
      assert.equal(await auctions.read.lastLotId(), 1n)
      const lot = await auctions.read.lots([1n])
      assert.equal(lot[0], zeroAddress)
      const offer = await auctions.read.offers([offerId])
      assert.equal(offer[1], zeroAddress)
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          6000,
        ]),
        0n,
      )

      // ETH conservation: neither the auction nor the escrow retains funds.
      assert.equal(
        await publicClient.getBalance({ address: auctions.address }),
        0n,
      )
      assert.equal(
        await publicClient.getBalance({ address: escrow.address }),
        0n,
      )
    })

    it('createLotAndAcceptOffer settles a V1+V2 bundle in one transaction', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, punksV1, seller, bidder1 } = ctx

      await assignPunkV1(ctx, seller, 6200n)
      await depositPunkV1(ctx, seller, 6200n)
      await assignPunk(ctx, seller, 6200n)
      await depositPunk(ctx, seller, 6200n)

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('5'),
        slots: [
          punkSlot(6200, Standard.CRYPTOPUNKS_V1),
          punkSlot(6200, Standard.CRYPTOPUNKS),
        ],
      })

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await auctionsAsSeller.write.createLotAndAcceptOffer([
        [
          lotItem(6200, 5_000, Standard.CRYPTOPUNKS_V1),
          lotItem(6200, 5_000, Standard.CRYPTOPUNKS),
        ],
        offerId,
        parseEther('5'),
      ])

      assert.equal(
        ((await punks.read.punkIndexToAddress([6200n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal(
        (
          (await punksV1.read.punkIndexToAddress([6200n])) as string
        ).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
    })

    it('createLotAndAcceptOffer respects the seller minimum', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 6300n)
      await depositPunk(ctx, seller, 6300n)

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(6300)],
      })

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLotAndAcceptOffer([
          [lotItem(6300)],
          offerId,
          parseEther('2'),
        ]),
        auctions,
        'OfferAmountBelowMinimum',
      )
    })

    it('createLotAndAcceptOffer reverts when the offer is not active', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLotAndAcceptOffer([
          [lotItem(6400)],
          999n,
          parseEther('1'),
        ]),
        auctions,
        'OfferNotActive',
      )
    })

    it('createLotAndAcceptOffer still enforces the createLot vault pre-checks', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 6500n)
      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(6500)],
      })

      // The seller never deployed a vault — lot creation must still fail.
      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLotAndAcceptOffer([
          [lotItem(6500)],
          offerId,
          parseEther('1'),
        ]),
        auctions,
        'VaultNotDeployed',
      )
    })

    it('createLotAndAcceptOffer rejects an offer whose slots do not match the items', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 6600n)
      await depositPunk(ctx, seller, 6600n)

      // A two-slot offer cannot settle a single-item lot.
      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(6600), punkSlot(6601)],
      })

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLotAndAcceptOffer([
          [lotItem(6600)],
          offerId,
          parseEther('1'),
        ]),
        auctions,
        'SlotItemCountMismatch',
      )
    })

    it('createLotAndAcceptOffer rejects a lot above MAX_INSTANT_ITEMS', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx

      // 41 > MAX_INSTANT_ITEMS (40). The size guard reverts before any lot,
      // offer, or vault work, so no Punks need to be set up first.
      const items: LotItemInput[] = []
      for (let i = 0; i < 41; i++) items.push(lotItem(8_000 + i, 1))

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLotAndAcceptOffer([items, 1n, 0n]),
        auctions,
        'LotTooLargeForInstantAccept',
      )
    })

    it('createLotAndAcceptOffer admits exactly MAX_INSTANT_ITEMS', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx

      // 40 == MAX_INSTANT_ITEMS: the size guard lets it through, so the call
      // fails later on the missing offer — not LotTooLargeForInstantAccept.
      const items: LotItemInput[] = []
      for (let i = 0; i < 40; i++) items.push(lotItem(8_100 + i, 250))

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLotAndAcceptOffer([items, 1n, 0n]),
        auctions,
        'OfferNotActive',
      )
    })

    it('acceptOfferFromLot rejects a lot above MAX_INSTANT_ITEMS', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx

      // A valid 41-item lot: one item carries the bulk of the weight, the
      // rest one bps each, so the weights still sum to 10_000.
      const items: LotItemInput[] = []
      for (let i = 0; i < 41; i++) {
        const punkId = 8_200 + i
        await assignPunk(ctx, seller, BigInt(punkId))
        await depositPunk(ctx, seller, BigInt(punkId))
        items.push(lotItem(punkId, i === 0 ? 9_960 : 1))
      }
      await createLotWith(ctx, seller, items, parseEther('1'))

      // The size guard reverts before the offer is ever looked up.
      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.acceptOfferFromLot([1n, 1n, parseEther('1')]),
        auctions,
        'LotTooLargeForInstantAccept',
      )
    })

    it('createLotAndStartAuction opens a live auction seeded by the offer in one transaction', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, escrow, punks, seller, bidder1, bidder2 } = ctx

      await assignPunk(ctx, seller, 6700n)
      await depositPunk(ctx, seller, 6700n)

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('2'),
        slots: [punkSlot(6700)],
      })

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await auctionsAsSeller.write.createLotAndStartAuction([
        [lotItem(6700)],
        offerId,
        parseEther('2'),
      ])

      // A live auction now exists, seeded with the offer as the opening bid.
      assert.equal(await auctions.read.lastLotId(), 1n)
      assert.equal(await auctions.read.lastAuctionId(), 1n)
      const auction = await auctions.read.auctions([1n])
      assert.equal(
        auction[0].toLowerCase(),
        seller.account.address.toLowerCase(),
      )
      assert.equal(
        auction[1].toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal(auction[2], parseEther('2'))

      // The Punk is in auction escrow and the offer was consumed.
      assert.equal(
        ((await punks.read.punkIndexToAddress([6700n])) as string).toLowerCase(),
        escrow.address.toLowerCase(),
      )
      const offer = await auctions.read.offers([offerId])
      assert.equal(offer[1], zeroAddress)

      // The auction behaves like any other: it accepts bids and settles.
      const auctionsAsBidder2 = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder2 } },
      )
      await auctionsAsBidder2.write.bid([1n], { value: parseEther('2.2') })
      await ctx.connection.networkHelpers.time.increase(DAY + 1)
      await auctions.write.settle([1n])
      assert.equal(
        ((await punks.read.punkIndexToAddress([6700n])) as string).toLowerCase(),
        bidder2.account.address.toLowerCase(),
      )
    })

    it('createLotAndStartAuction respects the caller minimum', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 6800n)
      await depositPunk(ctx, seller, 6800n)

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(6800)],
      })

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLotAndStartAuction([
          [lotItem(6800)],
          offerId,
          parseEther('2'),
        ]),
        auctions,
        'OfferAmountBelowMinimum',
      )
    })

    it('createLotAndStartAuction reverts when the offer is not active', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller } = ctx

      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLotAndStartAuction([
          [lotItem(6900)],
          999n,
          parseEther('1'),
        ]),
        auctions,
        'OfferNotActive',
      )
    })
  })

  describe('security review — adversarial coverage', () => {
    it('conserves ETH across a multi-actor lifecycle of offers, auctions, bids, and settlements', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, escrow, seller, bidder1, bidder2, other } = ctx
      const publicClient = await ctx.viem.getPublicClient()

      const auctionBalance = () =>
        publicClient.getBalance({ address: auctions.address })
      const escrowBalance = () =>
        publicClient.getBalance({ address: escrow.address })

      // Seller deposits four Punks and lists three lots.
      for (const id of [10n, 11n, 12n, 13n]) {
        await assignPunk(ctx, seller, id)
        await depositPunk(ctx, seller, id)
      }
      await createSinglePunkLot(ctx, seller, 10n, parseEther('1'))
      await createSinglePunkLot(ctx, seller, 11n, parseEther('1'))
      await createLotWith(
        ctx,
        seller,
        [lotItem(12, 5_000), lotItem(13, 5_000)],
        parseEther('2'),
      )

      // Two standing offers lock ETH in the auction house.
      const o1 = await placeOffer(ctx, bidder1, { amountWei: parseEther('0.5') })
      const o2 = await placeOffer(ctx, bidder2, { amountWei: parseEther('3') })
      assert.equal(await auctionBalance(), parseEther('3.5'))

      const auctionsAsB1 = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )
      const auctionsAsB2 = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder2 } },
      )

      // Open lot 1, then outbid it: the house always holds exactly the
      // live bid for an auction, never both the old and new bid.
      await openAuction(ctx, bidder1, 1n, parseEther('1'))
      assert.equal(await auctionBalance(), parseEther('4.5'))
      await auctionsAsB2.write.bid([1n], { value: parseEther('1.1') })
      assert.equal(await auctionBalance(), parseEther('4.6'))

      await openAuction(ctx, bidder1, 2n, parseEther('1'))
      assert.equal(await auctionBalance(), parseEther('5.6'))

      // Adjusting an offer down and cancelling another refund immediately.
      await auctionsAsB2.write.adjustOfferAmount([o2, parseEther('2')])
      await auctionsAsB1.write.cancelOffer([o1])
      assert.equal(await auctionBalance(), parseEther('4.1'))

      // Settle both auctions; only offer 2's locked ETH should remain.
      await ctx.connection.networkHelpers.time.increase(DAY + 1)
      await auctions.write.settle([1n])
      await auctions.write.settle([2n])
      assert.equal(await auctionBalance(), parseEther('2'))
      assert.equal(await escrowBalance(), 0n)

      // Cancelling the final offer and lot drains the house to zero.
      await auctionsAsB2.write.cancelOffer([o2])
      const auctionsAsSeller = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: seller } },
      )
      await auctionsAsSeller.write.cancelLot([3n])
      assert.equal(await auctionBalance(), 0n)
      assert.equal(await escrowBalance(), 0n)

      // No stranded pull-credit for any participant.
      for (const who of [seller, bidder1, bidder2, other]) {
        assert.equal(await auctions.read.balances([who.account.address]), 0n)
      }
    })

    it('prevents an offer from being consumed twice once it seeds an auction', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 20n)
      await depositPunk(ctx, seller, 20n)
      await createSinglePunkLot(ctx, seller, 20n, parseEther('1'))

      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
        slots: [punkSlot(20)],
      })

      // The offer + lot become a live auction.
      await auctions.write.startAuctionFromOffer([offerId, 1n, parseEther('1')])
      assert.equal(await auctions.read.lastAuctionId(), 1n)

      // The offer is gone — it cannot be cancelled, accepted, or reused.
      const auctionsAsOfferer = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.cancelOffer([offerId]),
        auctions,
        'OfferNotActive',
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 20, parseEther('1')]),
        auctions,
        'OfferNotActive',
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.startAuctionFromOffer([offerId, 1n, parseEther('1')]),
        auctions,
        'OfferNotActive',
      )
      // The lot is gone too.
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.openAuction([1n, parseEther('1')], {
          value: parseEther('1'),
        }),
        auctions,
        'LotNotFound',
      )
    })

    it('prevents reusing an offer already settled through acceptOffer', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx

      await assignPunk(ctx, seller, 21n)
      await offerPunkToAuctions(ctx, seller, 21n, parseEther('0.9'))
      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
      })

      await auctions.write.acceptOffer([offerId, 21, parseEther('0.9')])

      const auctionsAsOfferer = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.cancelOffer([offerId]),
        auctions,
        'OfferNotActive',
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.adjustOfferAmount([offerId, parseEther('2')], {
          value: parseEther('1'),
        }),
        auctions,
        'OfferNotActive',
      )
    })

    it('locks the escrow down to the auction and the two Punk markets', async () => {
      const ctx = await deployAuctionStack()
      const { escrow, punks, other } = ctx

      const escrowAsOther = await ctx.viem.getContractAt(
        'PunksAuctionEscrow',
        escrow.address,
        { client: { wallet: other } },
      )

      // Only the auction may route Punks through the escrow.
      await ctx.viem.assertions.revertWithCustomError(
        escrowAsOther.write.listForSettlement([punks.address, 0n, 1n]),
        escrow,
        'NotAuction',
      )
      await ctx.viem.assertions.revertWithCustomError(
        escrowAsOther.write.sweepProceeds([punks.address]),
        escrow,
        'NotAuction',
      )

      // Only the two markets may fund the escrow.
      await assert.rejects(
        other.sendTransaction({ to: escrow.address, value: 1n }),
      )
    })

    it('credits a contract seller that rejects ETH on settlement and still delivers the Punk', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, escrow, punks, vaultFactory, bidder1 } = ctx
      const publicClient = await ctx.viem.getPublicClient()

      const sellerBot = await ctx.viem.deployContract('AuctionBot', [
        auctions.address,
      ])

      // The bot deploys its own vault and approves the auction.
      await sellerBot.write.ensureVault([
        vaultFactory.address,
        [auctions.address],
      ])
      const botVault = (await vaultFactory.read.predictVault([
        sellerBot.address,
      ])) as `0x${string}`

      // Put a Punk straight into the bot's vault and list it.
      await punks.write.setInitialOwner([botVault, 400n])
      await sellerBot.write.createLot([
        [lotItem(400)],
        parseEther('1'),
        zeroAddress,
      ])

      await openAuction(ctx, bidder1, 1n, parseEther('1'))
      await ctx.connection.networkHelpers.time.increase(DAY + 1)

      // The seller refuses the direct payout — settlement must still succeed.
      await sellerBot.write.setRejectEther([true])
      await auctions.write.settle([1n])

      // Punk delivered, auction settled, proceeds parked as pull-credit.
      assert.equal(
        ((await punks.read.punkIndexToAddress([400n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal((await auctions.read.auctions([1n]))[4], true)
      assert.equal(
        await auctions.read.balances([sellerBot.address]),
        parseEther('1'),
      )
      assert.equal(
        await publicClient.getBalance({ address: sellerBot.address }),
        0n,
      )
      assert.equal(await publicClient.getBalance({ address: escrow.address }), 0n)

      // The seller can later pull the credited proceeds in full.
      await sellerBot.write.setRejectEther([false])
      await sellerBot.write.withdrawCredit()
      assert.equal(await auctions.read.balances([sellerBot.address]), 0n)
      assert.equal(
        await publicClient.getBalance({ address: sellerBot.address }),
        parseEther('1'),
      )
    })

    it('blocks reentrancy into bid during the outbid refund', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder2 } = ctx
      const publicClient = await ctx.viem.getPublicClient()

      await assignPunk(ctx, seller, 410n)
      await depositPunk(ctx, seller, 410n)
      await createSinglePunkLot(ctx, seller, 410n, parseEther('1'))

      // A bot opens the auction, then arms a reentry that calls `bid`
      // again from inside its refund hook.
      const botBidder = await ctx.viem.deployContract('AuctionBot', [
        auctions.address,
      ])
      await botBidder.write.openAuction([1n, parseEther('1')], {
        value: parseEther('1'),
      })
      await botBidder.write.armReentry([2, 1n])

      // An honest bidder outbids — the bot is refunded and its reentry fires.
      const auctionsAsBidder2 = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder2 } },
      )
      await auctionsAsBidder2.write.bid([1n], { value: parseEther('1.1') })

      // The reentry was attempted and rejected by the guard.
      assert.equal(await botBidder.read.reentryObserved(), true)
      assert.equal(await botBidder.read.reentryReverted(), true)

      // The honest bidder is the sole live bidder; the bot got its ETH back.
      const auction = await auctions.read.auctions([1n])
      assert.equal(auction[1].toLowerCase(), bidder2.account.address.toLowerCase())
      assert.equal(auction[2], parseEther('1.1'))
      assert.equal(
        await publicClient.getBalance({ address: botBidder.address }),
        parseEther('1'),
      )
      assert.equal(await auctions.read.balances([botBidder.address]), 0n)

      // Conservation: the house holds exactly the live bid.
      assert.equal(
        await publicClient.getBalance({ address: auctions.address }),
        parseEther('1.1'),
      )
    })

    it('blocks reentrancy into settle during the seller payout', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, escrow, punks, vaultFactory, bidder1 } = ctx
      const publicClient = await ctx.viem.getPublicClient()

      const sellerBot = await ctx.viem.deployContract('AuctionBot', [
        auctions.address,
      ])
      await sellerBot.write.ensureVault([
        vaultFactory.address,
        [auctions.address],
      ])
      const botVault = (await vaultFactory.read.predictVault([
        sellerBot.address,
      ])) as `0x${string}`

      await punks.write.setInitialOwner([botVault, 420n])
      await sellerBot.write.createLot([
        [lotItem(420)],
        parseEther('1'),
        zeroAddress,
      ])
      await openAuction(ctx, bidder1, 1n, parseEther('1'))
      await ctx.connection.networkHelpers.time.increase(DAY + 1)

      // The seller bot tries to reenter settle from inside its payout hook.
      await sellerBot.write.armReentry([1, 1n])
      await auctions.write.settle([1n])

      // The reentry fired and was rejected; settlement completed cleanly.
      assert.equal(await sellerBot.read.reentryObserved(), true)
      assert.equal(await sellerBot.read.reentryReverted(), true)
      assert.equal((await auctions.read.auctions([1n]))[4], true)
      assert.equal(
        ((await punks.read.punkIndexToAddress([420n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )

      // The seller is paid exactly once; nothing is stranded.
      assert.equal(
        await publicClient.getBalance({ address: sellerBot.address }),
        parseEther('1'),
      )
      assert.equal(await auctions.read.balances([sellerBot.address]), 0n)
      assert.equal(
        await publicClient.getBalance({ address: auctions.address }),
        0n,
      )
      assert.equal(await publicClient.getBalance({ address: escrow.address }), 0n)
    })

    it('refunds the opener and preserves the lot when the seller revoked auction approval', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, seller, bidder1 } = ctx
      const publicClient = await ctx.viem.getPublicClient()

      await assignPunk(ctx, seller, 430n)
      const vaultAddress = await depositPunk(ctx, seller, 430n)
      await createSinglePunkLot(ctx, seller, 430n, parseEther('1'))

      // The seller revokes the auction operator after listing.
      const vaultAsSeller = await ctx.viem.getContractAt(
        'PunksVault',
        vaultAddress,
        { client: { wallet: seller } },
      )
      await vaultAsSeller.write.setOperator([auctions.address, false])

      // openAuction reverts: the auction can no longer pull the Punk.
      const auctionsAsBidder = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )
      const bidderBefore = await publicClient.getBalance({
        address: bidder1.account.address,
      })
      await assert.rejects(
        auctionsAsBidder.write.openAuction([1n, parseEther('1')], {
          value: parseEther('1'),
        }),
      )
      const bidderAfter = await publicClient.getBalance({
        address: bidder1.account.address,
      })

      // The opener only spent gas — the bid value was never captured.
      assert.ok(bidderBefore - bidderAfter < parseEther('0.1'))
      assert.equal(
        await publicClient.getBalance({ address: auctions.address }),
        0n,
      )

      // The lot survived the failed open; no auction was created.
      assert.equal(await auctions.read.lastAuctionId(), 0n)
      assert.equal(
        (await auctions.read.lots([1n]))[0].toLowerCase(),
        seller.account.address.toLowerCase(),
      )

      // The now-stale lot can be cleared, freeing the Punk slot.
      await auctions.write.clearStaleLot([1n])
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          430,
        ]),
        0n,
      )
    })

    it('leaves a recoverable stale lot when a lotted Punk is sold via acceptOffer', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, seller, bidder1 } = ctx

      // The seller vaults a Punk and bundles it into a lot.
      await assignPunk(ctx, seller, 440n)
      const vaultAddress = await depositPunk(ctx, seller, 440n)
      await createSinglePunkLot(ctx, seller, 440n, parseEther('1'))
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          440,
        ]),
        1n,
      )

      // Nothing stops the vault from also listing that same Punk on the
      // canonical market — the lot reservation is auction-side bookkeeping.
      const vaultAsSeller = await ctx.viem.getContractAt(
        'PunksVault',
        vaultAddress,
        { client: { wallet: seller } },
      )
      await vaultAsSeller.write.offerPunkForSaleToAddress([
        punks.address,
        440n,
        parseEther('0.9'),
        auctions.address,
      ])

      // An offer is accepted straight off the market listing. acceptOffer
      // buys through the market and never touches lotForPunk.
      const offerId = await placeOffer(ctx, bidder1, {
        amountWei: parseEther('1'),
      })
      await auctions.write.acceptOffer([offerId, 440, parseEther('0.9')])
      assert.equal(
        ((await punks.read.punkIndexToAddress([440n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )

      // The lot is now stale: it still reserves the slot and still exists,
      // but its Punk has left the vault.
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          440,
        ]),
        1n,
      )
      assert.equal(
        (await auctions.read.lots([1n]))[0].toLowerCase(),
        seller.account.address.toLowerCase(),
      )

      // No double-sell: opening an auction on the dangling lot reverts
      // because the Punk is gone — the opener's ETH is never captured.
      const auctionsAsBidder = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: bidder1 } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsBidder.write.openAuction([1n, parseEther('1')], {
          value: parseEther('1'),
        }),
        auctions,
        'PunkNotInVault',
      )

      // The dangling lot is recoverable: clearStaleLot frees the slot.
      await auctions.write.clearStaleLot([1n])
      assert.equal(
        await auctions.read.activeLotFor([
          seller.account.address,
          Standard.CRYPTOPUNKS,
          440,
        ]),
        0n,
      )
      assert.equal((await auctions.read.lots([1n]))[0], zeroAddress)
    })
  })
})
