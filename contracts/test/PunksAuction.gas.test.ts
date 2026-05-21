import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { network } from 'hardhat'
import { getAddress, parseEther, zeroAddress } from 'viem'
import {
  DAY,
  lotItem,
  type LotItemInput,
  type OfferSlotInput,
  PUNKS_MARKET,
  punkSlot,
  VAULT_FACTORY,
} from './helpers/fixtures.js'

/**
 * Large-lot gas, measured against the real CryptoPunks market on a mainnet
 * fork and judged against the EIP-7825 per-transaction gas cap. The lot size
 * under test is `N` below.
 *
 * Since the Fusaka upgrade no single Ethereum transaction may use more than
 * 16,777,216 gas (EIP-7825), regardless of the block gas limit. That cap is
 * the binding ceiling for the auction's size-scaling transactions.
 *
 * The auction path splits work across two transactions: `openAuction` pulls
 * the punks into escrow, `settle` delivers them. The instant-accept paths do
 * not — `acceptOfferFromLot` pulls *and* delivers in one transaction, and
 * `createLotAndAcceptOffer` also creates the lot in that transaction. This
 * file measures all of them at N items and asserts each clears the cap.
 *
 * The fork runs at the `prague` hardfork: that matches mainnet's current gas
 * schedule (including the EIP-7623 calldata pricing) but omits EIP-7825, so a
 * transaction too large to land on mainnet still executes here and reports
 * its true gasUsed — which is then compared to the cap in JS.
 *
 * Requires MAINNET_RPC_URL. Heavy — each scenario moves N real punks by
 * impersonating their owners — so run it on its own:
 *
 *   npx hardhat test test/PunksAuction.gas.test.ts
 */

const N = 64 // Lot size under test. MAX_LOT_ITEMS caps a lot at 80.
const FIRST_PUNK = 1000 // First of N consecutive real punk indices used.
const TOTAL_WEIGHT_BPS = 10_000 // Lot item weights must sum to exactly this.

// EIP-7825 per-transaction gas cap, live on mainnet since Fusaka. A
// transaction that does not clear this cannot be mined at all — no matter the
// block gas limit — so any path that exceeds it is unusable at N items.
const TX_GAS_CAP = 16_777_216n
// Within this margin of a fixed, non-raisable cap a transaction is fragile:
// any future gas-cost increase tips it over.
const NEAR_CAP = (TX_GAS_CAP * 90n) / 100n

// Gas cap for measured calls: far above any plausible cost, far below the
// lifted block gas limit. `prague` means EIP-7825 is not enforced locally, so
// this is accepted even for over-cap transactions.
const MEASURE_GAS = 100_000_000n

const describeIfMainnetRpc = process.env.MAINNET_RPC_URL
  ? describe
  : describe.skip

const summary: Array<{ label: string; gas: bigint }> = []

// Per-item weights that sum to exactly TOTAL_WEIGHT_BPS for any N: the first
// `remainder` items each carry one extra bps.
function itemWeight(i: number): number {
  const base = Math.floor(TOTAL_WEIGHT_BPS / N)
  return i < TOTAL_WEIGHT_BPS - base * N ? base + 1 : base
}

function asPercent(gas: bigint): string {
  const tenths = (gas * 1_000n) / TX_GAS_CAP
  return `${tenths / 10n}.${tenths % 10n}%`
}

function logGas(label: string, gas: bigint): bigint {
  summary.push({ label, gas })
  const flag =
    gas >= TX_GAS_CAP
      ? '  ✗ OVER THE 16.78M TX CAP'
      : gas >= NEAR_CAP
        ? '  ⚠ near the cap'
        : ''
  console.log(
    `  [gas] ${label.padEnd(28)} ${gas
      .toLocaleString('en-US')
      .padStart(13)}   ${asPercent(gas).padStart(6)} of cap${flag}`,
  )
  return gas
}

async function gasOf(
  publicClient: any,
  label: string,
  hash: `0x${string}`,
): Promise<bigint> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  assert.equal(receipt.status, 'success', `${label} reverted`)
  return logGas(label, receipt.gasUsed as bigint)
}

