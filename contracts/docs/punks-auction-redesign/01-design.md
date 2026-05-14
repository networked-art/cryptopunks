# PunksAuction Redesign — Design

## 1. Context

`contracts/PunksAuction.sol` and `contracts/auction/PunkPurchaseOffers.sol` currently model
a lot, an auction, and an offer as exactly one Punk. The public structs hold
one `(tokenContract, tokenId, standard)` tuple, `createLot` validates one
Punk, `openAuction` pulls one Punk into escrow, `settle` delivers one Punk,
and `acceptOffer` matches one Punk against the offer's `TraitFilter[]` via the
old `ICryptoPunksTraits` shim.

Two upstream changes invalidate that shape:

1. **`PunksData` exposes mask-based predicates.** `hasTraits(punkId, req,
   forb, anyOf)` collapses an entire trait filter into one external call;
   `colorCountOf(punkId)` adds a cheap visual predicate. The per-trait loop in
   `Offers._requireOfferMatchesPunk` is no longer the right shape.
2. **Bundle use cases are real.** V1+V2 pairs, "Punk couple" offers, and
   curated multi-Punk lots (6-Punk collections, larger artist baskets) all
   require N>1.

The auction contracts are immutable. There is no v2. The single deployment
must natively support both single-Punk and bundle flows.

This document specifies the unified N-item / N-slot redesign.

## 2. Data structures

### 2.1 Tokens

```solidity
enum TokenStandard {
    CRYPTOPUNKS,
    CRYPTOPUNKS_V1
}
```

`PunksAuction` is Punks-only by design. The enum collapses to the two Punks
variants — `ERC721` and `ERC1155` are removed. Any future support for other
token standards is a separate contract, not a future variant of this one.

Removing the placeholder variants also removes the runtime
`UnsupportedStandard` check: every value the enum can hold is a valid Punks
standard, so the Solidity-generated bounds check on enum decoding is the only
validation needed.

### 2.2 Lot items

```solidity
struct LotItem {
    TokenStandard standard;
    uint16        punkId;
    uint16        weightBps;  // 1..10_000; Σ across lot must equal 10_000
}
```

Packed: `1 + 2 + 2 = 5` bytes per item, comfortably within one storage slot
when stored in an array.

`weightBps` is mandatory on every item. Frontends default to
`floor(10_000 / itemCount)` with the rounding remainder added to the first
item. Sellers can override per item.

The lot's settlement ETH is split per item by `weightBps` so that the per-item
delivery prices recorded by the CryptoPunks market reflect the seller's chosen
allocation. For a V1+V2 pair, a seller may pick `9500 / 500` to make the V2
side carry the bulk of the recorded sale; for a six-Punk equal split, every
item carries `1666` (or `1667` for the rounding-remainder item).

### 2.3 Lots and auctions

```solidity
struct Lot {
    address seller;
    uint96  reserveWei;
    uint8   itemCount;
    bytes32 itemHash;       // keccak256(abi.encode(items))
}

struct Auction {
    address seller;
    address latestBidder;
    uint96  latestBidWei;
    uint40  endTimestamp;
    uint8   itemCount;
    bytes32 itemHash;
    bool    settled;
}
```

Items are stored separately in `mapping(uint256 => LotItem[])` (one for lots,
one for active auctions) so the public `lots(id)` / `auctions(id)`
auto-getters return clean scalar fields. `itemHash` commits to the exact item
ordering for offchain consumers.

A Punk can be in at most one active lot at a time. The `lotForPunk` mapping,
keyed by `keccak256(seller, tokenContract, tokenId)`, holds the active lot id
or 0. `createLot` writes the entry; `cancelLot`, `clearStaleLot`, `openAuction`,
`acceptOfferFromLot`, and `startAuctionFromOffer` clear it. Trying to create
a lot whose Punk is already reserved reverts with `PunkAlreadyInLot(lotId)` —
the seller must `cancelLot(lotId)` (or the lot must become invalid and be
cleared with `clearStaleLot`) before
re-listing the same Punk.

