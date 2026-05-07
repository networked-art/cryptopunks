# Current Contract Findings

Address: `0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2`

The Larva Labs data contract solved a preservation problem. It put the 10,000
Punk images and text attributes into Ethereum state and exposed three useful
views:

- `punkImage(uint16) -> bytes`: raw 24x24 RGBA pixels.
- `punkImageSvg(uint16) -> string`: SVG data URI.
- `punkAttributes(uint16) -> string`: comma-separated display attributes.

Larva Labs described the contract as making images and attributes queryable from
an Ethereum client, and noted that deployment cost more than 73M gas. A separate
`punks.contracts` write-up points out an important implementation detail: the
data is not visible in source alone; it was loaded through the setup transaction
inputs.

## Live Crawl Results

I crawled all 10,000 `punkAttributes` responses on 2026-05-07.

Dataset hash over lines formatted as `punkId:csv\n`:

```text
3974413596261bb86ff67bd59c563e1a52af90491730c3bb3bb33512ba8c4259
```

Observed trait universe:

- 98 unique names if the first CSV entry is included.
- 11 exact head variants: `Male 1` through `Male 4`, `Female 1` through
  `Female 4`, `Zombie`, `Ape`, `Alien`.
- 87 non-head attributes.
- Normalized type counts:
  - Male: 6,039
  - Female: 3,840
  - Zombie: 88
  - Ape: 24
  - Alien: 9
- Attribute count distribution, excluding the head entry:
  - 0 attributes: 8
  - 1 attribute: 333
  - 2 attributes: 3,560
  - 3 attributes: 4,501
  - 4 attributes: 1,420
  - 5 attributes: 166
  - 6 attributes: 11
  - 7 attributes: 1
- Punk `8348` is the only 7-attribute Punk:
  `Male 2, Buck Teeth, Mole, Big Beard, Earring, Top Hat, Cigarette, Classic Shades`.

See [05 Trait Catalog](./05-trait-catalog.md) for the full count table.

## View Gas Probes

These are `eth_estimateGas` probes for view calls. They are not paid by users
when called offchain, but they matter because RPC providers still enforce call
gas and response limits.

Base fee at probe time:

```text
292,943,721 wei = 0.292943721 gwei
```

Representative estimates:

| Function | Punk | Estimate or result |
| --- | ---: | ---: |
| `punkAttributes(uint16)` | 0 | 40,971 gas |
| `punkAttributes(uint16)` | 8348 | 55,163 gas |
| `punkImage(uint16)` | 0 | 1,182,571 gas |
| `punkImage(uint16)` | 8348 | 1,563,692 gas |
| `punkImageSvg(uint16)` | 0 | 13,700,590 gas |
| `punkImageSvg(uint16)` | 8348 | estimate exceeded a 16,777,216 gas RPC allowance |

Returned SVG string lengths:

| Function | Punk | Response length |
| --- | ---: | ---: |
| `punkImageSvg(uint16)` | 0 | 19,895 chars |
| `punkImageSvg(uint16)` | 8348 | 28,108 chars |

## Issues For Trait Offers

### 1. The Core Attribute API Is Display Text

`punkAttributes` is a CSV string, not structured data. A human can read it, but
a contract cannot use it safely or cheaply. Onchain filtering needs numeric
predicates, bitmasks, or proofs, not string parsing.

This matters directly in this repo. `Offers` verifies filters with:

```solidity
bool hasTrait = TRAITS.hasTrait(punkId, filter.traitId);
```

The current Larva Labs data contract cannot satisfy that interface.

### 2. The First Entry Is Not A Normal Attribute

The first CSV entry is the head type or head variant. It is mixed into the same
string as accessories:

```text
Female 2, Earring, Blonde Bob, Green Eye Shadow
```

For bidding, users usually want both exact and normalized categories:

- Exact head variant: `Female 2`.
- Normalized type: `Female`.
- Rare types: `Zombie`, `Ape`, `Alien`.
- Attribute count: `3 Attributes`, `7 Attributes`, etc.
- Accessory: `Hoodie`, `Beanie`, `3D Glasses`, etc.

The current API exposes only the exact first entry and accessory names.

### 3. No Stable Trait ID Registry

The contract stores `assetNames` internally, but it does not expose:

- `traitCount()`
- `traitName(traitId)`
- `traitIdByName(nameHash)`
- `traitSupply(traitId)`
- `traitKind(traitId)`
- `traitMaskOf(punkId)`

Any downstream contract that wants `traitId = 7` to mean a specific trait must
invent an offchain convention. That is a weak foundation for high-value bids.

### 4. No Trait-Centric Enumeration

The contract can answer "what are this Punk's display attributes?" but not:

- "which Punks have this trait?"
- "how many Punks match this trait?"
- "does this Punk satisfy all required and no forbidden traits?"
- "return the bitmap word for trait X and token IDs 256..511"

Those are the primitives that make collection search, criteria offers, and
offer matching fast.

### 5. Rendering Is Coupled To Expensive String Assembly

`punkImageSvg` builds raw RGBA pixels first, then appends one `<rect>` per
visible pixel with repeated `abi.encodePacked` string concatenation.

That is acceptable for occasional offchain rendering, but it is not a good
base for:

- metadata JSON generation,
- marketplaces that impose `eth_call` gas limits,
- batch preview generation,
- composable onchain rendering.

### 6. The Contract Is Provenance-Oriented, Not Integration-Oriented

The original contract's purpose was preservation. It succeeds at that. A new
contract should keep that provenance, but expose integration-friendly views:

- deterministic numeric trait IDs,
- immutable dataset roots,
- cheap predicate checks,
- metadata-compatible JSON attributes,
- optional renderer improvements.

## Implication For The Auction System

The current auction contracts already made the right architectural move:
`ICryptoPunksTraits` is replaceable and minimal.

That means the first useful V2 does not need to rewrite auctions. It can be a
standalone immutable `hasTrait` oracle. The auction system immediately gets
trait bidding for canonical Punks and V1 Punks that share the same token ID
image/attribute set.

