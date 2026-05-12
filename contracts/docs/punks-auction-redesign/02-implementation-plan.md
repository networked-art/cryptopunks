# PunksAuction Redesign — Implementation Plan

This document is the file-by-file change list for the unified N-item / N-slot
redesign. Read [01-design.md](./01-design.md) first.

## 1. Interfaces

### 1.1 `contracts/interfaces/IPunksAuction.sol` — major rewrite

Drop:

- `struct TraitFilter`.
- `error TraitsUnavailable`.
- `enum TokenStandard` variants `ERC721` and `ERC1155`. The enum collapses to
  `{ CRYPTOPUNKS, CRYPTOPUNKS_V1 }`.
- `error UnsupportedStandard`. With the enum exhaustively valid, the
  Solidity-generated bounds check on enum decoding replaces the runtime
  rejection.

Add:

- `struct LotItem { TokenStandard standard; uint16 punkId; uint16 weightBps; }`.
- `struct OfferCriteria { uint256 requiredTraitMask; uint256 forbiddenTraitMask;
  uint256 anyOfTraitMask; uint8 minColorCount; uint8 maxColorCount; }`.
- `struct OfferSlot { OfferCriteria criteria; TokenStandard standard;
  uint16[] includeIds; uint16[] excludeIds; }`.

Reshape:

- `struct Lot` — replace `tokenContract`, `tokenId`, `standard` with
  `itemCount` and `itemHash`. Drop `version` (per-item versions live in
  parallel internal arrays — see 01-design §2.3).
- `struct Auction` — replace `tokenContract`, `tokenId`, `standard` with
  `itemCount` and `itemHash`.
- `struct Offer` — replace `traitFilters`, `includeIds`, `excludeIds`,
  `standard` with `slots`.

Reshape signatures:

- `createLot(LotItem[] calldata items, uint96 reserveWei, uint40 expiresAt)`
  — drops `tokenContract`, `tokenId`, `standard` (now per-item).
- `placeOffer(uint96 amountWei, uint96 settlementWei, address receiver,
  OfferSlot[] calldata slots)` — drops top-level `standard`,
  `traitFilters`, `includeIds`, `excludeIds`.
- `acceptOffer(uint256 offerId, uint16 punkId)` — unchanged signature.
  Behaviour limited to `slots.length == 1` (singleton fast path).
- New: `acceptOfferFromLot(uint256 offerId, uint256 lotId)`.
- `startAuctionFromOffer(uint256 offerId, uint256 lotId)` — second arg
  changes from `uint16 punkId` to `uint256 lotId`.
- New accessors: `getLotItems(lotId)`, `getAuctionItems(auctionId)`,
  `getOfferSlots(offerId)`. `getOfferFilters` is dropped.

Reshape events:

- `LotCreated` — drop `tokenContract`, `tokenId`, `standard`; add
  `itemHash`, `itemCount`.
- `LotItemDetail` (new) — emitted once per item at lot creation.
- `AuctionInitialised` — drop `tokenContract`, `tokenId`, `standard`; add
  `itemHash`, `itemCount`.
- `AuctionItemDelivered` (new) — emitted once per item at settlement.
- `OfferPlaced` — replace `traitFilters`, `includeIds`, `excludeIds`,
  `standard` payload with `slotCount` and an indexed `OfferSlotDetail` per
  slot.
- `OfferSlotDetail` (new) — emitted once per slot at place time.
- `OfferAccepted` — drop `standard`; the single matched Punk's standard is
  recoverable from `OfferSlotDetail` history.
- `OfferAcceptedFromLot` (new).
- `OfferAuctionInitialised` — second arg changes from `punkId` to `lotId`.

Add errors:

- `InvalidItemCount`, `DuplicateLotItem`, `InvalidWeights`,
  `SlotItemCountMismatch`, `MultiSlotOfferRequiresLot`, `OfferStandardMismatch`,
  `InvalidSlotCount`, `InvalidTraitMask`, `InvalidColorCountRange`,
  `PunkVisualMismatch`, `TooManyIds`.

Keep errors:

