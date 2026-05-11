# CryptoPunks

Documentation for the onchain CryptoPunks data and rendering contracts.

## Contracts

- [PunksData](/contracts/punks-data) covers trait masks, visual metrics,
  palette colors, indexed pixels, dataset commitments, and the sealed loader.
- [PunksRenderer](/contracts/punks-renderer) covers SVG, PNG-8, RGBA output,
  marketplace backgrounds, and ERC721-style metadata.

## SDK

- [TypeScript SDK](/sdk) covers the collection-first SDK for local search,
  rendering, original-market actions, and auction/offer flows.
- [Data And Search](/sdk/data-search) covers local query filtering, facets,
  dataset reads, and offer-slot compilation.
- [Rendering And Metadata](/sdk/rendering) covers local SVG, PNG, RGBA,
  metadata, token URI generation, and exact onchain renderer reads.
- [Market, Offers, And Auctions](/sdk/market-actions) covers original-market
  writes, criterion offers, vault custody, lots, bids, and settlement.
- [Utilities And Caching](/sdk/utilities) covers constants, ABIs, bitmap
  helpers, block options, validation, and cache behavior.
