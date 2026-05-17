import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseEther, zeroAddress } from 'viem'
import {
  deployPunksMarketStack,
  emptyCriteria,
  type FilterInput,
} from './helpers/fixtures.js'

type Ctx = Awaited<ReturnType<typeof deployPunksMarketStack>>

const traitBit = (id: number): bigint => 1n << BigInt(id)

async function punksAs(ctx: Ctx, wallet: any) {
  return ctx.viem.getContractAt(
    'MockCryptoPunksMarketV1Buggy',
    ctx.punksV1.address,
    { client: { wallet } },
  )
}

async function marketAs(ctx: Ctx, wallet: any) {
  return ctx.viem.getContractAt('PunksMarket', ctx.market.address, {
    client: { wallet },
  })
}

async function assignPunk(ctx: Ctx, to: any, punkId: bigint) {
  await ctx.punksV1.write.setInitialOwner([to.account.address, punkId])
}

async function offerPunkToMarket(
  ctx: Ctx,
  seller: any,
  punkId: bigint,
  priceWei: bigint,
  to: `0x${string}` = ctx.market.address,
) {
  const punks = await punksAs(ctx, seller)
  await punks.write.offerPunkForSaleToAddress([punkId, priceWei, to])
}

async function offerPunkPublic(
  ctx: Ctx,
  seller: any,
  punkId: bigint,
  priceWei: bigint,
) {
  const punks = await punksAs(ctx, seller)
  await punks.write.offerPunkForSale([punkId, priceWei])
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
  const market = await marketAs(ctx, bidder)
  await market.write.placeBid(
    [bidWei, settlementWei, criteria, includeIds, excludeIds],
    { value: bidWei + settlementWei },
  )
  return ctx.market.read.lastBidId() as Promise<bigint>
}