```solidity
mapping(bytes32 => uint256) public lotForPunk;     // (seller, contract, tokenId) → lotId

mapping(uint256 => Lot)         public  lots;
mapping(uint256 => LotItem[])   internal lotItems;

mapping(uint256 => Auction)     public  auctions;
mapping(uint256 => LotItem[])   internal auctionItems;
mapping(uint256 => address)     public  winnerReceivers;
```

Public accessors:

```solidity
function getLotItems(uint256 lotId) external view returns (LotItem[] memory);
function getAuctionItems(uint256 auctionId) external view returns (LotItem[] memory);
function activeLotFor(address seller, TokenStandard standard, uint16 punkId)
    external view returns (uint256);
```

`activeLotFor` is the typed read of `lotForPunk` for UIs and indexers that
prefer not to compute the key offchain.

### 2.4 Offer criteria

```solidity
struct OfferCriteria {
    uint256 requiredTraitMask;
    uint256 forbiddenTraitMask;
    uint256 anyOfTraitMask;
    uint8   minColorCount;   // 0 = no lower bound
    uint8   maxColorCount;   // 0 = filter disabled
}
```

Mask validation rules match `IPunksDataCriteria.hasTraits`:

- Every set bit in any of the three masks must lie within the canonical trait
  range (`bit < traitCount()`).
- `requiredTraitMask & forbiddenTraitMask == 0`.
- `forbiddenTraitMask & anyOfTraitMask == 0`.
- `requiredTraitMask & anyOfTraitMask` overlap is allowed but redundant.

`COLOR_COUNT_MAX = 14` is the sealed-dataset invariant; `Offers` hardcodes
this constant rather than expanding `IPunksDataVisual` to expose bounds.

### 2.5 Offer slots

```solidity
struct OfferSlot {
    OfferCriteria criteria;
    TokenStandard standard;       // CRYPTOPUNKS or CRYPTOPUNKS_V1; no "any" sentinel
    uint16[] includeIds;
    uint16[] excludeIds;
}

struct Offer {
    uint96  amountWei;
    uint96  settlementWei;
    address offerer;
    address receiver;
    OfferSlot[] slots;             // 1..MAX_PUNKS
}

mapping(uint256 => Offer) public offers;
```

Three motivating cases drop in cleanly:

- **"Any zombie"**: `slots = [{ criteria: { requiredTraitMask: 1 << ZOMBIE_BIT,
  ... }, standard: CRYPTOPUNKS, includeIds: [], excludeIds: [] }]`.
- **V1+V2 pair of #4156**: `slots = [
    { standard: CRYPTOPUNKS_V1, includeIds: [4156], ... },
    { standard: CRYPTOPUNKS,    includeIds: [4156], ... }
  ]`.
- **"Couple of zombies"**: two slots, both with shared zombie `criteria`,
  empty `includeIds`/`excludeIds`, both `standard: CRYPTOPUNKS`.

The `Offer` struct does not carry a top-level `standard` — each slot carries
its own. The singleton-fast-path `acceptOffer(offerId, punkId, expectedListingWei)`
uses `slots[0].standard` to decide which CryptoPunks market to look at.

### 2.6 Constants

```solidity
uint8  internal constant MAX_PUNKS    = 80;
uint16 internal constant TOTAL_WEIGHT_BPS = 10_000;
uint8  internal constant COLOR_COUNT_MAX  = 14;
uint16 internal constant BPS              = 10_000;
uint16 internal constant BID_INCREASE_BPS = 1_000;
uint40 internal constant AUCTION_DURATION = 24 hours;
uint40 internal constant BIDDING_GRACE_PERIOD = 15 minutes;
```

## 3. Lots lifecycle

### 3.1 createLot

```solidity
function createLot(
    LotItem[] calldata items,
    uint96 reserveWei
) external returns (uint256 lotId);
```

Validation:

- `items.length` ∈ `[1, MAX_PUNKS]`.
- No duplicate `(standard, punkId)` within the lot.
- Every `item.weightBps > 0` and Σ `weightBps == TOTAL_WEIGHT_BPS`.
- Every Punk is in the seller vault for its standard. (Vault ownership is the
  authoritative source: for canonical Punks the seller must hold the Punk;
  for V1 the seller must hold the V1 Punk.)
- For every item: `lotForPunk[key]` is 0. Otherwise revert
  `PunkAlreadyInLot(existingLotId)`.
- `reserveWei > 0`.

State changes:

- Allocate `lotId = ++lastLotId`.
- Store `Lot { seller, reserveWei, itemCount, itemHash }`.
- Store `lotItems[lotId] = items`.
- For every item: `lotForPunk[key(items[i])] = lotId`.

Events: see §8.

### 3.2 updateLot, cancelLot, clearStaleLot, clearStaleLots

```solidity
function updateLot(uint256 lotId, uint96 reserveWei) external;
function cancelLot(uint256 lotId) external;
function clearStaleLot(uint256 lotId) external;
function clearStaleLots(uint256[] calldata lotIds) external;
```

`cancelLot` (seller-only) and `clearStaleLot` (anyone) both `delete
lotForPunk[key]` for every item in the lot, releasing those Punks for
re-listing.

Stale conditions (any one):

- The seller vault no longer approves the auction contract.
- For any item: the Punk is no longer in the seller vault (custody slipped
  externally — typically a `reclaim` from the escrow).

### 3.3 openAuction

```solidity
function openAuction(uint256 lotId, uint96 expectedReserveWei)
    external
    payable
    returns (uint256 auctionId);
