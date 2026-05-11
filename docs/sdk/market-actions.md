# SDK: Market, Offers, And Auctions

The SDK treats writes as user-facing flows. Every write has two forms:

- `prepare*` returns a `ContractWritePlan` with a short description and viem
  `writeContract` request.
- The matching executable method submits that same plan with the configured
  `walletClient`.

```ts
const plan = punks.market.prepareList({
  punkId: 8348,
  priceWei: 100n * 10n ** 18n,
})

await walletClient.writeContract(plan.request)
```

Configure clients once:

```ts
const punks = createPunksSdk({
  publicClient,
  walletClient,
  addresses: {
    auction: '0x...',
  },
})
```

## Original Marketplace

Read ownership, listings, and original-market bids:

```ts
const owner = await punks.market.ownerOf(8348)
const listing = await punks.market.listing(8348)
const bid = await punks.market.bidFor(8348)
```

List, unlist, buy, transfer, and withdraw:

```ts
await punks.market.list({
  punkId: 8348,
  priceWei: 100n * 10n ** 18n,
})

await punks.market.list({
  punkId: 8348,
  priceWei: 100n * 10n ** 18n,
  onlySellTo: buyer,
})

await punks.market.unlist(8348)

await punks.market.buy({
  punkId: 8348,
  maxPriceWei: 100n * 10n ** 18n,
})

await punks.market.transfer({
  punkId: 8348,
  to: receiver,
})

await punks.market.withdraw()
```

Use `prepareList`, `prepareUnlist`, `prepareBuy`, `prepareTransfer`, and
`prepareWithdraw` when the app wants to simulate, show a confirmation, or batch
the request itself.

## Offer Slots

Criterion offers use the same query language as local search where the query
can be represented by `Punks.Filter`.

```ts
const slot = punks.offers.slot({
  standard: 'cryptopunks',
  query: {
    type: 'Zombie',
    attributes: { anyOf: ['Hoodie', 'Beanie'] },
    colorCount: { max: 4 },
  },
})
```

`text`, pagination, and sorting are local-only. For curated baskets, pass ids
explicitly:

```ts
const slot = punks.offers.slot({
  includeIds: [8348, 7804, 3100],
  excludeIds: [1234],
})
```

## Offers

Place a single-slot offer:

```ts
await punks.offers.place({
  amountWei: 50n * 10n ** 18n,
  settlementWei: 1n * 10n ** 18n,
  receiver,
  query: {
    type: 'Zombie',
    colorCount: { max: 4 },
  },
})
```

Place a bundle offer by passing slots:

```ts
await punks.offers.place({
  amountWei: 250n * 10n ** 18n,
  slots: [
    {
      standard: 'cryptopunks-v1',
      includeIds: [4156],
    },
    {
      standard: 'cryptopunks',
      includeIds: [4156],
    },
  ],
})
```

Manage active offers:

```ts
await punks.offers.cancel(12n)

await punks.offers.adjustAmount({
  offerId: 12n,
  amountWei: 5n * 10n ** 18n,
  increase: true,
})

await punks.offers.adjustSettlement({
  offerId: 12n,
  amountWei: 1n * 10n ** 18n,
  increase: false,
})
```

Accept offers:

```ts
await punks.offers.accept({
  offerId: 12n,
  punkId: 8348,
})

await punks.offers.acceptFromLot({
  offerId: 13n,
  lotId: 7n,
})
```

Each method has a `prepare*` equivalent: `preparePlace`, `prepareCancel`,
`prepareAdjustAmount`, `prepareAdjustSettlement`, `prepareAccept`, and
`prepareAcceptFromLot`.

## Auction Vaults

Auction lots require the seller's Punk to be in their deterministic vault.

```ts
const vault = await punks.auctions.vaultFor(seller)

await punks.auctions.ensureVault(seller)

await punks.auctions.deposit({
  owner: seller,
  punkId: 4156,
})

await punks.auctions.reclaim({
  punkId: 4156,
})
```

`prepareDeposit()` returns a transfer on the relevant Punk market to the
predicted vault address. `prepareEnsureVault()` registers the vault clone.
`prepareReclaim()` moves a deposited Punk back to the caller.

## Lots And Auctions

Create, update, cancel, and clear lots:

```ts
await punks.auctions.createLot({
  items: [
    { punkId: 4156, weightBps: 10_000 },
  ],
  reserveWei: 250n * 10n ** 18n,
  expiresAt: 1_800_000_000,
})

await punks.auctions.updateLot({
  lotId: 7n,
  reserveWei: 260n * 10n ** 18n,
  expiresAt: 1_800_100_000,
})

await punks.auctions.cancelLot(7n)
await punks.auctions.clearStaleLot(7n)
```

Open, bid, settle, and start auctions from offers:

```ts
await punks.auctions.openAuction({
  lotId: 7n,
  reserveWei: 250n * 10n ** 18n,
})

const minimum = await punks.auctions.minimumBid(3n)
const active = await punks.auctions.isActive(3n)

await punks.auctions.bid({
  auctionId: 3n,
  amountWei: minimum,
})

await punks.auctions.startAuctionFromOffer({
  offerId: 13n,
  lotId: 7n,
})

await punks.auctions.settle(3n)
```

When item weights are omitted, the SDK splits `10_000` basis points evenly and
adds any rounding remainder to the first item. If any item provides
`weightBps`, every item must provide it and the sum must equal `10_000`.

## Standards

`standard` defaults to canonical CryptoPunks. Accepted values:

- `'cryptopunks'`, `'punks'`, `'v2'`, `'cryptopunks-v2'`
- `'cryptopunks-v1'`, `'v1'`

The exported `PunkStandard` enum contains the numeric values sent to the
auction contract.
