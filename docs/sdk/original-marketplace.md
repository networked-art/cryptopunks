# Original Marketplace

The original CryptoPunks market is available at `punks.market`. Reads require
a `publicClient`; writes require a `walletClient`.

```ts
const punks = createPunksSdk({
  publicClient,
  walletClient,
})
```

Bid flows on the original market are not surfaced as helpers on this client.
Use [Offers And Auctions](/sdk/offers-and-auctions) for the Networked Art
auction/offer system, [Stash](/sdk/stash) for offchain Stash Punk bids, or the
exported `cryptoPunksMarketAbi` for direct viem calls.

## Reads

Read collection metadata, ownership, listings, and withdrawable ETH:

```ts
const name = await punks.market.name()
const symbol = await punks.market.symbol()
const imageHash = await punks.market.imageHash()
const totalSupply = await punks.market.totalSupply()
const remaining = await punks.market.punksRemainingToAssign()
const nextIndex = await punks.market.nextPunkIndexToAssign()

const owner = await punks.market.ownerOf(8348)
const balance = await punks.market.balanceOf(owner)
const listing = await punks.market.listing(8348)
const escrowed = await punks.market.pendingWithdrawal(owner)
```

`listing.priceWei` and pending withdrawals are returned as `bigint`.
`listing.isForSale`, `listing.seller`, and `listing.onlySellTo` reflect the
underlying `punksOfferedForSale` mapping.

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

await punks.market.transfer({
  punkId: 8348,
  to: receiver,
})

await punks.market.withdraw()
```

`buy()` fetches the live listing price when `priceWei` is omitted. Pass
`maxPriceWei` to keep the transaction from using a price above the value your
UI displayed; pass `priceWei` directly to lock the exact value sent.
