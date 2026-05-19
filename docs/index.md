# Punks SDK

Developer documentation for the CryptoPunks contracts and the TypeScript SDK
that wraps them. The contracts cover onchain trait and pixel data, the
renderer, and a criteria-bid market that fixes the broken June 2017
CryptoPunks contract. The SDK is the matching client surface: local search
and rendering, original-market reads and writes, Stash custody, criterion
offers, and auctions.

All contracts target Ethereum mainnet only.

## Contracts

- [PunksData](/contracts/punks-data) covers trait masks, visual metrics,
  palette colors, indexed pixels, and dataset commitments.
- [Filter Library](/contracts/punks-data/filter-library) covers the
  composite `Punks.Filter` struct, mask builders, validators, and per-Punk
  predicates that consumer contracts use to query `PunksData`.
- [PunksRenderer](/contracts/punks-renderer) covers SVG, PNG-8, RGBA output,
  marketplace backgrounds, and ERC721-style metadata.
- [PunksMarket](/contracts/punks-market) covers the criteria-bid market
  that wraps the broken June 2017 CryptoPunks contract.
- [UnwrapV1Punks](/contracts/punks-market/unwrap-v1-punks) covers the batch
  helper that unwraps `PunksV1Wrapper` ERC-721 tokens back into their
  underlying Punks.

## SDK

- [TypeScript SDK](/sdk) covers the collection-first SDK for local search,
  rendering, original-market actions, and auction/offer flows.
- [Data And Search](/sdk/data-search) covers local query filtering, facets,
  dataset reads, and offer-slot compilation.
- [Rendering And Metadata](/sdk/rendering) covers local SVG, PNG, RGBA,
  metadata, token URI generation, and exact onchain renderer reads.
- [Original Marketplace](/sdk/original-marketplace) covers original-market
  reads and writes.
- [V1 Market](/sdk/v1-market) covers the criteria-bid market that wraps the
  broken June 2017 CryptoPunks contract.
- [Punk Data Contracts](/sdk/punk-data-contracts) explains local dataset
  usage, `PunksData.sol`, and legacy `CryptopunksData`.
- [Wrappers](/sdk/wrappers) covers modern Stash wrapping, legacy proxy
  wrapping, approvals, and transfers.
- [Stash](/sdk/stash) covers StashFactory, funding, liquidity, Punk bids,
  withdrawals, and orders.
- [Stash Bids](/sdk/stash-bids) covers the Node Foundation offchain bids
  orderbook, signing, submission, and settlement.
- [Offers And Auctions](/sdk/offers-and-auctions) covers criterion offers,
  vault custody, lots, bids, and settlement.
- [Utilities And Caching](/sdk/utilities) covers constants, ABIs, bitmap
  helpers, block options, validation, and cache behavior.
