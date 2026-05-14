# Review Of CryptoPunks Data Research

Review date: 2026-05-07

This folder is a peer review of the seven research notes in
`docs/cryptopunks-data-research/`. It records:

- where I agree and want to reinforce,
- where I disagree with concrete reasoning,
- where the recommendation can be sharpened with specific changes,
- additional considerations not raised in the original notes,
- a numerical sanity pass over the dataset claims.

The review does not propose a different overall direction. The architectural
pivot from "narrow trait oracle" to "canonical Punk data contract with a thin
criteria adapter and a separate renderer" is the right call and I would not
walk it back. The substantive notes below are about pinning the spec, naming,
the storage shape for the hot settlement path, and a missing predicate
semantic.

## Files

- [01 Disagreements](./01-disagreements.md) — concrete disagreements with the
  current recommendation.
- [02 Improvements](./02-improvements.md) — sharpenings and additions I would
  fold into the V2 spec before any Solidity is written.
- [03 Considerations](./03-considerations.md) — adjacent concerns the research
  did not call out: deployment lifecycle, bidder UX, ENS / mirroring,
  versioning hygiene.
- [04 Numerical Checks](./04-numerical-checks.md) — independent sanity checks
  on the trait, attribute-count, color-count, and pixel totals reported in the
  research, plus byte-budget arithmetic for each proposed blob.
- [05 Full Mosaic Onchain](./05-full-mosaic-onchain.md) — design proposal for
  *generating* the canonical 2400×2400 mosaic onchain from primitives the V2
  contract already stores (`palette.bin` + `indexedPixelsOf(punkId)`), with
  no duplicated artifact storage. Two layers: paged pixel generation
  (workhorse) and paged PNG byte-stream generation (strict art-piece
  deliverable). Single-call full return is shown to be infeasible due to EVM
  memory cost regardless of fees.

## Headline Findings

