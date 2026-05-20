# PunksMarket

`PunksMarket` is a native-ETH market that gives the broken `CryptoPunks`
contract deployed by LarvaLabs on June 9th 2017 a working secondary market.
It acts as a directed-listing intermediary and as a criteria-bid book, with
all settlement routed through itself to work around the original contract's
sale-proceeds accounting bug.

The contract lives at `contracts/contracts/PunksMarket.sol`. It inherits
`PushPullEscrow`, which adds reentrancy guards and capped-gas ETH pushes
with a credit fallback. See the [Reference](/contracts/punks-market/reference)
page for the full API.

## Purpose

The June 9th 2017 `CryptoPunks` contract miscredits sale proceeds. Selling
directly through it is unsafe: the seller's `withdraw()` balance can be
clobbered by subsequent sales before they pull it.

`PunksMarket` works around this by inserting itself as the temporary holder
of every settlement:

1. The seller offers the Punk on the original market through
   [`offerPunkForSaleToAddress(punkId, price, punksmarket.eth)`](https://evm.now/address/0x6ba6f2207e343923ba692e5cae646fb0f566db8d/interact#offerPunkForSaleToAddress:::punksmarket.eth)
   — a directed listing whose `onlySellTo` is `PunksMarket`.
2. A buyer or settler calls into `PunksMarket`. The market pays the listing
   from its own ETH, immediately calls the original `withdraw()` to pull the
   credited proceeds back into itself, transfers the Punk on to the final
   recipient, and pushes the proceeds to the real seller.

Public listings (those without `onlySellTo == address(this)`) are rejected
because they do not safely route the seller's proceeds and because we don't want to encourage that potential footgun.

### Creating a directed listing

Listing a Punk is the one part of the workflow that happens on the original
contract, not on `PunksMarket`. The seller calls
[`offerPunkForSaleToAddress`](https://evm.now/address/0x6ba6f2207e343923ba692e5cae646fb0f566db8d/interact#offerPunkForSaleToAddress:::punksmarket.eth)
directly on the June 9th 2017 `CryptoPunks` market:

```solidity
ICryptoPunksMarket(0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D)
    .offerPunkForSaleToAddress(
        punkIndex,         // 0..9999
        minSalePriceInWei, // listing price in wei
        0x64e507FEBF26521b73FbdfA533106B2042533218 // punksmarket.eth
    );
```

The third argument must be the `PunksMarket` address (`punksmarket.eth`).
That is what makes the listing a _directed_ listing and what allows
[`buyPunk`](/contracts/punks-market/reference#buypunk) /
[`acceptBid`](/contracts/punks-market/reference#acceptbid) to settle it
safely. The
[interact link](https://evm.now/address/0x6ba6f2207e343923ba692e5cae646fb0f566db8d/interact#offerPunkForSaleToAddress:::punksmarket.eth)
above prefills the `toAddress` field with `punksmarket.eth` so it cannot be
typed incorrectly.

To cancel a listing the seller calls `punkNoLongerForSale(punkIndex)` on the
original market. There is no listing state stored inside `PunksMarket`
itself — every settlement reads the live offer through
`PUNKS_V1.punksOfferedForSale(punkId)`.

### Bid book

The bid book sits on top of the same settlement primitive: a bid escrows
`bidWei + settlementWei` and declares a trait/color/visual filter — matched
against the sealed [`PunksData`](/contracts/punks-data) contract through the
[Filter Library](/contracts/punks-data/filter-library) — plus optional
include and exclude id lists. Anyone may settle a matching directed listing
against a stored bid and earn the `settlementWei` reward; the bidder
receives the Punk and any difference between their bid and the actual
listing price.

The exact matching predicate, the bid struct layout, and the full lifecycle
API (`placeBid`, `cancelBid`, `adjustBidPrice`, `acceptBid`) are documented
on the [Reference](/contracts/punks-market/reference) page.

The design is inspired by MouseDev's `CryptoPunksBidsV2`.

## Immutable Dependencies

| Constant     | Address                                                                                                            | Role                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `PUNKS_V1`   | [`0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D`](https://evm.now/address/0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D) | The June 9th 2017 `CryptoPunks` market with the proceeds bug   |
| `PUNKS_DATA` | [`0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C`](https://evm.now/address/punksdata.eth)                              | Sealed dataset used to evaluate bid criteria against each Punk |

Both addresses are baked into the bytecode and cannot be changed after
deployment.

## Deployment

The Ignition module at `contracts/ignition/modules/PunksMarket.ts` deploys
the contract with no parameters.

| Contract      | Address                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| `PunksMarket` | [`0x64e507FEBF26521b73FbdfA533106B2042533218`](https://evm.now/address/punksmarket.eth) |

The contract is deployed only on Ethereum mainnet.

## Documentation Sections

| Section                                                  | Use it for                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [Reference](/contracts/punks-market/reference)           | Full API: constants, bid model and matching, purchase API, bid lifecycle, read API, ETH flow, events, errors, integration notes |
| [`UnwrapV1Punks`](/contracts/punks-market/unwrap-v1-punks) | Batch helper that unwraps `PunksV1Wrapper` ERC-721 tokens back into their underlying Punks                                    |

For TypeScript usage, see [V1 Market](/sdk/v1-market).
