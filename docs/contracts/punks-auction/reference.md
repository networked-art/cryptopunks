# PunksAuction Reference

This page is the full API reference for
[`PunksAuction`](/contracts/punks-auction): constants, types, the lot,
auction, and offer APIs, the offer→lot bridges, the offer matching
predicate, settlement, events, and errors. For the high-level role of the
contract — the vault custody model and escrow-routed settlement — see the
[overview](/contracts/punks-auction).

## Constants

| Name                   | Value      | Meaning                                                                  |
| ---------------------- | ---------- | ------------------------------------------------------------------------ |
| `AUCTION_DURATION`     | `24 hours` | Length of every auction from initialization                              |
| `BIDDING_GRACE_PERIOD` | `15 min`   | Minimum time left after a late bid; bids inside it extend the clock      |
| `BID_INCREASE_BPS`     | `100`      | Minimum bid increment over the previous bid (1%, on top of `BPS`)        |
| `BPS`                  | `10_000`   | Basis-point denominator                                                  |
| `MAX_LOT_ITEMS`        | `80`       | Cap on Punks per lot (auction path)                                      |
| `MAX_INSTANT_ITEMS`    | `40`       | Cap on Punks per lot for the instant-settlement paths                    |
| `TOTAL_WEIGHT_BPS`     | `10_000`   | Required sum of a lot's per-item `weightBps`                             |
| `MAX_OFFER_SLOTS`      | `80`       | Cap on slots per offer                                                   |
| `MAX_SLOT_IDS`         | `64`       | Cap on `includeIds` / `excludeIds` per slot                              |
| `PUSH_GAS`             | `95_000`   | Gas forwarded by direct ETH pushes (inherited from `PushPullEscrow`)     |

The two lot caps differ because the instant paths pull and deliver the
whole bundle in one transaction, which must stay under the EIP-7825
per-transaction gas cap. Larger lots (up to `MAX_LOT_ITEMS`) settle through
the auction path, which splits the pull (at open) from the delivery (at
settle).

## Constructor

```solidity
constructor()
```

Takes no arguments. It deploys a dedicated `PunksAuctionEscrow` (pinned to
this contract as its only caller) and calls the ENS reverse registrar at
`0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb` to set this contract's reverse
name to `punksauction.eth`.

## Receive

```solidity
receive() external payable
```

Accepts plain ETH only from settlement: the two Punk markets (during the
internal `withdraw()` calls) and the escrow (when it forwards
canonical-market proceeds via `sweepProceeds`). Any other sender reverts
with `UnexpectedEtherSender`.

## Types

```solidity
enum TokenStandard { CRYPTOPUNKS, CRYPTOPUNKS_V1 }

struct LotItem {
    TokenStandard standard;
    uint16 punkId;
    uint16 weightBps;
}

struct Lot {
    address seller;
    uint96 reserveWei;
    address onlySellTo;
}

struct Auction {
    address seller;
    address latestBidder;
    uint96 latestBidWei;
    uint40 endTimestamp;
    bool settled;
}

struct OfferSlot {
    Punks.Filter criteria;
    TokenStandard standard;
    uint16[] includeIds;
    uint16[] excludeIds;
}

struct Offer {
    uint96 amountWei;
    address offerer;
    OfferSlot[] slots;
}
```

`TokenStandard` selects which market a Punk lives on: `CRYPTOPUNKS` for the
canonical market, `CRYPTOPUNKS_V1` for the June 9th 2017 contract.

`weightBps` controls how a clearing price is allocated across a bundle's
items in the per-item settlement events; the lot's weights must sum to
`TOTAL_WEIGHT_BPS` (10,000).

The dynamic members — a lot's items, an auction's items, an offer's slots —
are not returned by the public struct getters (`lots`, `auctions`,
`offers`) and have dedicated getters: `getLotItems`, `getAuctionItems`,
`getOfferSlots`.

## Lots

### `createLot`

```solidity
function createLot(
    LotItem[] calldata items,
    uint96 reserveWei,
    address onlySellTo
) external returns (uint256 lotId);
```

Creates a lot owned by `msg.sender`. Validates up front:

