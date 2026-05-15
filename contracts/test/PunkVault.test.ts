import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { network } from 'hardhat'
import {
  encodeFunctionData,
  getAddress,
  hashMessage,
  hashTypedData,
  keccak256,
  parseEther,
  toBytes,
  toPrefixedMessage,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { wrapTypedDataSignature } from 'viem/experimental/erc7739'

const STASH_FACTORY = '0x000000000000A6fA31F5fC51c1640aAc76866750' as const
const CRYPTOPUNKS = '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB' as const
const ERC1271_MAGIC = '0x1626ba7e'
const ERC1271_INVALID = '0xffffffff'
const ERC7739_MAGIC = '0x77390001'
const ERC7739_DETECTION_HASH =
  '0x7739773977397739773977397739773977397739773977397739773977397739' as const
const PUNK_VAULT_DOMAIN_NAME = 'PunkVault'
const PUNK_VAULT_DOMAIN_VERSION = '1'

const callTargetAbi = [
  {
    type: 'function',
    name: 'record',
    inputs: [{ name: 'data', type: 'bytes' }],
    outputs: [{ type: 'bytes' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'setStored',
    inputs: [{ name: 'value', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'revertWith',
    inputs: [{ name: 'data', type: 'bytes' }],
    outputs: [],
    stateMutability: 'pure',
  },
] as const

const vaultAbi = [
  {
    type: 'function',
    name: 'isValidSignature',
    inputs: [
      { name: 'hash', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [{ type: 'bytes4' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'execute',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [{ type: 'bytes' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'eip712Domain',
    inputs: [],
    outputs: [
      { name: 'fields', type: 'bytes1' },
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
      { name: 'salt', type: 'bytes32' },
      { name: 'extensions', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'onERC721Received',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'from', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [{ type: 'bytes4' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'onERC1155Received',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'from', type: 'address' },
      { name: 'id', type: 'uint256' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [{ type: 'bytes4' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'onERC1155BatchReceived',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'from', type: 'address' },
      { name: 'ids', type: 'uint256[]' },
      { name: 'values', type: 'uint256[]' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [{ type: 'bytes4' }],
    stateMutability: 'nonpayable',
  },
] as const

type Ctx = Awaited<ReturnType<typeof deployVaultFixture>>

function lc(value: string): string {
  return value.toLowerCase()
}

async function deployVaultFixture() {
  const connection: any = await network.create()
  const { viem } = connection
  const [deployer, owner, operator, buyer, seller, other, attacker] =
    await viem.getWalletClients()

  const punks = await viem.deployContract('MockCryptoPunksMarket')
  const punksV1 = await viem.deployContract('MockCryptoPunksMarketV1Buggy')
  const vaultFactory = await viem.deployContract('PunkVaultFactory')
  const factoryAsOwner = await viem.getContractAt(
    'PunkVaultFactory',
    vaultFactory.address,
    { client: { wallet: owner } },
  )

  const vaultAddress = (await vaultFactory.read.predictVault([
    owner.account.address,
  ])) as Address
  await factoryAsOwner.write.ensureMyVault([[]])

  const vault = await viem.getContractAt('PunkVault', vaultAddress)
  const vaultAsOwner = await viem.getContractAt('PunkVault', vaultAddress, {
    client: { wallet: owner },
  })
  const vaultAsOperator = await viem.getContractAt('PunkVault', vaultAddress, {
    client: { wallet: operator },
  })
  const vaultAsAttacker = await viem.getContractAt('PunkVault', vaultAddress, {
    client: { wallet: attacker },
  })

  return {
    connection,
    viem,
    deployer,
    owner,
    operator,
    buyer,
    seller,
    other,
    attacker,
    punks,
    punksV1,
    vaultFactory,
    factoryAsOwner,
    vaultAddress,
    vault,
    vaultAsOwner,
    vaultAsOperator,
    vaultAsAttacker,
  }
}

async function depositPunk(ctx: Ctx, punkId: bigint) {
  await ctx.punks.write.setInitialOwner([ctx.owner.account.address, punkId])
  const punksAsOwner = await ctx.viem.getContractAt(
    'MockCryptoPunksMarket',
    ctx.punks.address,
    { client: { wallet: ctx.owner } },
  )
  await punksAsOwner.write.transferPunk([ctx.vaultAddress, punkId])
}

async function depositCanonicalPunk(ctx: Ctx, punkId: bigint) {
  const publicClient = await ctx.viem.getPublicClient()
  const code = await publicClient.getCode({ address: ctx.punks.address })
  await ctx.connection.networkHelpers.setCode(CRYPTOPUNKS, code)
  const canonicalPunks = await ctx.viem.getContractAt(
    'MockCryptoPunksMarket',
    CRYPTOPUNKS,
  )
  await canonicalPunks.write.setInitialOwner([ctx.owner.account.address, punkId])
  const canonicalPunksAsOwner = await ctx.viem.getContractAt(
    'MockCryptoPunksMarket',
    CRYPTOPUNKS,
    { client: { wallet: ctx.owner } },
  )
  await canonicalPunksAsOwner.write.transferPunk([ctx.vaultAddress, punkId])
  return canonicalPunks
}

async function depositV1Punk(ctx: Ctx, punkId: bigint) {
  await ctx.punksV1.write.setInitialOwner([ctx.owner.account.address, punkId])
  const punksAsOwner = await ctx.viem.getContractAt(
    'MockCryptoPunksMarketV1Buggy',
    ctx.punksV1.address,
    { client: { wallet: ctx.owner } },
  )
  await punksAsOwner.write.transferPunk([ctx.vaultAddress, punkId])
}

async function sendEth(ctx: Ctx, to: Address, value: bigint) {
  const publicClient = await ctx.viem.getPublicClient()
  const hash = await ctx.other.sendTransaction({ to, value })
  await publicClient.waitForTransactionReceipt({ hash })
}

async function assertInvalidOrReverts(check: Promise<unknown>) {
  try {
    assert.equal(await check, ERC1271_INVALID)
  } catch (err) {
    assert.match((err as Error).message, /invalid opcode|reverted/)
  }
}

describe('PunkVault', () => {
  describe('factory and identity', () => {
    it('deploys deterministic user-owned clones idempotently', async () => {
      const connection: any = await network.create()
      const { viem } = connection
      const [, owner, other] = await viem.getWalletClients()
      const vaultFactory = await viem.deployContract('PunkVaultFactory')

      const predicted = (await vaultFactory.read.predictVault([
        owner.account.address,
      ])) as Address
      const factoryAsOther = await viem.getContractAt(
        'PunkVaultFactory',
        vaultFactory.address,
        { client: { wallet: other } },
      )

      await factoryAsOther.write.ensureVault([owner.account.address])
      const publicClient = await viem.getPublicClient()
      const code = await publicClient.getCode({ address: predicted })
      assert.ok(code && code !== '0x')

      const vault = await viem.getContractAt('PunkVault', predicted)
      assert.equal(lc(await vault.read.owner() as string), lc(owner.account.address))
      assert.equal(lc(await vault.read.FACTORY() as string), lc(vaultFactory.address))

      await factoryAsOther.write.ensureVault([owner.account.address])
      assert.equal(
        lc(await vaultFactory.read.predictVault([owner.account.address]) as string),
        lc(predicted),
      )
    })

    it('rejects zero-address factory inputs and leaves implementation owner unset', async () => {
      const ctx = await deployVaultFixture()
      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultFactory.write.ensureVault([zeroAddress]),
        ctx.vaultFactory,
        'ZeroAddress',
      )

      const implAddress = (await ctx.vaultFactory.read.IMPLEMENTATION()) as Address
      const impl = await ctx.viem.getContractAt('PunkVault', implAddress)
      assert.equal(lc(await impl.read.owner() as string), lc(zeroAddress))
    })
  })

  describe('factory initialization', () => {
    it('pre-approves operators at deploy and additively approves later', async () => {
      const connection: any = await network.create()
      const { viem } = connection
      const [, owner, operator, other, attacker] = await viem.getWalletClients()
      const vaultFactory = await viem.deployContract('PunkVaultFactory')
      const factoryAsOwner = await viem.getContractAt(
        'PunkVaultFactory',
        vaultFactory.address,
        { client: { wallet: owner } },
      )

      await factoryAsOwner.write.ensureMyVault([
        [operator.account.address, other.account.address],
      ])
      const vaultAddress = (await vaultFactory.read.predictVault([
        owner.account.address,
      ])) as Address
      const vault = await viem.getContractAt('PunkVault', vaultAddress)

      assert.equal(await vault.read.isOperator([operator.account.address]), true)
      assert.equal(await vault.read.isOperator([other.account.address]), true)
      assert.equal(await vault.read.isOperator([attacker.account.address]), false)

      await factoryAsOwner.write.ensureMyVault([[attacker.account.address]])
      assert.equal(await vault.read.isOperator([attacker.account.address]), true)
    })

    it('allows ensureMyVault to add operators after empty initialization', async () => {
      const ctx = await deployVaultFixture()
      assert.equal(await ctx.vault.read.isOperator([ctx.operator.account.address]), false)

      await ctx.factoryAsOwner.write.ensureMyVault([[ctx.operator.account.address]])
      assert.equal(await ctx.vault.read.isOperator([ctx.operator.account.address]), true)
    })

    it('lets the owner approve operators after third-party deployment', async () => {
      const connection: any = await network.create()
      const { viem } = connection
      const [, owner, operator, other] = await viem.getWalletClients()
      const vaultFactory = await viem.deployContract('PunkVaultFactory')
      const factoryAsOther = await viem.getContractAt(
        'PunkVaultFactory',
        vaultFactory.address,
        { client: { wallet: other } },
      )
      const factoryAsOwner = await viem.getContractAt(
        'PunkVaultFactory',
        vaultFactory.address,
        { client: { wallet: owner } },
      )

      await factoryAsOther.write.ensureVault([owner.account.address])
      const vaultAddress = (await vaultFactory.read.predictVault([
        owner.account.address,
      ])) as Address
      const vault = await viem.getContractAt('PunkVault', vaultAddress)
      assert.equal(await vault.read.isOperator([operator.account.address]), false)

      await factoryAsOwner.write.ensureMyVault([[operator.account.address]])
      assert.equal(await vault.read.isOperator([operator.account.address]), true)
    })

    it('rejects zero factory operators and direct non-factory setup', async () => {
      const connection: any = await network.create()
      const { viem } = connection
      const [, owner] = await viem.getWalletClients()
      const vaultFactory = await viem.deployContract('PunkVaultFactory')
      const factoryAsOwner = await viem.getContractAt(
        'PunkVaultFactory',
        vaultFactory.address,
        { client: { wallet: owner } },
      )

      await assert.rejects(factoryAsOwner.write.ensureMyVault([[zeroAddress]]), /ZeroAddress/)
      await factoryAsOwner.write.ensureMyVault([[]])
      const vaultAddress = (await vaultFactory.read.predictVault([
        owner.account.address,
      ])) as Address
      const vaultAsOwner = await viem.getContractAt('PunkVault', vaultAddress, {
        client: { wallet: owner },
      })
      await viem.assertions.revertWithCustomError(
        vaultAsOwner.write.factoryInitialize([
          owner.account.address,
          [owner.account.address],
        ]),
        vaultAsOwner,
        'NotFactory',
      )
      await viem.assertions.revertWithCustomError(
        vaultAsOwner.write.factoryApproveOperators([
          owner.account.address,
          [owner.account.address],
        ]),
        vaultAsOwner,
        'NotFactory',
      )
      await viem.assertions.revertWithCustomError(
        factoryAsOwner.write.ensureMyVault([[zeroAddress]]),
        vaultAsOwner,
        'ZeroAddress',
      )
    })
  })

  describe('operator role', () => {
    it('restricts setOperator to the owner and rejects the zero address', async () => {
      const ctx = await deployVaultFixture()
      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultAsAttacker.write.setOperator([
          ctx.attacker.account.address,
          true,
        ]),
        ctx.vaultAsAttacker,
        'NotOwner',
      )
      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultAsOwner.write.setOperator([zeroAddress, true]),
        ctx.vaultAsOwner,
        'ZeroAddress',
      )

      await ctx.vaultAsOwner.write.setOperator([ctx.operator.account.address, true])
      assert.equal(await ctx.vault.read.isOperator([ctx.operator.account.address]), true)
      await ctx.vaultAsOwner.write.setOperator([ctx.operator.account.address, false])
      assert.equal(await ctx.vault.read.isOperator([ctx.operator.account.address]), false)
    })
  })

  describe('movement and listing surface', () => {
    it('allows owner and operator transfers', async () => {
      const ctx = await deployVaultFixture()
      await depositPunk(ctx, 21n)
      await depositPunk(ctx, 23n)

      await ctx.vaultAsOwner.write.transferPunk([
        ctx.punks.address,
        21n,
        ctx.owner.account.address,
      ])
      assert.equal(
        lc(await ctx.punks.read.punkIndexToAddress([21n]) as string),
        lc(ctx.owner.account.address),
      )

      await ctx.vaultAsOwner.write.setOperator([ctx.operator.account.address, true])
      await ctx.vaultAsOperator.write.transferPunk([
        ctx.punks.address,
        23n,
        ctx.other.account.address,
      ])
      assert.equal(
        lc(await ctx.punks.read.punkIndexToAddress([23n]) as string),
        lc(ctx.other.account.address),
      )
    })

    it('routes offerPunkForSale and punkNoLongerForSale through operator auth', async () => {
      const ctx = await deployVaultFixture()
      await depositPunk(ctx, 31n)
      await ctx.vaultAsOwner.write.setOperator([ctx.operator.account.address, true])

      await ctx.vaultAsOperator.write.offerPunkForSale([ctx.punks.address, 31n, 123n])
      let offer = await ctx.punks.read.punksOfferedForSale([31n]) as any
      assert.equal(offer[0], true)
      assert.equal(offer[3], 123n)

      await ctx.vaultAsOperator.write.punkNoLongerForSale([ctx.punks.address, 31n])
      offer = await ctx.punks.read.punksOfferedForSale([31n]) as any
      assert.equal(offer[0], false)
    })

    it('supports directed sales and acceptBidForPunk by operator', async () => {
      const ctx = await deployVaultFixture()
      await depositPunk(ctx, 41n)
      await depositV1Punk(ctx, 42n)
      const bid = parseEther('1')

      await ctx.vaultAsOwner.write.setOperator([ctx.operator.account.address, true])
      await ctx.vaultAsOperator.write.offerPunkForSaleToAddress([
        ctx.punks.address,
        41n,
        bid,
        ctx.buyer.account.address,
      ])
      const offer = await ctx.punks.read.punksOfferedForSale([41n]) as any
      assert.equal(offer[0], true)
      assert.equal(lc(offer[4]), lc(ctx.buyer.account.address))

      const punksAsBuyer = await ctx.viem.getContractAt(
        'MockCryptoPunksMarketV1Buggy',
        ctx.punksV1.address,
        { client: { wallet: ctx.buyer } },
      )
      await punksAsBuyer.write.enterBidForPunk([42n], { value: bid })
      await ctx.vaultAsOperator.write.acceptBidForPunk([ctx.punksV1.address, 42n, bid])

      assert.equal(
        lc(await ctx.punksV1.read.punkIndexToAddress([42n]) as string),
        lc(ctx.buyer.account.address),
      )
      assert.equal(await ctx.punksV1.read.pendingWithdrawals([ctx.vaultAddress]), bid)
    })

    it('rejects unauthorized movement and listing calls', async () => {
      const ctx = await deployVaultFixture()
      await depositPunk(ctx, 51n)

      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultAsAttacker.write.transferPunk([
          ctx.punks.address,
          51n,
          ctx.attacker.account.address,
        ]),
        ctx.vaultAsAttacker,
        'NotAuthorized',
      )
      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultAsAttacker.write.offerPunkForSale([ctx.punks.address, 51n, 1n]),
        ctx.vaultAsAttacker,
        'NotAuthorized',
      )
    })
  })

  describe('spending surface', () => {
    it('lets owner or operator buy a Punk from vault funds and inline ETH', async () => {
      const ctx = await deployVaultFixture()
      const price = parseEther('1')
      const retained = parseEther('0.1')

      await ctx.punks.write.setInitialOwner([ctx.seller.account.address, 61n])
      const punksAsSeller = await ctx.viem.getContractAt(
        'MockCryptoPunksMarket',
        ctx.punks.address,
        { client: { wallet: ctx.seller } },
      )
      await punksAsSeller.write.offerPunkForSale([61n, price])
      await sendEth(ctx, ctx.vaultAddress, parseEther('0.4'))

      await ctx.vaultAsOwner.write.setOperator([ctx.operator.account.address, true])
      await ctx.vaultAsOperator.write.buyPunk([ctx.punks.address, 61n, price], {
        value: parseEther('0.7'),
      })

      const publicClient = await ctx.viem.getPublicClient()
      assert.equal(
        lc(await ctx.punks.read.punkIndexToAddress([61n]) as string),
        lc(ctx.vaultAddress),
      )
      assert.equal(await ctx.punks.read.pendingWithdrawals([ctx.seller.account.address]), price)
      assert.equal(await publicClient.getBalance({ address: ctx.vaultAddress }), retained)
    })

    it('allows only owner or operator to enter and withdraw bids', async () => {
      const ctx = await deployVaultFixture()
      const bid = parseEther('0.5')
      await ctx.punks.write.setInitialOwner([ctx.seller.account.address, 71n])
      await sendEth(ctx, ctx.vaultAddress, parseEther('0.2'))
      await ctx.vaultAsOwner.write.setOperator([ctx.operator.account.address, true])

      await ctx.vaultAsOperator.write.enterBidForPunk([ctx.punks.address, 71n, bid], {
        value: parseEther('0.3'),
      })
      const storedBid = await ctx.punks.read.punkBids([71n]) as any
      assert.equal(storedBid[0], true)
      assert.equal(lc(storedBid[2]), lc(ctx.vaultAddress))
      assert.equal(storedBid[3], bid)

      await ctx.vaultAsOperator.write.withdrawBidForPunk([ctx.punks.address, 71n])
      const clearedBid = await ctx.punks.read.punkBids([71n]) as any
      assert.equal(clearedBid[0], false)
      const publicClient = await ctx.viem.getPublicClient()
      assert.equal(await publicClient.getBalance({ address: ctx.vaultAddress }), bid)
    })

    it('rejects buy/bid/withdrawBid from non-owner non-operator callers', async () => {
      const ctx = await deployVaultFixture()
      await ctx.punks.write.setInitialOwner([ctx.seller.account.address, 81n])

      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultAsAttacker.write.buyPunk([ctx.punks.address, 81n, 1n]),
        ctx.vaultAsAttacker,
        'NotAuthorized',
      )
      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultAsAttacker.write.enterBidForPunk([ctx.punks.address, 81n, 1n], {
          value: 1n,
        }),
        ctx.vaultAsAttacker,
        'NotAuthorized',
      )
      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultAsAttacker.write.withdrawBidForPunk([ctx.punks.address, 81n]),
        ctx.vaultAsAttacker,
        'NotAuthorized',
      )
    })

    it('credits a previous vault bid to pendingWithdrawals when outbid', async () => {
      const ctx = await deployVaultFixture()
      await ctx.punks.write.setInitialOwner([ctx.seller.account.address, 91n])
      await ctx.vaultAsOwner.write.enterBidForPunk([
        ctx.punks.address,
        91n,
        parseEther('1'),
      ], { value: parseEther('1') })

      const punksAsBuyer = await ctx.viem.getContractAt(
        'MockCryptoPunksMarket',
        ctx.punks.address,
        { client: { wallet: ctx.buyer } },
      )
      await punksAsBuyer.write.enterBidForPunk([91n], { value: parseEther('2') })
      assert.equal(
        await ctx.punks.read.pendingWithdrawals([ctx.vaultAddress]),
        parseEther('1'),
      )
    })
  })

  describe('proceeds', () => {
    it('allows owner or operator to withdraw market proceeds and forwards only newly withdrawn ETH', async () => {
      const ctx = await deployVaultFixture()
      await depositPunk(ctx, 101n)
      const price = parseEther('1')
      const retained = parseEther('0.123')

      await ctx.vaultAsOwner.write.offerPunkForSaleToAddress([
        ctx.punks.address,
        101n,
        price,
        ctx.buyer.account.address,
      ])
      const punksAsBuyer = await ctx.viem.getContractAt(
        'MockCryptoPunksMarket',
        ctx.punks.address,
        { client: { wallet: ctx.buyer } },
      )
      await punksAsBuyer.write.buyPunk([101n], { value: price })
      await sendEth(ctx, ctx.vaultAddress, retained)

      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultAsAttacker.write.withdrawFromMarket([ctx.punks.address]),
        ctx.vaultAsAttacker,
        'NotAuthorized',
      )
      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultAsAttacker.write.withdrawFromMarketTo([
          ctx.punks.address,
          ctx.attacker.account.address,
        ]),
        ctx.vaultAsAttacker,
        'NotAuthorized',
      )
      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultAsOwner.write.withdrawFromMarketTo([ctx.punks.address, zeroAddress]),
        ctx.vaultAsOwner,
        'ZeroAddress',
      )

      const publicClient = await ctx.viem.getPublicClient()
      const recipientBefore = await publicClient.getBalance({
        address: ctx.other.account.address,
      })
      await ctx.vaultAsOwner.write.setOperator([ctx.operator.account.address, true])
      await ctx.vaultAsOperator.write.withdrawFromMarketTo([
        ctx.punks.address,
        ctx.other.account.address,
      ])
      assert.equal(await publicClient.getBalance({ address: ctx.vaultAddress }), retained)
      assert.equal(
        await publicClient.getBalance({ address: ctx.other.account.address })
          - recipientBefore,
        price,
      )
    })

    it('reverts withdrawFromMarketTo when the recipient rejects ETH', async () => {
      const ctx = await deployVaultFixture()
      await depositPunk(ctx, 111n)
      const price = parseEther('1')
      const reject = await ctx.viem.deployContract('RejectEther')

      await ctx.vaultAsOwner.write.offerPunkForSaleToAddress([
        ctx.punks.address,
        111n,
        price,
        ctx.buyer.account.address,
      ])
      const punksAsBuyer = await ctx.viem.getContractAt(
        'MockCryptoPunksMarket',
        ctx.punks.address,
        { client: { wallet: ctx.buyer } },
      )
      await punksAsBuyer.write.buyPunk([111n], { value: price })

      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultAsOwner.write.withdrawFromMarketTo([ctx.punks.address, reject.address]),
        ctx.vaultAsOwner,
        'ExecutionFailed',
      )
      assert.equal(await ctx.punks.read.pendingWithdrawals([ctx.vaultAddress]), price)
    })
  })

  describe('generic execution', () => {
    it('executes owner calls with value, returndata simulation, and retained surplus ETH', async () => {
      const ctx = await deployVaultFixture()
      const target = await ctx.viem.deployContract('MockCallTarget')
      const publicClient = await ctx.viem.getPublicClient()
      const data = encodeFunctionData({
        abi: callTargetAbi,
        functionName: 'record',
        args: ['0x1234'],
      })
      const value = parseEther('0.2')

      const simulation = await publicClient.simulateContract({
        address: ctx.vaultAddress,
        abi: vaultAbi,
        functionName: 'execute',
        account: ctx.owner.account.address,
        args: [target.address, value, data],
        value,
      })
      assert.ok((simulation.result as Hex).startsWith('0x'))

      await ctx.vaultAsOwner.write.execute([target.address, value, data], {
        value: value + parseEther('0.1'),
      })
      assert.equal(lc(await target.read.lastSender() as string), lc(ctx.vaultAddress))
      assert.equal(await target.read.lastValue(), value)
      assert.equal(await target.read.lastData(), '0x1234')
      assert.equal(await publicClient.getBalance({ address: ctx.vaultAddress }), parseEther('0.1'))
    })

    it('executes batches atomically and rejects non-owner execution', async () => {
      const ctx = await deployVaultFixture()
      const target = await ctx.viem.deployContract('MockCallTarget')
      const setOne = encodeFunctionData({
        abi: callTargetAbi,
        functionName: 'setStored',
        args: [1n],
      })
      const setTwo = encodeFunctionData({
        abi: callTargetAbi,
        functionName: 'setStored',
        args: [2n],
      })
      const revertData = encodeFunctionData({
        abi: callTargetAbi,
        functionName: 'revertWith',
        args: ['0xbeef'],
      })

      await ctx.vaultAsOwner.write.executeBatch([
        [
          { target: target.address, value: 0n, data: setOne },
          { target: target.address, value: 0n, data: setTwo },
        ],
      ])
      assert.equal(await target.read.stored(), 2n)

      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultAsAttacker.write.execute([target.address, 0n, setOne]),
        ctx.vaultAsAttacker,
        'NotOwner',
      )
      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultAsOwner.write.executeBatch([
          [
            { target: target.address, value: 0n, data: setOne },
            { target: target.address, value: 0n, data: revertData },
          ],
        ]),
        ctx.vaultAsOwner,
        'ExecutionFailed',
      )
      assert.equal(await target.read.stored(), 2n)
    })
  })

  describe('receivers and ERC-1271', () => {
    it('returns receiver selectors', async () => {
      const ctx = await deployVaultFixture()
      const publicClient = await ctx.viem.getPublicClient()
      assert.equal(
        await publicClient.readContract({
          address: ctx.vault.address,
          abi: vaultAbi,
          functionName: 'onERC721Received',
          args: [ctx.owner.account.address, ctx.owner.account.address, 1n, '0x'],
        }),
        '0x150b7a02',
      )
      assert.equal(
        await publicClient.readContract({
          address: ctx.vault.address,
          abi: vaultAbi,
          functionName: 'onERC1155Received',
          args: [
            ctx.owner.account.address,
            ctx.owner.account.address,
            1n,
            1n,
            '0x',
          ],
        }),
        '0xf23a6e61',
      )
      assert.equal(
        await publicClient.readContract({
          address: ctx.vault.address,
          abi: vaultAbi,
          functionName: 'onERC1155BatchReceived',
          args: [
            ctx.owner.account.address,
            ctx.owner.account.address,
            [1n],
            [1n],
            '0x',
          ],
        }),
        '0xbc197c81',
      )

    })

    it('advertises ERC-7739 and exposes the vault EIP-712 domain', async () => {
      const ctx = await deployVaultFixture()
      const publicClient = await ctx.viem.getPublicClient()
      const chainId = await publicClient.getChainId()

      assert.equal(
        await publicClient.readContract({
          address: ctx.vault.address,
          abi: vaultAbi,
          functionName: 'isValidSignature',
          args: [ERC7739_DETECTION_HASH, '0x'],
        }),
        ERC7739_MAGIC,
      )

      const [
        fields,
        name,
        version,
        domainChainId,
        verifyingContract,
        salt,
        extensions,
      ] = await ctx.vault.read.eip712Domain()
      assert.equal(fields, '0x0f')
      assert.equal(name, PUNK_VAULT_DOMAIN_NAME)
      assert.equal(version, PUNK_VAULT_DOMAIN_VERSION)
      assert.equal(domainChainId, BigInt(chainId))
      assert.equal(lc(verifyingContract), lc(ctx.vault.address))
      assert.equal(salt, zeroHash)
      assert.deepEqual(extensions, [])
    })

    it('does not add a vault-specific raw EOA-signature fallback', async () => {
      const ctx = await deployVaultFixture()
      const signer = privateKeyToAccount(
        '0x59c6995e998f97a5a0044966f0945380531bc9e161a58aef6d2b73d3a5f1d5f5',
      )
      await ctx.vaultFactory.write.ensureVault([signer.address])
      const vaultAddress = (await ctx.vaultFactory.read.predictVault([
        signer.address,
      ])) as Address
      const publicClient = await ctx.viem.getPublicClient()
      const hash = keccak256(toBytes('punk vault eoa signature'))
      const signature = await signer.sign({ hash })

      await assertInvalidOrReverts(
        publicClient.readContract({
          address: vaultAddress,
          abi: vaultAbi,
          functionName: 'isValidSignature',
          args: [hash, signature],
        }),
      )
    })

    it('validates ERC-7739 personal-sign signatures for the initialized owner', async () => {
      const ctx = await deployVaultFixture()
      const signer = privateKeyToAccount(
        '0x59c6995e998f97a5a0044966f0945380531bc9e161a58aef6d2b73d3a5f1d5f5',
      )
      await ctx.vaultFactory.write.ensureVault([signer.address])
      const vaultAddress = (await ctx.vaultFactory.read.predictVault([
        signer.address,
      ])) as Address
      const publicClient = await ctx.viem.getPublicClient()
      const chainId = await publicClient.getChainId()
      const message = 'punk vault erc7739 personal'
      const hash = hashMessage(message)
      const signature = await signer.signTypedData({
        domain: {
          name: PUNK_VAULT_DOMAIN_NAME,
          version: PUNK_VAULT_DOMAIN_VERSION,
          chainId,
          verifyingContract: vaultAddress,
        },
        types: {
          PersonalSign: [{ name: 'prefixed', type: 'bytes' }],
        },
        primaryType: 'PersonalSign',
        message: {
          prefixed: toPrefixedMessage(message),
        },
      })

      assert.equal(
        await publicClient.readContract({
          address: vaultAddress,
          abi: vaultAbi,
          functionName: 'isValidSignature',
          args: [hash, signature],
        }),
        ERC1271_MAGIC,
      )

      const siblingFactory = await ctx.viem.deployContract('PunkVaultFactory')
      await siblingFactory.write.ensureVault([signer.address])
      const siblingVaultAddress = (await siblingFactory.read.predictVault([
        signer.address,
      ])) as Address
      assert.notEqual(lc(siblingVaultAddress), lc(vaultAddress))
      await assertInvalidOrReverts(
        publicClient.readContract({
          address: siblingVaultAddress,
          abi: vaultAbi,
          functionName: 'isValidSignature',
          args: [hash, signature],
        }),
      )
    })

    it('validates ERC-7739 typed-data signatures for the initialized owner', async () => {
      const ctx = await deployVaultFixture()
      const signer = privateKeyToAccount(
        '0x59c6995e998f97a5a0044966f0945380531bc9e161a58aef6d2b73d3a5f1d5f5',
      )
      await ctx.vaultFactory.write.ensureVault([signer.address])
      const vaultAddress = (await ctx.vaultFactory.read.predictVault([
        signer.address,
      ])) as Address
      const publicClient = await ctx.viem.getPublicClient()
      const chainId = await publicClient.getChainId()
      const domain = {
        name: 'Punk App',
        version: '1',
        chainId,
        verifyingContract: ctx.punks.address,
      } as const
      const types = {
        PunkIntent: [
          { name: 'buyer', type: 'address' },
          { name: 'punkIndex', type: 'uint256' },
        ],
      } as const
      const message = {
        buyer: ctx.buyer.account.address,
        punkIndex: 1001n,
      } as const
      const hash = hashTypedData({
        domain,
        types,
        primaryType: 'PunkIntent',
        message,
      })
      const signature = await signer.signTypedData({
        domain,
        types: {
          ...types,
          TypedDataSign: [
            { name: 'contents', type: 'PunkIntent' },
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
            { name: 'salt', type: 'bytes32' },
          ],
        },
        primaryType: 'TypedDataSign',
        message: {
          contents: message,
          name: PUNK_VAULT_DOMAIN_NAME,
          version: PUNK_VAULT_DOMAIN_VERSION,
          chainId,
          verifyingContract: vaultAddress,
          salt: zeroHash,
        },
      })
      const wrappedSignature = wrapTypedDataSignature({
        domain,
        types,
        primaryType: 'PunkIntent',
        message,
        signature,
      })

      assert.equal(
        await publicClient.readContract({
          address: vaultAddress,
          abi: vaultAbi,
          functionName: 'isValidSignature',
          args: [hash, wrappedSignature],
        }),
        ERC1271_MAGIC,
      )
    })

    it('forwards ERC-1271 checks when the owner is a contract account', async () => {
      const ctx = await deployVaultFixture()
      const owner1271 = await ctx.viem.deployContract('MockERC1271Owner')
      await ctx.vaultFactory.write.ensureVault([owner1271.address])
      const vaultAddress = (await ctx.vaultFactory.read.predictVault([
        owner1271.address,
      ])) as Address
      const publicClient = await ctx.viem.getPublicClient()
      const message = 'punk vault contract signature'
      const hash = hashMessage(message)
      const signature = '0x123456' as Hex
      const nestedHash = hashTypedData({
        domain: {
          name: PUNK_VAULT_DOMAIN_NAME,
          version: PUNK_VAULT_DOMAIN_VERSION,
          chainId: await publicClient.getChainId(),
          verifyingContract: vaultAddress,
        },
        types: {
          PersonalSign: [{ name: 'prefixed', type: 'bytes' }],
        },
        primaryType: 'PersonalSign',
        message: {
          prefixed: toPrefixedMessage(message),
        },
      })

      await owner1271.write.setValid([nestedHash, signature, true])
      assert.equal(
        await publicClient.readContract({
          address: vaultAddress,
          abi: vaultAbi,
          functionName: 'isValidSignature',
          args: [hash, signature],
        }),
        ERC1271_MAGIC,
      )
    })
  })

  describe('stash', () => {
    it('rejects unauthorized stash calls before touching StashFactory', async () => {
      const ctx = await deployVaultFixture()
      await ctx.viem.assertions.revertWithCustomError(
        ctx.vaultAsAttacker.write.stash([1n]),
        ctx.vaultAsAttacker,
        'NotAuthorized',
      )
    })

    it('uses the configured StashFactory', async () => {
      const ctx = await deployVaultFixture()
      const canonicalPunks = await depositCanonicalPunk(ctx, 121n)

      const mockStashFactory = await ctx.viem.deployContract('MockStashFactory')
      const publicClient = await ctx.viem.getPublicClient()
      const code = await publicClient.getCode({ address: mockStashFactory.address })
      await ctx.connection.networkHelpers.setCode(STASH_FACTORY, code)
      const stashFactory = await ctx.viem.getContractAt('MockStashFactory', STASH_FACTORY)
      const stashAddress = (await stashFactory.read.stashAddressFor([
        ctx.owner.account.address,
      ])) as Address

      await ctx.vaultAsOwner.write.stash([121n])

      assert.equal(
        lc(await canonicalPunks.read.punkIndexToAddress([121n]) as string),
        lc(stashAddress),
      )
      const stashCode = await publicClient.getCode({ address: stashAddress })
      assert.ok(stashCode && stashCode !== '0x')
    })
  })
})

const describeIfMainnetRpc = process.env.MAINNET_RPC_URL ? describe : describe.skip

describeIfMainnetRpc('PunkVault mainnet fork', () => {
  it('stashes a real Punk into the holder Stash on a fork', async () => {
    const connection: any = await network.create({
      network: 'hardhatMainnet',
      chainType: 'l1',
    })
    const { viem } = connection
    const publicClient = await viem.getPublicClient()
    const [deployer] = await viem.getWalletClients()

    const vaultFactory = await viem.deployContract('PunkVaultFactory')
    const punks = await viem.getContractAt('MockCryptoPunksMarket', CRYPTOPUNKS)
    const punkId = 0n
    const holder = getAddress(await punks.read.punkIndexToAddress([punkId]) as string)
    assert.notEqual(lc(holder), lc(zeroAddress))

    await connection.networkHelpers.impersonateAccount(holder)
    await connection.networkHelpers.setBalance(holder, parseEther('10'))
    const holderClient = await viem.getWalletClient(holder)
    const vaultAddress = (await vaultFactory.read.predictVault([holder])) as Address
    await vaultFactory.write.ensureVault([holder])

    const punksAsHolder = await viem.getContractAt('MockCryptoPunksMarket', CRYPTOPUNKS, {
      client: { wallet: holderClient },
    })
    await punksAsHolder.write.transferPunk([vaultAddress, punkId])

    const vaultAsHolder = await viem.getContractAt('PunkVault', vaultAddress, {
      client: { wallet: holderClient },
    })
    const stashFactory = await viem.getContractAt('MockStashFactory', STASH_FACTORY)
    const stashAddress = (await stashFactory.read.stashAddressFor([holder])) as Address

    await vaultAsHolder.write.stash([punkId])

    assert.equal(
      lc(await punks.read.punkIndexToAddress([punkId]) as string),
      lc(stashAddress),
    )
    const stashCode = await publicClient.getCode({ address: stashAddress })
    assert.ok(stashCode && stashCode !== '0x')
    await connection.networkHelpers.stopImpersonatingAccount(holder)
    assert.ok(deployer.account.address)
  })
})