- `InvalidAmount`, `InvalidExpiry`, `TooManyTokens`,
  `IncorrectPayment`, `NotOfferer`, `OfferNotActive`,
  `NegativeAdjustmentHigherThanCurrentOffer`, `ListingNotValid`,
  `ListingPriceTooHigh`, `PunkNotIncluded`, `PunkExcluded`,
  `PunkTraitMismatch`, `LotNotFound`, `LotExpired`, `LotNotStale`,
  `NotSeller`, `ReserveMismatch`, `ReserveNotMet`, `AuctionDoesNotExist`,
  `AuctionNotActive`, `AuctionAlreadySettled`, `AuctionNotComplete`,
  `MinimumBidNotMet`, `PunkNotInVault`, `PunkContractMismatch`, `NotAuctions`,
  `UnexpectedEtherSender`, `ZeroAddress`.

### 1.2 `contracts/interfaces/ICryptoPunksTraits.sol` — delete

Replaced by direct dependency on `IPunksDataCriteria` + `IPunksDataVisual`
from `IPunksData.sol`.

### 1.3 `contracts/interfaces/IPunksData.sol` — no change

The split sub-interfaces (`IPunksDataCriteria`, `IPunksDataVisual`,
`IPunksDataIndexed`) are already shipped; `Offers` consumes the first two.

## 2. Core contract changes

### 2.1 `contracts/PunksAuction.sol` — major rewrite

Module structure stays: `PunksAuction is IPunksAuction, PunksEscrowManager,
Offers`. Constructor changes:

```solidity
constructor(address punks, address punksV1, address punksData)
    PunksEscrowManager(punks, punksV1)
    Offers(punksData)
{}
```

Storage adds:

```solidity
mapping(bytes32 => uint256)     public  lotForPunk;     // (seller, contract, tokenId) → lotId
mapping(uint256 => LotItem[])   internal lotItems;
mapping(uint256 => LotItem[])   internal auctionItems;
```

A Punk can be in at most one active lot at a time — `lotForPunk` reserves
the slot. See 01-design §2.3 for the single-listing constraint.

`createLot`:

- Take `LotItem[] calldata items` instead of `(tokenContract, tokenId,
  standard)`.
- Validate item count, weights sum, no duplicates, every Punk in vault, and
  every Punk free of another lot (revert `PunkAlreadyInLot(otherLotId)`).
- For every item: `lotForPunk[key(item)] = lotId`.
- Emit `LotCreated` plus one `LotItemDetail` per item.

`updateLot` — straightforward; no item-level changes.

`cancelLot` — release every item's `lotForPunk` slot, then delete the lot.

`clearStaleLot`, `_clearStaleLot`:

- A lot is stale if expired OR any Punk left the seller vault.
- Release every item's `lotForPunk` slot, then delete the lot.

`openAuction`:

- Validate every item still in the seller's vault.
- Delete lot.
- For every item: `delete lotForPunk[key(item)]` and
  `_pullPunk(item.standard, lot.seller, item.punkId)`.
- Allocate auctionId; copy items into `auctionItems[auctionId]`; create
  `Auction` with itemHash/itemCount.
- Emit `AuctionInitialised` plus implicit `Bid`.

`bid` — unchanged.

`settle`:

- Read `auctionItems[auctionId]` and per-item delivery loop (§6.1 in
  01-design).
- Pay seller `latestBidWei` exactly via the cumulative per-item proceeds.
- Emit `AuctionItemDelivered` per item plus `AuctionSettled`.

`startAuctionFromOffer`:

- Take `(offerId, lotId)` instead of `(offerId, punkId)`.
- Match offer.slots ↔ lot.items by index.
- Same effect as `openAuction(lotId)` plus offer consumption.

`_buyListedOfferPunk` — unchanged (still used by the singleton `acceptOffer`
fast path).

`_validateLotArgs` — replaced by `_validateLotItems(items, reserveWei,
expiresAt)`.

`_tokenContractFor(standard)` — small private helper (currently inlined in
`_offerTokenContract` and the escrow router). Hoist to a shared util used by
both lot validation and per-item delivery.