```

Validation:

- Lot exists.
- `lot.reserveWei == expectedReserveWei` (frontend protection against reserve
  changes between read and submit).
- `msg.value >= lot.reserveWei` (cast to `uint96` with overflow check).
- For every item: the Punk is in the seller vault.

State changes (in order):

1. Delete the lot (so external custody moves can't re-enter into stale state).
2. For every item: `delete lotForPunk[key(item)]` (Punks are now in escrow,
   not in any lot).
3. For every item: `_pullPunk(item.standard, ...)` from seller vault into
   escrow custody.
4. Allocate `auctionId = ++lastAuctionId`.
5. Store `Auction { seller, latestBidder = msg.sender, latestBidWei,
   endTimestamp = now + AUCTION_DURATION, itemCount, itemHash, settled = false }`.
6. Store `auctionItems[auctionId] = items` (copied from `lotItems`).

Events: see §8.

### 3.4 bid, settle

```solidity
function bid(uint256 auctionId) external payable;
function settle(uint256 auctionId) external;
```

`bid` is unchanged from current single-Punk semantics. The auction-level
fields (`latestBidWei`, `endTimestamp`, anti-snipe extension) are
item-count-agnostic.

`settle` uses the per-item delivery loop in §6.

### 3.5 startAuctionFromOffer

```solidity
function startAuctionFromOffer(uint256 offerId, uint256 lotId, uint96 minAmountWei)
    external
    returns (uint256 auctionId);
