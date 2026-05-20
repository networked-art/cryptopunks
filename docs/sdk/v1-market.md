# V1 Market

`punks.v1Market` wraps a criteria-bid market that interacts with the broken
CryptoPunks contract deployed by LarvaLabs on June 9th 2017. It gives those
original Punks back a working secondary market: bids are escrowed in ETH and
settlement routes around the original contract's sale-proceeds accounting bug.

Reads require a `publicClient`; writes require a `walletClient`.

```ts
const punks = createPunksSdk({ publicClient, walletClient })
```

Each bid carries a `Punks.Filter` plus optional include / exclude id lists.
Sellers accept against any Punk they own on the original (June 9th 2017) contract
that matches the bid.

## Reads

```ts
const lastBidId = await punks.v1Market.lastBidId()

const bid = await punks.v1Market.bid(1234n)
if (bid) {
  bid.bidder
  bid.bidWei
  bid.settlementWei
  bid.criteria
  bid.includeIds
  bid.excludeIds
}

const matches = await punks.v1Market.matchesPunk(1234n, 4156)
const pending = await punks.v1Market.pendingWithdrawal(account)
```

`bid()` returns `null` when the bid does not exist (cancelled, accepted, or
never created).

### Paginated Cursor

The market exposes a per-punk cursor of matching bids. Drain it with the
page helper or the async iterator:

```ts
const page = await punks.v1Market.bidsMatchingPunkPage(4156, {
  fromId: 0n,
  count: 100,
})

for await (const bidId of punks.v1Market.bidsMatchingPunk(4156, {
  pageSize: 100,
})) {
  // ...
}

const allIds = await punks.v1Market.findBidsMatchingPunk(4156)
```

`nextId === 0n` signals end of book on `bidsMatchingPunkPage`.

## Writes

Every write has a `prepare*` equivalent.

```ts
await punks.v1Market.buyPunk({
  punkId: 4156,
  expectedListingWei: 50n * 10n ** 18n,
  recipient: account,
})

await punks.v1Market.placeBid({
  bidWei: 40n * 10n ** 18n,
  settlementWei: 0n,
  criteria: filter,
  includeIds: [],
  excludeIds: [],
})

await punks.v1Market.adjustBidPrice({
  bidId: 5n,
  weiToAdjust: 5n * 10n ** 18n,
  increase: true,
})

await punks.v1Market.acceptBid({
  bidId: 5n,
  punkId: 4156,
  expectedListingWei: 0n,
})

await punks.v1Market.cancelBid(5n)
await punks.v1Market.withdraw()
```

`placeBid` sends `value: bidWei + settlementWei`. `adjustBidPrice` only sends
ETH when `increase === true`. `buyPunk` sends `value: expectedListingWei`.

Build a `criteria: PunksFilter` from the same query language used by local
search:

```ts
import { compilePunksFilter } from '@networked-art/punks-sdk'

const criteria = compilePunksFilter(punks.dataset.source, {
  type: 'Zombie',
  attributes: { anyOf: ['Hoodie', 'Beanie'] },
  colorCount: { max: 4 },
})
```

## Indexer Composition

For richer queries (global lists, per-trait / per-color matching, sorted
pagination) the SDK ships an HTTP client for the indexer that tracks bids on
the original (June 9th 2017) CryptoPunks contract:

```ts
import {
  PunksV1MarketIndexerClient,
  PunksV1MarketFacade,
} from '@networked-art/punks-sdk'

const indexer = new PunksV1MarketIndexerClient({
  baseUrl: 'https://indexer.example/api',
})

const facade = new PunksV1MarketFacade({
  contract: punks.v1Market,
  indexer,
})

const matching = await facade.bidsMatchingPunk(4156)
const byTrait = await facade.bidsMatchingTrait(traitId)
const list = await facade.bids({ active: true, sort: 'bid_wei-desc' })
```

`bidsMatchingTrait`, `bidsMatchingColor`, and `bids()` are indexer-only —
the contract has no global enumerator. `bidsMatchingPunk` and `bid()` fall
back to the contract when no indexer is configured.
