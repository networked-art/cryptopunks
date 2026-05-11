# SDK: Original Marketplace

The original CryptoPunks market is available at `punks.market`. Reads require
a `publicClient`; writes require a `walletClient`.

```ts
const punks = createPunksSdk({
  publicClient,
  walletClient,
})
```

## Reads

Read collection metadata, ownership, listings, bids, and withdrawable ETH:

```ts
const name = await punks.market.name()
const symbol = await punks.market.symbol()
const totalSupply = await punks.market.totalSupply()
const remaining = await punks.market.punksRemainingToAssign()

const owner = await punks.market.ownerOf(8348)
const listing = await punks.market.listing(8348)
const bid = await punks.market.bidFor(8348)
const escrowed = await punks.market.pendingWithdrawal(owner)
```

`listing.priceWei`, `bid.valueWei`, and pending withdrawals are returned as
`bigint`.

## Writes

Every write has a matching `prepare*` method that returns the exact viem
request the executable method submits.

```ts
const plan = punks.market.prepareList({
  punkId: 8348,
  priceWei: 100n * 10n ** 18n,
})

await walletClient.writeContract(plan.request)
```

Use executable helpers when the SDK was configured with a wallet:

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

await punks.market.enterBid({
  punkId: 8348,
  amountWei: 90n * 10n ** 18n,
})

await punks.market.acceptBid({
  punkId: 8348,
  minPriceWei: 90n * 10n ** 18n,
})

await punks.market.withdrawBid(8348)

await punks.market.transfer({
  punkId: 8348,
  to: receiver,
})

await punks.market.withdraw()
```

`buy()` can fetch the live listing price when `priceWei` is omitted. Pass
`maxPriceWei` to keep the transaction from using a price above the value your
UI displayed.