1. **Naming collides with token V1/V2.** "CryptoPunksDataV2" reads, in this
   codebase, as "the data contract for V2 Punks" rather than "the second
   version of the Punk data contract." The auction code already speaks
   `CRYPTOPUNKS` and `CRYPTOPUNKS_V1` as token standards. Pick a different
   name. Concrete suggestions in
   [03 Considerations](./03-considerations.md#1-naming-avoid-the-v2-suffix).

2. **The mask predicate set is incomplete.** `requiredMask + forbiddenMask`
   only expresses "all of" and "none of." A real bidder population also wants
   "any of" — for example "any sunglasses," "any beard," "any hat." Without an
   `anyOfMask` semantic, that demand has to fragment across N independent
   offers, which is bad for liquidity and bad for the bidder. Add a third mask
   word. Detail in [01 Disagreements](./01-disagreements.md#2-missing-any-of-mask-semantic).

3. **The storage shape for hot scalar data is a tradeoff worth being explicit
   about.** Doc 03 recommends SSTORE2-backed bytecode for *everything*,
   including per-Punk masks. That is the right shape for large sequential
   blobs (palette, indexed pixels, per-trait bitmaps). For the per-Punk mask
   that is hit on every settlement, a plain storage mapping is read-cheaper.
   Recommend a mixed layout. Detail in
   [01 Disagreements](./01-disagreements.md#3-storage-mapping-vs-sstore2-for-hot-scalar-data).

4. **The trait ID assignment is described as "deterministic" but never
   pinned.** Without a concrete ordering committed in this folder, "anyone
   can recompute" is aspirational. The catalog should be specified — exact
   order, exact source name preservation, exact handling of the `Alien`
   collision between exact head variant and normalized type. Detail in
   [02 Improvements](./02-improvements.md#1-pin-the-trait-id-assignment).

5. **`traitIdByNameHash` does not specify the hash.** keccak256 of the raw
   source bytes? UTF-8? lowercased? trimmed? Without a fixed answer, the
   lookup is unusable across implementations. Pin keccak256 of the exact
   source bytes preserving casing and the `Tassle Hat` typo. Detail in
   [02 Improvements](./02-improvements.md#3-pin-the-name-hash).

6. **Verification claims need an explicit pinned source crawl.** The
   reproducibility note records hashes but does not pin the block height or
   chain that the source contract was crawled at. The data is static, but
   pinning still matters for future independent verification. Detail in
   [02 Improvements](./02-improvements.md#5-pin-the-source-crawl).

7. **Design `Offers` against the rich data surface from day one — skip the
   `hasTrait` shim.** Since these contracts are pre-deployment, there is
   no live oracle to migrate from and no live offers to preserve. The
   research's "first useful V2 does not need to rewrite auctions" framing
   is correct in spirit, but the corollary is: the current
   `ICryptoPunksTraits.hasTrait` interface, the `TraitFilter[]` storage
   layout, and the `_requireOfferMatchesPunk` per-filter loop in
   `contracts/offers/PunkPurchaseOffers.sol:243-250` are all freely editable. The V2
   data contract should be consumed *directly* by `Offers`, with mask
   filters as the native shape — not via a compat adapter that bridges
   the smaller interface. The compat adapter is still worth shipping for
   *third-party* protocols that want a minimal hook, but it should not be
   on the critical path for this repo's auction code. Detail in
   [03 Considerations](./03-considerations.md#3-design-offers-against-the-rich-surface-directly).

The remaining notes are smaller — gas-cost framing, ERC-165 ID assignment,
`MetadataUpdate` events at seal, EIP-3860 init-code limit, bounded Merkle
proofs in any future criteria registry, and renderer mode naming. They are in
[02 Improvements](./02-improvements.md) and
[03 Considerations](./03-considerations.md).

## Art-Piece Extension: Mosaic Generated From Primitives

[05 Full Mosaic Onchain](./05-full-mosaic-onchain.md) proposes
*generating* the canonical 2400×2400 mosaic onchain from the primitives
the V2 contract already stores — `palette.bin` and
`indexedPixelsOf(punkId)`. No PNG bytes are stored; every byte of the
output is computed at call time.

Key facts I verified while scoping the proposal (2026-05-07):

- The github file at
  `raw.githubusercontent.com/larvalabs/cryptopunks/master/punks.png` is
  2400 × 2400, 8-bit RGBA, with exactly **222 distinct RGBA colors** —
  same palette as the source contract's `punkImage(uint16)` outputs.
- Concatenating the 10,000 24×24 RGBA tiles from punks.png in row-major
  order (punkId 0 at top-left, columns first) produces a byte stream
  whose SHA-256 is **byte-equal** to the research's recorded hash
  `db0e780ac7553b5dd6a3bb02ed2bf8106c16659e15a36797294e01e8817286bf`
  over concatenated source `punkImage` outputs. That confirms the layout
  convention and gives a verification anchor for any onchain generator.

The constraint reality: a single eth_call cannot return the full
mosaic. EVM memory cost (`3·words + words²/512`) makes a 5.76 MB
indexed return ~64 M gas just for memory expansion, which exceeds
typical eth_call gas caps regardless of how much the caller is willing
to pay. The proposal is therefore paged — the contract knows how to
generate the mosaic byte-for-byte from primitives, and exposes paged
views that downstream code concatenates into the full image.

PNG generation lives in a **dedicated contract** — `CryptoPunksPng` —
that reads from `CryptoPunksData` via public views. The data contract
stays sealed and primitive-only; the encoder is pluggable. Anyone can
deploy a better encoder later (e.g. with real deflate compression) and
have it sit alongside the first one. The same contract handles per-Punk
PNG (`punkPng(punkId)`) and the paged mosaic.

Two delivery layers inside the encoder contract:

- **Layer 1**: paged pixel generation (`mosaicIndexedRow`,
  `mosaicRgbaRow`, `mosaicPixelsHash`). 100 calls assemble the full
  mosaic. The workhorse.
- **Layer 2**: paged PNG byte-stream generation (`pngHeader`,
  `pngStripe`, `pngFooter`). Caller concatenates the parts into a valid
  PNG-8 file whose pixels match `mosaicPixelsHash`. The strict
  art-piece deliverable — even the file-format wrapper is generated
  onchain, with no offchain encoder in the trust path.

Bonus generator: `mosaicIndexedRowFiltered(rowIndex, masks)` produces
the mosaic *through a trait predicate*, with non-matching tiles
transparent. "All 9 Aliens in canonical positions", "every 0-attribute
Punk", etc. — new canonical compositions composed onchain from V2
primitives.

## Internal Consistency Of The Dataset

The trait-count, attribute-count, color-count, and pixel totals all balance to
10,000 Punks and 5,760,000 pixels. The byte budgets in doc 03 are correct to
within rounding. See [04 Numerical Checks](./04-numerical-checks.md). I have
not re-crawled the source contract; this review takes the published hashes on
trust and only checks that the numbers reported in the research are
self-consistent.
