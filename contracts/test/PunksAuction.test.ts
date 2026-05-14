import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseAbiItem, parseEther, zeroAddress } from 'viem'
import {
  DAY,
  deployAuctionStack,
  emptyCriteria,
  lotItem,
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
    // First-time setup: deploy + pre-approve auctions in one tx.
    const factoryAsOwner = await ctx.viem.getContractAt(
      'PunkVaultFactory',
      ctx.vaultFactory.address,
      { client: { wallet: owner } },
    )
    await factoryAsOwner.write.ensureMyVault([[ctx.auctions.address]])
    return vault
  }

  // Already deployed — confirm the auction is approved as operator.
  const vaultContract = await ctx.viem.getContractAt('PunkVault', vault)
  const approved = (await vaultContract.read.isOperator([
    ctx.auctions.address,
  ])) as boolean
  if (!approved) {
    const vaultAsOwner = await ctx.viem.getContractAt('PunkVault', vault, {
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
) {
  const auctionsAsSeller = await ctx.viem.getContractAt(
    'PunksAuction',
    ctx.auctions.address,
    { client: { wallet: seller } },
  )
  await auctionsAsSeller.write.createLot([items, reserveWei])
}

async function createSinglePunkLot(
  ctx: Ctx,
  seller: any,
  punkId: bigint,
  reserveWei: bigint,
) {
  await createLotWith(
    ctx,
    seller,
    [lotItem(Number(punkId))],
    reserveWei,
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
  await auctionsAsOfferer.write.placeOffer(
    [amountWei, slots],
    { value: amountWei },
  )
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
      ((await auctions.read.PUNK_VAULTS()) as string).toLowerCase(),
      vaultFactory.address.toLowerCase(),
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
      'PunkVaultFactory',
      vaultFactory.address,
      { client: { wallet: other } },
    )
    await factoryAsOther.write.ensureVault([seller.account.address])

    const publicClient = await ctx.viem.getPublicClient()
    const code = await publicClient.getCode({ address: predicted })
    assert.ok(code && code !== '0x', 'vault should have code after ensureVault')

    // Predicted address stays the same after deploy.
    assert.equal(
      ((await vaultFactory.read.predictVault([
        seller.account.address,
      ])) as string).toLowerCase(),
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
      ]),
      auctions,
      'VaultNotDeployed',
    )
  })

  it('rejects createLot when the seller vault has not approved the auction', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, vaultFactory, seller } = ctx
    await assignPunk(ctx, seller, 501n)

    // Deploy the vault without pre-approving the auction.
    const factoryAsSeller = await ctx.viem.getContractAt(
      'PunkVaultFactory',
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
      ]),
      auctions,
      'PunkNotInVault',
    )
  })

  it('opens an auction by pulling the punk from the seller vault into auction custody', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, punks, seller, bidder1 } = ctx

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
      auctions.address.toLowerCase(),
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
    await createSinglePunkLot(ctx, seller, 101n, originalReserve)

    const auctionsAsSeller = await ctx.viem.getContractAt(
      'PunksAuction',
      auctions.address,
      { client: { wallet: seller } },
    )
    await auctionsAsSeller.write.updateLot([1n, raisedReserve])

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

  it('settles canonical Punks with a PunkBought round-trip and zero fees', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, punks, seller, bidder1 } = ctx

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
    // Round-trip happens from the auction's custody, so it appears as
    // both the seller and the buyer of the canonical PunkBought.
    assert.equal(bought[0].args.fromAddress.toLowerCase(), auctions.address.toLowerCase())
    assert.equal(bought[0].args.toAddress.toLowerCase(), auctions.address.toLowerCase())

    assert.equal(await publicClient.getBalance({ address: auctions.address }), 0n)
    assert.equal(await punks.read.pendingWithdrawals([auctions.address]), 0n)
  })

  it('reverts atomically without paying the seller when the Punk market buy fails', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, punks, seller, bidder1 } = ctx

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
      auctions.address.toLowerCase(),
    )
    assert.equal(await punks.read.pendingWithdrawals([auctions.address]), 0n)

    const auction = await auctions.read.auctions([1n])
    assert.equal(auction[6], false)
  })

  it('settles V1 Punks through the bug-aware withdraw path with zero fees', async () => {
    const ctx = await deployAuctionStack()
    const { auctions, punksV1, seller, bidder1 } = ctx

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

  describe('vault factory & vault', () => {
    it('routes both standards through one deterministic vault per user', async () => {
      const ctx = await deployAuctionStack()
      const { vaultFactory, punks, punksV1, seller } = ctx

      const predicted = (await vaultFactory.read.predictVault([
        seller.account.address,
      ])) as `0x${string}`

      await assignPunk(ctx, seller, 1n)
      await assignPunkV1(ctx, seller, 1n)
      const v2Vault = await depositPunk(ctx, seller, 1n)
      const v1Vault = await depositPunkV1(ctx, seller, 1n)

      // One address, both deposits.
      assert.equal(v2Vault.toLowerCase(), predicted.toLowerCase())
      assert.equal(v1Vault.toLowerCase(), predicted.toLowerCase())

      assert.equal(
        ((await punks.read.punkIndexToAddress([1n])) as string).toLowerCase(),
        predicted.toLowerCase(),
      )
      assert.equal(
        ((await punksV1.read.punkIndexToAddress([1n])) as string).toLowerCase(),
        predicted.toLowerCase(),
      )
    })

    it('reclaims canonical and V1 Punks via vault.transferPunk by the owner', async () => {
      const ctx = await deployAuctionStack()
      const { vaultFactory, punks, punksV1, seller } = ctx

      await assignPunk(ctx, seller, 5n)
      await assignPunkV1(ctx, seller, 5n)
      const vaultAddress = await depositPunk(ctx, seller, 5n)
      await depositPunkV1(ctx, seller, 5n)

      const vaultAsSeller = await ctx.viem.getContractAt(
        'PunkVault',
        vaultAddress,
        { client: { wallet: seller } },
      )

      // Owner is implicitly authorized: transferPunk back to themselves.
      await vaultAsSeller.write.transferPunk([
        punks.address,
        5n,
        seller.account.address,
      ])
      await vaultAsSeller.write.transferPunk([
        punksV1.address,
        5n,
        seller.account.address,
      ])

      assert.equal(
        ((await punks.read.punkIndexToAddress([5n])) as string).toLowerCase(),
        seller.account.address.toLowerCase(),
      )
      assert.equal(
        ((await punksV1.read.punkIndexToAddress([5n])) as string).toLowerCase(),
        seller.account.address.toLowerCase(),
      )
      // Predicted address survives a deploy.
      assert.equal(
        ((await vaultFactory.read.predictVault([
          seller.account.address,
        ])) as string).toLowerCase(),
        vaultAddress.toLowerCase(),
      )
    })

    it('leaves the bare implementation owner unset', async () => {
      const ctx = await deployAuctionStack()
      const { vaultFactory } = ctx

      const implAddress = (await vaultFactory.read.IMPLEMENTATION()) as `0x${string}`
      const impl = await ctx.viem.getContractAt('PunkVault', implAddress)

      assert.equal(
        ((await impl.read.owner()) as string).toLowerCase(),
        zeroAddress.toLowerCase(),
      )
    })

    it('vault.transferPunk reverts when the vault does not hold the Punk on that market', async () => {
      const ctx = await deployAuctionStack()
      const { seller } = ctx

      await assignPunk(ctx, seller, 6n)
      const vaultAddress = await depositPunk(ctx, seller, 6n)

      const vaultAsSeller = await ctx.viem.getContractAt(
        'PunkVault',
        vaultAddress,
        { client: { wallet: seller } },
      )

      // Vault doesn't hold V1 #6 — the underlying market call reverts.
      await assert.rejects(
        vaultAsSeller.write.transferPunk([
          ctx.punksV1.address,
          6n,
          seller.account.address,
        ]),
      )
    })

    it('exposes one-shot factory pre-approval, with subsequent calls reverting', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, vaultFactory, seller } = ctx

      // First call deploys + approves the auction in the same tx.
      await ensureVaultApprovingAuctions(ctx, seller)

      const vaultAddress = (await vaultFactory.read.predictVault([
        seller.account.address,
      ])) as `0x${string}`
      const vault = await ctx.viem.getContractAt('PunkVault', vaultAddress)
      assert.equal(
        (await vault.read.isOperator([auctions.address])) as boolean,
        true,
      )

      // Second factory pre-approval reverts — owner must use setOperator.
      const factoryAsSeller = await ctx.viem.getContractAt(
        'PunkVaultFactory',
        vaultFactory.address,
        { client: { wallet: seller } },
      )
      await assert.rejects(
        factoryAsSeller.write.ensureMyVault([[auctions.address]]),
      )
    })

    it('rejects ETH from any sender other than the two Punk markets', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, other } = ctx

      await assert.rejects(
        other.sendTransaction({
          to: auctions.address,
          value: 1n,
        }),
      )
    })

    it('rejects vault transferPunk from callers that are neither owner nor approved', async () => {
      const ctx = await deployAuctionStack()
      const { vaultFactory, punks, seller, attacker } = ctx

      // Seller deploys their vault without approving the attacker.
      const factoryAsSeller = await ctx.viem.getContractAt(
        'PunkVaultFactory',
        vaultFactory.address,
        { client: { wallet: seller } },
      )
      await factoryAsSeller.write.ensureMyVault([[]])

      const vaultAddress = (await vaultFactory.read.predictVault([
        seller.account.address,
      ])) as `0x${string}`
      const vault = await ctx.viem.getContractAt('PunkVault', vaultAddress, {
        client: { wallet: attacker },
      })

      await ctx.viem.assertions.revertWithCustomError(
        vault.write.transferPunk([
          punks.address,
          0n,
          attacker.account.address,
        ]),
        vault,
        'NotAuthorized',
      )
    })

    it('restricts vault market withdrawals to owner or operator', async () => {
      const ctx = await deployAuctionStack()
      const { punks, seller, attacker } = ctx

      const vaultAddress = await ensureVaultApprovingAuctions(ctx, seller)
      const vaultAsAttacker = await ctx.viem.getContractAt(
        'PunkVault',
        vaultAddress,
        { client: { wallet: attacker } },
      )

      await ctx.viem.assertions.revertWithCustomError(
        vaultAsAttacker.write.withdrawFromMarket([punks.address]),
        vaultAsAttacker,
        'NotAuthorized',
      )
      await ctx.viem.assertions.revertWithCustomError(
        vaultAsAttacker.write.withdrawFromMarketTo([
          punks.address,
          attacker.account.address,
        ]),
        vaultAsAttacker,
        'NotAuthorized',
      )

      const vaultAsSeller = await ctx.viem.getContractAt(
        'PunkVault',
        vaultAddress,
        { client: { wallet: seller } },
      )
      await vaultAsSeller.write.withdrawFromMarket([punks.address])
      await ctx.viem.assertions.revertWithCustomError(
        vaultAsSeller.write.withdrawFromMarketTo([punks.address, zeroAddress]),
        vaultAsSeller,
        'ZeroAddress',
      )
      await vaultAsSeller.write.withdrawFromMarketTo([
        punks.address,
        seller.account.address,
      ])
    })

    it('withdraws market proceeds directly to a recipient without sweeping vault ETH', async () => {
      const ctx = await deployAuctionStack()
      const { punks, seller, bidder1, other } = ctx

      await assignPunk(ctx, seller, 7n)
      const vaultAddress = await depositPunk(ctx, seller, 7n)
      const saleWei = parseEther('1')
      const retainedWei = parseEther('0.123')

      const vaultAsSeller = await ctx.viem.getContractAt(
        'PunkVault',
        vaultAddress,
        { client: { wallet: seller } },
      )
      await vaultAsSeller.write.offerPunkForSaleToAddress([
        punks.address,
        7n,
        saleWei,
        bidder1.account.address,
      ])

      const punksAsBidder = await ctx.viem.getContractAt(
        'MockCryptoPunksMarket',
        punks.address,
        { client: { wallet: bidder1 } },
      )
      await punksAsBidder.write.buyPunk([7n], { value: saleWei })
      assert.equal(await punks.read.pendingWithdrawals([vaultAddress]), saleWei)

      const publicClient = await ctx.viem.getPublicClient()
      const hash = await other.sendTransaction({
        to: vaultAddress,
        value: retainedWei,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      assert.equal(await publicClient.getBalance({ address: vaultAddress }), retainedWei)

      const recipientBefore = await publicClient.getBalance({
        address: other.account.address,
      })
      await vaultAsSeller.write.withdrawFromMarketTo([
        punks.address,
        other.account.address,
      ])

      assert.equal(await punks.read.pendingWithdrawals([vaultAddress]), 0n)
      assert.equal(await publicClient.getBalance({ address: vaultAddress }), retainedWei)
      assert.equal(
        await publicClient.getBalance({ address: other.account.address })
          - recipientBefore,
        saleWei,
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
        auctionsAsSeller.write.createLot([[], parseEther('1')]),
        auctions,
        'InvalidItemCount',
      )

      const big = Array.from({ length: 81 }, (_, i) => lotItem(i, 0))
      // weightBps=0 also invalid; still fails on count first
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLot([big, parseEther('1')]),
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
        ]),
        auctions,
        'InvalidWeights',
      )

      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsSeller.write.createLot([
          [lotItem(10, 0), lotItem(11, 10_000)],
          parseEther('1'),
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
        auctionsAsSeller.write.createLot([[lotItem(81)], parseEther('2')]),
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
        'PunkVault',
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
        'PunkVault',
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
      assert.equal(offer[1].toLowerCase(), bidder1.account.address.toLowerCase())

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
      await auctionsAsOfferer.write.adjustOfferAmount([offerId, parseEther('1.25')], {
        value: parseEther('0.25'),
      })
      await auctionsAsOfferer.write.adjustOfferAmount([offerId, parseEther('1.15')])

      offer = await auctions.read.offers([offerId])
      assert.equal(offer[0], parseEther('1.15'))

      const publicClient = await ctx.viem.getPublicClient()
      const before = await publicClient.getBalance({ address: bidder1.account.address })
      const hash = await auctionsAsOfferer.write.cancelOffer([offerId])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const after = await publicClient.getBalance({ address: bidder1.account.address })
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
        auctionsAsOfferer.write.adjustOfferAmount([offerId, parseEther('0.5')], { value: 1n }),
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
          [parseEther('1'), []],
          { value: parseEther('1') },
        ),
        auctions,
        'InvalidSlotCount',
      )

      const tooMany = Array.from({ length: 81 }, () => wildcardSlot())
      await ctx.viem.assertions.revertWithCustomError(
        auctionsAsOfferer.write.placeOffer(
          [parseEther('1'), tooMany],
          { value: parseEther('1') },
        ),
        auctions,
        'InvalidSlotCount',
      )

      const maxSlots = Array.from({ length: 80 }, () => wildcardSlot())
      await auctionsAsOfferer.write.placeOffer(
        [parseEther('1'), maxSlots],
        { value: parseEther('1') },
      )
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
      const bidderBefore = await publicClient.getBalance({ address: bidder1.account.address })
      const settlerBefore = await publicClient.getBalance({ address: attacker.account.address })

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
      assert.equal(await punks.read.pendingWithdrawals([seller.account.address]), parseEther('1'))
      assert.equal(
        await publicClient.getBalance({ address: bidder1.account.address }) - bidderBefore,
        0n,
      )

      const settlerAfter = await publicClient.getBalance({ address: attacker.account.address })
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
      assert.equal(await punks.read.pendingWithdrawals([seller.account.address]), parseEther('1'))

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

      await offerPunkToAuctions(ctx, seller, 701n, parseEther('0.9'), other.account.address)
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
        auctions.write.acceptOffer([offerId, 799, parseEther('0.9')]),
        auctions,
        'PunkNotIncluded',
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
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 801, parseEther('0.9')]),
        auctions,
        'PunkCriteriaMismatch',
      )

      await assignPunk(ctx, seller, 800n)
      await offerPunkToAuctions(ctx, seller, 800n, parseEther('0.9'))
      await auctions.write.acceptOffer([offerId, 800, parseEther('0.9')])
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
            includeIds: [900],
            excludeIds: [],
          },
        ],
      })

      await assignPunk(ctx, seller, 900n)
      await offerPunkToAuctions(ctx, seller, 900n, parseEther('0.9'))
      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOffer([offerId, 900, parseEther('0.9')]),
        auctions,
        'PunkCriteriaMismatch',
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
      const sellerBefore = await publicClient.getBalance({ address: seller.account.address })
      const bidderBefore = await publicClient.getBalance({ address: bidder1.account.address })

      const auctionsAsSettler = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: attacker } },
      )
      await auctionsAsSettler.write.acceptOffer([offerId, 905, parseEther('0.8')])

      assert.equal(
        ((await punksV1.read.punkIndexToAddress([905n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal(
        await publicClient.getBalance({ address: seller.account.address }) - sellerBefore,
        parseEther('1'),
      )
      assert.equal(
        await publicClient.getBalance({ address: bidder1.account.address }) - bidderBefore,
        0n,
      )
      assert.equal(await punksV1.read.pendingWithdrawals([auctions.address]), 0n)
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
      await auctionsAsSeller.write.startAuctionFromOffer([offerId, 1n, parseEther('1')])

      const publicClient = await ctx.viem.getPublicClient()
      assert.equal(
        ((await punks.read.punkIndexToAddress([950n])) as string).toLowerCase(),
        auctions.address.toLowerCase(),
      )
      const auction = await auctions.read.auctions([1n])
      assert.equal(auction[0].toLowerCase(), seller.account.address.toLowerCase())
      assert.equal(auction[1].toLowerCase(), bidder1.account.address.toLowerCase())
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
        auctionsAsCaller.write.startAuctionFromOffer([offerId, 999n, parseEther('1')]),
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
      await auctionsAsOfferer.write.adjustOfferAmount([offerId, parseEther('1')])

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.startAuctionFromOffer([offerId, 1n, parseEther('5')]),
        auctions,
        'OfferAmountBelowMinimum',
      )
    })

    it('accepts a V1+V2 pair offer against a stored lot and pays seller the offer amount', async () => {
      const ctx = await deployAuctionStack()
      const { auctions, punks, punksV1, seller, bidder1, attacker } = ctx

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
      const sellerBefore = await publicClient.getBalance({ address: seller.account.address })
      const settlerBefore = await publicClient.getBalance({ address: attacker.account.address })

      const auctionsAsSettler = await ctx.viem.getContractAt(
        'PunksAuction',
        auctions.address,
        { client: { wallet: attacker } },
      )
      const hash = await auctionsAsSettler.write.acceptOfferFromLot([
        offerId,
        1n,
        parseEther('5'),
      ])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      assert.equal(
        await publicClient.getBalance({ address: seller.account.address }) - sellerBefore,
        parseEther('5'),
      )
      const settlerAfter = await publicClient.getBalance({ address: attacker.account.address })
      const gas = receipt.gasUsed * receipt.effectiveGasPrice
      assert.equal(settlerAfter - settlerBefore + gas, 0n)

      assert.equal(
        ((await punks.read.punkIndexToAddress([1000n])) as string).toLowerCase(),
        bidder1.account.address.toLowerCase(),
      )
      assert.equal(
        ((await punksV1.read.punkIndexToAddress([1000n])) as string).toLowerCase(),
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

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOfferFromLot([offerId, 1n, parseEther('1')]),
        auctions,
        'ReserveNotMet',
      )
    })

    it('rejects accepting a lot offer that was lowered below the caller minimum', async () => {
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
      await auctionsAsOfferer.write.adjustOfferAmount([offerId, parseEther('1')])

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOfferFromLot([offerId, 1n, parseEther('5')]),
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

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOfferFromLot([offerId, 1n, parseEther('1')]),
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

      await ctx.viem.assertions.revertWithCustomError(
        auctions.write.acceptOfferFromLot([offerId, 1n, parseEther('1')]),
        auctions,
        'OfferStandardMismatch',
      )
    })
  })
})
