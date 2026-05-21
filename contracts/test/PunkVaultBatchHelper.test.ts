import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { network } from 'hardhat'
import { parseEther, zeroAddress, type Address } from 'viem'

import { REVERSE_REGISTRAR, etchReverseRegistrar } from './helpers/fixtures.js'

const CRYPTOPUNKS = '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB' as const
const STASH_FACTORY = '0x000000000000A6fA31F5fC51c1640aAc76866750' as const

type Ctx = Awaited<ReturnType<typeof deployHelperFixture>>

function lc(value: string): string {
  return value.toLowerCase()
}

async function deployHelperFixture(opts: { approveHelper?: boolean } = {}) {
  const approveHelper = opts.approveHelper ?? true
  const connection: any = await network.create()
  const { viem } = connection
  const [deployer, owner, seller, buyer, other, attacker] =
    await viem.getWalletClients()

  const punks = await viem.deployContract('MockCryptoPunksMarket')
  await etchReverseRegistrar(connection)
  const vaultFactory = await viem.deployContract('PunksVaultFactory')
  const helper = await viem.deployContract('PunkVaultBatchHelper', [
    vaultFactory.address,
  ])

  const factoryAsOwner = await viem.getContractAt(
    'PunksVaultFactory',
    vaultFactory.address,
    { client: { wallet: owner } },
  )
  await factoryAsOwner.write.ensureMyVault([
    approveHelper ? [helper.address] : [],
  ])

  const vaultAddress = (await vaultFactory.read.predictVault([
    owner.account.address,
  ])) as Address
  const vault = await viem.getContractAt('PunksVault', vaultAddress)
  const vaultAsOwner = await viem.getContractAt('PunksVault', vaultAddress, {
    client: { wallet: owner },
  })
  const helperAsOwner = await viem.getContractAt(
    'PunkVaultBatchHelper',
    helper.address,
    { client: { wallet: owner } },
  )
  const helperAsAttacker = await viem.getContractAt(
    'PunkVaultBatchHelper',
    helper.address,
    { client: { wallet: attacker } },
  )

  return {
    connection,
    viem,
    deployer,
    owner,
    seller,
    buyer,
    other,
    attacker,
    punks,
    vaultFactory,
    factoryAsOwner,
    helper,
    helperAsOwner,
    helperAsAttacker,
    vault,
    vaultAsOwner,
    vaultAddress,
  }
}

async function sendEth(ctx: Ctx, to: Address, value: bigint) {
  const publicClient = await ctx.viem.getPublicClient()
  const hash = await ctx.other.sendTransaction({ to, value })
  await publicClient.waitForTransactionReceipt({ hash })
}

async function depositPunk(ctx: Ctx, market: any, punkId: bigint) {
  await market.write.setInitialOwner([ctx.owner.account.address, punkId])
  const marketAsOwner = await ctx.viem.getContractAt(
    'MockCryptoPunksMarket',
    market.address,
    { client: { wallet: ctx.owner } },
  )
  await marketAsOwner.write.transferPunk([ctx.vaultAddress, punkId])
}

async function offerPunkFromSeller(
  ctx: Ctx,
  market: any,
  punkId: bigint,
  price: bigint,
) {
  await market.write.setInitialOwner([ctx.seller.account.address, punkId])
  const marketAsSeller = await ctx.viem.getContractAt(
    'MockCryptoPunksMarket',
    market.address,
    { client: { wallet: ctx.seller } },
  )
  await marketAsSeller.write.offerPunkForSale([punkId, price])
}

async function enterBid(
  ctx: Ctx,
  market: any,
  bidder: any,
  punkId: bigint,
  value: bigint,
) {
  const marketAsBidder = await ctx.viem.getContractAt(
    'MockCryptoPunksMarket',
    market.address,
    { client: { wallet: bidder } },
  )
  await marketAsBidder.write.enterBidForPunk([punkId], { value })
}

async function etchContractAt(ctx: Ctx, address: Address, contractName: string) {
  const deployed = await ctx.viem.deployContract(contractName)
  const publicClient = await ctx.viem.getPublicClient()
  const code = await publicClient.getCode({ address: deployed.address })
  await ctx.connection.networkHelpers.setCode(address, code)
}