- `reserveWei` is non-zero.
- The seller's vault is deployed and has approved this contract as an
  operator (`AuctionNotApproved` / `VaultNotDeployed`).
- `1 <= items.length <= MAX_LOT_ITEMS`.
- Every `weightBps` is non-zero and they sum to `TOTAL_WEIGHT_BPS`.
- No duplicate `(standard, punkId)` in the bundle.
- No Punk is already reserved by another lot (`PunkAlreadyInLot`).
- Every Punk is currently in the seller's vault (`PunkNotInVault`).

Each Punk is reserved through `lotForPunk` on a first-wins basis. Pass
`address(0)` for `onlySellTo` to make the lot public, or a non-zero address
to restrict the initial buyer. Emits `LotCreated` and one `LotItemDetail`
per item. Returns the new lot id (also exposed via `lastLotId`).

### `updateLot`

```solidity
function updateLot(uint256 lotId, uint96 reserveWei, address onlySellTo) external;
```

Seller-only. Sets a new non-zero reserve and `onlySellTo` (pass
`address(0)` to lift a restriction). Emits `LotUpdated`.

### `cancelLot`

```solidity
function cancelLot(uint256 lotId) external;
```

Seller-only. Releases the per-Punk reservations and deletes the lot. Emits
`LotCancelled`.

### `clearStaleLot` / `clearStaleLots`

```solidity
function clearStaleLot(uint256 lotId) external;
function clearStaleLots(uint256[] calldata lotIds) external;
```

Anyone may call. A lot is *stale* when the seller has revoked the auction's
operator approval, or when any of its Punks has left the seller's vault.
Clearing releases the reservations and deletes the lot. Reverts with
`LotNotStale` if the lot is still valid. Lots themselves never expire — this
is the only way an outsider can remove one.

### Lot reads

```solidity
function lastLotId() external view returns (uint256);
function lots(uint256 lotId) external view returns (address seller, uint96 reserveWei, address onlySellTo);
function getLotItems(uint256 lotId) external view returns (LotItem[] memory);
function lotForPunk(bytes32 key) external view returns (uint256);
function activeLotFor(address seller, TokenStandard standard, uint16 punkId) external view returns (uint256);
```

`activeLotFor` returns the lot id currently reserving a seller's Punk, or
`0` if none. `lotForPunk` is the raw mapping, keyed by
`keccak256(abi.encode(seller, tokenContract, punkId))`.

## Auctions

### `openAuction`

```solidity
function openAuction(uint256 lotId, uint96 expectedReserveWei)
    external
    payable
    nonReentrant
    returns (uint256 auctionId);
```

Opens a stored lot into a 24-hour auction, seeded by the caller's first
bid (`msg.value`). Requirements:

- The lot exists (`LotNotFound`).
- `expectedReserveWei` equals the lot's live reserve, guarding against a
  reserve change between read and send (`ReserveMismatch`).
- If the lot has an `onlySellTo`, the caller must be that address
  (`BuyerNotAllowed`).
- `msg.value >= reserveWei` (`ReserveNotMet`).
- Every Punk is still in the seller's vault.

The lot is deleted, the Punks are pulled from the vault into the escrow,
and the auction is created with `msg.sender` as the opening bidder. Emits
`AuctionInitialised` and the opening `Bid`. Anyone may open a public lot.

### `bid`

```solidity
function bid(uint256 auctionId) external payable nonReentrant;
```

Places a bid of `msg.value` on a live auction. The auction must exist
(`AuctionDoesNotExist`), be unsettled (`AuctionAlreadySettled`), and still
be open (`AuctionNotActive`). The bid must reach `currentMinBidWei`
(`MinimumBidNotMet`), which is the previous bid rounded up by 1%:

```text
minBid = ceil(previousBid * (BPS + BID_INCREASE_BPS) / BPS)   // ×1.01, capped at uint96 max
```

The new bid is recorded, the auction is extended if it landed inside the
grace period (see below), and the previous bidder is refunded via the
push/pull escrow. Emits `Bid`.

### Auction extension

A bid placed when less than `BIDDING_GRACE_PERIOD` (15 minutes) remains
pushes the end timestamp to `now + 15 minutes`, so every auction always
leaves at least 15 minutes for a response to the last bid. Emits
`AuctionExtended`.