`_isSupportedPunkStandard` — deleted. With the enum collapsed to the two
Punks variants, every value is supported by construction.

Internal helpers added:

- `_validateLotItems(LotItem[] calldata items, uint96 reserveWei, uint40 expiresAt)`.
- `_validateLotItemNoDuplicates(LotItem[] calldata items)` — O(N²); for N≤40
  this is bounded and clean.
- `_releaseLotSlots(address seller, LotItem[] memory items)`.
- `_settleBundleDelivery(LotItem[] memory items, uint96 totalWei, address recipient)`.

### 2.2 `contracts/offers/Offers.sol` — major rewrite

Constructor:

```solidity
constructor(address punksData) {
    if (punksData == address(0)) revert ZeroAddress();
    PUNKS_CRITERIA = IPunksDataCriteria(punksData);
    PUNKS_VISUAL   = IPunksDataVisual(punksData);
}

IPunksDataCriteria public immutable PUNKS_CRITERIA;
IPunksDataVisual   public immutable PUNKS_VISUAL;
```

The two narrow immutables both point at the same address. Required-non-zero
since rich predicate consumption is the entire point.

`placeOffer`:

```solidity
function placeOffer(
    uint96 amountWei,
    uint96 settlementWei,
    address receiver,
    OfferSlot[] calldata slots
) external payable returns (uint256 offerId);
```

- Drop top-level `standard` arg; drop `traitFilters`, `includeIds`,
  `excludeIds`.
- Validate `slots.length` ∈ `[1, MAX_LOT_ITEMS]`, payment, every slot's
  criteria + standard + ID arrays.
- Store offer + slots; emit `OfferPlaced` plus one `OfferSlotDetail` per slot.

`cancelOffer`, `adjustOfferAmount`, `adjustOfferSettlement` — semantics
unchanged; only types of offer struct fields move under the hood.

`acceptOffer(uint256 offerId, uint16 punkId)`:

- Require `offer.slots.length == 1`.
- `_requireSlotMatchesPunk(slots[0], punkId)` — does criteria + includeIds +
  excludeIds + standard.
- Existing market arbitrage flow follows: `_requireAcceptableListing`,
  `_buyListedOfferPunk`, refund excess, pay settlement.

`acceptOfferFromLot(uint256 offerId, uint256 lotId)`:

- Required for any N>1; usable for N=1 if seller chose to escrow.
- Validate slot/item count match, every slot matches its item, lot not stale.
- Delete offer + lot.
- Pull every item, settle with `_settleBundleDelivery(items, offer.amountWei,
  recipient)`.
- Pay msg.sender `offer.settlementWei`.

`startAuctionFromOffer(uint256 offerId, uint256 lotId)`:

- Same matching as acceptOfferFromLot.
- Refund offer.settlementWei to offerer.
- Open the auction in same shape as `openAuction(lotId)` but with the offer
  as the first bid.

`getOfferSlots(uint256 offerId)`:

```solidity
function getOfferSlots(uint256 offerId) external view returns (OfferSlot[] memory) {
    return offers[offerId].slots;
}
```

Internal helpers:

- `_requireSlotMatchesPunk(OfferSlot memory slot, TokenStandard standard, uint16 punkId)`
  — shared by both acceptance paths.
- `_requireValidCriteria(OfferCriteria calldata criteria)`.
- `_requireValidSlots(OfferSlot[] calldata slots)`.
- `_storeOfferSlots(Offer storage stored, OfferSlot[] calldata slots)` —
  copy-loop for the dynamic `slots[]`.

Settlement helpers and offer-consumption helpers (`_consumeOfferForAuction`,
`_offerForOfferer`, `_activeOffer`, `_offerRecipient`, etc.) carry over
mostly unchanged.

Drop:

- `_storeOfferFilters` (per-filter push loop).
- `_requireOfferMatchesPunk` (replaced by per-slot match).
- `_requireSupportedOfferStandard` — obsolete with the enum collapsed to
  Punks-only variants.
- `_offerMarket(standard)` and `_offerTokenContract(standard)` virtuals
  remain (still resolved against `PunksAuction` for the market path).

