# Offers And Auctions

Offers and auctions use the Networked Art auction contract. Configure its
address before preparing or submitting writes:

```ts
const punks = createPunksSdk({
  publicClient,
  walletClient,
  addresses: {
    auction: '0x...',
  },
})
```

## Offer Slots

Criterion offers compile the same query language as local search where the
query can be represented by `Punks.Filter`.

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

The `standard` field accepts `'cryptopunks'` (default) or `'cryptopunks-v1'`
for the V̶ ̶1̶ "CryptoPunks" collection.

## Offers

Place a single-slot offer:

```ts
await punks.offers.place({
  amountWei: 50n * 10n ** 18n,
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
```

`adjustAmount` sends `value: amountWei` only when `increase === true`. Use
`increase: false` to claim back amount without sending ETH.

Accept offers:

```ts
await punks.offers.accept({
  offerId: 12n,
  punkId: 8348,
  expectedListingWei: 0n,
})

await punks.offers.acceptFromLot({
  offerId: 13n,
  lotId: 7n,
  minAmountWei: 240n * 10n ** 18n,
})
```

`expectedListingWei` guards against frontruns of an existing market listing —
pass the listing price you displayed to the user, or `0n` when no listing is
expected. `minAmountWei` is the lowest auction-clearing price the seller is
willing to accept when redirecting an offer through a lot.

Each offer helper has a `prepare*` equivalent.

## Auction Vaults

Auction lots require the seller's Punk to be in their deterministic vault.

```ts
const vaultFactory = await punks.auctions.vaultFactoryAddress()
const market = await punks.auctions.canonicalMarketAddress()
const v1Market = await punks.auctions.v1MarketAddress()

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
predicted vault address. `prepareEnsureVault()` registers the vault clone for
any user (no approvals). `prepareReclaim()` moves a deposited Punk back to the
caller.

Owners who want to deploy and approve operators in one transaction can use
the owner-only path:

```ts
await punks.auctions.ensureMyVault([operator1, operator2])
```

`ensureMyVault` uses `msg.sender` as the immutable owner and additively
approves the supplied operators.

## Lots And Auctions

Create, update, cancel, and clear lots:

```ts
await punks.auctions.createLot({
  items: [{ punkId: 4156, weightBps: 10_000 }],
  reserveWei: 250n * 10n ** 18n,
})

await punks.auctions.updateLot({
  lotId: 7n,
  reserveWei: 260n * 10n ** 18n,
})

await punks.auctions.cancelLot(7n)
await punks.auctions.clearStaleLot(7n)
```

Lots do not expire. `clearStaleLot` only removes lots that became invalid
because custody or vault approval changed.

Open, bid, settle, and start auctions from offers:

```ts
await punks.auctions.openAuction({
  lotId: 7n,
  reserveWei: 250n * 10n ** 18n,
})

await punks.auctions.openAuction({
  lotId: 7n,
  reserveWei: 250n * 10n ** 18n,
  bidWei: 260n * 10n ** 18n,
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
  minAmountWei: 240n * 10n ** 18n,
})

await punks.auctions.settle(3n)
```

`openAuction` sends `value: bidWei ?? reserveWei` so a single transaction can
seed the opening bid alongside the reserve.
