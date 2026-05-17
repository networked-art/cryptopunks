# PunksData

`PunksData` is the sealed data surface for CryptoPunks traits, visual
metrics, palette colors, and 24x24 indexed pixel art. It replaces the old
display-oriented `CryptoPunksData` shape with a machine-readable primitive
that other contracts can use for filtering, rendering, metadata, and
indexing.

The contract lives at `contracts/contracts/PunksData.sol` and implements the
split interfaces in `contracts/contracts/interfaces/IPunksData.sol`. This page
documents how to use the sealed mainnet deployment at
[`punksdata.eth`](https://evm.now/address/punksdata.eth).

## Purpose

`PunksData` is designed as a canonical public-good data contract:

- 10,000 Punks.
- 111 canonical trait bits.
- 222 RGBA palette entries, with palette id `0` reserved for transparency.
- 576 indexed pixels per Punk, exposed in row-major order.
- Per-Punk trait masks, color masks, pixel counts, color counts, normalized
  Punk types, and exact head variants.
- Per-trait, per-color, per-pixel-count, and per-color-count bitmap rows for
  indexers and batch search.

The mainnet dataset is sealed and immutable. Consumers use `PunksData` through
read calls.

## Trust Model

Use the canonical mainnet deployment,
[`punksdata.eth`](https://evm.now/address/punksdata.eth)
(`0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C`), for public reads. If a
consumer accepts a configurable data address, pin it with these checks:

```solidity
require(data.datasetHash() == EXPECTED_DATASET_HASH, "PunksData: wrong data");
```

On the live deployment,
[`datasetHash()`](https://evm.now/address/punksdata.eth/read#datasetHash)
returns the dataset hash below.

## Dataset Reference

The current generated dataset is derived from the immutable Larva Labs
CryptoPunksData contract on Ethereum mainnet:

| Field               | Value                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Source contract     | [`0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2`](https://evm.now/address/0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2) |
| Source network      | Ethereum mainnet                                                                                                   |
| Sealed dataset hash | `0x92117ce6cb6bb70f9ffb9bf51ebbca6a84eae10e70639295d9c4a07958cd1f68`                                               |

The mainnet `PunksData` address recorded in the repo is
[`0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C`](https://evm.now/address/punksdata.eth).

## Documentation Sections

The detailed reference is split by topic:

| Section                                                    | Use it for                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Core Concepts](/contracts/punks-data/core-concepts)       | Trait masks, color masks, bitmap rows, blob storage, compressed pixels, and palette ids |
| [Criteria API](/contracts/punks-data/criteria)             | Trait catalog reads, trait masks, broad Punk type filters, and batch trait bitmaps      |
| [Visual API](/contracts/punks-data/visual)                 | Palette colors, color masks, visual metrics, and visual bitmap rows                     |
| [Indexed Pixels API](/contracts/punks-data/indexed-pixels) | Decoded 24x24 indexed pixels, `colorAt`, and palette byte arrays                        |
| [Usage And Integration](/contracts/punks-data/usage)       | Common patterns, expected reverts, split interfaces, and renderer integration notes     |

The TypeScript SDK has its own [top-level section](/sdk) because it covers both
`PunksData` reads and `PunksRenderer` outputs. For data-specific examples, see
[Data And Search](/sdk/data-search).