```

Bootstraps an auction with an existing offer as the first bid.

Validation:

- `offer.slots.length == lot.itemCount`.
- `offer.amountWei >= minAmountWei`.
- For every i: `lot.items[i]` matches `offer.slots[i]` (see §5.2).
- Lot not stale; standard custody checks.

State changes:

1. Delete offer.
2. Delete lot.
3. For every item: `delete lotForPunk[key(item)]` and `_pullPunk`.
4. Create auction with `latestBidder = offer.offerer`,
   `latestBidWei = offer.amountWei`, `winnerReceivers[auctionId] = offer.receiver`
   if non-zero.

Events: `OfferAuctionInitialised`, `AuctionInitialised`, `Bid`.

## 4. Auctions lifecycle

Settled auctions deliver every item to the recipient and pay the seller
exactly `latestBidWei` once. See §6.

The `Auction` struct keeps the lot-level fields needed for settlement
(seller, items via itemHash + itemCount) so that after `delete lots[id]`,
settlement still has all the data it needs.

## 5. Offers

### 5.1 placeOffer

```solidity
function placeOffer(
    uint96 amountWei,
    uint96 settlementWei,
    address receiver,
    OfferSlot[] calldata slots
) external payable returns (uint256 offerId);
```

Validation:

- `amountWei > 0`.
- `msg.value == amountWei + settlementWei`.
- `slots.length` ∈ `[1, MAX_PUNKS]`.
- For every slot: criteria masks pass `_requireValidCriteria` (canonical bit
  range, no required/forbidden overlap, no forbidden/anyOf overlap, color
  count range valid if enabled).
- `includeIds` and `excludeIds` are size-bounded (suggest `MAX_INCLUDE_IDS =
  64`, `MAX_EXCLUDE_IDS = 64`; tunable). Without bounds, a 10000-element
  `includeIds` would be expensive at acceptance; the bound also keeps the
  offer size-predictable.

There is no top-level `standard` argument; each slot carries its own. There
is no top-level `includeIds`/`excludeIds`; they're per-slot, since slots
target different items.

### 5.2 Slot/item matching

`offer.slots[i]` matches a Punk `(standard, punkId)` if all of:

- `slot.standard == standard`.
- `slot.includeIds.length == 0` OR `punkId ∈ slot.includeIds`.
- `punkId ∉ slot.excludeIds`.
- The mask trio is non-empty ⇒
  `IPunksDataCriteria.hasTraits(punkId, req, forb, anyOf)` returns true.
- `slot.criteria.maxColorCount != 0` ⇒
  `IPunksDataVisual.colorCountOf(punkId) ∈ [minColorCount, maxColorCount]`.

Bounded settlement cost: at most one `hasTraits` and one `colorCountOf`
call per slot.

### 5.3 cancelOffer, adjustOfferAmount, adjustOfferSettlement

```solidity
function cancelOffer(uint256 offerId) external;
function adjustOfferAmount(uint256 offerId, uint96 weiToAdjust, bool increase) external payable;
function adjustOfferSettlement(uint256 offerId, uint96 weiToAdjust, bool increase) external payable;
```

Semantics unchanged from current single-Punk path.

### 5.4 acceptOffer (singleton fast path)

```solidity
function acceptOffer(uint256 offerId, uint16 punkId, uint96 expectedListingWei) external;
```

The CryptoPunks-market arbitrage path. Requires `offer.slots.length == 1`.

Validation:

- `offer.slots.length == 1`.
- `slot = offer.slots[0]` matches `(slot.standard, punkId)` per §5.2.
- The Punk is offered for sale on the appropriate market for the auction
  contract at `minValue == expectedListingWei` and
  `minValue <= offer.amountWei`, with `onlySellTo == auction contract`.
- The seller (= market listing seller) still owns the Punk.

State changes:

1. Delete the offer.
2. Buy from market with `offer.amountWei`; transfer to `offer.receiver` (or
   offerer if zero).
3. The seller receives the full offer amount even when the pinned listing
   price is lower.

Events: `OfferAccepted`.

### 5.5 acceptOfferFromLot (any-N path)

```solidity
function acceptOfferFromLot(uint256 offerId, uint256 lotId, uint96 minAmountWei) external;
```

Lot-binding path. Works for any N including N=1 (when seller has chosen to
escrow rather than market-list). Required for any N > 1.

The caller supplies `minAmountWei` to pin the minimum acceptable current offer
amount and avoid accepting an offer that was lowered before execution.

Validation:

- Offer exists; lot exists, not stale.
- `offer.amountWei >= minAmountWei`.
- `offer.slots.length == lot.itemCount`.
- For every i: `lot.items[i]` matches `offer.slots[i]` per §5.2 (with
  `standard = lot.items[i].standard` and `punkId = lot.items[i].punkId`).
- For every item: the Punk is in the seller vault.

State changes:

1. Delete the offer.
2. Delete the lot and `delete lotForPunk[key(item)]` for every item.
3. For every item: `_pullPunk` (so escrow holds the Punks for delivery).
4. Per-item delivery loop (§6) using `offer.amountWei` as the total, splitting
   per `weightBps`. Recipient is `offer.receiver` (or offerer).
5. Pay msg.sender `offer.settlementWei`.

Events: `OfferAcceptedFromLot` (see §8).

### 5.6 getOfferSlots

```solidity
function getOfferSlots(uint256 offerId) external view returns (OfferSlot[] memory);
```

Explicit accessor for the dynamic-array field, which the auto-generated
`offers(id)` getter cannot return. Replaces the old `getOfferFilters`.

## 6. Settlement model

### 6.1 Per-item delivery

Both `settle` (auction won) and `acceptOfferFromLot` (offer accepted via lot)
share one delivery primitive:

```solidity
function _settleBundleDelivery(
    LotItem[] memory items,
    uint96 totalWei,
    address recipient
) internal {
    uint256 itemCount = items.length;
    uint256 allocated;
    for (uint256 i; i < itemCount;) {
        LotItem memory item = items[i];
        uint96 itemWei = i == itemCount - 1
            ? totalWei - uint96(allocated)
            : uint96(uint256(totalWei) * item.weightBps / TOTAL_WEIGHT_BPS);
        allocated += itemWei;
        _deliverPunk(item.standard, item.punkId, recipient, itemWei);
        unchecked { ++i; }
    }
    // assert allocated == totalWei (always true for well-formed weightBps)
}
```

`_deliverPunk` is the primitive in `escrow/PunksEscrowManager.sol` — it
asks the unified `PUNKS_ESCROW` to offer the Punk to the auction contract,
buys it back at `itemWei` (so the CryptoPunks market emits a sale event with
that price), sweeps the proceeds, and transfers to the recipient. The V1
path additionally runs the V1 `withdraw()` workaround. See §11 for the
escrow topology.

The seller is paid via the escrow's `sweepProceeds()` (canonical) or the
auction contract's `_pushOrCredit` after V1 `withdraw()`. The total paid to
the seller equals `Σ itemWei == totalWei` exactly.

### 6.2 Atomicity

- Mark `settled = true` (or `delete offers[id]`) before delivery.
- A revert in any item delivery rolls back state; the auction or offer remains
  in its pre-settlement form.
- Pay msg.sender (settlement bribe) only after all deliveries succeed.

### 6.3 V1 + V2 mixed bundles

Each item's standard determines which market is used. The same escrow
brokers both items because vault custody is unified across standards (§11).
A V1+V2 pair of #4156 runs two sequential `_deliverPunk` calls:

1. V1 #4156: escrow offers on the V1 market, contract buys at `itemWei[0]`,
   V1 withdraw, V1 transferPunk.
2. V2 #4156: escrow offers on the canonical market, contract buys at
   `itemWei[1]`, sweepProceeds, V2 transferPunk.

The two market sale events recorded onchain will have the seller's chosen
`weightBps` allocation as their per-item prices.

### 6.4 Listed Punk offer amount

The market-arbitrage `acceptOffer` path checks the Punk's market listing
price (`minValue`) but buys the Punk with the full `offer.amountWei`. This
keeps the seller-facing behavior aligned with accepting an offer: a Punk
listed to the auction contract at 5 ETH that matches an 8 ETH offer settles
for 8 ETH, not 5 ETH plus a 3 ETH refund to the offerer.

The lot path has no equivalent — the bundle's `totalWei` is exactly the
offer's `amountWei`, split per `weightBps`. There is no listing price to
match against.

## 7. Validation

### 7.1 Lot validation

| Check | Where | Error |
| --- | --- | --- |
| `items.length` ∈ `[1, MAX_PUNKS]` | createLot | `InvalidItemCount` |
| No duplicate `(standard, punkId)` | createLot | `DuplicateLotItem` |
| Σ `weightBps == TOTAL_WEIGHT_BPS` and every weight > 0 | createLot | `InvalidWeights` |
| Every Punk in seller vault | createLot, openAuction, clearStaleLot | `PunkNotInVault` |
| Every Punk free of another lot | createLot | `PunkAlreadyInLot(otherLotId)` |
| `reserveWei > 0` | createLot, updateLot | `InvalidAmount` |
| `expectedReserveWei` matches | openAuction | `ReserveMismatch(expected, actual)` |
| `msg.value >= reserveWei` | openAuction | `ReserveNotMet` |

### 7.2 Offer validation

| Check | Where | Error |
| --- | --- | --- |
| `slots.length` ∈ `[1, MAX_PUNKS]` | placeOffer | `InvalidSlotCount` |
| Mask validity per slot | placeOffer | `InvalidTraitMask` |
| Color count range valid per slot | placeOffer | `InvalidColorCountRange` |
| `includeIds.length <= MAX_INCLUDE_IDS` | placeOffer | `TooManyIds` |
| `excludeIds.length <= MAX_EXCLUDE_IDS` | placeOffer | `TooManyIds` |
| `amountWei > 0` | placeOffer | `InvalidAmount` |
| `msg.value == amountWei + settlementWei` | placeOffer | `IncorrectPayment` |

### 7.3 Match validation

| Check | Where | Error |
| --- | --- | --- |
| Slot count == item count (lot path) | acceptOfferFromLot, startAuctionFromOffer | `SlotItemCountMismatch` |
| Slot count == 1 (market path) | acceptOffer | `MultiSlotOfferRequiresLot` |
| Listing price matches caller expectation | acceptOffer | `ListingPriceMismatch` |
| Slot.standard matches item/punk | matching | `OfferStandardMismatch` |
| includeIds match | matching | `PunkNotIncluded` |
| excludeIds clear | matching | `PunkExcluded` |
| `hasTraits` true | matching | `PunkTraitMismatch` |
| Color count in range | matching | `PunkVisualMismatch` |

## 8. Events

### 8.1 Lots and auctions

```solidity
event LotCreated(
    uint256 indexed lotId,
    address indexed seller,
    bytes32 indexed itemHash,
    uint8  itemCount,
    uint96 reserveWei
);

