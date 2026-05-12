import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CRYPTOPUNKS_721_ADDRESS,
  CRYPTOPUNKS_MARKET_ADDRESS,
  PUNKS_RENDERER_BACKGROUND_DEFAULT,
  STASH_FACTORY_ADDRESS,
  WRAPPED_PUNKS_ADDRESS,
  PunksDataValidationError,
  createPunksSdk,
} from '../dist/index.js'

const AUCTION = '0x0000000000000000000000000000000000000abc'
const BUYER = '0x0000000000000000000000000000000000000b0b'
const STASH = '0x0000000000000000000000000000000000000a55'
const ZERO_BYTES32 = '0x' + '00'.repeat(32)

describe('PunksSdk', () => {
  it('exposes collection-first search, summaries, and local rendering without RPC', () => {
    const punks = createPunksSdk()

    assert.deepEqual(punks.search({ text: 'hoodie', limit: 3 }), [54, 58, 87])
    assert.equal(punks.count({ type: 'Alien' }), 9)

    const punk = punks.get(8348, { includeTraits: true })
    assert.equal(punk.punkTypeName, 'Male')
    assert.equal(punk.attributeCount, 7)
    assert.ok(punk.traits.some((trait) => trait.name === 'Top Hat'))

    const svg = punks.render.svg(8348)
    assert.ok(svg.startsWith("<svg xmlns='http://www.w3.org/2000/svg'"))
    assert.ok(svg.includes(PUNKS_RENDERER_BACKGROUND_DEFAULT.slice(2, 8)))

    const transparentSvg = punks.render.svg(8348, { background: 'transparent' })
    assert.equal(transparentSvg.includes("<rect width='24' height='24'"), false)

    const png = punks.render.png(8348)
    assert.deepEqual([...png.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    assert.equal(punks.render.metadata(8348).name, 'CryptoPunk 8348')
  })

  it('compiles user queries into auction offer slots', () => {
    const punks = createPunksSdk({ addresses: { auction: AUCTION } })
    const slot = punks.offers.slot({
      query: {
        type: 'Zombie',
        colorCount: { max: 4 },
        ids: [1, 2, 2],
        excludeIds: [3],
      },
    })

    assert.equal(slot.standard, 0)
    assert.deepEqual(slot.includeIds, [1, 2])
    assert.deepEqual(slot.excludeIds, [3])
    assert.equal(slot.criteria.requiredTraitMask, 1n << 4n)
    assert.equal(slot.criteria.minColorCount, 2)
    assert.equal(slot.criteria.maxColorCount, 4)

    const plan = punks.offers.preparePlace({
      amountWei: 10n,
      settlementWei: 2n,
      receiver: BUYER,
      query: { attributes: { required: ['Hoodie'] } },
    })
    assert.equal(plan.request.address, AUCTION)
    assert.equal(plan.request.functionName, 'placeOffer')
    assert.equal(plan.request.value, 12n)
    assert.equal(plan.request.args[2], BUYER)
    assert.equal(plan.request.args[3][0].criteria.requiredTraitMask, 1n << 62n)

    assert.throws(
      () => punks.offers.slot({ query: { text: 'zombie hoodie' } }),
      /text search cannot be represented/,
    )
  })

  it('prepares and executes original-market writes through wallet clients', async () => {
    const writes = []
    const punks = createPunksSdk({
      walletClient: {
        account: { address: BUYER },
        writeContract: async (request) => {
          writes.push(request)
          return '0x1234'
        },
      },
    })

    const publicListing = punks.market.prepareList({ punkId: 10, priceWei: 5n })
    assert.equal(publicListing.request.address, CRYPTOPUNKS_MARKET_ADDRESS)
    assert.equal(publicListing.request.functionName, 'offerPunkForSale')
    assert.deepEqual(publicListing.request.args, [10n, 5n])

    const privateListing = punks.market.prepareList({
      punkId: 10,
      priceWei: 5n,
      onlySellTo: BUYER,
    })
    assert.equal(privateListing.request.functionName, 'offerPunkForSaleToAddress')
    assert.deepEqual(privateListing.request.args, [10n, 5n, BUYER])

    assert.equal(await punks.market.list({ punkId: 10, priceWei: 5n }), '0x1234')
    assert.equal(writes[0].functionName, 'offerPunkForSale')
    assert.equal(writes[0].account, BUYER)

    const enterBid = punks.market.prepareEnterBid({ punkId: 10, amountWei: 7n })
    assert.equal(enterBid.request.functionName, 'enterBidForPunk')
    assert.equal(enterBid.request.value, 7n)

    const acceptBid = punks.market.prepareAcceptBid({ punkId: 10, minPriceWei: 6n })
    assert.equal(acceptBid.request.functionName, 'acceptBidForPunk')
    assert.deepEqual(acceptBid.request.args, [10n, 6n])

    const withdrawBid = punks.market.prepareWithdrawBid(10)
    assert.equal(withdrawBid.request.functionName, 'withdrawBidForPunk')
  })

  it('exposes legacy data, read-only PunksData contract reads, wrappers, and stash plans', async () => {
    const punks = createPunksSdk({
      addresses: { stash: STASH },
    })

    assert.equal(punks.data.legacy.address.length, 42)
    assert.equal('prepareLoadBlobChunk' in punks.data.onchain, false)
    assert.equal('prepareSeal' in punks.data.onchain, false)
    assert.equal('isSealed' in punks.data.onchain, false)
    assert.equal('owner' in punks.data.onchain, false)

    const c721Wrap = punks.wrappers.c721.prepareWrapPunk(123)
    assert.equal(c721Wrap.request.address, CRYPTOPUNKS_721_ADDRESS)
    assert.equal(c721Wrap.request.functionName, 'wrapPunk')

    const c721Flow = await punks.wrappers.c721.prepareWrapFlow({
      owner: BUYER,
      punkId: 123,
      stash: STASH,
    })
    assert.deepEqual(c721Flow.map((plan) => plan.request.functionName), ['transferPunk', 'wrapPunk'])

    const legacyProxy = punks.wrappers.legacy.prepareRegisterProxy()
    assert.equal(legacyProxy.request.address, WRAPPED_PUNKS_ADDRESS)
    assert.equal(legacyProxy.request.functionName, 'registerProxy')

    const legacyDeposit = punks.wrappers.legacy.prepareDepositToProxy({
      punkId: 123,
      proxy: BUYER,
    })
    assert.equal(legacyDeposit.request.functionName, 'transferPunk')

    const deployStash = punks.stash.prepareDeploy(BUYER)
    assert.equal(deployStash.request.address, STASH_FACTORY_ADDRESS)
    assert.equal(deployStash.request.functionName, 'deployStash')

    const stash = punks.stash.at(STASH)
    const fund = stash.prepareFundEth(10n)
    assert.deepEqual(fund.request, { to: STASH, value: 10n })

    const process = stash.prepareProcessPunkBid({
      punkId: 123,
      signature: '0x1234',
      bid: {
        order: {
          numberOfUnits: 1,
          pricePerUnit: 10n,
          auction: CRYPTOPUNKS_MARKET_ADDRESS,
        },
        accountNonce: 0n,
        bidNonce: 1n,
        expiration: 0n,
        root: ZERO_BYTES32,
      },
    })
    assert.equal(process.request.functionName, 'processPunkBid')
    assert.equal(process.request.args[1], 123n)

    const typedData = stash.typedDataForPunkBid({ bid: process.request.args[0] })
    assert.equal(typedData.domain.verifyingContract, STASH)
    assert.equal(typedData.domain.chainId, 1)
    assert.equal(typedData.primaryType, 'PunkBid')
  })

  it('keeps auction lot and bid writes inspectable', () => {
    const punks = createPunksSdk({ addresses: { auction: AUCTION } })

    const lot = punks.auctions.prepareCreateLot({
      items: [{ punkId: 1 }, { punkId: 2 }, { punkId: 3 }],
      reserveWei: 100n,
      expiresAt: 2_000_000_000,
    })
    assert.equal(lot.request.functionName, 'createLot')
    assert.deepEqual(
      lot.request.args[0].map((item) => item.weightBps),
      [3334, 3333, 3333],
    )

    const bid = punks.auctions.prepareBid({ auctionId: 7n, amountWei: 150n })
    assert.equal(bid.request.functionName, 'bid')
    assert.equal(bid.request.value, 150n)

    assert.throws(
      () => createPunksSdk().auctions.prepareBid({ auctionId: 1n, amountWei: 1n }),
      PunksDataValidationError,
    )
  })
})
