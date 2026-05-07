# Additional Considerations

These are concerns the seven research notes do not call out. None of them
block the V2 design; all are worth at least a sentence in the spec before
implementation.

## 1. Naming — Avoid The "V2" Suffix

Already covered as a disagreement in
[01 Disagreements](./01-disagreements.md#1-the-name-cryptopunksdatav2). The
short version: this codebase already uses V1/V2 to label *Punk token
standards*, so `CryptoPunksDataV2` reads ambiguously. Pick a name that
does not reuse that suffix. `CryptoPunksAtlas`, `OnchainPunkData`,
`CanonicalPunkData`, `PunkRegistry` are all fine; `CryptoPunksDataV2` is
not.

## 2. Sealed-Initializer Pattern Should Be Specified

Where the research touches it: `03-storage-and-rendering-options.md` lines
296–309 ("Prefer constructor-time immutable roots or one-time loader plus
seal").

For a public-good claim of "immutable forever," a one-line "we'll seal it"
is not a spec. The pattern I would commit to:

- Constructor records `address admin` (or uses `Ownable`).
- `loadChunk(blobName, index, bytes data)` writes one SSTORE2 chunk and
  records a pointer. Only `admin` can call.
- `seal()` is called once: it writes the canonical `datasetHash`,
  emits `DatasetCommitted`, sets `admin = address(0)`, and disables every
  loader function permanently.
- After seal, every state-changing function reverts.
- After seal, the contract has no owner, no admin, no proxy, no upgrade
  path. Period.

Worth being explicit because "seal" can mean three different things
across the EVM ecosystem (admin removal, proxy lock, code freeze) and a
public-good audience reads each differently.

## 3. Design `Offers` Against The Rich Surface Directly

Where the research touches it: `01-current-contract-findings.md` lines
171–179; `04-final-recommendation.md` lines 122–145.

The contracts in this repo are pre-deployment as of 2026-05-07. There is
no live oracle to migrate away from and no live offers to preserve.

That changes the recommended shape. Doc 04 frames the auction work as a
"follow-up" — keep the existing `ICryptoPunksTraits.hasTrait` shim during
phase 1, then move to mask filters in a "later `Offers` version." That
framing makes sense for a deployed contract that needs an evolution path.
For this repo, it just adds a layer.

The cleaner sequence:

1. Spec and ship the data contract (e.g., `CryptoPunksAtlas`) with the
   rich predicate interface from doc 04 §"Core Data Scope" — `hasTrait`,
   `traitMaskOf`, `hasTraits`. Plus the `anyOfMask` extension recommended
   in [01 Disagreements §2](./01-disagreements.md#2-missing-any-of-mask-semantic).
2. Rewrite `contracts/offers/Offers.sol` so that:
   - `Offer.traitFilters` (currently `TraitFilter[]`) is replaced by the
     mask trio: `requiredMask`, `forbiddenMask`, `anyOfMask` (or just the
     pair if the team wants to skip "any-of" for v1).
   - `_requireOfferMatchesPunk` calls `TRAITS.hasTraits(...)` once per
     offer, not once per filter
     (`contracts/offers/Offers.sol:243-250`).
   - `placeOffer` takes mask args directly, not `TraitFilter[] calldata`.
   - Events emit the masks.
3. Replace `ICryptoPunksTraits` with the richer interface
   (`ICryptoPunksAtlasCriteria` or similar). The current single-method
   interface is no longer load-bearing.

The compat adapter is still worth shipping — see
[02 Improvements §14](./02-improvements.md#14-the-adapter-is-for-third-parties-not-for-this-repos-migration)
— but as a *separate deployment artifact* aimed at external consumers,
not as a bridge that exists for this repo's benefit.

Two practical knock-on effects:

- The events `OfferPlaced` and `getOfferFilters` need to change shape
  (mask args replacing the filter array). That is a breaking event
  schema change — fine because nothing is indexing the current shape
  yet.
- The `MockCryptoPunksTraits` test double
  (`contracts/mocks/MockCryptoPunksTraits.sol`) needs to expose the
  richer mock surface. Easy: a `mapping(uint16 => uint256) punkMask` and
  a `setMask` helper. The current `mapping(uint16 => mapping(uint16 =>
  bool))` shape goes away.

These changes are routine because the contracts are pre-deployment. They
would be much harder if there were live offers. Make them now.

## 4. Auction Contract Storage Compaction Tradeoffs

Where the research touches it: `04-final-recommendation.md` lines 128–145.

Since the contracts are pre-deployment, the `Offer` struct in
`contracts/interfaces/IPunksAuction.sol:41` can be redesigned
freely. The mask-based shape is straightforwardly the right call. This
section just records the slot accounting so the team can pick the final
layout deliberately.

Current shape per offer:

- `TraitFilter[] traitFilters` — dynamic array. For the common 1–4 filter
  case, this occupies 1 length slot + 1 data slot (each filter is 4 bytes
  packed) = 2 storage slots.
- `uint16[] includeIds` — dynamic array. Often empty.
- `uint16[] excludeIds` — dynamic array. Often empty.

Proposed shape:

- `uint256 requiredMask` — 1 slot.
- `uint256 forbiddenMask` — 1 slot.
- (with anyOfMask) `uint256 anyOfMask` — 1 slot.
- `uint16[] includeIds`, `uint16[] excludeIds` — unchanged.

Slot count by filter count:

| Filters per offer | Current (slots) | Mask form, no any-of | Mask form, with any-of |
| ---: | ---: | ---: | ---: |
| 0 | 1 (length only, zero) | 2 | 3 |
| 1 | 2 | 2 | 3 |
| 2–4 | 2 | 2 | 3 |
| 5–7 | 2 | 2 | 3 |

(The current shape uses 1 length slot + 1 data slot for up to 8 filters
because each filter is 4 bytes packed.)

So the mask form is *fixed cost* (2 or 3 slots) regardless of filter
count, while the current shape is *variable* (1–2 slots). The mask form
loses on the no-trait-filter offer (2/3 slots vs 1) and ties or wins
otherwise. The wins are bigger on:

- calldata size at offer creation,
- gas at settlement (no per-filter loop, no per-filter external call),
- event size,
- offchain indexer schema simplicity.

A pragmatic optimisation: pack the masks together with `Offer`'s other
small fields. The current `Offer` already has `uint96 amountWei`, `uint96
settlementWei`, `address offerer`, `address receiver`, and
`TokenStandard standard`. Those total 96 + 96 + 160 + 160 + 8 = 520 bits,
which spreads across 3 slots. With masks added, the layout could be:

- slot 0: `uint96 amountWei` + `uint96 settlementWei` + `uint8 standard` +
  `bool hasFilters`
- slot 1: `address offerer`
- slot 2: `address receiver`
- slot 3: `uint256 requiredMask` (only if `hasFilters`)
- slot 4: `uint256 forbiddenMask` (only if `hasFilters`)
- slot 5: `uint256 anyOfMask` (only if `hasFilters` and used)

Empty masks for offers without trait filters could be skipped at
write-time using a `hasFilters` boolean. Implementation detail — the
spec just needs to commit the field set. The point is that pre-deployment
freedom lets the team optimise the layout for the offer population they
actually expect.

## 5. Bidder UX For Mask Composition

Where the research touches it: nowhere directly.

Mask-based offers shift work to the frontend. A bidder needs:

- A canonical trait → bit table.
- A composer that builds `requiredMask`, `forbiddenMask`, (and ideally
  `anyOfMask`) from a UI selection.
- A way to detect that a stored offer's masks reference unknown bits
  (e.g., if a future predicate adapter adds bits 128+).

Recommend committing the trait → bit table as a JSON artifact in the
deployment artifacts and treating it the same way ABI files are treated:
checked into version control, tagged with the deployed address.

Without that artifact, recovering the mask semantics from chain alone
requires reading the catalog views from the contract, which is fine but
slow and adds an RPC dependency to every UI build.

## 6. ENS And Mirroring

For a public-good contract, post-deploy chores worth doing:

- ENS subdomain pointing at the address (`punks-data.eth` or similar).
- Mirroring of the deployment artifacts (trait table, palette,
  pinned source crawl) on IPFS with a content hash recorded in the
  contract event.
- Etherscan source verification with a deterministic build (committed
  Solidity version, optimizer settings, exact build flags).

Out of scope for the spec, but worth a checklist appended to doc 04 so it
does not get forgotten.

## 7. Color Predicate Granularity

Where the research touches it: `07-visual-metrics-and-renderer-scope.md`
lines 50–115.

The proposed `hasColor(uint16, uint8)` and `colorMaskOf(uint16)` are
predicate-friendly. There are 222 colors total (221 visible + 1
transparent), so a single 256-bit mask covers it cleanly. Good.

Worth adding to the spec: a *small* set of derived color predicates,
because raw colors are too granular for most bidders.

For example, "has any red-family color" or "has black background" are
common requests. They should not be built into the data contract (color
families are subjective like trait categories). They belong in a separate
optional taxonomy.

But the data contract should make those predicates *cheap to build* by
exposing `colorMaskOf` directly, which it does. So no change to the data
contract — just note in the spec that color-family predicates are
explicitly out of scope for the canonical layer.

## 8. Legacy-Wrapped Background Has Alpha

Where the research touches it: `07-visual-metrics-and-renderer-scope.md`
lines 200–225.

`#66a6705e` has alpha `0x5e`. The `bytes4 rgba` representation handles
this fine. The renderer should be careful with how this interacts with
the underlying Punk pixels:

- Translucent background composited *under* opaque punk pixels: identical
  to opaque background.
- Translucent background composited *under* semi-transparent (alpha 0x80)
  punk pixels: blended.
- Final raster: needs an alpha-channel-aware compositor.

Three alpha values exist in the Punk dataset (0, 128, 255 per doc 07
line 16). Composition with a translucent background is well-defined but
should be specified rather than left to each consumer.

Recommendation: the renderer's `punkRgba(punkId, mode)` should *flatten*
the punk against the chosen background and return fully opaque output
(alpha 255 everywhere). The renderer's `indexedPixelsOf(punkId)` should
*not* take a background — it returns the canonical indexed image without
flattening, and the consumer composites if they want.

That separation keeps the indexed-pixel data canonical and the renderer
the only place where compositing happens.

## 9. Deployment Cost — Order-Of-Magnitude Sanity

Where the research touches it: `03-storage-and-rendering-options.md` line
3 ("Deployment cost is not the primary constraint").

Order-of-magnitude budget for the recommended payload:

- 5.76 MB indexed pixels @ ~200 gas/byte (SSTORE2 amortized) ≈ 1.15 B gas.
- 320 KB trait masks (storage) @ ~100 gas/byte after EIP-2929
  optimisation ≈ 32 M gas (rough; in practice many `SSTORE` of dirty
  slots, ~22.1K each). 10,000 × 22,100 = 221 M gas. SSTORE2 ≈ 65 M.
- 135 KB trait bitmaps (SSTORE2) ≈ 27 M gas.
- 720 KB visible-pixel bitmaps ≈ 144 M gas SSTORE2.
- 320 KB color masks ≈ 65 M gas SSTORE2.
- 230 KB color histograms ≈ 46 M gas SSTORE2.

Total ≈ 1.6 B gas at the SSTORE2-everywhere shape. At 30 M gas per block,
that is ~55 transactions of pure data-loading. At 5 gwei mainnet, that
is ~8 ETH. At 0.5 gwei mainnet, ~0.8 ETH.

These numbers are rough. The point: "deployment cost is not the primary
constraint" is *acceptable* if the team is prepared for low-single-digit
ETH on mainnet. If the team prefers an L2 deployment, the cost is two to
three orders of magnitude lower; if mainnet, the cost is real but not
prohibitive. Worth recording the rough number in doc 03 so the team is
not surprised.

## 10. The "11 Exact Head Variants" Choice Is A Convention

Where the research touches it: `01-current-contract-findings.md` lines
38–40; `05-trait-catalog.md` lines 12–37.

Doc 01 lists 11 head variants: `Male 1..4`, `Female 1..4`, plus three
single-variant `Zombie`, `Ape`, `Alien`. That is the source contract's
choice and the right thing to preserve.

But the predicate space described in doc 02 collapses Alien / Ape /
Zombie's exact-variant predicate to the same set as their normalized-type
predicate. As noted in [02 Improvements](./02-improvements.md#1-pin-the-trait-id-assignment), I think
giving them separate bits is correct because the predicate *meaning* is
different even if the matching set is identical today.

Worth a one-paragraph note in doc 02 saying so explicitly. Otherwise a
later reader will think "Alien" should have one bit, not two, and may
"clean up" the catalog into a non-canonical form.

## 11. The Renderer's Role In The Auction Path

Where the research touches it: `04-final-recommendation.md` lines
148–164.

The current auction path does not call any rendering view. It only calls
`hasTrait`. The proposed `CryptoPunksRendererV2` is for *display*, not
for *settlement*. Worth saying so explicitly to head off concerns about
SVG gas in transactions:

> Renderer views are for offchain display and `eth_call` consumption.
> No auction or settlement function calls the renderer. The renderer's
> existence does not affect the gas profile of bid placement,
> acceptance, or settlement.

That paragraph belongs in doc 04 near the renderer scope.

## 12. The "Public Good" Framing — Who Pays?

Where the research touches it: implicit throughout.

A canonical onchain data contract is a public good only if someone funds
the deployment and someone keeps the source verified. Worth recording in
the spec who is committing to:

- pay deployment gas,
- maintain Etherscan verification,
- maintain the IPFS mirror of artifacts,
- be the canonical address listed in documentation.

Not a Solidity question, but a commitment question. A doc that pretends
this is "the contract everyone will use" without naming a deployer
implicitly forecloses the answer to whoever moves first.

## 13. What This Project Specifically Needs From V2

Backing up from the spec: this repository is `cryptopunks-auctions`, a
zero-fee auction house. The narrowest thing it actually needs is the
ability to do mask-based trait filtering on Offers. Everything else in
the V2 spec — color predicates, indexed pixels, renderer — is icing.

If shipping V2 turns out to be nontrivial, the team's option to ship
*only* the trait-mask layer first and add visual data later is sound.
The doc could call this out as a phased delivery option:

- Phase 1: per-Punk trait masks + per-trait bitmaps + catalog (≈ 295 KB).
  Auction system gets cheap mask-based bidding immediately.
- Phase 2: color masks + visual metric scalars (≈ 320 KB additional).
- Phase 3: full palette + indexed pixels + renderer (≈ 5.76 MB
  additional).

Each phase produces an immutable, sealed contract. Later phases extend
the data surface in *separate* contracts that reference Phase 1 by
address; there is no upgrade. That is consistent with the
"no proxies, no upgrades" public-good posture.

Worth adding to doc 04 as a sequencing option.