describe('PunkVaultBatchHelper', () => {
  it('deploys with an immutable factory and sets the batch ENS reverse name', async () => {
    const ctx = await deployHelperFixture()
    const reverse = await ctx.viem.getContractAt(
      'ReverseRegistrarMock',
      REVERSE_REGISTRAR,
    )

    assert.equal(lc((await ctx.helper.read.FACTORY()) as string), lc(ctx.vaultFactory.address))
    assert.equal(await reverse.read.calls(), 2n)
    assert.equal(
      lc((await reverse.read.lastCaller()) as string),
      lc(ctx.helper.address),
    )
    assert.equal(await reverse.read.lastName(), 'batch.punksvaultfactory.eth')

    await ctx.viem.assertions.revertWithCustomError(
      ctx.viem.deployContract('PunkVaultBatchHelper', [zeroAddress]),
      ctx.helper,
      'ZeroAddress',
    )
  })

  it('requires the caller vault to exist and approve the helper', async () => {
    const unapproved = await deployHelperFixture({ approveHelper: false })

    await unapproved.viem.assertions.revertWithCustomError(
      unapproved.helperAsOwner.write.batchTransferPunks([[]]),
      unapproved.helper,
      'HelperNotOperator',
    )
    await unapproved.viem.assertions.revertWithCustomError(
      unapproved.helperAsAttacker.write.batchTransferPunks([[]]),
      unapproved.helper,
      'VaultNotDeployed',
    )
  })

  it('cannot be used by a different caller to operate the owner vault', async () => {
    const ctx = await deployHelperFixture()
    await depositPunk(ctx, ctx.punks, 1n)

    const factoryAsAttacker = await ctx.viem.getContractAt(
      'PunksVaultFactory',
      ctx.vaultFactory.address,
      { client: { wallet: ctx.attacker } },
    )
    await factoryAsAttacker.write.ensureMyVault([[ctx.helper.address]])

    await assert.rejects(
      ctx.helperAsAttacker.write.batchTransferPunks([
        [{ market: ctx.punks.address, punkIndex: 1n, to: ctx.attacker.account.address }],
      ]),
      /not owner/,
    )
    assert.equal(
      lc((await ctx.punks.read.punkIndexToAddress([1n])) as string),
      lc(ctx.vaultAddress),
    )
  })

  it('batches transfers, public listings, directed listings, and cancellations', async () => {
    const ctx = await deployHelperFixture()
    for (const id of [10n, 11n, 12n, 13n, 14n, 15n]) {
      await depositPunk(ctx, ctx.punks, id)
    }

    await ctx.helperAsOwner.write.batchTransferPunks([
      [
        { market: ctx.punks.address, punkIndex: 10n, to: ctx.other.account.address },
        { market: ctx.punks.address, punkIndex: 11n, to: ctx.buyer.account.address },
      ],
    ])
    assert.equal(
      lc((await ctx.punks.read.punkIndexToAddress([10n])) as string),
      lc(ctx.other.account.address),
    )
    assert.equal(
      lc((await ctx.punks.read.punkIndexToAddress([11n])) as string),
      lc(ctx.buyer.account.address),
    )

    await ctx.helperAsOwner.write.batchOfferPunksForSale([
      [
        { market: ctx.punks.address, punkIndex: 12n, minSalePriceWei: 123n },
        { market: ctx.punks.address, punkIndex: 13n, minSalePriceWei: 456n },
      ],
    ])
    let offer = (await ctx.punks.read.punksOfferedForSale([12n])) as any
    assert.equal(offer[0], true)
    assert.equal(offer[3], 123n)
    offer = (await ctx.punks.read.punksOfferedForSale([13n])) as any
    assert.equal(offer[0], true)
    assert.equal(offer[3], 456n)

    await ctx.helperAsOwner.write.batchPunksNoLongerForSale([
      [
        { market: ctx.punks.address, punkIndex: 12n },
        { market: ctx.punks.address, punkIndex: 13n },
      ],
    ])
    offer = (await ctx.punks.read.punksOfferedForSale([12n])) as any
    assert.equal(offer[0], false)
    offer = (await ctx.punks.read.punksOfferedForSale([13n])) as any
    assert.equal(offer[0], false)

    await ctx.helperAsOwner.write.batchOfferPunksForSaleToAddress([
      [
        {
          market: ctx.punks.address,
          punkIndex: 14n,
          minSalePriceWei: 789n,
          toAddress: ctx.buyer.account.address,
        },
        {
          market: ctx.punks.address,
          punkIndex: 15n,
          minSalePriceWei: 987n,
          toAddress: ctx.other.account.address,
        },
      ],
    ])
    offer = (await ctx.punks.read.punksOfferedForSale([14n])) as any
    assert.equal(offer[0], true)
    assert.equal(lc(offer[4]), lc(ctx.buyer.account.address))
    offer = (await ctx.punks.read.punksOfferedForSale([15n])) as any
    assert.equal(offer[0], true)
    assert.equal(lc(offer[4]), lc(ctx.other.account.address))
  })

  it('batches accepting bids and withdrawing proceeds from multiple markets', async () => {
    const ctx = await deployHelperFixture()
    const otherMarket = await ctx.viem.deployContract('MockCryptoPunksMarket')
    await depositPunk(ctx, ctx.punks, 20n)
    await depositPunk(ctx, ctx.punks, 21n)
    await depositPunk(ctx, otherMarket, 22n)
    await enterBid(ctx, ctx.punks, ctx.buyer, 20n, parseEther('1'))
    await enterBid(ctx, ctx.punks, ctx.other, 21n, parseEther('2'))
    await enterBid(ctx, otherMarket, ctx.buyer, 22n, parseEther('0.5'))

    await ctx.helperAsOwner.write.batchAcceptBidsForPunk([
      [
        { market: ctx.punks.address, punkIndex: 20n, minPrice: parseEther('1') },
        { market: ctx.punks.address, punkIndex: 21n, minPrice: parseEther('2') },
      ],
    ])
    assert.equal(
      await ctx.punks.read.pendingWithdrawals([ctx.vaultAddress]),
      parseEther('3'),
    )

    await ctx.helperAsOwner.write.batchAcceptBidsForPunk([
      [{ market: otherMarket.address, punkIndex: 22n, minPrice: parseEther('0.5') }],
    ])
    await ctx.helperAsOwner.write.batchWithdrawFromMarkets([
      [ctx.punks.address, otherMarket.address],
    ])
    const publicClient = await ctx.viem.getPublicClient()
    assert.equal(
      await publicClient.getBalance({ address: ctx.vaultAddress }),
      parseEther('3.5'),
    )

    await depositPunk(ctx, ctx.punks, 23n)
    await depositPunk(ctx, otherMarket, 24n)
    await enterBid(ctx, ctx.punks, ctx.buyer, 23n, parseEther('0.75'))
    await enterBid(ctx, otherMarket, ctx.other, 24n, parseEther('0.25'))
    await ctx.helperAsOwner.write.batchAcceptBidsForPunk([
      [
        { market: ctx.punks.address, punkIndex: 23n, minPrice: parseEther('0.75') },
        { market: otherMarket.address, punkIndex: 24n, minPrice: parseEther('0.25') },
      ],
    ])

    const recipientBefore = await publicClient.getBalance({
      address: ctx.seller.account.address,
    })
    await ctx.helperAsOwner.write.batchWithdrawFromMarketsTo([
      [
        { market: ctx.punks.address, recipient: ctx.seller.account.address },
        { market: otherMarket.address, recipient: ctx.seller.account.address },
      ],
    ])
    assert.equal(
      (await publicClient.getBalance({ address: ctx.seller.account.address })) -
        recipientBefore,
      parseEther('1'),
    )
  })

  it('batches payable buys and bids while preserving exact call-value accounting', async () => {
    const ctx = await deployHelperFixture()
    await offerPunkFromSeller(ctx, ctx.punks, 30n, parseEther('1'))
    await offerPunkFromSeller(ctx, ctx.punks, 31n, parseEther('0.4'))
    await sendEth(ctx, ctx.vaultAddress, parseEther('0.6'))

    await ctx.helperAsOwner.write.batchBuyPunks(
      [
        [
          {
            market: ctx.punks.address,
            punkIndex: 30n,
            marketValue: parseEther('1'),
            callValue: parseEther('0.6'),
          },
          {
            market: ctx.punks.address,
            punkIndex: 31n,
            marketValue: parseEther('0.4'),
            callValue: parseEther('0.2'),
          },
        ],
      ],
      { value: parseEther('0.8') },
    )
    assert.equal(
      lc((await ctx.punks.read.punkIndexToAddress([30n])) as string),
      lc(ctx.vaultAddress),
    )
    assert.equal(
      lc((await ctx.punks.read.punkIndexToAddress([31n])) as string),
      lc(ctx.vaultAddress),
    )

    await ctx.punks.write.setInitialOwner([ctx.seller.account.address, 32n])
    await ctx.punks.write.setInitialOwner([ctx.seller.account.address, 33n])
    await ctx.helperAsOwner.write.batchEnterBidsForPunk(
      [
        [
          {
            market: ctx.punks.address,
            punkIndex: 32n,
            marketValue: parseEther('0.3'),
            callValue: parseEther('0.3'),
          },
          {
            market: ctx.punks.address,
            punkIndex: 33n,
            marketValue: parseEther('0.5'),
            callValue: parseEther('0.5'),
          },
        ],
      ],
      { value: parseEther('0.8') },
    )
    let bid = (await ctx.punks.read.punkBids([32n])) as any
    assert.equal(bid[0], true)
    assert.equal(lc(bid[2]), lc(ctx.vaultAddress))
    assert.equal(bid[3], parseEther('0.3'))
    bid = (await ctx.punks.read.punkBids([33n])) as any
    assert.equal(bid[0], true)
    assert.equal(lc(bid[2]), lc(ctx.vaultAddress))
    assert.equal(bid[3], parseEther('0.5'))

    await ctx.helperAsOwner.write.batchWithdrawBidsForPunk([
      [
        { market: ctx.punks.address, punkIndex: 32n },
        { market: ctx.punks.address, punkIndex: 33n },
      ],
    ])
    bid = (await ctx.punks.read.punkBids([32n])) as any
    assert.equal(bid[0], false)
    bid = (await ctx.punks.read.punkBids([33n])) as any
    assert.equal(bid[0], false)

    await ctx.viem.assertions.revertWithCustomError(
      ctx.helperAsOwner.write.batchBuyPunks([
        [
          {
            market: ctx.punks.address,
            punkIndex: 30n,
            marketValue: 1n,
            callValue: 2n,
          },
        ],
      ]),
      ctx.helper,
      'ValueMismatch',
    )
    await ctx.viem.assertions.revertWithCustomError(
      ctx.helperAsOwner.write.batchEnterBidsForPunk(
        [
          [
            {
              market: ctx.punks.address,
              punkIndex: 32n,
              marketValue: 1n,
              callValue: 2n,
            },
          ],
        ],
        { value: 3n },
      ),
      ctx.helper,
      'ValueMismatch',
    )
  })

  it('batches canonical Punk stashing to the EOA owner stash', async () => {
    const ctx = await deployHelperFixture()
    await etchContractAt(ctx, CRYPTOPUNKS, 'MockCryptoPunksMarket')
    await etchContractAt(ctx, STASH_FACTORY, 'MockStashFactory')
    const canonicalPunks = await ctx.viem.getContractAt(
      'MockCryptoPunksMarket',
      CRYPTOPUNKS,
    )
    const stashFactory = await ctx.viem.getContractAt(
      'MockStashFactory',
      STASH_FACTORY,
    )
    await depositPunk(ctx, canonicalPunks, 40n)
    await depositPunk(ctx, canonicalPunks, 41n)

    await ctx.helperAsOwner.write.batchStashPunks([[40n, 41n]])

    const stash = (await stashFactory.read.stashAddressFor([
      ctx.owner.account.address,
    ])) as Address
    assert.equal(
      lc((await canonicalPunks.read.punkIndexToAddress([40n])) as string),
      lc(stash),
    )
    assert.equal(
      lc((await canonicalPunks.read.punkIndexToAddress([41n])) as string),
      lc(stash),
    )
    const publicClient = await ctx.viem.getPublicClient()
    assert.notEqual(await publicClient.getCode({ address: stash }), undefined)
  })

  it('reverts atomically when a later batch item fails', async () => {
    const ctx = await deployHelperFixture()
    await depositPunk(ctx, ctx.punks, 50n)

    await assert.rejects(
      ctx.helperAsOwner.write.batchOfferPunksForSale([
        [
          { market: ctx.punks.address, punkIndex: 50n, minSalePriceWei: 1n },
          { market: ctx.punks.address, punkIndex: 51n, minSalePriceWei: 1n },
        ],
      ]),
      /not owner/,
    )

    const offer = (await ctx.punks.read.punksOfferedForSale([50n])) as any
    assert.equal(offer[0], false)
    assert.equal(
      lc((await ctx.punks.read.punkIndexToAddress([50n])) as string),
      lc(ctx.vaultAddress),
    )
  })
})
