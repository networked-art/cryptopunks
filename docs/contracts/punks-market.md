# PunksMarket

`PunksMarket` is a native-ETH market that gives the broken CryptoPunks
contract deployed by LarvaLabs on June 9th 2017 a working secondary market.
It acts as a directed-listing intermediary and as a criteria-bid book, with
all settlement routed through itself to work around the original contract's
sale-proceeds accounting bug.

The contract lives at `contracts/contracts/PunksMarket.sol`. It inherits
[`PushPullEscrow`](#eth-flow), which adds reentrancy guards and capped-gas
ETH pushes with a credit fallback.

## Purpose

The June 2017 CryptoPunks contract miscredits sale proceeds. Selling
directly through it is unsafe: the seller's `withdraw()` balance can be
clobbered by subsequent sales before they pull it.

`PunksMarket` works around this by inserting itself as the temporary holder
of every settlement:

1. The seller offers the Punk on the original market through
   [`offerPunkForSaleToAddress(punkId, price, punksmarket.eth)`](https://evm.now/address/0x6ba6f2207e343923ba692e5cae646fb0f566db8d/interact#offerPunkForSaleToAddress:::punksmarket.eth)
   — a directed listing whose `onlySellTo` is `PunksMarket`.
2. A buyer or settler calls into `PunksMarket`. The market pays the listing
   from its own ETH, immediately calls the original `withdraw()` to pull the
   credited proceeds back into itself, transfers the Punk on to the final
   recipient, and pushes the proceeds to the real seller.

Public listings (those without `onlySellTo == address(this)`) are rejected
because they do not safely route the seller's proceeds and because we don't want to encourage that potential footgun.

### Creating a directed listing

Listing a Punk is the one part of the workflow that happens on the original
contract, not on `PunksMarket`. The seller calls
[`offerPunkForSaleToAddress`](https://evm.now/address/0x6ba6f2207e343923ba692e5cae646fb0f566db8d/interact#offerPunkForSaleToAddress:::punksmarket.eth)
directly on the June 2017 CryptoPunks market:

```solidity
ICryptoPunksMarket(0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D)
    .offerPunkForSaleToAddress(
        punkIndex,         // 0..9999
        minSalePriceInWei, // listing price in wei
        0x64e507FEBF26521b73FbdfA533106B2042533218 // punksmarket.eth
    );
```

The third argument must be the `PunksMarket` address (`punksmarket.eth`).
That is what makes the listing a *directed* listing and what allows
`buyPunk` / `acceptBid` to settle it safely. The
[interact link](https://evm.now/address/0x6ba6f2207e343923ba692e5cae646fb0f566db8d/interact#offerPunkForSaleToAddress:::punksmarket.eth)
above prefills the `toAddress` field with `punksmarket.eth` so it cannot be
typed incorrectly.

To cancel a listing the seller calls `punkNoLongerForSale(punkIndex)` on the
original market. There is no listing state stored inside `PunksMarket`
itself — every settlement reads the live offer through
`PUNKS_V1.punksOfferedForSale(punkId)`.

The bid book sits on top of the same settlement primitive: a bid escrows
`bidWei + settlementWei` and declares a trait/color/visual filter — matched
against the sealed [`PunksData`](/contracts/punks-data) contract — plus
optional include and exclude id lists. Anyone may settle a matching directed
listing against a stored bid and earn the `settlementWei` reward; the bidder
receives the Punk and any difference between their bid and the actual
listing price.

The design is inspired by MouseDev's `CryptoPunksBidsV2`.

## Immutable Dependencies

| Constant     | Address                                                                                                            | Role                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `PUNKS_V1`   | [`0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D`](https://evm.now/address/0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D) | The June 2017 CryptoPunks market with the proceeds bug         |
| `PUNKS_DATA` | [`0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C`](https://evm.now/address/punksdata.eth)                              | Sealed dataset used to evaluate bid criteria against each Punk |

Both addresses are baked into the bytecode and cannot be changed after
deployment.

## Constants

| Name              | Value    | Meaning                                                              |
| ----------------- | -------- | -------------------------------------------------------------------- |
| `MAX_INCLUDE_IDS` | `64`     | Cap on `Bid.includeIds.length`                                       |
| `MAX_EXCLUDE_IDS` | `64`     | Cap on `Bid.excludeIds.length`                                       |
| `PUNK_COUNT`      | `10_000` | Canonical CryptoPunks supply                                         |
| `PUSH_GAS`        | `95_000` | Gas forwarded by direct ETH pushes (inherited from `PushPullEscrow`) |

## Constructor

```solidity
constructor()
```

The constructor takes no arguments. It calls the ENS reverse registrar at
`0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb` to set the contract's reverse
name to `punksmarket.eth`.

## Receive

```solidity
receive() external payable
```

Only the original CryptoPunks market may send ETH directly to the contract,
which happens during the internal `PUNKS_V1.withdraw()` call inside a
settlement. Any other sender reverts with `UnexpectedEtherSender`.

## Bid Model

```solidity
struct Bid {
    uint96 bidWei;
    uint96 settlementWei;
    address bidder;
    Punks.Filter criteria;
    uint16[] includeIds;
    uint16[] excludeIds;
}
```

| Field           | Meaning                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `bidWei`        | Maximum the bidder is willing to pay for any matching Punk. Always strictly positive.                    |
| `settlementWei` | Caller reward paid out of escrow when someone other than the bidder fills the bid. May be zero.          |
| `bidder`        | The address that placed the bid. Zero when the slot is inactive (never created, cancelled, or accepted). |
| `criteria`      | `Punks.Filter` evaluated against the sealed dataset. See [Bid matching](#bid-matching).                  |
| `includeIds`    | Up to 64 Punk ids that match unconditionally (subject to `excludeIds`).                                  |
| `excludeIds`    | Up to 64 Punk ids that never match, regardless of `criteria` or `includeIds`.                            |

`Punks.Filter` is the composite filter defined in
`contracts/contracts/lib/Punks.sol`. It packs three trait masks, three color
masks, and `[min, max]` ranges for pixel count and color count. See
[Criteria API](/contracts/punks-data/criteria) and [Visual API](/contracts/punks-data/visual)
for the underlying primitives.

### Bid matching

`acceptBid` and the `matchesPunk` / `bidsMatchingPunk` views all share the
same predicate:

1. **Inactive** — `bid.bidder == address(0)` ⇒ never matches.
2. **Excluded** — `punkId` appears in `excludeIds` ⇒ never matches.
3. **Explicit include** — `punkId` appears in `includeIds` ⇒ matches.
4. **Closed allowlist** — if `includeIds` is non-empty and `criteria` is
   empty (`Punks.isEmpty(criteria) == true`), the bid matches only the
   `includeIds`. The empty criteria does _not_ widen the bid to every Punk.
5. **Criteria** — otherwise the bid matches iff `criteria.matches(PUNKS_DATA, punkId)`
   is true.

So `excludeIds` is an unconditional veto, `includeIds` is an OR-shortcut
into the bid (or a closed allowlist when criteria is empty), and `criteria`
applies elsewhere. An empty `criteria` with empty `includeIds` matches every
Punk (subject to `excludeIds`).

Linear scans of `includeIds` and `excludeIds` are bounded by the 64-entry
caps. Filter validation against the canonical bit space happens at
`placeBid` time, mirroring `PunksData._requireCriteriaMasks`.

## Purchase API

### `buyPunk`

```solidity
function buyPunk(uint16 punkId, uint96 expectedListingWei, address recipient)
    external
    payable
    nonReentrant;
```

Buys a directed listing and forwards the Punk to `recipient`. `msg.value`
must equal `expectedListingWei`, and the live listing on `PUNKS_V1` must
match: `isForSale`, `onlySellTo == address(this)`, the seller is still the
current owner, and `minValue == expectedListingWei`. Reverts otherwise with
`ListingNotValid` or `ListingPriceMismatch(expected, actual)`.

The seller is paid via `_pushOrCredit`. Emits `PunkPurchased`.

### `acceptBid`

```solidity
function acceptBid(uint256 bidId, uint16 punkId, uint96 expectedListingWei)
    external
    nonReentrant;
```

Settles a stored bid against a live directed listing. Anyone may call. The
caller supplies the listing price; the bid must match the Punk by the
predicate above.

Settlement order:

1. Snapshot `bidder`, `bidWei`, `settlementWei`.
2. Delete the bid before any mutable external calls.
3. Buy the listing through `_buyDirectedListing` with `maxListingWei = bidWei`.
   Reverts with `ListingPriceTooHigh` if `listingWei > bidWei`.
4. Push the `settlementWei` caller reward.
5. Push `bidWei - listingWei` back to the bidder.
6. Emit `BidAccepted`.

The bid is one-shot: a successful match consumes it entirely. Partial fills
do not exist.

## Bid lifecycle

### `placeBid`

```solidity
function placeBid(
    uint96 bidWei,
    uint96 settlementWei,
    Punks.Filter calldata criteria,
    uint16[] calldata includeIds,
    uint16[] calldata excludeIds
) external payable returns (uint256 bidId);
```

`msg.value` must equal `uint256(bidWei) + uint256(settlementWei)`. `bidWei`
must be non-zero. `includeIds` and `excludeIds` each cap at 64 entries.
`Punks.validate(criteria)` rejects masks outside the canonical bit space and
malformed pixel/color count ranges.

Returns the new bid id (also exposed via `lastBidId`). Emits `BidPlaced`.

### `cancelBid`

```solidity
function cancelBid(uint256 bidId) external nonReentrant;
```

Only the original bidder may call. Refunds `bidWei + settlementWei` via
`_pushOrCredit` and emits `BidCancelled`.

### `adjustBidPrice`

```solidity
function adjustBidPrice(uint256 bidId, uint96 weiToAdjust, bool increase)
    external
    payable
    nonReentrant;
```

Only the original bidder may call. Adjusts `bid.bidWei` without recreating
the bid. `weiToAdjust` must be non-zero.

| `increase` | Requires                                 | Effect                                     |
| ---------- | ---------------------------------------- | ------------------------------------------ |
| `true`     | `msg.value == weiToAdjust`               | `bidWei += weiToAdjust`                    |
| `false`    | `msg.value == 0`, `weiToAdjust < bidWei` | `bidWei -= weiToAdjust`, refund the caller |

A decrement that would leave `bidWei == 0` reverts with `AdjustmentTooLarge`
(use `cancelBid` instead). `settlementWei` cannot be changed in place — to
adjust it, cancel and replace the bid.

Emits `BidAdjusted` with the new `bidWei`.

## Read API

```solidity
function lastBidId() external view returns (uint256);

function bids(uint256 bidId)
    external
    view
    returns (uint96 bidWei, uint96 settlementWei, address bidder);

function getBidCriteria(uint256 bidId)  external view returns (Punks.Filter memory);
function getBidIncludeIds(uint256 bidId) external view returns (uint16[] memory);
function getBidExcludeIds(uint256 bidId) external view returns (uint16[] memory);

function matchesPunk(uint256 bidId, uint16 punkId) external view returns (bool);

function bidsMatchingPunk(uint16 punkId, uint256 fromId, uint256 count)
    external
    view
    returns (uint256[] memory bidIds, uint256 nextId);
```

`bids` only returns the scalar fields; the criteria and id lists need their
dedicated getters because Solidity cannot ABI-encode the nested arrays
through the struct accessor.

`matchesPunk` mirrors the `acceptBid` predicate. Cancelled, accepted, and
never-created bids return `false`; an out-of-range `punkId` reverts with
`InvalidPunkId`.

### Paginated cursor

`bidsMatchingPunk` is the only enumerator on the contract. It scans a
descending window of `count` consecutive bid ids ending at `fromId`, and
returns the ids whose bids match `punkId`.

- Pass `fromId == 0` to start at `lastBidId`.
- `count` is the _scan window_ size, not a match cap. The returned array is
  truncated to the number of matches found.
- `nextId` is the next lower id to resume from, or `0` when the scan
  reached bid id 1.

The function is intentionally cursor-only: `lastBidId` is monotonically
increasing and callers must page through the book rather than ask for it in
one shot. For richer queries (global lists, per-trait or per-color
matching, sorted pagination) compose with the indexer documented in
[V1 Market](/sdk/v1-market#indexer-composition).

## ETH flow

`PunksMarket` inherits `PushPullEscrow`:

```solidity
mapping(address => uint256) public balances;

function withdraw() external nonReentrant;
```

Every outgoing payment goes through `_pushOrCredit(to, amount)`:

1. Attempt a `call{value: amount, gas: 95_000}` to `to`.
2. If the call fails (e.g. the recipient reverts, runs out of gas, or is
   not a contract that accepts ETH), credit `balances[to] += amount` and
   emit `Credited(to, amount)`.

Recipients with credited balances pull them out with `withdraw()`. This
makes settlement non-revertable: a malicious or contract-only seller, caller,
or bidder cannot block another party's payout.

Internally the market also calls `PUNKS_V1.withdraw()` during every directed
settlement to pull seller proceeds out of the buggy contract before passing
them along.

## Events

```solidity
event BidPlaced(
    uint256 indexed bidId,
    address indexed bidder,
    uint96 bidWei,
    uint96 settlementWei,
    Punks.Filter criteria,
    uint16[] includeIds,
    uint16[] excludeIds
);
event BidCancelled(uint256 indexed bidId);
event BidAdjusted(uint256 indexed bidId, uint96 newBidWei);
event BidAccepted(
    uint256 indexed bidId,
    uint256 indexed punkId,
    address indexed seller,
    address bidder,
    address caller,
    uint96 listingWei,
    uint96 bidWei,
    uint96 settlementWei
);
event PunkPurchased(
    uint256 indexed punkId,
    address indexed seller,
    address indexed recipient,
    address caller,
    uint96 listingWei
);

// Inherited from PushPullEscrow.
event Withdrawal(address indexed account, uint256 amount);
event Credited(address indexed account, uint256 amount);
```

## Errors

| Error                                                                       | When                                                                              |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `ZeroAddress`                                                               | `buyPunk` called with `recipient == address(0)`                                   |
| `UnexpectedEtherSender`                                                     | Plain ETH transfer to the contract from anyone other than `PUNKS_V1`              |
| `InvalidAmount`                                                             | `placeBid` with `bidWei == 0`, or `adjustBidPrice` with `weiToAdjust == 0`        |
| `IncorrectPayment`                                                          | `msg.value` does not match the required amount for the call                       |
| `TooManyIds`                                                                | `placeBid` with `includeIds.length > 64` or `excludeIds.length > 64`              |
| `AdjustmentTooLarge`                                                        | `adjustBidPrice(increase=false)` with `weiToAdjust >= bidWei`                     |
| `NotBidder`                                                                 | `cancelBid` or `adjustBidPrice` called by anyone other than the original bidder   |
| `BidNotActive`                                                              | Bid slot is empty (`bidder == address(0)`)                                        |
| `ListingNotValid`                                                           | Listing is missing, not directed to this market, or seller is no longer the owner |
| `ListingPriceMismatch(uint96 expectedListingWei, uint256 actualListingWei)` | `expectedListingWei` does not match the live listing's `minValue`                 |
| `ListingPriceTooHigh`                                                       | Inside `acceptBid`, the listing costs more than `bid.bidWei`                      |
| `InvalidPunkId`                                                             | `punkId >= 10_000`                                                                |
| `PunkExcluded`                                                              | `acceptBid` against a Punk listed in `bid.excludeIds`                             |
| `PunkNotMatched`                                                            | `acceptBid` against a Punk that fails the criteria predicate                      |
| `NoBalanceToWithdraw`                                                       | `withdraw()` with no credited balance (inherited)                                 |
| `FailedWithdrawal`                                                          | `withdraw()` push-back to the caller reverts (inherited)                          |

## Deployment

The Ignition module at `contracts/ignition/modules/PunksMarket.ts` deploys
the contract with no parameters.

| Contract      | Address                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| `PunksMarket` | [`0x64e507FEBF26521b73FbdfA533106B2042533218`](https://evm.now/address/punksmarket.eth) |

## Integration notes

- **Listings must be directed.** Sellers create listings through
  [`PUNKS_V1.offerPunkForSaleToAddress(punkId, price, punksmarket.eth)`](https://evm.now/address/0x6ba6f2207e343923ba692e5cae646fb0f566db8d/interact#offerPunkForSaleToAddress:::punksmarket.eth)
  on the original market. Public listings cannot be settled here. See
  [Creating a directed listing](#creating-a-directed-listing).
- **Caller rewards.** `settlementWei` is the only economic incentive for a
  third party to call `acceptBid`. Set it large enough to cover gas plus a
  margin if the bid needs to clear without the bidder watching the chain.
- **Bid pricing.** Bidders should treat `bidWei` as the maximum spend.
  `acceptBid` returns `bidWei - listingWei` to the bidder, so a generous
  ceiling does not cost extra when a cheap listing settles the bid.
- **Allowlist semantics.** To bid on a closed set of Punks, send an empty
  `Punks.Filter` together with up to 64 `includeIds`. To bid widely but
  veto specific Punks, leave `excludeIds` populated and use a real
  `criteria`. Avoid combining a populated `criteria` with `includeIds` if
  the include ids already satisfy the criteria — they are redundant.
- **Indexing.** The contract intentionally exposes only a single per-Punk
  cursor. Use the SDK's `PunksV1MarketIndexerClient` and
  `PunksV1MarketFacade` for cross-bid queries.

For TypeScript usage, see [V1 Market](/sdk/v1-market).
