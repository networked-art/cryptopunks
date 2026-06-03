---
'@networked-art/punks-sdk': minor
---

`PunksAuction` and its escrow are deployed on mainnet; wire up their addresses
and round out the auction client.

- New `PUNKS_AUCTION_ADDRESS` and `PUNKS_AUCTION_ESCROW_ADDRESS` constants.
  `PunksAuctionClient` now defaults to the live address (so `address` is
  optional in config but always set) and adds the deployed reads
  `escrowAddress()`, `punksDataAddress()`, `activeLotFor({ seller, standard,
  punkId })`, and `balanceOf(account)`; `vaultFactoryAddress()` now reads
  `VAULTS`.
- Combined create-and-execute flows `createLotAndAcceptOffer` and
  `createLotAndStartAuction` (mirrored on the SDK facade as `createLotAndAccept`
  / `createLotAndStartAuction`), plus `clearStaleLots(ids)` and `withdraw()` for
  ETH credited after a failed direct payout.
- `adjustOfferAmount` now takes an absolute `newAmountWei` and reads the current
  offer on-chain to size `msg.value` (previously `{ amountWei, increase }`).
- New `@networked-art/punks-sdk` `./auction` helpers mirroring the contract:
  the `PUNKS_AUCTION_*` constants (`MAX_LOT_ITEMS`, `MAX_INSTANT_ITEMS`,
  `MAX_OFFER_SLOTS`, `MAX_SLOT_IDS`, `TOTAL_WEIGHT_BPS`, `BID_INCREASE_BPS`,
  `BPS`, `DURATION_SECONDS`, `BIDDING_GRACE_SECONDS`), `minPunksAuctionBidWei`,
  `splitPunksAuctionLotWeights`, `punksAuctionOfferSlotMatchesPunk`,
  `punksAuctionLotMatchesOffer`, `isPunksFilterEmpty`, and the
  `PunksAuctionLotLike` / `PunksAuctionOfferLike` types. Lot and offer builders
  now enforce these bounds.

Thanks [@yougogirldoteth](https://github.com/yougogirldoteth)!
