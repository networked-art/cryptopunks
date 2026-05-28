# PunksAuction

`PunksAuction` is a zero-fee auction house for CryptoPunks. It runs
24-hour English auctions over single Punks or multi-item lots, holds a
native-ETH purchase-offer book with trait criteria, and settles both the
canonical `CryptoPunks` market and the broken June 9th 2017 `CryptoPunks`
contract — routing every sale through itself so neither market's quirks
reach the seller.

The contract lives at `contracts/contracts/PunksAuction.sol`. It inherits
[`PunkLots`](#lots) (lot bookkeeping) and
[`PunkPurchaseOffers`](#offers) (the offer book), which in turn extends
`PushPullEscrow` for reentrancy guards and capped-gas ETH pushes with a
credit fallback. See the [Reference](/contracts/punks-auction/reference)
page for the full API.

## Purpose

The auction house gives sellers a single venue to clear Punks held on
either market, with three composable primitives:

- **Lots** — a seller bundles one to eighty Punks under one reserve. Each
  Punk carries a `weightBps` that decides how the clearing price is split
  across the bundle for the per-item settlement events.
- **Auctions** — a lot opens into a 24-hour auction seeded by the opener's
  first bid. Bids must clear a 1% minimum increment, and a bid inside the
  last 15 minutes extends the clock (anti-snipe). Anyone can settle once
  the clock runs out.
- **Offers** — a buyer locks ETH behind a list of slots, each a
  trait/color/visual filter (the same `Punks.Filter` language as
  [`PunksMarket`](/contracts/punks-market)) plus optional include and
  exclude id lists. An offer can be filled against a live market listing,
  accepted instantly against a lot, or used to open an auction.

The design deliberately funnels discovery through the 24-hour auction:
instant-settlement paths are seller-gated, while the paths that *start* an
auction are permissionless. A seller lists a lot low and lets the auction
find the price; a buyer who wants the lot now can still trigger the auction
themselves.

## Vault custody

Sellers never approve the auction on a Punk market directly. Instead each
seller custodies their Punks in their own deterministic
[`PunksVault`](/sdk/stash), deployed through the `PunksVaultFactory`, and
approves `PunksAuction` as an operator on that vault.

- At **lot create time** the auction checks that the seller's vault is
  deployed and has approved this contract, and that every listed Punk is
  currently in the vault. The Punk stays in the vault — listing a lot moves
  nothing.
- At **sale start** (an auction opening, or an instant accept) the auction
  pulls the lot's Punks straight from the vault into a dedicated
  [`PunksAuctionEscrow`](#settlement-through-escrow).

Because custody is only a reservation until a sale starts, a seller can
hold a live lot and keep using the Punk. If the Punk leaves the vault or
the operator approval is revoked, the lot becomes stale and anyone may
clear it with `clearStaleLot`.

## Settlement through escrow

Every sale is settled on the underlying Punk market, not peer-to-peer, so
the canonical record stays clean and the June 9th 2017 contract's
accounting bug never touches a user.

The auction owns a single `PunksAuctionEscrow`, deployed in its
constructor and pinned to it. When a Punk is delivered to a winner or
offerer:

1. The escrow lists the Punk for sale **exclusively to the auction** at the
   hammer price (`offerPunkForSaleToAddress(punkId, hammerWei, auction)`).
2. The auction buys it. On the canonical market this emits
   `PunkBought(escrow, auction)` — a real seller and a real buyer — then
   the auction sweeps the escrow's proceeds back and transfers the Punk on
   to the recipient.

Net ETH movement through the markets is zero: the hammer price the auction
pays for the canonical purchase comes straight back via the escrow's
`sweepProceeds`. For the June 9th 2017 `CryptoPunks` market, whose
`buyPunk` miscredits proceeds to the buyer rather than the seller, the
proceeds return through the market's own `withdraw()` (see
[`PunksV1Bug`](/contracts/punks-market)). Either way the seller is paid
once, from the auction's own balance, through the push/pull escrow.

## Immutable Dependencies

| Constant     | Address                                                                                                            | Role                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `PUNKS`      | [`0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB`](https://evm.now/address/0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB) | The canonical `CryptoPunks` market                              |
| `PUNKS_V1`   | [`0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D`](https://evm.now/address/0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D) | The June 9th 2017 `CryptoPunks` market with the proceeds bug    |
| `VAULTS`     | [`0xf3381B259B2FE142c0A87bffF463695d935D6F66`](https://evm.now/address/0xf3381B259B2FE142c0A87bffF463695d935D6F66) | `PunksVaultFactory` used to predict and read seller vaults      |
| `PUNKS_DATA` | [`0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C`](https://evm.now/address/punksdata.eth)                              | Sealed dataset used to evaluate offer criteria against each Punk |

All four are baked into the bytecode and cannot be changed after
deployment. The contract also deploys its own `PunksAuctionEscrow` in the
constructor and exposes it via the immutable `ESCROW`.

## Deployment

The Ignition module at `contracts/ignition/modules/PunksAuction.ts` deploys
the contract with no constructor arguments. The escrow is deployed by the
auction itself; the module reads `ESCROW` off the auction and records it in
the deployment artifact alongside it.

| Contract             | Address                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `PunksAuction`       | [`0x6f99d7E85b4Ba6fFD9ff60A09fc12201027b7873`](https://evm.now/address/0x6f99d7E85b4Ba6fFD9ff60A09fc12201027b7873) |
| `PunksAuctionEscrow` | [`0x366662a518702CE9bC0Be44930ec8d176eF56aD5`](https://evm.now/address/0x366662a518702CE9bC0Be44930ec8d176eF56aD5) |

The constructor also sets the contract's ENS reverse name to
`punksauction.eth` (and the escrow's to `escrow.punksauction.eth`). Both
contracts are deployed only on Ethereum mainnet.

## Documentation Sections

| Section                                                | Use it for                                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| [Reference](/contracts/punks-auction/reference)        | Full API: constants, types, lots, auctions, offers, the offer→lot bridges, offer matching, settlement, events, errors |

For TypeScript usage, see [Offers And Auctions](/sdk/offers-and-auctions).
