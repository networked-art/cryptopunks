import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  concatHex,
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  parseAbiParameters,
  stringToHex,
} from 'viem'
import {
  CRYPTOPUNKS_721_ADDRESS,
  CRYPTOPUNKS_MARKET_ADDRESS,
  STASH_FACTORY_ADDRESS,
  WRAPPED_PUNKS_ADDRESS,
  ZERO_ADDRESS,
  createPunksSdk,
  createStashClient,
  stashPunkBidTypedData,
} from '../dist/index.js'

const OWNER = '0x0000000000000000000000000000000000000a11'
const OPERATOR = '0x0000000000000000000000000000000000000b0b'
const AUCTION = '0x0000000000000000000000000000000000000abc'
const STASH = '0x0000000000000000000000000000000000000a55'
const PROXY = '0x0000000000000000000000000000000000000f00'
const WETH = '0x0000000000000000000000000000000000000e7c'
const ZERO_BYTES32 = '0x' + '00'.repeat(32)

describe('SDK contract actions', () => {
  it('reads market, legacy data, wrapper, factory, and Stash state through publicClient', async () => {
    const reads = []
    const publicClient = {
      readContract: async (request) => {
        reads.push(request)
        return fakeRead(request)
      },
    }
    const punks = createPunksSdk({
      publicClient,
      addresses: {
        stash: STASH,
      },
    })

    assert.equal(await punks.market.name(), 'CryptoPunks')
    assert.equal(await punks.market.pendingWithdrawal(OWNER), 55n)
    assert.equal(await punks.data.legacy.punkImageSvg(123), '<svg />')
    assert.equal(await punks.data.legacy.punkAttributes(123), 'Hoodie, Smile')
    assert.equal(await punks.wrappers.modern.stashFor(OWNER), STASH)
    assert.equal(await punks.wrappers.legacy.proxyFor(OWNER), PROXY)
    assert.equal(await punks.stash.factory.ownerHasDeployed(OWNER), true)
    assert.deepEqual(await punks.stash.statusForOwner(OWNER), {
      owner: OWNER,
      address: STASH,
      deployed: true,
    })

    const stash = punks.stash.at(STASH)
    assert.equal(await stash.availableLiquidity(), 100n)
    assert.equal(await stash.availableLiquidity(WETH), 75n)
    assert.equal(await stash.availableLiquidityWETHAndETH(), 175n)
    assert.deepEqual(await stash.getOrder(AUCTION), {
      numberOfUnits: 2,
      pricePerUnit: 10n,
      auction: AUCTION,
    })

    assert.ok(
      reads.some(
        (read) =>
          read.address === CRYPTOPUNKS_MARKET_ADDRESS &&
          read.functionName === 'pendingWithdrawals' &&
          read.args[0] === OWNER,
      ),
    )
    assert.ok(
      reads.some(
        (read) =>
          read.address === STASH_FACTORY_ADDRESS &&
          read.functionName === 'stashAddressFor',
      ),
    )
    assert.ok(
      reads.some(
        (read) =>
          read.address === STASH &&
          read.functionName === 'availableLiquidityWETHAndETH',
      ),
    )
  })

  it('preflights and executes modern Stash and legacy proxy wrapping flows', async () => {
    const writes = []
    const punks = createPunksSdk({
      publicClient: {
        readContract: async (request) => fakeRead(request),
      },
      walletClient: {
        account: { address: OWNER },
        writeContract: async (request) => {
          writes.push(request)
          return `0x${writes.length.toString(16).padStart(64, '0')}`
        },
      },
    })

    const modern = await punks.wrappers.modern.wrapPreflight({
      owner: OWNER,
      punkId: 123,
      operator: OPERATOR,
    })
    assert.equal(modern.currentOwner, OWNER)
    assert.equal(modern.expectedStash, STASH)
    assert.equal(modern.stashDeployed, true)
    assert.equal(modern.nextStep, 'transferPunk')
    assert.equal(modern.canSendNextStep, true)
    assert.equal(modern.approval.canTransfer, true)

    const deployStash = punks.wrappers.modern.prepareDeployStash(OWNER)
    assert.equal(deployStash.request.address, STASH_FACTORY_ADDRESS)
    assert.equal(deployStash.request.functionName, 'deployStash')
    assert.deepEqual(deployStash.request.args, [OWNER])

    const modernHashes = await punks.wrappers.modern.wrapFlow({
      owner: OWNER,
      punkId: 123,
    })
    assert.deepEqual(modernHashes, [
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000000002',
    ])
    assert.equal(writes[0].address, CRYPTOPUNKS_MARKET_ADDRESS)
    assert.equal(writes[0].functionName, 'transferPunk')
    assert.deepEqual(writes[0].args, [STASH, 123n])
    assert.equal(writes[0].account, OWNER)
    assert.equal(writes[1].address, CRYPTOPUNKS_721_ADDRESS)
    assert.equal(writes[1].functionName, 'wrapPunk')

    const legacy = await punks.wrappers.legacy.wrapPreflight({
      owner: OWNER,
      punkId: 123,
      operator: OPERATOR,
    })
    assert.equal(legacy.expectedProxy, PROXY)
    assert.equal(legacy.proxyRegistered, true)
    assert.equal(legacy.nextStep, 'transferPunk')
    assert.equal(legacy.approval.canTransfer, true)

    const legacyHashes = await punks.wrappers.legacy.wrapFlow({
      owner: OWNER,
      punkId: 123,
    })
    assert.deepEqual(legacyHashes, [
      '0x0000000000000000000000000000000000000000000000000000000000000003',
      '0x0000000000000000000000000000000000000000000000000000000000000004',
    ])
    assert.equal(writes[2].address, CRYPTOPUNKS_MARKET_ADDRESS)
    assert.equal(writes[2].functionName, 'transferPunk')
    assert.deepEqual(writes[2].args, [PROXY, 123n])
    assert.equal(writes[3].address, WRAPPED_PUNKS_ADDRESS)
    assert.equal(writes[3].functionName, 'mint')
  })

  it('rejects missing zero-address wrapper flow destinations clearly', async () => {
    const punks = createPunksSdk()

    await assert.rejects(
      () =>
        punks.wrappers.modern.prepareWrapFlow({
          owner: OWNER,
          punkId: 123,
          stash: ZERO_ADDRESS,
        }),
      /Stash address must not be the zero address/,
    )
    assert.throws(
      () =>
        punks.wrappers.legacy.prepareDepositToProxy({
          punkId: 123,
          proxy: ZERO_ADDRESS,
        }),
      /legacy wrapper proxy must not be the zero address/,
    )
    await assert.rejects(
      () =>
        punks.wrappers.legacy.prepareWrapFlow({
          owner: OWNER,
          punkId: 123,
          proxy: ZERO_ADDRESS,
        }),
      /legacy wrapper proxy must not be the zero address/,
    )

    const undeployed = createPunksSdk({
      publicClient: {
        readContract: async (request) => {
          if (request.address === CRYPTOPUNKS_MARKET_ADDRESS) return OWNER
          if (request.address === CRYPTOPUNKS_721_ADDRESS) return STASH
          if (request.address === STASH_FACTORY_ADDRESS) return false
          throw new Error(`unhandled read ${request.functionName}`)
        },
      },
      walletClient: {
        account: { address: OWNER },
        writeContract: async () => '0x1234',
      },
    })
    const preflight = await undeployed.wrappers.modern.wrapPreflight({
      owner: OWNER,
      punkId: 123,
    })
    assert.equal(preflight.expectedStash, STASH)
    assert.equal(preflight.stashDeployed, false)
    assert.equal(preflight.nextStep, 'deployStash')
    assert.equal(preflight.canSendNextStep, true)
    await assert.rejects(
      () =>
        undeployed.wrappers.modern.prepareWrapFlow({
          owner: OWNER,
          punkId: 123,
        }),
      /Stash is not deployed/,
    )
  })

  it('prepares Stash order, withdrawal, receiver, and Punk bid writes', async () => {
    const stash = createStashClient({ address: STASH })

    const placeOrder = stash.preparePlaceOrder({
      pricePerUnit: 10n,
      numberOfUnits: 2,
      valueWei: 20n,
    })
    assert.equal(placeOrder.request.address, STASH)
    assert.equal(placeOrder.request.functionName, 'placeOrder')
    assert.deepEqual(placeOrder.request.args, [10n, 2])
    assert.equal(placeOrder.request.value, 20n)

    const processOrder = stash.prepareProcessOrder({
      costPerUnit: 9n,
      numberOfUnits: 1,
    })
    assert.equal(processOrder.request.functionName, 'processOrder')
    assert.deepEqual(processOrder.request.args, [9n, 1])

    const erc721 = stash.prepareWithdrawERC721({
      token: CRYPTOPUNKS_721_ADDRESS,
      tokenIds: [1, 2n],
    })
    assert.equal(erc721.request.functionName, 'withdrawERC721')
    assert.deepEqual(erc721.request.args, [CRYPTOPUNKS_721_ADDRESS, [1n, 2n]])

    const erc1155 = stash.prepareWithdrawERC1155({
      token: WETH,
      tokenIds: [3],
      amounts: [4n],
    })
    assert.equal(erc1155.request.functionName, 'withdrawERC1155')
    assert.deepEqual(erc1155.request.args, [WETH, [3n], [4n]])

    const punks = stash.prepareWithdrawPunks([123, 456])
    assert.equal(punks.request.functionName, 'withdrawPunks')
    assert.deepEqual(punks.request.args, [[123n, 456n]])

    const erc721Receiver = stash.prepareOnERC721Received({
      operator: OPERATOR,
      from: OWNER,
      tokenId: 123,
    })
    assert.equal(erc721Receiver.request.functionName, 'onERC721Received')
    assert.deepEqual(erc721Receiver.request.args, [OPERATOR, OWNER, 123n, '0x'])

    const erc1155Receiver = stash.prepareOnERC1155Received({
      operator: OPERATOR,
      from: OWNER,
      tokenId: 1,
      amount: 2,
      data: '0x1234',
    })
    assert.equal(erc1155Receiver.request.functionName, 'onERC1155Received')
    assert.deepEqual(erc1155Receiver.request.args, [
      OPERATOR,
      OWNER,
      1n,
      2n,
      '0x1234',
    ])

    const erc1155BatchReceiver = stash.prepareOnERC1155BatchReceived({
      operator: OPERATOR,
      from: OWNER,
      tokenIds: [1, 2],
      amounts: [3, 4],
    })
    assert.equal(
      erc1155BatchReceiver.request.functionName,
      'onERC1155BatchReceived',
    )
    assert.deepEqual(erc1155BatchReceiver.request.args, [
      OPERATOR,
      OWNER,
      [1n, 2n],
      [3n, 4n],
      '0x',
    ])

    assert.throws(
      () =>
        stash.prepareOnERC1155BatchReceived({
          operator: OPERATOR,
          from: OWNER,
          tokenIds: [1],
          amounts: [],
        }),
      /tokenIds and amounts must have the same length/,
    )
    assert.throws(
      () =>
        stash.preparePlaceOrder({
          pricePerUnit: 10n,
          numberOfUnits: 1,
          valueWei: -1n,
        }),
      /valueWei must be a non-negative bigint/,
    )
    assert.throws(
      () =>
        stash.prepareWithdrawERC721({
          token: CRYPTOPUNKS_721_ADDRESS,
          tokenIds: [-1],
        }),
      /tokenIds\[0\] must be an unsigned 256-bit integer/,
    )
    assert.throws(
      () =>
        stash.prepareProcessPunkBid({
          punkId: 123,
          signature: '0x1234',
          bid: {
            ...makeBid(),
            bidNonce: -1n,
          },
        }),
      /bidNonce must be an unsigned 256-bit integer/,
    )
  })

  it('forwards wallet accounts for Stash writes and typed-data signing', async () => {
    const calls = []
    const signatures = []
    const stash = createStashClient({
      address: STASH,
      walletClient: {
        account: { address: OWNER },
        writeContract: async (request) => {
          calls.push(request)
          return '0x1234'
        },
        signTypedData: async (request) => {
          signatures.push(request)
          return '0xabcd'
        },
      },
    })

    assert.equal(
      await stash.onERC721Received({
        operator: OPERATOR,
        from: OWNER,
        tokenId: 123,
      }),
      '0x1234',
    )
    assert.equal(calls[0].account, OWNER)
    assert.equal(calls[0].functionName, 'onERC721Received')

    const bid = makeBid()
    assert.equal(await stash.signPunkBid({ bid }), '0xabcd')
    assert.equal(signatures[0].account, OWNER)
    assert.deepEqual(signatures[0].domain, {
      chainId: 1,
      verifyingContract: STASH,
    })
    assert.equal(signatures[0].primaryType, 'PunkBid')
  })

  it('matches the Stash Solidity EIP-712 PunkBid domain, types, and digest', () => {
    const bid = makeBid()
    const typedData = stashPunkBidTypedData({
      stash: STASH,
      bid,
    })

    assert.deepEqual(typedData.domain, {
      chainId: 1,
      verifyingContract: STASH,
    })
    assert.deepEqual(typedData.types.Order, [
      { name: 'numberOfUnits', type: 'uint16' },
      { name: 'pricePerUnit', type: 'uint80' },
      { name: 'auction', type: 'address' },
    ])
    assert.deepEqual(typedData.types.PunkBid, [
      { name: 'order', type: 'Order' },
      { name: 'accountNonce', type: 'uint256' },
      { name: 'bidNonce', type: 'uint256' },
      { name: 'expiration', type: 'uint256' },
      { name: 'root', type: 'bytes32' },
    ])
    assert.equal(hashTypedData(typedData), manualStashPunkBidDigest(bid))
  })

  it('keeps admin-only helpers off the user-facing SDK clients', () => {
    const punks = createPunksSdk({ addresses: { stash: STASH } })
    const stash = punks.stash.at(STASH)
    assert.deepEqual(
      {
        factoryAddVersion: punks.stash.factory.addVersion,
        stashInitialize: stash.initialize,
        legacyPause: punks.wrappers.legacy.pause,
      },
      {
        factoryAddVersion: undefined,
        stashInitialize: undefined,
        legacyPause: undefined,
      },
    )
  })

  it('rejects zero or undeployed Stash owner lookups clearly', async () => {
    const punks = createPunksSdk({
      publicClient: {
        readContract: async ({ functionName }) => {
          if (functionName === 'stashAddressFor') return ZERO_ADDRESS
          if (functionName === 'ownerHasDeployed') return false
          throw new Error(`unhandled ${functionName}`)
        },
      },
    })

    await assert.rejects(
      () => punks.stash.forOwner(OWNER),
      /Stash is not deployed for owner/,
    )
    assert.throws(
      () => createStashClient({ address: ZERO_ADDRESS }),
      /Stash address must not be the zero address/,
    )
  })

  it('prepares one-transaction create-lot-and-settle auction writes', () => {
    const punks = createPunksSdk({ addresses: { auction: AUCTION } })

    const accept = punks.auctions.prepareCreateLotAndAcceptOffer({
      items: [{ punkId: 4156 }],
      offerId: 7,
      minAmountWei: 50n,
    })
    assert.equal(accept.request.address, AUCTION)
    assert.equal(accept.request.functionName, 'createLotAndAcceptOffer')
    assert.equal(accept.request.args.length, 3)
    assert.equal(accept.request.args[0].length, 1)
    assert.equal(accept.request.args[0][0].punkId, 4156)
    assert.equal(accept.request.args[0][0].weightBps, 10_000)
    assert.equal(accept.request.args[1], 7n)
    assert.equal(accept.request.args[2], 50n)

    // The offers facade exposes the same helper alongside acceptFromLot.
    const facadeAccept = punks.offers.prepareCreateLotAndAccept({
      items: [{ punkId: 4156 }],
      offerId: 7,
      minAmountWei: 50n,
    })
    assert.deepEqual(facadeAccept.request, accept.request)

    const startAuction = punks.auctions.prepareCreateLotAndStartAuction({
      items: [
        { punkId: 4156, standard: 'cryptopunks-v1', weightBps: 500 },
        { punkId: 4156, standard: 'cryptopunks', weightBps: 9500 },
      ],
      offerId: 9n,
      minAmountWei: 0n,
    })
    assert.equal(startAuction.request.functionName, 'createLotAndStartAuction')
    assert.equal(startAuction.request.args[0].length, 2)
    assert.equal(startAuction.request.args[0][0].weightBps, 500)
    assert.equal(startAuction.request.args[0][1].weightBps, 9500)
    assert.equal(startAuction.request.args[1], 9n)
    assert.equal(startAuction.request.args[2], 0n)

    assert.throws(
      () =>
        punks.auctions.prepareCreateLotAndAcceptOffer({
          items: [{ punkId: 4156 }],
          offerId: 7,
          minAmountWei: -1n,
        }),
      /minAmountWei must be a non-negative bigint/,
    )
    assert.throws(
      () =>
        punks.auctions.prepareCreateLotAndAcceptOffer({
          items: [],
          offerId: 7,
          minAmountWei: 50n,
        }),
      /lot must contain at least one item/,
    )
  })
})

