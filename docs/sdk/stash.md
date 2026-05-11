# SDK: Stash

`punks.stash` covers StashFactory and individual Stash contracts.

| Surface | Use it for |
| --- | --- |
| `punks.stash.factory` | Deployment lookup, deployment, implementation status, and Stash upgrades |
| `punks.stash.at(address)` | Work with a known Stash address |
| `punks.stash.forOwner(owner)` | Resolve a deployed Stash for an owner |
| `punks.stash.current` | Stash client from `addresses.stash`, when configured |

`forOwner()` rejects if the factory reports that the owner has not deployed a
Stash or if the resolved Stash address is zero.

## Factory

```ts
const status = await punks.stash.statusForOwner(owner)

if (!status.deployed) {
  await punks.stash.deploy(owner)
}

const stash = await punks.stash.forOwner(owner)
```

The user-facing factory client exposes status reads plus Stash deployment and
caller upgrades:

```ts
const version = await punks.stash.factory.currentVersion()
const implementation = await punks.stash.factory.implementation(version)
const deployed = await punks.stash.factory.ownerHasDeployed(owner)
const isKnownStash = await punks.stash.factory.isStash(stashAddress)

await punks.stash.factory.upgradeStash()
```

Use the `prepare*` variants for simulation or custom submission. Raw ABI
exports remain available for protocol-owner tooling that needs manual admin
calls.

## Funding And Liquidity

Send ETH directly to the Stash:

```ts
await stash.fundEth(100n * 10n ** 18n)
```

Read ETH, ERC-20, and combined WETH/ETH liquidity:

```ts
const availableEth = await stash.availableLiquidity()
const lockedWeth = await stash.totalLocked(weth)
const availableWeth = await stash.availableLiquidity(weth)
const usableBidLiquidity = await stash.availableLiquidityWETHAndETH()
```

`availableLiquidityWETHAndETH()` includes ETH held by the Stash, WETH held by
the Stash, and WETH that the owner has approved for the Stash.

## Orders

`placeOrder` and `processOrder` are exposed because they are part of
`Stash.sol`, but normal app users usually do not call them directly. The
contract expects valid auction-contract call paths, and direct calls may
revert with auction or authorization errors.

```ts
await stash.placeOrder({
  pricePerUnit: 10n * 10n ** 18n,
  numberOfUnits: 1,
  valueWei: 10n * 10n ** 18n,
})

const order = await stash.getOrder(auction)

await stash.processOrder({
  costPerUnit: 10n * 10n ** 18n,
  numberOfUnits: 1,
})
```

## Punk Bids

Offchain Punk bids use the Stash EIP-712 domain with `chainId: 1` and
`verifyingContract`. CryptoPunks are mainnet-only, so the SDK sets the chain ID
internally.

Migration note: replace `signPunkBid({ chainId, bid })` and
`typedDataForPunkBid({ chainId, bid })` with `{ bid }`. Stash Punk bid signing
always uses Ethereum mainnet.

```ts
const bid = {
  order: {
    numberOfUnits: 1,
    pricePerUnit: 90n * 10n ** 18n,
    auction: CRYPTOPUNKS_MARKET_ADDRESS,
  },
  accountNonce,
  bidNonce,
  expiration,
  root,
}

const typedData = stash.typedDataForPunkBid({ bid })

const signature = await stash.signPunkBid({ bid })

await stash.processPunkBid({
  bid,
  punkId: 8348,
  signature,
  proof,
})
```

Cancel one bid nonce or all outstanding bid signatures:

```ts
await stash.cancelPunkBid(12n)
await stash.cancelAllPunkBids()
```

## Withdrawals

Withdraw liquid ETH or ERC-20 balances:

```ts
await stash.withdraw({
  token: weth,
  amountWei: 10n * 10n ** 18n,
})

await stash.withdraw({
  amountWei: 1n * 10n ** 18n,
})
```

Withdraw NFTs and original Punks held by the Stash:

```ts
await stash.withdrawERC721({
  token: nft,
  tokenIds: [1n, 2n],
})

await stash.withdrawERC1155({
  token: editions,
  tokenIds: [1n],
  amounts: [5n],
})

await stash.withdrawPunks([8348])
```

The ERC-721 and ERC-1155 receiver hooks are also exposed for ABI parity, but
they are normally invoked by token contracts during safe transfers.
