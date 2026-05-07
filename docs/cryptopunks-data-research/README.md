# CryptoPunks Data Contract Research

Research date: 2026-05-07

Subject contract: `0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2`

This folder contains notes on replacing or augmenting the Larva Labs
`CryptoPunksData` contract with an independent public-good data surface that is
better for trait offers, trait filtering, and rendering.

## Documents

- [01 Current Contract Findings](./01-current-contract-findings.md)
- [02 Trait Filtering Interfaces](./02-trait-filtering-interfaces.md)
- [03 Storage And Rendering Options](./03-storage-and-rendering-options.md)
- [04 Final Recommendation](./04-final-recommendation.md)
- [05 Trait Catalog](./05-trait-catalog.md)
- [06 Reproducibility Notes](./06-reproducibility-notes.md)
- [07 Visual Metrics And Renderer Scope](./07-visual-metrics-and-renderer-scope.md)
- [08 Full Composite PNG Generation](./08-full-composite-png-generation.md)

## High-Level Takeaway

The existing data contract is excellent for provenance, but awkward as a
machine-readable data primitive. It exposes attributes as a display CSV string
and SVG as an expensive string-building view.

The broader goal should not be "make the current auction interface work." It
should be an immutable, canonical Punk data contract that exposes traits,
visual metrics, color data, and flattened image data. Trait bidding should be
one consumer of that surface.

The most important contract-facing primitives remain cheap predicates:

```solidity
function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool);
function traitMaskOf(uint16 punkId) external view returns (uint256);
function hasTraits(
    uint16 punkId,
    uint256 requiredMask,
    uint256 forbiddenMask
) external view returns (bool);
function hasColor(uint16 punkId, uint8 colorId) external view returns (bool);
function pixelCountOf(uint16 punkId) external view returns (uint16);
function colorCountOf(uint16 punkId) external view returns (uint8);
```

The current `Offers` contract already accepts an external trait oracle, but the
new data contract should not be shaped around that narrow interface. Auctions
can adapt to the canonical data surface.

## Methodology

- Crawled all 10,000 live `punkAttributes(uint16)` responses through Ethereum
  mainnet `eth_call`.
- Probed representative view gas with `cast estimate`.
- Compared the live contract to the local auction integration surface in
  `contracts/interfaces/ICryptoPunksTraits.sol` and `contracts/offers/Offers.sol`.
- Reviewed relevant standards and public references:
  - Larva Labs onchain CryptoPunks announcement:
    https://larvalabs.com/writing/2021-8-18-18-0/on-chain-cryptopunks
  - Etherscan contract page:
    https://etherscan.io/address/0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2
  - `punks.contracts` notes on the data contract:
    https://github.com/cryptopunksnotdead/punks.contracts
  - ERC-721 metadata standard:
    https://eips.ethereum.org/EIPS/eip-721
  - ERC-4906 metadata update extension:
    https://eips.ethereum.org/EIPS/eip-4906
  - OpenSea metadata docs:
    https://docs.opensea.io/docs/metadata-standards
  - Seaport criteria order docs:
    https://docs.opensea.io/docs/seaport-models
  - EIP-170 contract size limit:
    https://eips.ethereum.org/EIPS/eip-170
  - 0xSequence SSTORE2:
    https://github.com/0xsequence/sstore2