function fakeRead({ address, functionName, args = [] }) {
  if (address === CRYPTOPUNKS_MARKET_ADDRESS) {
    switch (functionName) {
      case 'name':
        return 'CryptoPunks'
      case 'pendingWithdrawals':
        assert.equal(args[0], OWNER)
        return 55n
      case 'punkIndexToAddress':
        return OWNER
      default:
        throw new Error(`unhandled market read ${functionName}`)
    }
  }

  if (address === '0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2') {
    assert.deepEqual(args, [123])
    if (functionName === 'punkImageSvg') return '<svg />'
    if (functionName === 'punkAttributes') return 'Hoodie, Smile'
    throw new Error(`unhandled legacy data read ${functionName}`)
  }

  if (address === CRYPTOPUNKS_721_ADDRESS) {
    switch (functionName) {
      case 'punkProxyForUser':
        assert.equal(args[0], OWNER)
        return STASH
      case 'getApproved':
        return OPERATOR
      case 'isApprovedForAll':
        return false
      default:
        throw new Error(`unhandled c721 read ${functionName}`)
    }
  }

  if (address === WRAPPED_PUNKS_ADDRESS) {
    switch (functionName) {
      case 'proxyInfo':
        assert.equal(args[0], OWNER)
        return PROXY
      case 'getApproved':
        return ZERO_ADDRESS
      case 'isApprovedForAll':
        return true
      default:
        throw new Error(`unhandled legacy wrapper read ${functionName}`)
    }
  }

  if (address === STASH_FACTORY_ADDRESS) {
    switch (functionName) {
      case 'stashAddressFor':
        assert.equal(args[0], OWNER)
        return STASH
      case 'ownerHasDeployed':
        assert.equal(args[0], OWNER)
        return true
      default:
        throw new Error(`unhandled stash factory read ${functionName}`)
    }
  }

  if (address === STASH) {
    switch (functionName) {
      case 'availableLiquidity':
        return args[0] === ZERO_ADDRESS ? 100n : 75n
      case 'availableLiquidityWETHAndETH':
        return 175n
      case 'getOrder':
        assert.equal(args[0], AUCTION)
        return [2, 10n, AUCTION]
      default:
        throw new Error(`unhandled stash read ${functionName}`)
    }
  }

  throw new Error(`unhandled address ${address}`)
}