### 2.3 `contracts/escrow/PunksEscrowManager.sol` — small additions

`_pullPunk` and `_deliverPunk` already operate on a single Punk. Bundle
flows compose them in a loop in `PunksAuction`. No changes to the escrow
contracts themselves.

Optional ergonomic helper (not required):

```solidity
function _pullPunks(LotItem[] memory items, address from) internal {
    uint256 n = items.length;
    for (uint256 i; i < n;) {
        LotItem memory it = items[i];
        _pullPunk(it.standard, _tokenContractFor(it.standard), from, it.punkId);
        unchecked { ++i; }
    }
}
```

If kept, mirror with `_deliverPunks(items, totalWei, recipient)` for the
settlement loop.

### 2.4 `contracts/escrow/PunksEscrow.sol`, `PunkVault.sol` — no changes

Both already operate on a single Punk; bundle loops live one level up.

## 3. Mocks and tests

### 3.1 `contracts/mocks/MockCryptoPunksTraits.sol` — delete

### 3.2 `contracts/mocks/MockPunksData.sol` — new

Implements the slice of `IPunksDataCriteria` + `IPunksDataVisual` consumed by
`Offers`:

```solidity
contract MockPunksData is IPunksDataCriteria, IPunksDataVisual {
    uint16 internal _traitCount;
    mapping(uint16 => uint256) internal _traitMasks;
    mapping(uint16 => uint8)   internal _colorCounts;

    function setTraitCount(uint16 count) external;
    function setTraitMask(uint16 punkId, uint256 mask) external;
    function setColorCount(uint16 punkId, uint8 cc) external;

    function traitCount() external view returns (uint16);
    function traitMaskOf(uint16 punkId) external view returns (uint256);
    function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool);
    function hasTraits(
        uint16 punkId,
        uint256 requiredMask,
        uint256 forbiddenMask,
        uint256 anyOfMask
    ) external view returns (bool);
    function colorCountOf(uint16 punkId) external view returns (uint8);

    // Other view methods revert `Unimplemented` until used.
}
```

`hasTraits` mirrors the real contract's validation:

- Reverts with `InvalidMask` if any mask has bits outside the canonical
  range (`bit >= _traitCount`).
- Reverts on `requiredMask & forbiddenMask != 0`.
- Reverts on `forbiddenMask & anyOfMask != 0`.
- Returns the boolean predicate result otherwise.

### 3.3 `test/PunksAuction.test.ts` — major rewrite

Update the offer placement helper to take an `OfferSlot[]`. Migration cheat
sheet for existing test cases:

| Old | New |
| --- | --- |
| `traitFilters: [{ required: true, traitId: 7 }]` | `slots[0].criteria.requiredTraitMask = 1n << 7n` |
| `traitFilters: [{ required: false, traitId: 7 }]` | `slots[0].criteria.forbiddenTraitMask = 1n << 7n` |
| `includeIds: [4156]` | `slots[0].includeIds = [4156]` |
| `excludeIds: [9999]` | `slots[0].excludeIds = [9999]` |
| `standard: CRYPTOPUNKS` | `slots[0].standard = CRYPTOPUNKS` |

New coverage:

- Multi-slot offer place + match: V1+V2 pair, "couple of zombies".
- Slot/item count mismatch reverts.
- Slot/item standard mismatch reverts.
- Multi-slot offer rejected by `acceptOffer(offerId, punkId)`.
- Single-slot offer accepted via either path (market or lot).
- Color count range matching (lower-only, upper-only, exact bracket, miss).
- Place-time mask validation: bits beyond canonical, required/forbidden
  overlap, forbidden/anyOf overlap.
- Place-time `weightBps` validation: zero weight, sum != 10_000.
- Bundle createLot with V1+V2 pair, six-Punk equal-weight, 80-Punk max.
- Bundle openAuction pulls every Punk; bundle settle delivers every Punk;
  per-item market sale events recorded with weighted prices.
- Per-item version cascading: opening a lot containing item X invalidates
  every other lot containing the same `(seller, tokenContract, X)`.
