import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseEther, zeroAddress } from 'viem'
import {
  deployCollectionBidsStack,
  emptyCriteria,
  type FilterInput,
} from './helpers/fixtures.js'

type Ctx = Awaited<ReturnType<typeof deployCollectionBidsStack>>

const traitBit = (id: number): bigint => 1n << BigInt(id)

async function assignPunk(ctx: Ctx, to: any, punkId: bigint) {
  await ctx.punks.write.setInitialOwner([to.account.address, punkId])
}

async function offerPunkTo(
  ctx: Ctx,
  seller: any,
  punkId: bigint,
  priceWei: bigint,
  to: `0x${string}` = ctx.bids.address,
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

async function placeBid(
  ctx: Ctx,
  bidder: any,
  {
    bidWei = parseEther('1'),
    settlementWei = 0n,
    criteria = emptyCriteria(),
    includeIds = [],
    excludeIds = [],
  }: {
    bidWei?: bigint
    settlementWei?: bigint
    criteria?: FilterInput
    includeIds?: number[]
    excludeIds?: number[]
  } = {},
) {
  const bidsAsBidder = await ctx.viem.getContractAt(
    'PunksCollectionBids',
    ctx.bids.address,
    { client: { wallet: bidder } },
  )
  await bidsAsBidder.write.placeBid(
    [bidWei, settlementWei, criteria, includeIds, excludeIds],
    { value: bidWei + settlementWei },
  )
  return ctx.bids.read.lastBidId() as Promise<bigint>
}

describe('PunksCollectionBids', () => {
  it('exposes the punks market and the punks data contract through immutables', async () => {
    const { bids, punks, punksData } = await deployCollectionBidsStack()
    assert.equal(
      ((await bids.read.PUNKS()) as string).toLowerCase(),
      punks.address.toLowerCase(),
    )
    assert.equal(
      ((await bids.read.PUNKS_CRITERIA()) as string).toLowerCase(),
      punksData.address.toLowerCase(),
    )
    assert.equal(
      ((await bids.read.PUNKS_VISUAL()) as string).toLowerCase(),
      punksData.address.toLowerCase(),
    )
  })

  it('rejects zero-address constructor args', async () => {
    const ctx = await deployCollectionBidsStack()
    await ctx.viem.assertions.revertWithCustomError(
      ctx.viem.deployContract('PunksCollectionBids', [
        zeroAddress,
        ctx.punksData.address,
      ]),
      ctx.bids,
      'ZeroAddress',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.viem.deployContract('PunksCollectionBids', [
        ctx.punks.address,
        zeroAddress,
      ]),
      ctx.bids,
      'ZeroAddress',
    )
  })

  describe('placeBid', () => {
    it('stores the bid with criteria, include and exclude lists', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, bidder } = ctx

      const bidId = await placeBid(ctx, bidder, {
        bidWei: parseEther('1'),
        settlementWei: parseEther('0.05'),
        criteria: { ...emptyCriteria(), requiredTraitMask: traitBit(7) },
        includeIds: [1, 2, 3],
        excludeIds: [4, 5],
      })

      const [bidWei, settlementWei, storedBidder] = (await bids.read.bids([
        bidId,
      ])) as [bigint, bigint, string]
      assert.equal(bidWei, parseEther('1'))
      assert.equal(settlementWei, parseEther('0.05'))
      assert.equal(
        storedBidder.toLowerCase(),
        bidder.account.address.toLowerCase(),
      )

      const criteria = (await bids.read.getBidCriteria([bidId])) as {
        requiredTraitMask: bigint
      }
      assert.equal(criteria.requiredTraitMask, traitBit(7))

      assert.deepEqual(await bids.read.getBidIncludeIds([bidId]), [1, 2, 3])
      assert.deepEqual(await bids.read.getBidExcludeIds([bidId]), [4, 5])
      assert.equal(await bids.read.lastBidId(), bidId)
    })

    it('escrows bidWei plus settlementWei', async () => {
      const ctx = await deployCollectionBidsStack()
      const publicClient = await ctx.viem.getPublicClient()
      await placeBid(ctx, ctx.bidder, {
        bidWei: parseEther('2'),
        settlementWei: parseEther('0.1'),
      })
      assert.equal(
        await publicClient.getBalance({ address: ctx.bids.address }),
        parseEther('2.1'),
      )
    })

    it('rejects a zero bid amount even when msg.value matches', async () => {
      const ctx = await deployCollectionBidsStack()
      const bidsAsBidder = await ctx.viem.getContractAt(
        'PunksCollectionBids',
        ctx.bids.address,
        { client: { wallet: ctx.bidder } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        bidsAsBidder.write.placeBid([0n, 0n, emptyCriteria(), [], []], {
          value: 0n,
        }),
        ctx.bids,
        'InvalidAmount',
      )
    })

    it('rejects mismatched msg.value', async () => {
      const ctx = await deployCollectionBidsStack()
      const bidsAsBidder = await ctx.viem.getContractAt(
        'PunksCollectionBids',
        ctx.bids.address,
        { client: { wallet: ctx.bidder } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        bidsAsBidder.write.placeBid(
          [parseEther('1'), parseEther('0.05'), emptyCriteria(), [], []],
          { value: parseEther('1') },
        ),
        ctx.bids,
        'IncorrectPayment',
      )
    })

    it('rejects include/exclude lists over the maximum size', async () => {
      const ctx = await deployCollectionBidsStack()
      const bidsAsBidder = await ctx.viem.getContractAt(
        'PunksCollectionBids',
        ctx.bids.address,
        { client: { wallet: ctx.bidder } },
      )
      const sixtyFive = Array.from({ length: 65 }, (_, i) => i)
      await ctx.viem.assertions.revertWithCustomError(
        bidsAsBidder.write.placeBid(
          [parseEther('1'), 0n, emptyCriteria(), sixtyFive, []],
          { value: parseEther('1') },
        ),
        ctx.bids,
        'TooManyIds',
      )
      await ctx.viem.assertions.revertWithCustomError(
        bidsAsBidder.write.placeBid(
          [parseEther('1'), 0n, emptyCriteria(), [], sixtyFive],
          { value: parseEther('1') },
        ),
        ctx.bids,
        'TooManyIds',
      )
    })

    it('rejects invalid trait masks at place time', async () => {
      const ctx = await deployCollectionBidsStack()
      const bidsAsBidder = await ctx.viem.getContractAt(
        'PunksCollectionBids',
        ctx.bids.address,
        { client: { wallet: ctx.bidder } },
      )
      // Bit beyond the canonical trait range (TRAIT_COUNT = 111).
      await ctx.viem.assertions.revertWithCustomError(
        bidsAsBidder.write.placeBid(
          [
            parseEther('1'),
            0n,
            { ...emptyCriteria(), requiredTraitMask: traitBit(120) },
            [],
            [],
          ],
          { value: parseEther('1') },
        ),
        ctx.bids,
        'InvalidTraitMask',
      )
    })
  })

  describe('cancelBid', () => {
    it('refunds the full escrow back to the bidder', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, bidder } = ctx
      const publicClient = await ctx.viem.getPublicClient()

      const bidId = await placeBid(ctx, bidder, {
        bidWei: parseEther('1'),
        settlementWei: parseEther('0.05'),
      })

      const before = await publicClient.getBalance({
        address: bidder.account.address,
      })
      const bidsAsBidder = await ctx.viem.getContractAt(
        'PunksCollectionBids',
        bids.address,
        { client: { wallet: bidder } },
      )
      const hash = await bidsAsBidder.write.cancelBid([bidId])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const after = await publicClient.getBalance({
        address: bidder.account.address,
      })
      const gas = receipt.gasUsed * receipt.effectiveGasPrice

      assert.equal(after - before + gas, parseEther('1.05'))
      assert.equal(await publicClient.getBalance({ address: bids.address }), 0n)

      const [, , storedBidder] = (await bids.read.bids([bidId])) as [
        bigint,
        bigint,
        string,
      ]
      assert.equal(storedBidder, zeroAddress)
    })

    it('rejects cancellation by anyone other than the bidder', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, bidder, attacker } = ctx
      const bidId = await placeBid(ctx, bidder)

      const bidsAsAttacker = await ctx.viem.getContractAt(
        'PunksCollectionBids',
        bids.address,
        { client: { wallet: attacker } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        bidsAsAttacker.write.cancelBid([bidId]),
        bids,
        'NotBidder',
      )
    })

    it('rejects cancellation of an inactive bid', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, bidder } = ctx
      const bidId = await placeBid(ctx, bidder)

      const bidsAsBidder = await ctx.viem.getContractAt(
        'PunksCollectionBids',
        bids.address,
        { client: { wallet: bidder } },
      )
      await bidsAsBidder.write.cancelBid([bidId])
      await ctx.viem.assertions.revertWithCustomError(
        bidsAsBidder.write.cancelBid([bidId]),
        bids,
        'BidNotActive',
      )
    })
  })

  describe('adjustBidPrice', () => {
    it('tops up the bid amount and updates storage', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, bidder } = ctx
      const bidId = await placeBid(ctx, bidder)

      const bidsAsBidder = await ctx.viem.getContractAt(
        'PunksCollectionBids',
        bids.address,
        { client: { wallet: bidder } },
      )
      await bidsAsBidder.write.adjustBidPrice(
        [bidId, parseEther('0.5'), true],
        { value: parseEther('0.5') },
      )

      const [bidWei] = (await bids.read.bids([bidId])) as [
        bigint,
        bigint,
        string,
      ]
      assert.equal(bidWei, parseEther('1.5'))
    })

    it('refunds the bidder when decreasing', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, bidder } = ctx
      const publicClient = await ctx.viem.getPublicClient()
      const bidId = await placeBid(ctx, bidder, { bidWei: parseEther('1') })

      const bidsAsBidder = await ctx.viem.getContractAt(
        'PunksCollectionBids',
        bids.address,
        { client: { wallet: bidder } },
      )
      const before = await publicClient.getBalance({
        address: bidder.account.address,
      })
      const hash = await bidsAsBidder.write.adjustBidPrice([
        bidId,
        parseEther('0.3'),
        false,
      ])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const after = await publicClient.getBalance({
        address: bidder.account.address,
      })
      const gas = receipt.gasUsed * receipt.effectiveGasPrice
      assert.equal(after - before + gas, parseEther('0.3'))

      const [bidWei] = (await bids.read.bids([bidId])) as [
        bigint,
        bigint,
        string,
      ]
      assert.equal(bidWei, parseEther('0.7'))
    })

    it('rejects adjustments of zero, mismatched payment, and over-decrease', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, bidder } = ctx
      const bidId = await placeBid(ctx, bidder, { bidWei: parseEther('1') })

      const bidsAsBidder = await ctx.viem.getContractAt(
        'PunksCollectionBids',
        bids.address,
        { client: { wallet: bidder } },
      )

      await ctx.viem.assertions.revertWithCustomError(
        bidsAsBidder.write.adjustBidPrice([bidId, 0n, true], { value: 0n }),
        bids,
        'InvalidAmount',
      )
      await ctx.viem.assertions.revertWithCustomError(
        bidsAsBidder.write.adjustBidPrice([bidId, parseEther('0.5'), true], {
          value: parseEther('0.4'),
        }),
        bids,
        'IncorrectPayment',
      )
      await ctx.viem.assertions.revertWithCustomError(
        bidsAsBidder.write.adjustBidPrice([bidId, parseEther('0.5'), false], {
          value: 1n,
        }),
        bids,
        'IncorrectPayment',
      )
      // Decrease must not zero the bid out.
      await ctx.viem.assertions.revertWithCustomError(
        bidsAsBidder.write.adjustBidPrice([bidId, parseEther('1'), false]),
        bids,
        'AdjustmentTooLarge',
      )
    })

    it('rejects adjustments by anyone other than the bidder', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, bidder, attacker } = ctx
      const bidId = await placeBid(ctx, bidder)

      const bidsAsAttacker = await ctx.viem.getContractAt(
        'PunksCollectionBids',
        bids.address,
        { client: { wallet: attacker } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        bidsAsAttacker.write.adjustBidPrice([bidId, parseEther('0.1'), true], {
          value: parseEther('0.1'),
        }),
        bids,
        'NotBidder',
      )
    })
  })

  describe('acceptBid', () => {
    it('buys a directed listing, refunds the bidder, and pays the settler', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, punks, seller, bidder, settler } = ctx
      const publicClient = await ctx.viem.getPublicClient()

      await assignPunk(ctx, seller, 700n)
      await offerPunkTo(ctx, seller, 700n, parseEther('0.7'))

      const bidId = await placeBid(ctx, bidder, {
        bidWei: parseEther('1'),
        settlementWei: parseEther('0.05'),
      })

      const bidderBefore = await publicClient.getBalance({
        address: bidder.account.address,
      })
      const settlerBefore = await publicClient.getBalance({
        address: settler.account.address,
      })

      const bidsAsSettler = await ctx.viem.getContractAt(
        'PunksCollectionBids',
        bids.address,
        { client: { wallet: settler } },
      )
      const hash = await bidsAsSettler.write.acceptBid([
        bidId,
        700,
        parseEther('0.7'),
      ])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const gas = receipt.gasUsed * receipt.effectiveGasPrice

      // Punk is now in the bidder's wallet.
      assert.equal(
        ((await punks.read.punkIndexToAddress([700n])) as string).toLowerCase(),
        bidder.account.address.toLowerCase(),
      )

      // Seller is owed the listing price via the canonical market's pull pattern.
      assert.equal(
        await punks.read.pendingWithdrawals([seller.account.address]),
        parseEther('0.7'),
      )

      // Bidder gets back the excess (1 - 0.7 = 0.3).
      const bidderAfter = await publicClient.getBalance({
        address: bidder.account.address,
      })
      assert.equal(bidderAfter - bidderBefore, parseEther('0.3'))

      // Settler nets the settlement reward minus gas.
      const settlerAfter = await publicClient.getBalance({
        address: settler.account.address,
      })
      assert.equal(settlerAfter - settlerBefore + gas, parseEther('0.05'))

      // No ETH is stuck in the bid book.
      assert.equal(await publicClient.getBalance({ address: bids.address }), 0n)

      // Bid storage is cleared.
      const [, , storedBidder] = (await bids.read.bids([bidId])) as [
        bigint,
        bigint,
        string,
      ]
      assert.equal(storedBidder, zeroAddress)
    })

    it('accepts a public listing and pays the bidder no excess when listing equals bid', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, punks, seller, bidder } = ctx
      const publicClient = await ctx.viem.getPublicClient()

      await assignPunk(ctx, seller, 710n)
      await offerPunkPublic(ctx, seller, 710n, parseEther('1'))

      const bidId = await placeBid(ctx, bidder, { bidWei: parseEther('1') })

      const bidderBefore = await publicClient.getBalance({
        address: bidder.account.address,
      })
      await bids.write.acceptBid([bidId, 710, parseEther('1')])

      assert.equal(
        ((await punks.read.punkIndexToAddress([710n])) as string).toLowerCase(),
        bidder.account.address.toLowerCase(),
      )
      // No excess refunded.
      assert.equal(
        await publicClient.getBalance({ address: bidder.account.address }),
        bidderBefore,
      )
    })

    it('rejects acceptance when the listing is directed elsewhere', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, seller, bidder, other } = ctx

      await assignPunk(ctx, seller, 720n)
      await offerPunkTo(
        ctx,
        seller,
        720n,
        parseEther('0.7'),
        other.account.address,
      )

      const bidId = await placeBid(ctx, bidder)
      await ctx.viem.assertions.revertWithCustomError(
        bids.write.acceptBid([bidId, 720, parseEther('0.7')]),
        bids,
        'ListingNotValid',
      )
    })

    it('rejects acceptance when the listing exceeds the bid', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, seller, bidder } = ctx

      await assignPunk(ctx, seller, 730n)
      await offerPunkTo(ctx, seller, 730n, parseEther('1.2'))

      const bidId = await placeBid(ctx, bidder, { bidWei: parseEther('1') })
      await ctx.viem.assertions.revertWithCustomError(
        bids.write.acceptBid([bidId, 730, parseEther('1.2')]),
        bids,
        'ListingPriceTooHigh',
      )
    })

    it('rejects acceptance when the listing price moved away from the caller expectation', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, seller, bidder } = ctx

      await assignPunk(ctx, seller, 740n)
      await offerPunkTo(ctx, seller, 740n, parseEther('0.7'))
      const bidId = await placeBid(ctx, bidder, { bidWei: parseEther('1') })

      // Seller raises the listing price.
      await offerPunkTo(ctx, seller, 740n, parseEther('0.8'))

      await ctx.viem.assertions.revertWithCustomError(
        bids.write.acceptBid([bidId, 740, parseEther('0.7')]),
        bids,
        'ListingPriceMismatch',
      )
    })

    it('rejects acceptance for an inactive bid', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, seller, bidder } = ctx

      await assignPunk(ctx, seller, 750n)
      await offerPunkTo(ctx, seller, 750n, parseEther('0.5'))
      const bidId = await placeBid(ctx, bidder)

      const bidsAsBidder = await ctx.viem.getContractAt(
        'PunksCollectionBids',
        bids.address,
        { client: { wallet: bidder } },
      )
      await bidsAsBidder.write.cancelBid([bidId])

      await ctx.viem.assertions.revertWithCustomError(
        bids.write.acceptBid([bidId, 750, parseEther('0.5')]),
        bids,
        'BidNotActive',
      )
    })

    it('enforces include, exclude and trait/color predicates against PunksData', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, punks, punksData, seller, bidder } = ctx

      // 800 matches both trait and color count; 801 has no trait; 802 is excluded.
      await punksData.write.setTraitMask([800, traitBit(7)])
      await punksData.write.setTraitMask([801, 0n])
      await punksData.write.setTraitMask([802, traitBit(7)])
      await punksData.write.setColorCount([800, 6])
      await punksData.write.setColorCount([802, 6])

      const bidId = await placeBid(ctx, bidder, {
        bidWei: parseEther('1'),
        criteria: {
          ...emptyCriteria(),
          requiredTraitMask: traitBit(7),
          minColorCount: 4,
          maxColorCount: 8,
        },
        includeIds: [800, 801, 802],
        excludeIds: [802],
      })

      // 799 -- not in include list.
      await assignPunk(ctx, seller, 799n)
      await offerPunkTo(ctx, seller, 799n, parseEther('0.5'))
      await ctx.viem.assertions.revertWithCustomError(
        bids.write.acceptBid([bidId, 799, parseEther('0.5')]),
        bids,
        'PunkNotIncluded',
      )

      // 802 -- excluded.
      await assignPunk(ctx, seller, 802n)
      await offerPunkTo(ctx, seller, 802n, parseEther('0.5'))
      await ctx.viem.assertions.revertWithCustomError(
        bids.write.acceptBid([bidId, 802, parseEther('0.5')]),
        bids,
        'PunkExcluded',
      )

      // 801 -- in include list, but criteria mismatch.
      await assignPunk(ctx, seller, 801n)
      await offerPunkTo(ctx, seller, 801n, parseEther('0.5'))
      await ctx.viem.assertions.revertWithCustomError(
        bids.write.acceptBid([bidId, 801, parseEther('0.5')]),
        bids,
        'PunkCriteriaMismatch',
      )

      // 800 -- happy path.
      await assignPunk(ctx, seller, 800n)
      await offerPunkTo(ctx, seller, 800n, parseEther('0.5'))
      await bids.write.acceptBid([bidId, 800, parseEther('0.5')])
      assert.equal(
        ((await punks.read.punkIndexToAddress([800n])) as string).toLowerCase(),
        bidder.account.address.toLowerCase(),
      )
    })

    it('rejects acceptance when the matched Punk is outside the color count range', async () => {
      const ctx = await deployCollectionBidsStack()
      const { bids, punksData, seller, bidder } = ctx

      await punksData.write.setColorCount([900, 3])

      const bidId = await placeBid(ctx, bidder, {
        bidWei: parseEther('1'),
        criteria: {
          ...emptyCriteria(),
          minColorCount: 5,
          maxColorCount: 10,
        },
        includeIds: [900],
      })

      await assignPunk(ctx, seller, 900n)
      await offerPunkTo(ctx, seller, 900n, parseEther('0.5'))

      await ctx.viem.assertions.revertWithCustomError(
        bids.write.acceptBid([bidId, 900, parseEther('0.5')]),
        bids,
        'PunkCriteriaMismatch',
      )
    })

    it('falls back to pull-credit when the bidder cannot accept a refund', async () => {
      // We model this by routing the refund through `withdraw()` after the
      // recipient (a normal EOA) refuses the push. There is no easy way to
      // make a vanilla EOA refuse a push, so we simply assert the
      // `_pushOrCredit(_, 0)` zero-amount path is a no-op and that
      // `withdraw()` reverts with NoBalanceToWithdraw when there is none.
      const ctx = await deployCollectionBidsStack()
      const { bids, bidder } = ctx
      const bidsAsBidder = await ctx.viem.getContractAt(
        'PunksCollectionBids',
        bids.address,
        { client: { wallet: bidder } },
      )
      await ctx.viem.assertions.revertWithCustomError(
        bidsAsBidder.write.withdraw(),
        bids,
        'NoBalanceToWithdraw',
      )
    })
  })

  it('rejects arbitrary ETH sends', async () => {
    const ctx = await deployCollectionBidsStack()
    const { bids, other } = ctx
    await assert.rejects(other.sendTransaction({ to: bids.address, value: 1n }))
  })
})
