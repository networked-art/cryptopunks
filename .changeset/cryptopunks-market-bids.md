---
'@networked-art/punks-sdk': minor
---

Add the native bidding surface to `PunksMarketClient`.

- `bid(punkId)` reads the current `punkBids` entry into a new `PunkMarketBid`
  (`{ punkId, hasBid, bidder, valueWei }`).
- `enterBid`, `acceptBid`, and `withdrawBid` (each with a `prepare*` variant)
  wrap `enterBidForPunk`, `acceptBidForPunk`, and `withdrawBidForPunk` on the
  canonical `CryptoPunksMarket`.
