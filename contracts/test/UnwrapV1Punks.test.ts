import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { zeroAddress } from 'viem'
import {
  deployUnwrapV1PunksStack,
  PUNKS_V1_MARKET,
  PUNKS_V1_WRAPPER,
} from './helpers/fixtures.js'

type Ctx = Awaited<ReturnType<typeof deployUnwrapV1PunksStack>>

async function wrapperAs(ctx: Ctx, wallet: any) {
  return ctx.viem.getContractAt('MockPunksV1Wrapper', ctx.wrapper.address, {
    client: { wallet },
  })
}

async function unwrapperAs(ctx: Ctx, wallet: any) {
  return ctx.viem.getContractAt('UnwrapV1Punks', ctx.unwrapper.address, {
    client: { wallet },
  })
}

/// Mints a wrapper ERC-721 to `to` and parks the underlying V1 Punk on the
/// wrapper, mirroring the post-`wrap` state without going through the V1
/// market sale flow.
async function seedWrapped(ctx: Ctx, to: any, punkId: bigint) {
  await ctx.punksV1.write.setInitialOwner([ctx.wrapper.address, punkId])
  await ctx.wrapper.write.mockWrap([to.account.address, punkId])
}

describe('UnwrapV1Punks', () => {
  it('exposes the hardcoded wrapper and V1 market through immutables', async () => {
    const { unwrapper } = await deployUnwrapV1PunksStack()
    assert.equal(
      ((await unwrapper.read.WRAPPER()) as string).toLowerCase(),
      PUNKS_V1_WRAPPER.toLowerCase(),
    )
    assert.equal(
      ((await unwrapper.read.PUNKS_V1()) as string).toLowerCase(),
      PUNKS_V1_MARKET.toLowerCase(),
    )
  })

  it('unwraps a batch and delivers each Punk to the wrapper-token owner', async () => {
    const ctx = await deployUnwrapV1PunksStack()
    const { wrapper, punksV1, unwrapper, alice } = ctx

    await seedWrapped(ctx, alice, 11n)
    await seedWrapped(ctx, alice, 22n)
    await seedWrapped(ctx, alice, 33n)

    const wrapperForAlice = await wrapperAs(ctx, alice)
    await wrapperForAlice.write.setApprovalForAll([unwrapper.address, true])

    const unwrapperForAlice = await unwrapperAs(ctx, alice)
    await unwrapperForAlice.write.unwrap([[11, 22, 33]])

    for (const id of [11n, 22n, 33n]) {
      assert.equal(
        (
          (await punksV1.read.punkIndexToAddress([id])) as string
        ).toLowerCase(),
        alice.account.address.toLowerCase(),
      )
      assert.equal(await wrapper.read.exists?.([id]).catch(() => false), false)
    }
  })

  it('rejects callers who do not own every id in the batch', async () => {
    const ctx = await deployUnwrapV1PunksStack()
    const { wrapper, punksV1, unwrapper, alice, bob } = ctx

    await seedWrapped(ctx, alice, 101n)
    await seedWrapped(ctx, alice, 102n)

    // Alice approves the unwrapper for all of her wrapped tokens — this is
    // a wrapper-side approval and must NOT be enough for someone else to
    // unwrap her Punks.
    const wrapperForAlice = await wrapperAs(ctx, alice)
    await wrapperForAlice.write.setApprovalForAll([unwrapper.address, true])

    const unwrapperForBob = await unwrapperAs(ctx, bob)
    await ctx.viem.assertions.revertWithCustomError(
      unwrapperForBob.write.unwrap([[101, 102]]),
      unwrapper,
      'NotPunkOwner',
    )

    // Alice still holds the wrapped tokens; the wrapper still holds the
    // underlying Punks.
    for (const id of [101n, 102n]) {
      assert.equal(
        ((await wrapper.read.ownerOf([id])) as string).toLowerCase(),
        alice.account.address.toLowerCase(),
      )
      assert.equal(
        (
          (await punksV1.read.punkIndexToAddress([id])) as string
        ).toLowerCase(),
        wrapper.address.toLowerCase(),
      )
    }
  })

  it('reverts when the batch mixes ids owned by different holders', async () => {
    const ctx = await deployUnwrapV1PunksStack()
    const { wrapper, unwrapper, alice, bob } = ctx

    await seedWrapped(ctx, alice, 201n)
    await seedWrapped(ctx, bob, 202n)

    const wrapperForAlice = await wrapperAs(ctx, alice)
    await wrapperForAlice.write.setApprovalForAll([unwrapper.address, true])
    const wrapperForBob = await wrapperAs(ctx, bob)
    await wrapperForBob.write.setApprovalForAll([unwrapper.address, true])

    const unwrapperForAlice = await unwrapperAs(ctx, alice)
    await ctx.viem.assertions.revertWithCustomError(
      unwrapperForAlice.write.unwrap([[201, 202]]),
      unwrapper,
      'NotPunkOwner',
    )
  })

  it('honors per-token approvals as well as operator approvals', async () => {
    const ctx = await deployUnwrapV1PunksStack()
    const { punksV1, unwrapper, alice } = ctx

    await seedWrapped(ctx, alice, 301n)
    const wrapperForAlice = await wrapperAs(ctx, alice)
    await wrapperForAlice.write.approve([unwrapper.address, 301n])

    const unwrapperForAlice = await unwrapperAs(ctx, alice)
    await unwrapperForAlice.write.unwrap([[301]])

    assert.equal(
      ((await punksV1.read.punkIndexToAddress([301n])) as string).toLowerCase(),
      alice.account.address.toLowerCase(),
    )
  })

  it('reverts when no ids are provided', async () => {
    const ctx = await deployUnwrapV1PunksStack()
    const { unwrapper, alice } = ctx

    const unwrapperForAlice = await unwrapperAs(ctx, alice)
    await ctx.viem.assertions.revertWithCustomError(
      unwrapperForAlice.write.unwrap([[]]),
      unwrapper,
      'NoPunkIds',
    )
  })

  it('reverts the whole batch when this contract lacks approval on any id', async () => {
    const ctx = await deployUnwrapV1PunksStack()
    const { wrapper, punksV1, unwrapper, alice } = ctx

    await seedWrapped(ctx, alice, 401n)
    await seedWrapped(ctx, alice, 402n)

    const wrapperForAlice = await wrapperAs(ctx, alice)
    await wrapperForAlice.write.approve([unwrapper.address, 401n])
    // No approval for 402

    const unwrapperForAlice = await unwrapperAs(ctx, alice)
    await assert.rejects(unwrapperForAlice.write.unwrap([[401, 402]]))

    // Nothing moved — original wrapper holds underlying Punks, alice still
    // holds the wrapped tokens.
    assert.equal(
      ((await wrapper.read.ownerOf([401n])) as string).toLowerCase(),
      alice.account.address.toLowerCase(),
    )
    assert.equal(
      ((await punksV1.read.punkIndexToAddress([401n])) as string).toLowerCase(),
      wrapper.address.toLowerCase(),
    )
  })

  it('reverts when an id has already been unwrapped', async () => {
    const ctx = await deployUnwrapV1PunksStack()
    const { unwrapper, alice } = ctx

    await seedWrapped(ctx, alice, 501n)
    const wrapperForAlice = await wrapperAs(ctx, alice)
    await wrapperForAlice.write.setApprovalForAll([unwrapper.address, true])

    const unwrapperForAlice = await unwrapperAs(ctx, alice)
    await unwrapperForAlice.write.unwrap([[501]])

    // Second unwrap for the same id: token no longer exists.
    await assert.rejects(unwrapperForAlice.write.unwrap([[501]]))
  })

  it('emits PunksUnwrapped with the caller and ids', async () => {
    const ctx = await deployUnwrapV1PunksStack()
    const { unwrapper, alice, publicClient } = ctx

    await seedWrapped(ctx, alice, 601n)
    await seedWrapped(ctx, alice, 602n)
    const wrapperForAlice = await wrapperAs(ctx, alice)
    await wrapperForAlice.write.setApprovalForAll([unwrapper.address, true])

    const unwrapperForAlice = await unwrapperAs(ctx, alice)
    const hash = await unwrapperForAlice.write.unwrap([[601, 602]])
    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    const events = await unwrapper.getEvents.PunksUnwrapped({}, {
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    })
    assert.equal(events.length, 1)
    assert.equal(
      events[0].args.caller!.toLowerCase(),
      alice.account.address.toLowerCase(),
    )
    assert.deepEqual(events[0].args.punkIds, [601, 602])
  })

  it('leaves no leftover V1 ownership on the unwrapper contract', async () => {
    const ctx = await deployUnwrapV1PunksStack()
    const { punksV1, unwrapper, alice } = ctx

    await seedWrapped(ctx, alice, 701n)
    const wrapperForAlice = await wrapperAs(ctx, alice)
    await wrapperForAlice.write.setApprovalForAll([unwrapper.address, true])

    const unwrapperForAlice = await unwrapperAs(ctx, alice)
    await unwrapperForAlice.write.unwrap([[701]])

    assert.equal(await punksV1.read.balanceOf([unwrapper.address]), 0n)
    assert.notEqual(
      (await punksV1.read.punkIndexToAddress([701n])) as string,
      zeroAddress,
    )
  })
})
