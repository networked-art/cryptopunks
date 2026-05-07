# Improvements

These are sharpenings I would fold into the spec before any Solidity is
written. They do not change the architecture; they fill in details that are
underspecified in the seven research notes.

## 1. Pin The Trait ID Assignment

Where it appears: `02-trait-filtering-interfaces.md` lines 52–67;
`04-final-recommendation.md` lines 86–98.

Both notes call the trait IDs "deterministic" and "versioned" but no
ordering is committed. Without the concrete table, two implementers will
produce different mask bit assignments and "anyone can recompute" stops
being true.

I would commit one ordering in this folder, before Solidity exists. A
reasonable scheme that is easy to audit:

| Bit | Kind | Source |
| ---: | --- | --- |
| 0 | normalized type — Alien | derived |
| 1 | normalized type — Ape | derived |
| 2 | normalized type — Female | derived |
| 3 | normalized type — Male | derived |
| 4 | normalized type — Zombie | derived |
| 5..15 | exact head variants in alphabetical order | `assetNames` derived |
| 16..23 | attribute count 0..7 | derived |
| 24..110 | accessories in alphabetical order | source CSV literals |

Choices to call out:

1. **Alphabetical, not source-contract order.** The Larva Labs `assetNames`
   table is not stable for new readers — it requires reading the deployment
   transaction. Alphabetical order is determinable from the CSV crawl
   alone.

2. **Exact source name preservation.** "Tassle Hat" stays "Tassle Hat" and
   gets its own bit. "Pink With Hat" stays as the source spelling. Aliases
   live in a separate optional contract per doc 04 line 95–98 — agreed.

3. **Alien / Ape / Zombie collision.** These names appear as both *exact
   head variant* and *normalized type*. Doc 02 implies separate IDs; I
   agree because the predicate kinds are semantically different even if
   the matching sets coincide today. Cost is 3 extra bits.

4. **Bit 0 is non-empty.** Bit 0 reserved as normalized type Alien (rather
   than as a sentinel) avoids special-casing zero in mask code.

This adds up to 111 bits, fits in `uint128`, and the recommendation to
return `uint256` for headroom is fine.

A second-best alternative is to pin the assignment from source contract's
internal `assetNames[]` array order. Either is fine; *some* concrete order
needs to be committed before Solidity is written.

## 2. Pin The Mask Width Decision

Where it appears: `04-final-recommendation.md` lines 79–82.

The doc says "Use uint256 masks even though the first version fits in
128 bits. That leaves room for stable derived predicates without a second
mask type."

Agreed. Worth being explicit about *which* derived predicates we are
reserving room for, so the next maintainer does not invent ad hoc bits.
Candidates:

- "rare type" composite (Alien | Ape | Zombie) — convenience predicate
- per-color-family flags (e.g., "any blue beard") — needs design
- pixel-count tier flags (e.g., "≤ 175 pixels", "≥ 250 pixels") — derived

I would *not* reserve those bits at deploy. I would reserve a documented
range — for example bits 128..255 — for future derived predicates added in
a separate adapter contract, with the rule that the *base* dataset never
sets bits ≥ 128. That keeps the immutable base small and lets derived
predicates compose through bitwise OR at the call site.

## 3. Pin The Name Hash

Where it appears: `02-trait-filtering-interfaces.md` lines 102–107.

```solidity
function traitIdByNameHash(
    bytes32 nameHash,
    uint8 kind
) external view returns (uint16 traitId, bool exists);
```

`nameHash` is not specified. Pin:

- `nameHash = keccak256(bytes(name))`,
- `name` is the *exact* source bytes (case preserved, typos preserved),
- no trimming, no lowercasing, no normalization.

The frontend builds a static name → keccak256 table at build time. The
contract stores the same hash. No ambiguity.

`kind` is needed because of the Alien / Ape / Zombie collision noted in
improvement 1. Document the `kind` enum values explicitly:

- `0 = head variant`
- `1 = normalized type`
- `2 = attribute count`
- `3 = accessory`

## 4. Pin The Onchain `datasetHash()`

Where it appears: `06-reproducibility-notes.md` lines 80–98.

The note records SHA-256 over UTF-8 lines. Useful as an offchain integrity
tag but it is not what the contract should expose, because:

- SHA-256 is not free in Solidity (precompile call).
- Indexers and bidders prefer keccak256.

Recommendation:

- Keep SHA-256 as the *offchain tooling* hash — fine for the README and
  generator artifacts.