- Atomicity: forced delivery revert leaves seller unpaid and auction
  unsettled.
- ETH split rounding: last item picks up the remainder so total paid ==
  hammer.

Replace `MockCryptoPunksTraits` deploy + `setTrait` calls with `MockPunksData`
+ `setTraitMask` / `setColorCount` / `setTraitCount`.

Existing harness pieces that move:

- The lot-creation helper: takes `items` (array) instead of `(tokenContract,
  tokenId, standard, reserveWei, expiresAt)`.
- The auction settler helper: still takes `auctionId`; reads items via
  `getAuctionItems`.
- The offer placement helper: takes `slots` array.

## 4. Sequencing

Recommended commit / PR sequence:

1. **Interface rewrite** — `IPunksAuction.sol`, delete `ICryptoPunksTraits.sol`.
   Compiles by itself but breaks downstream contracts.
2. **MockPunksData** — new mock; delete `MockCryptoPunksTraits`.
3. **Offers.sol rewrite** — depends on the new interface and mock.
4. **PunksAuction.sol rewrite** — bundle-aware createLot / openAuction /
   settle / startAuctionFromOffer.
5. **Test rewrite** — migrate existing tests + add bundle coverage.
6. **Gas profiling pass** — measure actual per-item costs at MAX_LOT_ITEMS;
   tighten the bound only if measurements demand it.

Each step compiles after the previous. Steps 3–4 can be split across
commits if it's helpful for review, but the test suite won't be green
until step 5.

## 5. Risks and mitigations

### 5.1 Storage growth on the offer struct

The `OfferSlot[]` indirection costs ~2 storage slots vs the old flat layout
for the singleton case. Acceptable for the project's art-piece deployment
posture, but worth confirming in benchmarks.

### 5.2 ETH split rounding

`weightBps * totalWei / 10_000` truncates. The settlement loop gives the
last item the remainder so the total paid is exact. Test must cover bundles
where every item's allocation is a non-integer division (e.g. 7-Punk lot
with equal split: 1428 bps each, sum 9996, last item gets 1432 to balance
to 10_000). The off-by-rounding is at most `itemCount` wei.

### 5.3 V1 settlement event ordering

V1 bundle items each call `withdraw()` between buy and transfer. Within a
single bundle, this means the V1 escrow's pending balance is drained item
by item. The escrow's `_pushOrCredit(seller, listingWei)` call inside the V1
branch of `_deliverPunk` continues to work: each call adds to the seller's
pending pull balance, which they sweep separately. No accounting drift.

### 5.4 MAX_LOT_ITEMS tightening

`MAX_LOT_ITEMS = 80` is chosen for use-case coverage with more measured
headroom than the earlier 100-item design. If post-implementation gas
measurements reveal real overhead beyond the estimates in 01-design §10,
MAX should be reduced further. Better to ship with measured headroom than
to ship at the edge and have settlement transactions fail under congestion.

### 5.5 Per-item lot reservation storage

`mapping(bytes32 => uint256) lotForPunk` reserves a Punk for one lot at a
time (see 01-design §2.3). Lot creation writes one SSTORE per item;
consumption (openAuction, acceptOfferFromLot, cancelLot, clearStaleLot)
clears them with refund-eligible deletes. For 80-item lots that's 80
SSTOREs at create + 80 deletes at consume.

### 5.6 Offer deletion gas

Deleting an `Offer` with 80 slots iterates 80 dynamic-storage clears.
Cancelling a maxed offer is gas-expensive but linearly bounded. Acceptable.

## 6. Done definition

- All listed contract files compile with the new interfaces.
- All existing test cases pass after migration to `MockPunksData` and
  `OfferSlot[]`.
- New bundle test cases pass (V1+V2 pair, 6-Punk lot, 80-Punk lot,
  single-listing rejection on overlap, atomic delivery revert).
- Gas profile output recorded against MAX_LOT_ITEMS=80 worst case;
  decision to keep or tighten the bound documented.
- `docs/punks-auction-redesign/02-implementation-plan.md` updated with any
  spec deviations discovered during implementation.
