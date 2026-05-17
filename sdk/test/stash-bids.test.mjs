import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CRYPTOPUNKS_MARKET_ADDRESS,
  PunksDataValidationError,
  PunksStashBidsFacade,
  StashBidsApiClient,
  createPunksSdk,
} from '../dist/index.js'

const BIDDER = '0x000000000000000000000000000000000000B1d5'
const STASH = '0x113ad230db4b4c2ee794d73ed858364c23bc9bba'
const ZERO_BYTES32 = '0x' + '00'.repeat(32)
const TRAIT_ROOT =
  '0x149dd98f1bc0a334b71f0f282ed1ee67d441dd7550558b5b2fa69261d75b45ce'
const SAMPLE_SIGNATURE = '0x' + 'aa'.repeat(65)

function fakeFetch(handler) {
  const calls = []
  const fetcher = async (url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null
    const call = {
      url,
      method: init?.method ?? 'GET',
      body,
      headers: init?.headers ?? {},
    }
    calls.push(call)
    const result = await handler(call)
    return {
      ok: result.ok ?? true,
      status: result.status ?? 200,
      json: async () => result.json,
      text: async () => result.text ?? '',
    }
  }
  return { fetcher, calls }
}

describe('StashBidsApiClient', () => {
  it('builds the POST /bids body and hydrates the response', async () => {
    const { fetcher, calls } = fakeFetch(() => ({
      status: 201,
      json: {
        success: true,
        data: {
          id: 'a-uuid',
          bidder_address: BIDDER,
          punk_indices: [1, 2, 3],
          bid_amount_wei: '50000000000000000',
          bid_amount_eth: 0.05,
          merkle_root: TRAIT_ROOT,
          status: 'pending',
          created_at: '2026-05-17T00:00:00.000Z',
          tag: 'beanie',
        },
      },
    }))
    const api = new StashBidsApiClient({
      baseUrl: 'https://example.test/api/v1/',
      fetch: fetcher,
    })

    const bid = await api.submit({
      punkIndices: [1, 2, 3],
      bidAmount: '0.05',
      address: BIDDER,
      signature: SAMPLE_SIGNATURE,
      bidNonce: 1779011683874,
      auctionContract: CRYPTOPUNKS_MARKET_ADDRESS,
      stashContract: STASH,
      tag: 'beanie',
    })

    assert.equal(calls.length, 1)
    assert.equal(calls[0].method, 'POST')
    assert.equal(calls[0].url, 'https://example.test/api/v1/bids')
    assert.deepEqual(calls[0].body, {
      punkIndices: [1, 2, 3],
      bidAmount: '0.05',
      address: BIDDER,
      signature: SAMPLE_SIGNATURE,
      bidNonce: 1779011683874,
      chainId: 1,
      auctionContract: CRYPTOPUNKS_MARKET_ADDRESS,
      stashContract: STASH,
      tag: 'beanie',
    })
    assert.equal(bid.id, 'a-uuid')
    assert.equal(bid.bidAmountWei, 50000000000000000n)
    assert.equal(bid.merkleRoot, TRAIT_ROOT)
    assert.equal(bid.tag, 'beanie')
    assert.equal(bid.status, 'pending')
  })

  it('hydrates list, proof, and per-punk responses', async () => {
    const { fetcher } = fakeFetch((call) => {
      if (call.url.endsWith('/bids?bidder=' + BIDDER + '&limit=2')) {
        return {
          json: {
            success: true,
            data: [
              {
                id: 'b-1',
                bidder_address: BIDDER,
                punk_indices: [42],
                bid_amount_wei: '10000000000000000',
                bid_amount_eth: 0.01,
                merkle_root: ZERO_BYTES32,
                account_nonce: 0,
                bid_nonce: '1779011425922',
                status: 'pending',
                created_at: '2026-05-17T00:00:00.000Z',
                proofs: { 42: [TRAIT_ROOT] },
              },
            ],
          },
        }
      }
      if (call.url.endsWith('/bids/b-1/proofs')) {
        return {
          json: { success: true, data: { 42: [TRAIT_ROOT] } },
        }
      }
      throw new Error('unexpected url ' + call.url)
    })
    const api = new StashBidsApiClient({
      baseUrl: 'https://example.test/api/v1',
      fetch: fetcher,
    })

    const list = await api.list({ bidder: BIDDER, limit: 2 })
    assert.equal(list.length, 1)
    assert.equal(list[0].bidNonce, 1779011425922n)
    assert.equal(list[0].accountNonce, 0n)
    assert.deepEqual(list[0].proofs, { 42: [TRAIT_ROOT] })

    const proofs = await api.proofs('b-1')
    assert.deepEqual(proofs, { 42: [TRAIT_ROOT] })
  })

  it('returns null on 404 byId', async () => {
    const { fetcher } = fakeFetch(() => ({
      ok: false,
      status: 404,
      json: { success: false },
    }))
    const api = new StashBidsApiClient({
      baseUrl: 'https://example.test/api/v1',
      fetch: fetcher,
    })
    assert.equal(await api.byId('missing'), null)
  })

  it('skips the merkle/root call for empty punk lists', async () => {
    const { fetcher, calls } = fakeFetch(() => ({
      json: { success: false },
    }))
    const api = new StashBidsApiClient({
      baseUrl: 'https://example.test/api/v1',
      fetch: fetcher,
    })
    const root = await api.merkleRoot([])
    assert.equal(root, ZERO_BYTES32)
    assert.equal(calls.length, 0)
  })

  it('calls merkle/root for non-empty punk lists', async () => {
    const { fetcher, calls } = fakeFetch(() => ({
      json: { success: true, data: { root: TRAIT_ROOT } },
    }))
    const api = new StashBidsApiClient({
      baseUrl: 'https://example.test/api/v1',
      fetch: fetcher,
    })
    const root = await api.merkleRoot([1, 2, 3])
    assert.equal(root, TRAIT_ROOT)
    assert.equal(calls[0].method, 'POST')
    assert.deepEqual(calls[0].body, { punkIndices: [1, 2, 3] })
    assert.equal(calls[0].url, 'https://example.test/api/v1/merkle/root')
  })

  it('throws PunksDataSdkError on non-2xx responses', async () => {
    const { fetcher } = fakeFetch(() => ({
      ok: false,
      status: 500,
      text: 'boom',
    }))
    const api = new StashBidsApiClient({
      baseUrl: 'https://example.test/api/v1',
      fetch: fetcher,
    })
    await assert.rejects(
      api.list(),
      /Stash bids request failed \(500\) at \/bids: boom/,
    )
  })
})