### `settle`

```solidity
function settle(uint256 auctionId) external nonReentrant;
```

Settles a completed auction. The auction must exist, be unsettled, and be
past its end timestamp (`AuctionNotComplete`). Anyone may call. The auction
is marked settled, each Punk is delivered to the winning bidder through the
escrow, the per-item allocations are emitted as `AuctionItemDelivered`, and
the seller is paid the final bid. Emits `AuctionSettled`.

### Auction reads

```solidity
function lastAuctionId() external view returns (uint256);
function auctions(uint256 auctionId)
    external
    view
    returns (address seller, address latestBidder, uint96 latestBidWei, uint40 endTimestamp, bool settled);
function getAuctionItems(uint256 auctionId) external view returns (LotItem[] memory);
function currentMinBidWei(uint256 auctionId) external view returns (uint96);
function auctionActive(uint256 auctionId) external view returns (bool);
function endTimestampOf(uint256 auctionId) external view returns (uint40);
```

`currentMinBidWei` returns the smallest acceptable next bid. For a freshly
opened auction with one bid, this is the opening bid ×1.01 rounded up.

## Offers

An offer locks ETH behind one or more slots. A single-slot offer can be
filled directly against a live market listing with `acceptOffer`;
multi-slot (bundle) offers can only be filled through a lot.

### `placeOffer`

```solidity
function placeOffer(uint96 amountWei, OfferSlot[] calldata slots)
    external
    payable
    returns (uint256 offerId);
```

`amountWei` must be non-zero and exactly equal `msg.value`
(`IncorrectPayment`). `slots.length` must be `1..MAX_OFFER_SLOTS`. Each
slot's `criteria` is validated against the canonical bit space, and its
`includeIds` / `excludeIds` each cap at `MAX_SLOT_IDS`. Emits `OfferPlaced`
and one `OfferSlotDetail` per slot. Returns the new offer id (also exposed
via `lastOfferId`).

### `cancelOffer`

```solidity
function cancelOffer(uint256 offerId) external nonReentrant;
```

Offerer-only. Refunds the locked ETH and deletes the offer. Emits
`OfferCancelled`.

### `adjustOfferAmount`

```solidity
function adjustOfferAmount(uint256 offerId, uint96 newAmountWei) external payable nonReentrant;
```

Offerer-only. Sets the absolute locked amount. To raise it, send exactly
the increase as `msg.value`; to lower it, send no ETH and the difference is
refunded. `newAmountWei` must be non-zero (`InvalidAmount`); a mismatched
`msg.value` reverts with `IncorrectPayment`. Emits `OfferAmountAdjusted`.

### `acceptOffer`

```solidity
function acceptOffer(uint256 offerId, uint16 punkId, uint96 expectedListingWei) external nonReentrant;
```

