# Stash Bids

`punks.stashBids` is the SDK surface for the Node Foundation offchain bids
orderbook at `bids.cryptopunks.app`. It composes:

- A REST client (`punks.stashBids.api`) for the public HTTP API.
- An EIP-712 builder that signs Stash Punk bids with `chainId: 1` and the
  bidder's Stash as the verifying contract.
- `processPunkBid` settlement plans backed by the seller's Stash.

Set `bidsBaseUrl` on `createPunksSdk` to override the default host. Mainnet is
the only supported chain.

## API Reads

```ts
const top = await punks.stashBids.top({ limit: 25 })
const mine = await punks.stashBids.list({ bidder: account, status: 'pending' })
const single = await punks.stashBids.byId(bidId)
const forPunk = await punks.stashBids.forPunk(8348)
const proofs = await punks.stashBids.proofs(bidId)
```

Each read returns hydrated `StashBid` objects: bigints decoded, addresses
checksummed, and proofs keyed by punk index when present.

## Compile A Bid Slot

The same query language used by `punks.search` compiles to the punk-index
list embedded in a trait/specific bid:

```ts
const punkIds = punks.stashBids.slot({
  type: 'Zombie',
  attributes: { anyOf: ['Hoodie', 'Beanie'] },
})
```

## Prepare, Sign, Submit

The full lifecycle is split into three steps for advanced flows:

```ts
const prepared = await punks.stashBids.prepare({
  stash: stashAddress,
  punkIds, // empty array = collection bid
  pricePerUnit: 50n * 10n ** 18n,
  numberOfUnits: 1,
  accountNonce: currentAccountNonce,
  bidNonce: nextBidNonce,
  expiration: 0n, // 0 = no expiration
})

const signature = await punks.stashBids.sign(prepared)

const submitted = await punks.stashBids.submit({
  prepared,
  signature,
  tag: 'my-app',
  expiresAtMs: Date.now() + 7 * 24 * 60 * 60 * 1000,
})
```

`prepare()` derives the Merkle root automatically. Collection bids use
`0x00..00`; trait or specific-id bids POST to the orderbook's `/merkle/root`
endpoint unless a precomputed `root` is supplied.

For the common case, `place()` runs all three steps:

```ts
const placed = await punks.stashBids.place({
  stash: stashAddress,
  punkIds,
  pricePerUnit: 50n * 10n ** 18n,
  accountNonce,
  bidNonce,
})
```

## Refresh Bidder State

After cancelling onchain bids or burning a nonce, ask the orderbook to
re-validate everything tied to a bidder:

```ts
const result = await punks.stashBids.refresh(account)
```

`result.results` lists every bid touched and why its status changed.

## Settlement

`prepareAccept` builds the `processPunkBid` write that settles a bid through
the seller's Stash. The bid struct, signature, and proof typically come from
`byId` and `proofs` calls:

```ts
const plan = punks.stashBids.prepareAccept({
  stashAddress: bidderStash,
  bid,
  signature,
  proof,
  punkId: 8348,
})

await walletClient.writeContract(plan.request)
```

Bidders cancel one or all of their outstanding signatures with:

```ts
const cancelOne = punks.stashBids.prepareCancel({
  stashAddress: bidderStash,
  bidNonce: 12n,
})

const cancelAll = punks.stashBids.prepareCancelAll(bidderStash)
```

Both routes settle on the bidder's Stash via `cancelPunkBid` /
`cancelAllPunkBids`.

## Direct API Client

The lower-level `StashBidsApiClient` is also exported when only the orderbook
endpoints are needed:

```ts
import { StashBidsApiClient } from '@networked-art/punks-sdk'

const api = new StashBidsApiClient({
  baseUrl: 'https://bids.cryptopunks.app/api/v1',
})
```