// Forks mainnet and leaves the real Punk markets and the real ENS reverse
// registrar in place (the registrar's `setName` works fine on a fork —
// etching a mock over it breaks the factory/auction constructors). Only the
// vault factory, which is not yet deployed to mainnet, is etched at its
// hardcoded address. PunksData is never touched: offer slots match by
// includeIds, not criteria, so it is never called.
async function setupFork(): Promise<any> {
  const connection: any = await network.create({
    network: 'hardhatMainnet',
    chainType: 'l1',
    override: {
      // Lift the block gas limit so over-cap transactions still execute, and
      // pin `prague` so EIP-7825 is not enforced — see the file header.
      blockGasLimit: 200_000_000n,
      hardfork: 'prague',
    },
  })
  const { viem } = connection
  const publicClient = await viem.getPublicClient()
  const [, seller, offerer, bidder] = await viem.getWalletClients()

  // The vault factory bakes its own address into every clone, so etch it at
  // its canonical address and re-etch the implementation built for it — same
  // dance as the unit-test `deployAuctionStack`.
  const factoryDeploy = await viem.deployContract('PunksVaultFactory')
  const implAddress = (await factoryDeploy.read.IMPLEMENTATION()) as `0x${string}`
  await connection.networkHelpers.setCode(
    VAULT_FACTORY,
    await publicClient.getCode({ address: factoryDeploy.address }),
  )
  const canonicalImpl = await viem.deployContract('PunksVault', [VAULT_FACTORY])
  await connection.networkHelpers.setCode(
    implAddress,
    await publicClient.getCode({ address: canonicalImpl.address }),
  )

  const auctions = await viem.deployContract('PunksAuction')
  const escrow = (await auctions.read.ESCROW()) as `0x${string}`

  return { connection, viem, publicClient, seller, offerer, bidder, auctions, escrow }
}

// Deploys the seller's vault (auction pre-approved as operator) and moves N
// consecutive real punks into it by impersonating each current owner. This is
// the slow part of every scenario.
async function fundedSellerVault(ctx: any): Promise<`0x${string}`> {
  const { connection, viem, auctions, seller } = ctx

  const factoryAsSeller = await viem.getContractAt(
    'PunksVaultFactory',
    VAULT_FACTORY,
    { client: { wallet: seller } },
  )
  await factoryAsSeller.write.ensureMyVault([[auctions.address]])
  const vault = (await factoryAsSeller.read.predictVault([
    seller.account.address,
  ])) as `0x${string}`

  const punks = await viem.getContractAt('MockCryptoPunksMarket', PUNKS_MARKET)
  for (let i = 0; i < N; i++) {
    const punkId = BigInt(FIRST_PUNK + i)
    const owner = getAddress(
      (await punks.read.punkIndexToAddress([punkId])) as string,
    )
    await connection.networkHelpers.impersonateAccount(owner)
    await connection.networkHelpers.setBalance(owner, parseEther('10'))
    const ownerClient = await viem.getWalletClient(owner)
    const punksAsOwner = await viem.getContractAt(
      'MockCryptoPunksMarket',
      PUNKS_MARKET,
      { client: { wallet: ownerClient } },
    )
    await punksAsOwner.write.transferPunk([vault, punkId])
    await connection.networkHelpers.stopImpersonatingAccount(owner)
  }
  return vault
}

const lotItems = (): LotItemInput[] =>
  Array.from({ length: N }, (_, i) => lotItem(FIRST_PUNK + i, itemWeight(i)))

const offerSlots = (): OfferSlotInput[] =>
  Array.from({ length: N }, (_, i) => punkSlot(FIRST_PUNK + i))

const withWallet = (viem: any, auctions: any, wallet: any) =>
  viem.getContractAt('PunksAuction', auctions.address, {
    client: { wallet },
  })