Fills a **single-slot** offer against a live directed listing on the
relevant market (multi-slot offers revert with
`MultiSlotOfferRequiresLot`). The Punk must satisfy the slot
([matching](#offer-matching) below), and the listing must be valid:
for sale, not directed away from this contract, the seller is still the
owner, `minValue == expectedListingWei` (`ListingPriceMismatch`), and
`minValue <= offer.amountWei` (`ListingPriceTooHigh`). The offer is
deleted, the listed Punk is bought and delivered to the offerer, and the
seller is paid. Emits `OfferAccepted`.

`expectedListingWei` pins the listing price the caller saw, guarding
against a frontrun that changes it.

### Offer reads

```solidity
function lastOfferId() external view returns (uint256);
function offers(uint256 offerId) external view returns (uint96 amountWei, address offerer);
function getOfferSlots(uint256 offerId) external view returns (OfferSlot[] memory);
```

## Offer → lot bridges

These functions settle an offer against a stored lot. They split along the
[design line](/contracts/punks-auction#purpose): paths that settle
instantly are seller-gated; the path that opens an auction is
permissionless.

All of them share the same validation (`_consumeOfferAgainstLot`): the
offer is active, the lot exists, `offer.amountWei >= minAmountWei`
(`OfferAmountBelowMinimum`), `offer.amountWei >= lot.reserveWei`
(`ReserveNotMet`), the lot's `onlySellTo` (if set) equals the offerer
(`BuyerNotAllowed`), the slots match the items one-to-one
(`SlotItemCountMismatch`), and every Punk is in the seller's vault.

### `acceptOfferFromLot`

```solidity
function acceptOfferFromLot(uint256 offerId, uint256 lotId, uint96 minAmountWei) external nonReentrant;
```

**Seller-only.** Settles the lot instantly at the offer amount, skipping
the auction. Capped at `MAX_INSTANT_ITEMS`
(`LotTooLargeForInstantAccept`). Pulls the bundle, delivers it to the
offerer, pays the seller. Emits `OfferAcceptedFromLot`.

### `startAuctionFromOffer`

```solidity
function startAuctionFromOffer(uint256 offerId, uint256 lotId, uint96 minAmountWei)
    external
    nonReentrant
    returns (uint256 auctionId);
```

**Permissionless.** Consumes the offer/lot pair into a live auction seeded
with the offer as the opening bid. `minAmountWei` is the caller's floor for
the offer. Emits `OfferAuctionInitialised` alongside the usual
`AuctionInitialised` / `Bid`.

### `createLotAndAcceptOffer`

```solidity
function createLotAndAcceptOffer(LotItem[] calldata items, uint256 offerId, uint96 minAmountWei)
    external
    nonReentrant
    returns (uint256 lotId);
```

Creates a transient lot for `msg.sender` (reserve set to the offer amount,
no `onlySellTo`) and instantly accepts the offer against it in one
transaction. Because the lot is created for the caller, this path is
inherently seller-only and cannot be sniped by an `openAuction` in between.
Capped at `MAX_INSTANT_ITEMS`.

### `createLotAndStartAuction`

```solidity
function createLotAndStartAuction(LotItem[] calldata items, uint256 offerId, uint96 minAmountWei)
    external
    nonReentrant
    returns (uint256 auctionId);
```

Creates a lot and immediately opens an auction from the offer, with the
offer as the opening bid.

## Offer matching

Each offer slot declares a `standard`, a `Punks.Filter` `criteria`, and
`includeIds` / `excludeIds`. A Punk matches a slot by this predicate
(`_requireSlotMatchesPunk`):

1. **Standard** — `slot.standard` must equal the Punk's standard, else
   `OfferStandardMismatch`.
2. **Excluded** — the Punk's id in `excludeIds` ⇒ `PunkExcluded`
   (unconditional veto).
3. **Explicit include** — the id in `includeIds` ⇒ matches.
4. **Closed allowlist** — if `includeIds` is non-empty and `criteria` is
   empty, an id not in `includeIds` ⇒ `PunkNotMatched`. An empty criteria
   does *not* widen the slot to every Punk.
5. **Criteria** — otherwise the Punk must satisfy
   `criteria.matches(PUNKS_DATA, punkId)`, else `PunkNotMatched`.

So `excludeIds` is a veto, `includeIds` is an OR-shortcut into the slot (or
a closed allowlist when criteria is empty), and `criteria` applies
elsewhere. `Punks.Filter` is the composite filter from
`contracts/contracts/lib/Punks.sol` — see the
[Filter Library](/contracts/punks-data/filter-library) for the full
reference.

When an offer is filled through a lot, the slots and the lot's items are
checked pairwise in order (`_requireSlotsMatchItems`): they must be equal
in count and each item must satisfy the slot at the same index.

## Settlement and ETH flow

`PunksAuction` inherits `PushPullEscrow`:

```solidity
mapping(address => uint256) public balances;
function withdraw() external nonReentrant;
```

Every outgoing payment — refunding an outbid bidder, paying a seller — goes
through `_pushOrCredit(to, amount)`: a `call` with `PUSH_GAS` (95,000) gas,
falling back to crediting `balances[to]` and emitting `Credited` if the
push fails. Recipients pull credited balances with `withdraw()`. This makes
settlement non-revertable — a contract-only or malicious party cannot block
another's payout.

**Per-item allocation.** When a bundle settles, the clearing price is split
by `weightBps`: each item gets `floor(totalWei * weightBps / TOTAL_WEIGHT_BPS)`,
and the last item absorbs the rounding remainder so the parts sum exactly to
the total. Each allocation is the `itemWei` carried by `AuctionItemDelivered`.

**Escrow round-trip.** Delivery of each Punk goes through the escrow: it
lists the Punk to the auction at the hammer price, the auction buys it, and
the proceeds return — via `ESCROW.sweepProceeds` on the canonical market,
or via the market's own `withdraw()` for the June 9th 2017 contract (whose
`buyPunk` credits the buyer, not the seller). Net market movement is zero;
the seller is paid once from the auction's balance. See
[settlement through escrow](/contracts/punks-auction#settlement-through-escrow).

## Events

```solidity
// Lots
event LotCreated(uint256 indexed lotId, address indexed seller, bytes32 indexed itemHash, uint8 itemCount, uint96 reserveWei, address onlySellTo);
event LotItemDetail(uint256 indexed lotId, uint8 indexed itemIndex, TokenStandard standard, uint16 punkId, uint16 weightBps);
event LotUpdated(uint256 indexed lotId, uint96 reserveWei, address onlySellTo);
event LotCancelled(uint256 indexed lotId);
event LotCleared(uint256 indexed lotId, address indexed cleaner);

// Auctions
event AuctionInitialised(uint256 indexed auctionId, uint256 indexed lotId, address indexed seller, uint8 itemCount, uint40 endTimestamp);
event Bid(uint256 indexed auctionId, address indexed bidder, uint256 amountWei);
event AuctionExtended(uint256 indexed auctionId, uint40 endTimestamp);
event AuctionItemDelivered(uint256 indexed auctionId, uint8 indexed itemIndex, TokenStandard standard, uint16 punkId, address recipient, uint96 itemWei);
event AuctionSettled(uint256 indexed auctionId, address indexed winner, address indexed seller, uint256 finalWei);

// Offers
event OfferPlaced(uint256 indexed offerId, address indexed offerer, uint96 amountWei, uint8 slotCount);
event OfferSlotDetail(uint256 indexed offerId, uint8 indexed slotIndex, TokenStandard standard, Punks.Filter criteria, uint16[] includeIds, uint16[] excludeIds);
event OfferCancelled(uint256 indexed offerId);
event OfferAmountAdjusted(uint256 indexed offerId, uint96 newAmountWei);
event OfferAccepted(uint256 indexed offerId, uint256 indexed punkId, address indexed seller, address offerer, uint256 amountWei);
event OfferAcceptedFromLot(uint256 indexed offerId, uint256 indexed lotId, address indexed seller, address offerer, uint96 amountWei);
event OfferAuctionInitialised(uint256 indexed offerId, uint256 indexed auctionId, uint256 indexed lotId, address seller, address offerer, uint96 amountWei);

// Inherited from PushPullEscrow
event Withdrawal(address indexed account, uint256 amount);
event Credited(address indexed account, uint256 amount);
```

The dynamic item and slot details are split into their own per-element
events (`LotItemDetail`, `OfferSlotDetail`) because they cannot be packed
into the headline event cheaply; `LotCreated` carries
`itemHash = keccak256(abi.encode(items))` so an indexer can bind the
details to the lot.

## Errors

| Error                                                    | When                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `UnexpectedEtherSender`                                  | Plain ETH from anyone other than the two markets or the escrow              |
| `InvalidAmount`                                          | Zero reserve, zero offer amount, or zero adjust amount                      |
| `IncorrectPayment`                                       | `msg.value` does not match the required amount for the call                 |
| `VaultNotDeployed`                                       | The seller's vault clone is not deployed                                    |
| `AuctionNotApproved`                                     | The seller's vault has not approved this contract as an operator            |
| `PunkNotInVault`                                         | A listed Punk is not in the seller's vault                                  |
| `InvalidItemCount`                                       | Lot has zero items or more than `MAX_LOT_ITEMS`                             |
| `InvalidWeights`                                         | A `weightBps` is zero, or the weights do not sum to `TOTAL_WEIGHT_BPS`      |
| `DuplicateLotItem`                                       | The same `(standard, punkId)` appears twice in a lot                        |
| `PunkAlreadyInLot(uint256 lotId)`                        | A Punk is already reserved by another lot                                   |
| `LotNotFound`                                            | The lot id has no live lot                                                  |
| `NotSeller`                                              | A seller-only lot action called by someone else                            |
| `LotNotStale`                                            | `clearStaleLot` on a lot that is still valid                                |
| `LotTooLargeForInstantAccept`                            | An instant-settlement path on a lot above `MAX_INSTANT_ITEMS`               |
| `ReserveMismatch(uint96 expected, uint96 actual)`        | `openAuction`'s `expectedReserveWei` ≠ the live reserve                     |
| `ReserveNotMet(uint96 reserve, uint96 actual)`           | A bid or offer below the lot's reserve                                      |
| `BuyerNotAllowed(address allowed)`                       | A restricted lot's initial buyer is not the allowed address                 |
| `AuctionDoesNotExist`                                    | The auction id has no auction                                               |
| `AuctionNotActive`                                       | `bid` after the auction's end timestamp                                     |
| `AuctionAlreadySettled`                                  | `bid` or `settle` on a settled auction                                      |
| `AuctionNotComplete`                                     | `settle` before the auction's end timestamp                                 |
| `MinimumBidNotMet(uint96 minBid, uint96 actual)`         | A bid below `currentMinBidWei`                                              |
| `OfferNotActive`                                         | The offer id has no active offer                                            |
| `NotOfferer`                                             | An offerer-only offer action called by someone else                        |
| `InvalidSlotCount`                                       | Offer has zero slots or more than `MAX_OFFER_SLOTS`                         |
| `TooManyIds`                                             | A slot's `includeIds` or `excludeIds` exceeds `MAX_SLOT_IDS`               |
| `MultiSlotOfferRequiresLot`                              | `acceptOffer` on an offer with more than one slot                           |
| `OfferStandardMismatch`                                  | A slot's `standard` does not match the Punk being matched                   |
| `SlotItemCountMismatch`                                  | An offer's slots and a lot's items differ in count                          |
| `OfferAmountBelowMinimum(uint96 minAmount, uint96 actual)` | The offer amount is below the caller's `minAmountWei`                     |
| `PunkExcluded`                                           | Matching a Punk listed in a slot's `excludeIds`                             |
| `PunkNotMatched`                                         | A Punk fails a slot's include/criteria predicate                            |
| `ListingNotValid`                                        | `acceptOffer`'s market listing is missing, redirected, or stale            |
| `ListingPriceMismatch(uint96 expected, uint256 actual)`  | The live listing's `minValue` ≠ `expectedListingWei`                        |
| `ListingPriceTooHigh`                                    | The listing costs more than the offer amount                                |
| `NoBalanceToWithdraw`                                    | `withdraw()` with no credited balance (inherited)                           |
| `FailedWithdrawal`                                       | `withdraw()` push-back to the caller reverts (inherited)                    |

## Integration notes

- **Custody before lots.** A lot can only be created once the seller's
  vault is deployed and has approved this contract. The SDK's
  `ensureVault` / `ensureMyVault` and `deposit` helpers set this up — see
  [Auction Vaults](/sdk/offers-and-auctions#auction-vaults).
- **Reserve and floor guards.** `openAuction` pins the reserve with
  `expectedReserveWei`; the offer→lot bridges pin the offer floor with
  `minAmountWei`. Pass the value you displayed so a concurrent
  `updateLot` / `adjustOfferAmount` cannot move the price under you.
- **Anyone settles.** Both `settle` and `startAuctionFromOffer` are
  permissionless, so an auction always clears even if neither party is
  watching the chain. Only the instant-accept paths are seller-gated.
- **Single-slot vs bundle offers.** A single-slot offer can be filled
  directly against a live listing with `acceptOffer`. Any multi-slot offer
  must go through a lot (`acceptOfferFromLot`, `startAuctionFromOffer`, or
  the `createLotAnd*` pair).

For TypeScript usage, see [Offers And Auctions](/sdk/offers-and-auctions).