function makeBid() {
  return {
    order: {
      numberOfUnits: 2,
      pricePerUnit: 10n,
      auction: CRYPTOPUNKS_MARKET_ADDRESS,
    },
    accountNonce: 1n,
    bidNonce: 2n,
    expiration: 3n,
    root: ZERO_BYTES32,
  }
}

function manualStashPunkBidDigest(bid) {
  const domainTypeHash = keccak256(
    stringToHex('EIP712Domain(uint256 chainId,address verifyingContract)'),
  )
  const orderTypeHash = keccak256(
    stringToHex(
      'Order(uint16 numberOfUnits,uint80 pricePerUnit,address auction)',
    ),
  )
  const punkBidTypeHash = keccak256(
    stringToHex(
      'PunkBid(Order order,uint256 accountNonce,uint256 bidNonce,uint256 expiration,bytes32 root)Order(uint16 numberOfUnits,uint80 pricePerUnit,address auction)',
    ),
  )
  const orderHash = keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32,uint16,uint80,address'), [
      orderTypeHash,
      bid.order.numberOfUnits,
      bid.order.pricePerUnit,
      bid.order.auction,
    ]),
  )
  const structHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32,bytes32,uint256,uint256,uint256,bytes32'),
      [
        punkBidTypeHash,
        orderHash,
        bid.accountNonce,
        bid.bidNonce,
        bid.expiration,
        bid.root,
      ],
    ),
  )
  const domainHash = keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32,uint256,address'), [
      domainTypeHash,
      1n,
      STASH,
    ]),
  )

  return keccak256(concatHex(['0x1901', domainHash, structHash]))
}