describeIfMainnetRpc(`PunksAuction — ${N}-item gas vs the EIP-7825 cap (mainnet fork)`, () => {
  it(
    `auction path — createLot, openAuction, settle (${N} canonical punks)`,
    { timeout: 1_200_000 },
    async () => {
      console.log(`\n  auction path: funding a vault with ${N} real punks…`)
      const ctx = await setupFork()
      const { viem, publicClient, auctions, escrow, seller, bidder } = ctx
      await fundedSellerVault(ctx)

      const reserve = parseEther('10')
      const auctionsAsSeller = await withWallet(viem, auctions, seller)
      const auctionsAsBidder = await withWallet(viem, auctions, bidder)

      await gasOf(
        publicClient,
        `createLot(${N})`,
        await auctionsAsSeller.write.createLot(
          [lotItems(), reserve, zeroAddress],
          { gas: MEASURE_GAS },
        ),
      )
      await gasOf(
        publicClient,
        `openAuction(${N})`,
        await auctionsAsBidder.write.openAuction([1n, reserve], {
          value: reserve,
          gas: MEASURE_GAS,
        }),
      )

      await ctx.connection.networkHelpers.time.increase(DAY + 1)

      const settleGas = await gasOf(
        publicClient,
        `settle(${N})`,
        await auctions.write.settle([1n], { gas: MEASURE_GAS }),
      )

      // Sanity: punks delivered to the winner, no ETH stranded.
      const punks = await viem.getContractAt(
        'MockCryptoPunksMarket',
        PUNKS_MARKET,
      )
      assert.equal(
        getAddress(
          (await punks.read.punkIndexToAddress([BigInt(FIRST_PUNK)])) as string,
        ),
        getAddress(bidder.account.address),
      )
      assert.equal(
        await publicClient.getBalance({ address: auctions.address }),
        0n,
      )
      assert.equal(await publicClient.getBalance({ address: escrow }), 0n)

      assert.ok(
        settleGas < TX_GAS_CAP,
        `settle(${N}) uses ${settleGas} gas — over the 16,777,216 per-tx gas ` +
          `cap (EIP-7825); a ${N}-item auction could never be settled`,
      )
    },
  )

  it(
    `instant accept — acceptOfferFromLot pulls and delivers ${N} punks in one tx`,
    { timeout: 1_200_000 },
    async () => {
      console.log(
        `\n  acceptOfferFromLot: funding a vault with ${N} real punks…`,
      )
      const ctx = await setupFork()
      const { viem, publicClient, auctions, escrow, seller, offerer } = ctx
      await fundedSellerVault(ctx)

      const auctionsAsSeller = await withWallet(viem, auctions, seller)
      const auctionsAsOfferer = await withWallet(viem, auctions, offerer)

      await gasOf(
        publicClient,
        `createLot(${N})`,
        await auctionsAsSeller.write.createLot(
          [lotItems(), parseEther('1'), zeroAddress],
          { gas: MEASURE_GAS },
        ),
      )

      const offerAmount = parseEther('80')
      await gasOf(
        publicClient,
        `placeOffer(${N} slots)`,
        await auctionsAsOfferer.write.placeOffer([offerAmount, offerSlots()], {
          value: offerAmount,
          gas: MEASURE_GAS,
        }),
      )

      const acceptGas = await gasOf(
        publicClient,
        `acceptOfferFromLot(${N})`,
        await auctionsAsSeller.write.acceptOfferFromLot(
          [1n, 1n, parseEther('1')],
          { gas: MEASURE_GAS },
        ),
      )

      const punks = await viem.getContractAt(
        'MockCryptoPunksMarket',
        PUNKS_MARKET,
      )
      assert.equal(
        getAddress(
          (await punks.read.punkIndexToAddress([BigInt(FIRST_PUNK)])) as string,
        ),
        getAddress(offerer.account.address),
      )
      assert.equal(
        await publicClient.getBalance({ address: auctions.address }),
        0n,
      )
      assert.equal(await publicClient.getBalance({ address: escrow }), 0n)

      assert.ok(
        acceptGas < TX_GAS_CAP,
        `acceptOfferFromLot(${N}) uses ${acceptGas} gas — over the 16,777,216 ` +
          `per-tx gas cap (EIP-7825); unusable at ${N} items`,
      )
    },
  )

  it(
    `instant accept — createLotAndAcceptOffer creates, pulls and delivers ${N} punks in one tx`,
    { timeout: 1_200_000 },
    async () => {
      console.log(
        `\n  createLotAndAcceptOffer: funding a vault with ${N} real punks…`,
      )
      const ctx = await setupFork()
      const { viem, publicClient, auctions, escrow, seller, offerer } = ctx
      await fundedSellerVault(ctx)

      const auctionsAsSeller = await withWallet(viem, auctions, seller)
      const auctionsAsOfferer = await withWallet(viem, auctions, offerer)

      const offerAmount = parseEther('80')
      await gasOf(
        publicClient,
        `placeOffer(${N} slots)`,
        await auctionsAsOfferer.write.placeOffer([offerAmount, offerSlots()], {
          value: offerAmount,
          gas: MEASURE_GAS,
        }),
      )

      const combinedGas = await gasOf(
        publicClient,
        `createLotAndAcceptOffer(${N})`,
        await auctionsAsSeller.write.createLotAndAcceptOffer(
          [lotItems(), 1n, parseEther('1')],
          { gas: MEASURE_GAS },
        ),
      )

      const punks = await viem.getContractAt(
        'MockCryptoPunksMarket',
        PUNKS_MARKET,
      )
      assert.equal(
        getAddress(
          (await punks.read.punkIndexToAddress([BigInt(FIRST_PUNK)])) as string,
        ),
        getAddress(offerer.account.address),
      )
      assert.equal(
        await publicClient.getBalance({ address: auctions.address }),
        0n,
      )
      assert.equal(await publicClient.getBalance({ address: escrow }), 0n)

      assert.ok(
        combinedGas < TX_GAS_CAP,
        `createLotAndAcceptOffer(${N}) uses ${combinedGas} gas — over the ` +
          `16,777,216 per-tx gas cap (EIP-7825); unusable at ${N} items`,
      )
    },
  )

  after(() => {
    if (summary.length === 0) return
    const byLabel = new Map<string, bigint>()
    for (const { label, gas } of summary) byLabel.set(label, gas)
    console.log(
      `\n  ── ${N}-item gas vs the 16,777,216 per-tx cap (EIP-7825) — real CryptoPunks, fork ──`,
    )
    for (const [label, gas] of byLabel) {
      const verdict = gas >= TX_GAS_CAP ? 'UNMINEABLE' : 'fits'
      console.log(
        `  ${label.padEnd(28)} ${gas
          .toLocaleString('en-US')
          .padStart(13)}   ${asPercent(gas).padStart(6)} of cap   ${verdict}`,
      )
    }
    console.log(
      '  ───────────────────────────────────────────────────────────────────────────────\n',
    )
  })
})