describe('PunksMarket', () => {
  it('exposes the hardcoded V1 market and PunksData through immutables', async () => {
    const { market, punksV1, punksData } = await deployPunksMarketStack()

    assert.equal(
      ((await market.read.PUNKS_V1()) as string).toLowerCase(),
      punksV1.address.toLowerCase(),
    )
    assert.equal(
      ((await market.read.PUNKS_DATA()) as string).toLowerCase(),
      punksData.address.toLowerCase(),
    )
    assert.equal(
      ((await market.read.PUNKS_CRITERIA()) as string).toLowerCase(),
      punksData.address.toLowerCase(),
    )
    assert.equal(
      ((await market.read.PUNKS_VISUAL()) as string).toLowerCase(),
      punksData.address.toLowerCase(),
    )
  })

  it('stores, adjusts, and cancels V1 collection bids', async () => {
    const ctx = await deployPunksMarketStack()
    const { market, bidder } = ctx
    const publicClient = await ctx.viem.getPublicClient()

    const bidId = await placeBid(ctx, bidder, {
      bidWei: parseEther('1'),
      settlementWei: parseEther('0.05'),
      criteria: { ...emptyCriteria(), requiredTraitMask: traitBit(7) },
      includeIds: [1, 2],
      excludeIds: [3],
    })

    const [bidWei, settlementWei, storedBidder] = (await market.read.bids([
      bidId,
    ])) as [bigint, bigint, string]
    assert.equal(bidWei, parseEther('1'))
    assert.equal(settlementWei, parseEther('0.05'))
    assert.equal(
      storedBidder.toLowerCase(),
      bidder.account.address.toLowerCase(),
    )
    assert.deepEqual(await market.read.getBidIncludeIds([bidId]), [1, 2])
    assert.deepEqual(await market.read.getBidExcludeIds([bidId]), [3])

    const criteria = (await market.read.getBidCriteria([bidId])) as {
      requiredTraitMask: bigint
    }
    assert.equal(criteria.requiredTraitMask, traitBit(7))

    const marketForBidder = await marketAs(ctx, bidder)
    await marketForBidder.write.adjustBidPrice(
      [bidId, parseEther('0.25'), true],
      { value: parseEther('0.25') },
    )
    const [adjustedBidWei] = (await market.read.bids([bidId])) as [
      bigint,
      bigint,
      string,
    ]
    assert.equal(adjustedBidWei, parseEther('1.25'))

    await marketForBidder.write.cancelBid([bidId])
    assert.equal(await publicClient.getBalance({ address: market.address }), 0n)
    const [, , clearedBidder] = (await market.read.bids([bidId])) as [
      bigint,
      bigint,
      string,
    ]
    assert.equal(clearedBidder, zeroAddress)
  })

  describe('buyPunk', () => {
    it('buys a directed V1 listing, transfers to the recipient, and pays the seller', async () => {
      const ctx = await deployPunksMarketStack()
      const { market, punksV1, seller, buyer, other } = ctx
      const publicClient = await ctx.viem.getPublicClient()
      const price = parseEther('0.7')

      await assignPunk(ctx, seller, 101n)
      await offerPunkToMarket(ctx, seller, 101n, price)

      const sellerBefore = await publicClient.getBalance({
        address: seller.account.address,
      })
      const marketForBuyer = await marketAs(ctx, buyer)
      await marketForBuyer.write.buyPunk([101, price, other.account.address], {
        value: price,
      })

      assert.equal(
        (
          (await punksV1.read.punkIndexToAddress([101n])) as string
        ).toLowerCase(),
        other.account.address.toLowerCase(),
      )
      assert.equal(
        (await publicClient.getBalance({ address: seller.account.address })) -
          sellerBefore,
        price,
      )
      assert.equal(
        await punksV1.read.pendingWithdrawals([seller.account.address]),
        0n,
      )
      assert.equal(await punksV1.read.pendingWithdrawals([market.address]), 0n)
      assert.equal(
        await publicClient.getBalance({ address: market.address }),
        0n,
      )
    })

    it('rejects public listings, listings directed elsewhere, and stale seller ownership', async () => {
      const ctx = await deployPunksMarketStack()
      const { market, seller, buyer, other } = ctx
      const price = parseEther('0.7')
      const marketForBuyer = await marketAs(ctx, buyer)

      await assignPunk(ctx, seller, 201n)
      await offerPunkPublic(ctx, seller, 201n, price)
      await ctx.viem.assertions.revertWithCustomError(
        marketForBuyer.write.buyPunk([201, price, buyer.account.address], {
          value: price,
        }),
        market,
        'ListingNotValid',
      )

      await assignPunk(ctx, seller, 202n)
      await offerPunkToMarket(ctx, seller, 202n, price, other.account.address)
      await ctx.viem.assertions.revertWithCustomError(
        marketForBuyer.write.buyPunk([202, price, buyer.account.address], {
          value: price,
        }),
        market,
        'ListingNotValid',
      )

      await assignPunk(ctx, seller, 203n)
      await offerPunkToMarket(ctx, seller, 203n, price)
      const punksForSeller = await punksAs(ctx, seller)
      await punksForSeller.write.transferPunk([other.account.address, 203n])
      await ctx.viem.assertions.revertWithCustomError(
        marketForBuyer.write.buyPunk([203, price, buyer.account.address], {
          value: price,
        }),
        market,
        'ListingNotValid',
      )
    })

    it('rejects wrong expected prices and incorrect payments', async () => {
      const ctx = await deployPunksMarketStack()
      const { market, seller, buyer } = ctx
      const price = parseEther('0.7')
      const marketForBuyer = await marketAs(ctx, buyer)

      await assignPunk(ctx, seller, 301n)
      await offerPunkToMarket(ctx, seller, 301n, price)
      await ctx.viem.assertions.revertWithCustomError(
        marketForBuyer.write.buyPunk(
          [301, parseEther('0.8'), buyer.account.address],
          { value: parseEther('0.8') },
        ),
        market,
        'ListingPriceMismatch',
      )
      await ctx.viem.assertions.revertWithCustomError(
        marketForBuyer.write.buyPunk([301, price, buyer.account.address], {
          value: parseEther('0.6'),
        }),
        market,
        'IncorrectPayment',
      )
    })
  })

  describe('acceptBid', () => {
    it('lets anyone match a bid against a directed V1 listing with refunds and reward', async () => {
      const ctx = await deployPunksMarketStack()
      const { market, punksV1, seller, bidder, settler } = ctx
      const publicClient = await ctx.viem.getPublicClient()
      const listingWei = parseEther('0.7')

      await assignPunk(ctx, seller, 401n)
      await offerPunkToMarket(ctx, seller, 401n, listingWei)

      const bidId = await placeBid(ctx, bidder, {
        bidWei: parseEther('1'),
        settlementWei: parseEther('0.05'),
      })

      const sellerBefore = await publicClient.getBalance({
        address: seller.account.address,
      })
      const bidderBefore = await publicClient.getBalance({
        address: bidder.account.address,
      })
      const settlerBefore = await publicClient.getBalance({
        address: settler.account.address,
      })

      const marketForSettler = await marketAs(ctx, settler)
      const hash = await marketForSettler.write.acceptBid([
        bidId,
        401,
        listingWei,
      ])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const gas = receipt.gasUsed * receipt.effectiveGasPrice

      assert.equal(
        (
          (await punksV1.read.punkIndexToAddress([401n])) as string
        ).toLowerCase(),
        bidder.account.address.toLowerCase(),
      )
      assert.equal(
        (await publicClient.getBalance({ address: seller.account.address })) -
          sellerBefore,
        listingWei,
      )
      assert.equal(
        (await publicClient.getBalance({ address: bidder.account.address })) -
          bidderBefore,
        parseEther('0.3'),
      )
      assert.equal(
        (await publicClient.getBalance({ address: settler.account.address })) -
          settlerBefore +
          gas,
        parseEther('0.05'),
      )
      assert.equal(
        await punksV1.read.pendingWithdrawals([seller.account.address]),
        0n,
      )
      assert.equal(await punksV1.read.pendingWithdrawals([market.address]), 0n)
      assert.equal(
        await publicClient.getBalance({ address: market.address }),
        0n,
      )

      const [, , storedBidder] = (await market.read.bids([bidId])) as [
        bigint,
        bigint,
        string,
      ]
      assert.equal(storedBidder, zeroAddress)
    })

    it('rejects public V1 listings for bid settlement', async () => {
      const ctx = await deployPunksMarketStack()
      const { market, seller, bidder } = ctx

      await assignPunk(ctx, seller, 501n)
      await offerPunkPublic(ctx, seller, 501n, parseEther('0.7'))
      const bidId = await placeBid(ctx, bidder, { bidWei: parseEther('1') })

      await ctx.viem.assertions.revertWithCustomError(
        market.write.acceptBid([bidId, 501, parseEther('0.7')]),
        market,
        'ListingNotValid',
      )
    })

    it('rejects settlement when the listing price is above the bid', async () => {
      const ctx = await deployPunksMarketStack()
      const { market, seller, bidder } = ctx

      await assignPunk(ctx, seller, 601n)
      await offerPunkToMarket(ctx, seller, 601n, parseEther('1.2'))
      const bidId = await placeBid(ctx, bidder, { bidWei: parseEther('1') })

      await ctx.viem.assertions.revertWithCustomError(
        market.write.acceptBid([bidId, 601, parseEther('1.2')]),
        market,
        'ListingPriceTooHigh',
      )
    })

    it('rejects invalid punk ids before listing validation', async () => {
      const ctx = await deployPunksMarketStack()
      const { market, bidder } = ctx
      const bidId = await placeBid(ctx, bidder, { bidWei: parseEther('1') })

      await ctx.viem.assertions.revertWithCustomError(
        market.write.acceptBid([bidId, 10000, 0n]),
        market,
        'InvalidPunkId',
      )
    })

    it('enforces include, exclude, and PunksData criteria', async () => {
      const ctx = await deployPunksMarketStack()
      const { market, punksV1, punksData, seller, bidder } = ctx

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

      await assignPunk(ctx, seller, 799n)
      await offerPunkToMarket(ctx, seller, 799n, parseEther('0.5'))
      await ctx.viem.assertions.revertWithCustomError(
        market.write.acceptBid([bidId, 799, parseEther('0.5')]),
        market,
        'PunkNotIncluded',
      )

      await assignPunk(ctx, seller, 802n)
      await offerPunkToMarket(ctx, seller, 802n, parseEther('0.5'))
      await ctx.viem.assertions.revertWithCustomError(
        market.write.acceptBid([bidId, 802, parseEther('0.5')]),
        market,
        'PunkExcluded',
      )

      await assignPunk(ctx, seller, 801n)
      await offerPunkToMarket(ctx, seller, 801n, parseEther('0.5'))
      await ctx.viem.assertions.revertWithCustomError(
        market.write.acceptBid([bidId, 801, parseEther('0.5')]),
        market,
        'PunkCriteriaMismatch',
      )

      await assignPunk(ctx, seller, 800n)
      await offerPunkToMarket(ctx, seller, 800n, parseEther('0.5'))
      await market.write.acceptBid([bidId, 800, parseEther('0.5')])
      assert.equal(
        (
          (await punksV1.read.punkIndexToAddress([800n])) as string
        ).toLowerCase(),
        bidder.account.address.toLowerCase(),
      )
    })
  })

  it('rejects arbitrary ETH sends', async () => {
    const ctx = await deployPunksMarketStack()
    const { market, other } = ctx
    await assert.rejects(
      other.sendTransaction({ to: market.address, value: 1n }),
    )
  })

  describe('matchesPunk', () => {
    it('returns false for a never-created bid id', async () => {
      const ctx = await deployPunksMarketStack()
      assert.equal(await ctx.market.read.matchesPunk([1n, 0]), false)
      assert.equal(await ctx.market.read.matchesPunk([42n, 100]), false)
    })

    it('rejects invalid punk ids before matching', async () => {
      const ctx = await deployPunksMarketStack()
      const bidId = await placeBid(ctx, ctx.bidder)

      await ctx.viem.assertions.revertWithCustomError(
        ctx.market.read.matchesPunk([bidId, 10000]),
        ctx.market,
        'InvalidPunkId',
      )
      await ctx.viem.assertions.revertWithCustomError(
        ctx.market.read.matchesPunk([42n, 10000]),
        ctx.market,
        'InvalidPunkId',
      )
    })

    it('returns true for an active wildcard bid against any punk', async () => {
      const ctx = await deployPunksMarketStack()
      const bidId = await placeBid(ctx, ctx.bidder)
      assert.equal(await ctx.market.read.matchesPunk([bidId, 0]), true)
      assert.equal(await ctx.market.read.matchesPunk([bidId, 9999]), true)
    })

    it('returns true when criteria + include + exclude all permit the punk', async () => {
      const ctx = await deployPunksMarketStack()
      await ctx.punksData.write.setTraitMask([500n, traitBit(7)])
      const bidId = await placeBid(ctx, ctx.bidder, {
        criteria: { ...emptyCriteria(), requiredTraitMask: traitBit(7) },
        includeIds: [500, 501],
        excludeIds: [600],
      })
      assert.equal(await ctx.market.read.matchesPunk([bidId, 500]), true)
    })

    it('returns false when include list excludes the punk', async () => {
      const ctx = await deployPunksMarketStack()
      const bidId = await placeBid(ctx, ctx.bidder, { includeIds: [1, 2, 3] })
      assert.equal(await ctx.market.read.matchesPunk([bidId, 4]), false)
      assert.equal(await ctx.market.read.matchesPunk([bidId, 2]), true)
    })

    it('returns false when exclude list contains the punk', async () => {
      const ctx = await deployPunksMarketStack()
      const bidId = await placeBid(ctx, ctx.bidder, { excludeIds: [42, 43] })
      assert.equal(await ctx.market.read.matchesPunk([bidId, 42]), false)
      assert.equal(await ctx.market.read.matchesPunk([bidId, 41]), true)
    })

    it('returns false when criteria predicate rejects the punk', async () => {
      const ctx = await deployPunksMarketStack()
      await ctx.punksData.write.setTraitMask([10n, traitBit(3)])
      const bidId = await placeBid(ctx, ctx.bidder, {
        criteria: { ...emptyCriteria(), requiredTraitMask: traitBit(7) },
      })
      assert.equal(await ctx.market.read.matchesPunk([bidId, 10]), false)
    })

    it('returns false after the bid is cancelled', async () => {
      const ctx = await deployPunksMarketStack()
      const bidId = await placeBid(ctx, ctx.bidder)
      const marketForBidder = await marketAs(ctx, ctx.bidder)
      await marketForBidder.write.cancelBid([bidId])
      assert.equal(await ctx.market.read.matchesPunk([bidId, 0]), false)
    })

    it('returns false after the bid is accepted', async () => {
      const ctx = await deployPunksMarketStack()
      const { market, seller, bidder, settler } = ctx
      const listingWei = parseEther('0.3')

      const bidId = await placeBid(ctx, bidder, { bidWei: parseEther('1') })
      await assignPunk(ctx, seller, 901n)
      await offerPunkToMarket(ctx, seller, 901n, listingWei)
      const marketForSettler = await marketAs(ctx, settler)
      await marketForSettler.write.acceptBid([bidId, 901, listingWei])

      assert.equal(await market.read.matchesPunk([bidId, 901]), false)
    })
  })

  describe('bidsMatchingPunk', () => {
    it('returns empty for an empty book', async () => {
      const ctx = await deployPunksMarketStack()
      const [ids, nextId] = (await ctx.market.read.bidsMatchingPunk([
        0,
        0n,
        100n,
      ])) as [bigint[], bigint]
      assert.deepEqual(ids, [])
      assert.equal(nextId, 0n)
    })

    it('rejects invalid punk ids before scanning', async () => {
      const ctx = await deployPunksMarketStack()
      await ctx.viem.assertions.revertWithCustomError(
        ctx.market.read.bidsMatchingPunk([10000, 0n, 100n]),
        ctx.market,
        'InvalidPunkId',
      )
    })

    it('returns empty when count is zero', async () => {
      const ctx = await deployPunksMarketStack()
      await placeBid(ctx, ctx.bidder)
      const [ids, nextId] = (await ctx.market.read.bidsMatchingPunk([
        0,
        0n,
        0n,
      ])) as [bigint[], bigint]
      assert.deepEqual(ids, [])
      assert.equal(nextId, 0n)
    })

    it('returns empty when fromId is past lastBidId', async () => {
      const ctx = await deployPunksMarketStack()
      await placeBid(ctx, ctx.bidder)
      const [ids, nextId] = (await ctx.market.read.bidsMatchingPunk([
        0,
        5n,
        10n,
      ])) as [bigint[], bigint]
      assert.deepEqual(ids, [])
      assert.equal(nextId, 0n)
    })

    it('normalizes fromId == 0 to start at the latest bid and signals end with nextId == 0', async () => {
      const ctx = await deployPunksMarketStack()
      const a = await placeBid(ctx, ctx.bidder)
      const b = await placeBid(ctx, ctx.bidder)
      const c = await placeBid(ctx, ctx.bidder)
      const [ids, nextId] = (await ctx.market.read.bidsMatchingPunk([
        0,
        0n,
        100n,
      ])) as [bigint[], bigint]
      assert.deepEqual(ids, [c, b, a])
      assert.equal(nextId, 0n)
    })

    it('filters bids that do not match the punk', async () => {
      const ctx = await deployPunksMarketStack()
      await ctx.punksData.write.setTraitMask([50n, traitBit(2)])

      // bid #1: wildcard — matches any
      const idAny = await placeBid(ctx, ctx.bidder)
      // bid #2: requires trait 2 — matches punk 50
      const idTrait = await placeBid(ctx, ctx.bidder, {
        criteria: { ...emptyCriteria(), requiredTraitMask: traitBit(2) },
      })
      // bid #3: excludes punk 50 — does not match
      await placeBid(ctx, ctx.bidder, { excludeIds: [50] })
      // bid #4: include-only list without punk 50 — does not match
      await placeBid(ctx, ctx.bidder, { includeIds: [49, 51] })

      const [ids, nextId] = (await ctx.market.read.bidsMatchingPunk([
        50,
        0n,
        100n,
      ])) as [bigint[], bigint]
      assert.deepEqual(ids, [idTrait, idAny])
      assert.equal(nextId, 0n)
    })

    it('paginates newest-first with a continuation cursor', async () => {
      const ctx = await deployPunksMarketStack()
      const ids: bigint[] = []
      for (let i = 0; i < 5; i++) ids.push(await placeBid(ctx, ctx.bidder))

      const [page1, next1] = (await ctx.market.read.bidsMatchingPunk([
        0,
        0n,
        2n,
      ])) as [bigint[], bigint]
      assert.deepEqual(page1, [ids[4], ids[3]])
      assert.equal(next1, 3n)

      const [page2, next2] = (await ctx.market.read.bidsMatchingPunk([
        0,
        next1,
        2n,
      ])) as [bigint[], bigint]
      assert.deepEqual(page2, [ids[2], ids[1]])
      assert.equal(next2, 1n)

      const [page3, next3] = (await ctx.market.read.bidsMatchingPunk([
        0,
        next2,
        2n,
      ])) as [bigint[], bigint]
      assert.deepEqual(page3, [ids[0]])
      assert.equal(next3, 0n)
    })

    it('skips cancelled bids without breaking pagination', async () => {
      const ctx = await deployPunksMarketStack()
      const a = await placeBid(ctx, ctx.bidder)
      const b = await placeBid(ctx, ctx.bidder)
      const c = await placeBid(ctx, ctx.bidder)
      const marketForBidder = await marketAs(ctx, ctx.bidder)
      await marketForBidder.write.cancelBid([b])

      const [ids, nextId] = (await ctx.market.read.bidsMatchingPunk([
        0,
        0n,
        100n,
      ])) as [bigint[], bigint]
      assert.deepEqual(ids, [c, a])
      assert.equal(nextId, 0n)
    })
  })
})
