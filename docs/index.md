# CryptoPunks

Documentation for the onchain CryptoPunks data and rendering contracts.

## Contracts

- [PunksData](/contracts/punks-data) covers trait masks, visual metrics,
  palette colors, indexed pixels, and dataset commitments.
- [PunksRenderer](/contracts/punks-renderer) covers SVG, PNG-8, RGBA output,
  marketplace backgrounds, and ERC721-style metadata.

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