describe('PunksStashBidsFacade', () => {
  it('compiles a query into punk indices via slot()', () => {
    const punks = createPunksSdk()
    const ids = punks.stashBids.slot({ type: 'Alien' })
    assert.equal(ids.length, 9)
    assert.ok(ids.every((id) => id >= 0 && id <= 9999))
  })

  it('prepares a collection bid with the zero root, no network call', async () => {
    const { fetcher, calls } = fakeFetch(() => ({
      json: { success: false },
    }))
    const stashBids = new PunksStashBidsFacade({
      api: new StashBidsApiClient({
        baseUrl: 'https://example.test/api/v1',
        fetch: fetcher,
      }),
    })
    const prepared = await stashBids.prepare({
      stash: STASH,
      pricePerUnit: 10000000000000000n,
      accountNonce: 0n,
      bidNonce: 1779011425922n,
      expiration: 1779015025n,
    })
    assert.equal(prepared.bid.root, ZERO_BYTES32)
    assert.equal(prepared.bid.order.numberOfUnits, 1)
    assert.equal(prepared.bid.order.auction, CRYPTOPUNKS_MARKET_ADDRESS)
    assert.equal(prepared.typedData.domain.verifyingContract, STASH)
    assert.equal(prepared.typedData.domain.chainId, 1)
    assert.equal(calls.length, 0)
  })

  it('fetches the merkle root for trait/specific bids', async () => {
    const { fetcher, calls } = fakeFetch(() => ({
      json: { success: true, data: { root: TRAIT_ROOT } },
    }))
    const stashBids = new PunksStashBidsFacade({
      api: new StashBidsApiClient({
        baseUrl: 'https://example.test/api/v1',
        fetch: fetcher,
      }),
    })
    const prepared = await stashBids.prepare({
      stash: STASH,
      punkIds: [1, 2, 3],
      pricePerUnit: 10000000000000000n,
      accountNonce: 0n,
      bidNonce: 1779011683874n,
      expiration: 1779015283n,
    })
    assert.equal(prepared.bid.root, TRAIT_ROOT)
    assert.equal(prepared.punkIds.length, 3)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].body, { punkIndices: [1, 2, 3] })
  })

  it('honors an explicit root and skips the API call', async () => {
    const { fetcher, calls } = fakeFetch(() => ({ json: { success: false } }))
    const stashBids = new PunksStashBidsFacade({
      api: new StashBidsApiClient({
        baseUrl: 'https://example.test/api/v1',
        fetch: fetcher,
      }),
    })
    const prepared = await stashBids.prepare({
      stash: STASH,
      punkIds: [1, 2],
      pricePerUnit: 10n,
      accountNonce: 0n,
      bidNonce: 1n,
      root: TRAIT_ROOT,
    })
    assert.equal(prepared.bid.root, TRAIT_ROOT)
    assert.equal(calls.length, 0)
  })

  it('signs and submits with derived bidAmount, stashContract, and auction', async () => {
    const writes = []
    const { fetcher } = fakeFetch((call) => {
      writes.push(call)
      return {
        status: 201,
        json: {
          success: true,
          data: {
            id: 'a-uuid',
            bidder_address: BIDDER,
            punk_indices: [],
            bid_amount_wei: '10000000000000000',
            bid_amount_eth: 0.01,
            merkle_root: ZERO_BYTES32,
            status: 'pending',
            created_at: '2026-05-17T00:00:00.000Z',
          },
        },
      }
    })
    const stashBids = new PunksStashBidsFacade({
      walletClient: {
        account: { address: BIDDER },
        signTypedData: async () => SAMPLE_SIGNATURE,
      },
      api: new StashBidsApiClient({
        baseUrl: 'https://example.test/api/v1',
        fetch: fetcher,
      }),
    })

    const bid = await stashBids.place({
      stash: STASH,
      pricePerUnit: 10000000000000000n,
      accountNonce: 0n,
      bidNonce: 1779011425922n,
      expiration: 1779015025n,
      tag: 'any-punk',
    })

    assert.equal(bid.id, 'a-uuid')
    assert.equal(writes.length, 1)
    assert.equal(writes[0].url, 'https://example.test/api/v1/bids')
    assert.equal(writes[0].body.address, BIDDER)
    assert.equal(writes[0].body.bidAmount, '0.01')
    assert.equal(writes[0].body.bidNonce, 1779011425922)
    assert.equal(writes[0].body.signature, SAMPLE_SIGNATURE)
    assert.equal(writes[0].body.chainId, 1)
    assert.equal(writes[0].body.auctionContract, CRYPTOPUNKS_MARKET_ADDRESS)
    assert.equal(writes[0].body.stashContract, STASH)
    assert.equal(writes[0].body.tag, 'any-punk')
    assert.deepEqual(writes[0].body.punkIndices, [])
  })

  it('prepareAccept builds processPunkBid against the seller Stash', () => {
    const punks = createPunksSdk()
    const plan = punks.stashBids.prepareAccept({
      stashAddress: STASH,
      bid: {
        order: {
          numberOfUnits: 1,
          pricePerUnit: 10000000000000000n,
          auction: CRYPTOPUNKS_MARKET_ADDRESS,
        },
        accountNonce: 0n,
        bidNonce: 1n,
        expiration: 0n,
        root: ZERO_BYTES32,
      },
      signature: SAMPLE_SIGNATURE,
      proof: [],
      punkId: 8348,
    })
    assert.equal(plan.request.address, STASH)
    assert.equal(plan.request.functionName, 'processPunkBid')
    assert.equal(plan.request.args[1], 8348n)
    assert.equal(plan.request.args[2], SAMPLE_SIGNATURE)
  })

  it('rejects non-bigint pricePerUnit', async () => {
    const punks = createPunksSdk()
    await assert.rejects(
      punks.stashBids.prepare({
        stash: STASH,
        pricePerUnit: /** @type {any} */ (10),
        accountNonce: 0n,
        bidNonce: 1n,
      }),
      PunksDataValidationError,
    )
  })
})