event LotItemDetail(
    uint256 indexed lotId,
    uint8   indexed itemIndex,
    TokenStandard standard,
    uint16  punkId,
    uint16  weightBps
);

event LotCancelled(uint256 indexed lotId);
event LotCleared(uint256 indexed lotId, address indexed cleaner);
event LotUpdated(uint256 indexed lotId, uint96 reserveWei);

event AuctionInitialised(
    uint256 indexed auctionId,
    address indexed seller,
    bytes32 indexed itemHash,
    uint8  itemCount,
    uint40 endTimestamp
);

event Bid(uint256 indexed auctionId, address indexed bidder, uint256 amountWei);
event AuctionExtended(uint256 indexed auctionId, uint40 endTimestamp);

event AuctionItemDelivered(
    uint256 indexed auctionId,
    uint8   indexed itemIndex,
    TokenStandard standard,
    uint16  punkId,
    address recipient,
    uint96  itemWei
);

event AuctionSettled(
    uint256 indexed auctionId,
    address indexed winner,
    address indexed seller,
    uint256 finalWei,
    uint256 sellerWei,
    uint256 protocolWei
);
```

`LotItemDetail` is emitted once per item at lot creation. Indexers can
reconstruct the bundle from logs alone without ever calling
`getLotItems`. Same pattern for `AuctionItemDelivered` at settlement.

### 8.2 Offers

```solidity
event OfferPlaced(
    uint256 indexed offerId,
    address indexed offerer,
    address indexed receiver,
    uint96 amountWei,
    uint96 settlementWei,
    uint8  slotCount
);