- Make `datasetHash()` a keccak256 over the canonical concatenation of:
  - `traitCatalogHash = keccak256(abi.encodePacked(forEach trait: utf8(name) || uint8(kind)))`
  - `punkMaskHash = keccak256(abi.encodePacked(forEach punk: traitMaskOf))`
  - `paletteHash = keccak256(palette bytes)`
  - `indexedPixelsHash = keccak256(forEach punk: indexedPixelsOf)`

  then `datasetHash = keccak256(abi.encode(traitCatalogHash, punkMaskHash,
  paletteHash, indexedPixelsHash))`.

Both hashes can coexist. The point is that *one* of them is the contract's
public commitment, and that one needs to be cheap to recompute and cheap to
include in events.

Also: emit a `DatasetCommitted` event at deploy or at seal that includes
all sub-hashes. That makes the dataset auditable from event logs alone.

## 5. Pin The Source Crawl

Where it appears: `06-reproducibility-notes.md` lines 4–17.

The note says:

```text
Source data contract: 0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2
RPC used for probes: https://ethereum-rpc.publicnode.com
```

Pin further:

- Chain ID (1 for mainnet).
- Block height at which the crawl was performed (every Punk crawl should
  be at one fixed block).
- Source contract code hash (`extcodehash`) at that block.

The data is static, so in practice nothing changes. Pinning still matters
because the *source contract address could be redeployed by an attacker
on a fork* and a future generator without pin information could be tricked
into producing a different blob. Pin the height and code hash and the
attack surface is gone.

Concrete addition to doc 06:

```text
Chain ID: 1
Block height: <pinned>
Source extcodehash: <pinned>
```

## 6. Add ERC-165 Interface IDs Explicitly

Where it appears: `02-trait-filtering-interfaces.md` line 96;
`04-final-recommendation.md` line 61.

Both mention `supportsInterface` but no interface ID is named. Pin them in
the spec, e.g.:

- `IPunkTraitsCompat` (just `hasTrait(uint16,uint16)`) → fixed `bytes4`.
- `IPunkDataCriteria` (mask predicates) → fixed `bytes4`.
- `IPunkDataVisual` (color and pixel views) → fixed `bytes4`.
- `IPunkDataIndexed` (`indexedPixelsOf`, `colorAt`, `palette`) → fixed
  `bytes4`.

Splitting into multiple interface IDs (rather than one giant one) is
useful: a minimal renderer might only support `IPunkDataIndexed`, a
criteria-only adapter might only support `IPunkDataCriteria`. Consumers
can probe per-feature without trusting a marketing header.

## 7. Emit ERC-4906 At Seal Once

Where it appears: `02-trait-filtering-interfaces.md` lines 233–254;
`07-visual-metrics-and-renderer-scope.md` line 192.

If the renderer supports a `tokenUriJson` view, marketplaces will cache
the result. For a sealed dataset, no further updates are expected. Emit
`BatchMetadataUpdate(0, 9999)` exactly once at deploy / seal so caches
invalidate. For a permanent dataset, that single emission is enough.

If the renderer is later replaced (e.g., a better SVG implementation), a
fresh `BatchMetadataUpdate(0, 9999)` is the right way to signal it. Keep
that path open, but the data contract itself should not emit metadata
updates after seal because the underlying bytes never change.

## 8. Bound Merkle Proof Lengths In Any Future Criteria Registry

Where it appears: `02-trait-filtering-interfaces.md` lines 181–212.

The criteria registry sketch takes `bytes32[] calldata includeProof` and
`bytes32[] calldata excludeProof`. Unbounded length is a footgun:

- An attacker submitting a long crafted proof can grief the gas budget
  during fulfilment.
- A misconfigured offer with a tree depth not matching the canonical 14
  (since `ceil(log2(10000)) = 14`) will silently mismatch.

If the registry is shipped, bound proof length to a small constant — for
10,000-Punk trees, 14 is enough. Reject longer proofs explicitly.

## 9. Note EIP-3860 Init Code Limit

Where it appears: `03-storage-and-rendering-options.md` lines 7–10, 64–105.

The doc cites EIP-170 (24,576 byte runtime). It does not cite EIP-3860
(maximum 49,152 byte init code, applies to `CREATE`/`CREATE2`).

For SSTORE2-style chunks where data is written via a constructor that
returns the data as runtime code, the init code is roughly
`runtime_data + ~24 byte wrapper`. A 24,576-byte runtime chunk produces a
~24,600-byte init code, well under the 49,152 limit. So the limit is not
binding in practice for the proposed layout, but the doc should *say so*
to avoid implementer surprise.