event OfferSlotDetail(
    uint256 indexed offerId,
    uint8   indexed slotIndex,
    TokenStandard standard,
    uint256 requiredTraitMask,
    uint256 forbiddenTraitMask,
    uint256 anyOfTraitMask,
    uint8   minColorCount,
    uint8   maxColorCount,
    uint16[] includeIds,
    uint16[] excludeIds
);

event OfferCancelled(uint256 indexed offerId);
event OfferAmountAdjusted(uint256 indexed offerId, uint96 newAmountWei);
event OfferSettlementAdjusted(uint256 indexed offerId, uint96 newSettlementWei);

event OfferAccepted(
    uint256 indexed offerId,
    uint256 indexed punkId,
    address indexed seller,
    address offerer,
    address receiver,
    uint256 amountWei
);

event OfferAcceptedFromLot(
    uint256 indexed offerId,
    uint256 indexed lotId,
    address indexed seller,
    address offerer,
    address receiver,
    uint96  amountWei,
    uint96  settlementWei
);

event OfferAuctionInitialised(
    uint256 indexed offerId,
    uint256 indexed auctionId,
    uint256 indexed lotId,
    address seller,
    address offerer,
    address receiver,
    uint96  amountWei
);
```

`OfferSlotDetail` mirrors `LotItemDetail`: one per slot at place time so
indexers can reconstruct the offer from logs.

## 9. Mock surface

`contracts/mocks/MockCryptoPunksTraits.sol` is deleted. Its replacement,
`MockPunksData`, implements the slice of `IPunksDataCriteria` and
`IPunksDataVisual` that `Offers` calls:

```solidity
contract MockPunksData is IPunksDataCriteria, IPunksDataVisual {
    uint16  internal _traitCount;
    mapping(uint16 => uint256) internal _traitMasks;
    mapping(uint16 => uint8)   internal _colorCounts;

    function setTraitCount(uint16 count) external;
    function setTraitMask(uint16 punkId, uint256 mask) external;
    function setColorCount(uint16 punkId, uint8 cc) external;

    function traitCount() external pure returns (uint16);
    function traitMaskOf(uint16 punkId) external view returns (uint256);
    function hasTrait(uint16 punkId, uint16 traitId) external view returns (bool);
    function hasTraits(
        uint16 punkId,
        uint256 requiredMask,
        uint256 forbiddenMask,
        uint256 anyOfMask
    ) external view returns (bool);

    function colorCountOf(uint16 punkId) external view returns (uint8);

    // Other interface methods revert `Unimplemented` until needed.
}
```

`hasTraits` matches the real contract's validation: reverts on bits outside
the canonical range, on overlap between required and forbidden, and on overlap
between forbidden and anyOf.

## 10. Gas analysis

`MAX_PUNKS = 80` is chosen to cover plausible curated baskets (large
artist collections, exchange treasury bundles) while keeping worst-case
settlement well under the L1 mainnet 30M block limit.

### 10.1 Settlement (worst case: 80 V1 items)

Per V1 item via `_deliverPunk`:

- `PUNKS_ESCROW.offerToAuctions(CRYPTOPUNKS_V1, tokenId, hammerWei)` ~50k
- `PUNKS_V1.buyPunk{value: hammerWei}(tokenId)` ~30k
- `PUNKS_V1.withdraw()` ~30k
- `PUNKS_V1.transferPunk(to, tokenId)` ~25k
- Auction-contract bookkeeping per item ~15k

Per item: ~150k gas. 80 × 150k = ~12M.

Plus auction state read/write, seller payment, settled-flag flip, top-level
events: ~1M.

Total: ~13M gas. Within a 30M block limit, leaving ~17M of headroom.

### 10.2 Settlement (canonical-only)

Canonical V2 path is cheaper (~110k per item; no `withdraw()`):

- 80 × 110k = ~8.8M plus ~1M overhead = ~9.8M.

### 10.3 openAuction (80-item pull)

Per item: `_pullPunk` ~60–80k (V1 higher than V2). 80 × 80k = ~6.4M plus
~1M overhead = ~7.4M.

### 10.4 placeOffer (80-slot offer)

Per slot: ~25k (storage of OfferSlot + small dynamic arrays). 80 × 25k =
~2M plus ~50k overhead = ~2.05M.

### 10.5 createLot (80-item lot)

Per item: ~25k storage + ~10k validation + ~3k slot reservation = ~38k.
80 × 38k = ~3.04M plus ~100k overhead = ~3.14M.

### 10.6 Conclusion

At MAX_PUNKS=80, worst-case settlement (~13M) stays below half a block.
The bound leaves more headroom under congestion than the earlier 100-item
design while still covering larger curated collections that 40 would exclude.

Bidder gas cost rises linearly in N; acceptable for the bundle use case
where the buyer is choosing to acquire many Punks atomically.

If post-implementation gas profiling shows the per-item estimates above are
optimistic — say worst-case settlement creeps toward 20M+ — MAX should be
tightened (likely to 64 or 80). That is a contract change, so this bound must
be re-validated against measured numbers before mainnet.

## 11. Escrow & vault topology

The auction house owns one `PunksEscrow` that brokers custody for both
canonical CryptoPunks and CryptoPunks V1. Each user has exactly one
`PunkVault` clone, deployed deterministically at `predictVault(user)`,
that holds Punks of either standard.

```
PunksAuction
   │   immutables: PUNKS, PUNKS_V1, PUNKS_ESCROW
   │
   └── PunksEscrow                         (one per deployment)
          │   immutables: PUNKS, PUNKS_V1, AUCTIONS, VAULT_IMPLEMENTATION
          │   storage:    mapping(user => PunkVault)
          │
          └── PunkVault                    (one EIP-1167 clone per user)
                immutable: OWNER (the escrow)
                only entry: transfer(market, punkIndex, to)  -- onlyOwner
```

Three properties make the topology safe and ergonomic:

1. **One vault address per user, both standards.** The vault is
   market-agnostic — the escrow names the market on every `transfer` call.
   This eliminates the historical footgun where a user could accidentally
   send a V1 Punk to a canonical-only vault address (or vice versa) and
   strand it forever.

2. **Deterministic-deposit-then-register.** `predictVault(user)` returns
   the eventual clone address even before the clone is deployed. Users may
   deposit by calling `transferPunk(predictVault(user), punkId)` on either
   market; the clone is materialised lazily by either `ensureVault`,
   `createLot` (which auto-registers the seller's vault), or `reclaim`
   (which auto-registers on first reclaim).

3. **Tight trust boundary.** The vault accepts calls only from `OWNER`
   (the escrow). The escrow accepts state-changing custody calls only
   from `AUCTIONS` (`pullFromVault`, `offerToAuctions`, `sweepProceeds`).
   The escrow's `receive()` accepts ETH only from the canonical Punk
   market — V1 settlement proceeds route directly to the auction house
   instead, because the V1 `buyPunk` accounting bug credits the buyer
   (here: the auction house), not the seller.

The escrow exposes a small typed surface keyed by `TokenStandard`:

```solidity
function predictVault(address user) external view returns (address);
function ensureVault(address user)  external returns (address);
function reclaim(TokenStandard standard, uint256 punkIndex) external;

// auction-only:
function pullFromVault(TokenStandard, address seller, uint256 punkIndex) external;
function offerToAuctions(TokenStandard, uint256 punkIndex, uint256 priceWei) external;
function sweepProceeds() external;  // canonical-only; V1 settles to auctions
```

Lots may freely mix V1 and canonical items because each item carries its
own standard and the unified vault holds both. Sellers do not need to
maintain separate custody addresses for the two markets.

## 12. Out of scope

These remain explicitly deferred. The unified design does not preclude any of
them; they're simply not in v1.

- **Color mask trio** (`requiredColorMask` / `forbiddenColorMask` /
  `anyOfColorMask`). The `OfferCriteria` struct can be extended additively in
  a future contract version.
- **Pixel count range**.
- **Merkle-rooted include/exclude** for very large baskets.
- **Permutation matching** between offer slots and lot items. Index binding
  is locked.
- **Partial fills**. Offers and bundles settle atomically.
- **`weightBps` enforcement at openAuction time on the bidder side**. The
  bidder sees the lot's items and weights; if they bid, they accept the
  split.
- **Bundle bid increment policies**. The auction contract uses a single
  `BID_INCREASE_BPS` regardless of item count.