If the team is tempted to use 32 KB chunks (which would not fit runtime),
the EIP-170 limit catches that. If the team is tempted to use a
single-shot `CREATE2` of all 24 KB at once, EIP-3860 also does not bite.
Worth a one-line acknowledgement.

## 10. Add A Generator Invariants List

Where it appears: `06-reproducibility-notes.md` lines 102–143.

The current invariants list is good. Add:

- `popcount(traitMaskOf(punkId)) == 1 + 1 + attributeCountOf(punkId)`
  for every Punk: exactly one head variant bit, exactly one normalized
  type bit, and as many accessory bits as the attribute count.
- For every Punk, the head variant bit is consistent with the normalized
  type bit (`Female 1..4` → `Female`, etc.). Hardcode the table; assert.
- Sum over all 10,000 Punks of `popcount(traitMaskOf)` equals sum over
  all trait IDs of `traitSupply(traitId)`.
- For every visible color in `palette.bin`, alpha is 0xFF or 0x80; the
  one transparent color has alpha 0x00.
- For every Punk, `colorMaskOf(punkId)` has popcount equal to
  `colorCountOf(punkId)`. (See `07-visual-metrics-and-renderer-scope.md`
  lines 88–104 for the count distribution.)
- For every Punk, the visible-pixel-bitmap popcount equals
  `pixelCountOf(punkId)`.
- For every Punk, expanding indexed pixels through the palette equals the
  source contract's `punkImage(uint16)` byte-for-byte. (Already in the
  doc; reaffirming.)

These are cheap to assert in the generator and they catch the kinds of
silent miscompiles that fork-testing alone can miss (e.g., a palette
permutation that happens to round-trip raw RGBA but disagrees on the
indexed-pixels claim).

## 11. Rename `BackgroundMode.Default`

Where it appears: `07-visual-metrics-and-renderer-scope.md` lines 177–187.

`Default` is ambiguous: is it the renderer's choice, or specifically the
"owned, no listing, no bid" status colour `#638596`? Pick one and rename
the other.

I would split:

```solidity
enum BackgroundMode {
    Transparent,
    Owned,        // #638596
    ForSale,      // #95554f
    HasBid,       // #8e6fb6
    Transfer,     // #75bf80
    Wrapped,      // #66a670
    LegacyWrapped,// #66a6705e
    Custom
}
```

`Custom` then accepts an explicit RGBA via the second-arg overload, which
is already in the sketch.

## 12. Drop The Return Of `tokenUriJson(uint16, BackgroundMode) string`

Where it appears: `07-visual-metrics-and-renderer-scope.md` line 192.

The signature is fine but consider that `tokenURI` for the canonical Punk
contract is *already* served by Larva Labs and `WrappedPunks`. The new
renderer should produce JSON that downstream wrappers can use, but it
should avoid claiming to *be* the canonical metadata for any specific
Punk token contract. Suggested rename: `metadataJson(uint16,
BackgroundMode)`. Same shape, less implication that this contract owns
the tokenURI for Punks.

## 13. The Adapter Is For Third Parties, Not For This Repo's Migration

Where it appears: `04-final-recommendation.md` lines 122–127.

Doc 04 frames the adapter as a follow-up that lets the existing auction
contract consume the new data surface. Since this repo is
pre-deployment, that framing is upside-down.

For *this repo*, the auction code should consume the rich data surface
directly — see [03 Considerations §3](./03-considerations.md#3-design-offers-against-the-rich-surface-directly).
No adapter is needed on the critical path.

The adapter is still worth shipping, but for a different reason: external
consumers — other Punk-aware protocols — may want a minimal
`hasTrait(uint16,uint16)` view rather than the full predicate surface.
A separately deployed `CryptoPunksTraitsCompat` contract that wraps the
canonical data contract gives them that hook without forcing them to
read masks.

Recommended deployment order:

1. `CryptoPunksAtlas` (or whatever name; the rich data contract).
2. New `CryptoPunksAuctions` deployment pointing at `CryptoPunksAtlas`
   and consuming mask predicates directly. The `Offer` struct, the
   `placeOffer` calldata, the events, and the `MockCryptoPunksTraits`
   test double are all updated as part of this step.
3. `CryptoPunksTraitsCompat` (optional, for external consumers).

The auction code's connection to the canonical data surface is the
*primary* deliverable. The adapter is an optional public-good
courtesy.
