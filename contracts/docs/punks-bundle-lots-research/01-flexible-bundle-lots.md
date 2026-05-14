# Flexible Bundle Lots

> **Superseded.** This research was merged into
> [`docs/punks-auction-redesign/`](../punks-auction-redesign/). The merged
> design pushes the unification further than this doc proposed: rather than
> adding bundle paths additively alongside the single-Punk path, every lot
> is `LotItem[]` of length 1..40, with N=1 as the singleton case. The
> `Offers` redesign was folded in at the same time. See
> [`punks-auction-redesign/01-design.md`](../punks-auction-redesign/01-design.md)
> and
> [`02-implementation-plan.md`](../punks-auction-redesign/02-implementation-plan.md).
>
> Carryover: weighted-split settlement, `itemHash` commitment, per-item
> versioning, atomic delivery, and the test plan all survive into the
> merged spec. Changed: `MAX_PUNKS` raised from 8 to 40; `BundleLot` /
> `BundleAuction` namespaces dropped (everything is now bundle-shaped); the
> "offers stay single-Punk for now" deferral was reversed.
>
> The body below is preserved for historical context.

## Context

`contracts/PunksAuction.sol` currently models a lot and an auction as exactly
one Punk. The public `Lot` and `Auction` structs store one
`tokenContract/tokenId/standard` tuple, `createLot` validates one Punk,
`openAuction` pulls one Punk from the seller vault, and `settle` delivers one
Punk before paying the seller.

That shape works for single Punk auctions and single-Punk offer flows, but it
does not support:

- V1 + V2 pairs.
- Multiple canonical Punks in one lot.
- Mixed canonical and V1 bundles.
- Larger curated lots, for example six Punks sold as one collection.

The escrow layer is already close to what bundle lots need. It has one route
for canonical CryptoPunks and one route for V1 CryptoPunks, and each route can
validate, pull, offer, buy, withdraw, and transfer a single Punk. A bundle lot
can compose those existing one-Punk operations in bounded loops.

## Recommendation

Add bounded Punk bundle lots. Do not make lots unbounded, and do not generalize
to arbitrary token standards in the first version.

```solidity
uint8 internal constant MAX_PUNKS = 9;

struct LotItem {
    TokenStandard standard; // CRYPTOPUNKS or CRYPTOPUNKS_V1
    uint16 punkId;
    uint16 weightBps;
}
```

The flexible surface should support 1 to `MAX_PUNKS` items. A one-item
bundle is equivalent to the current single-Punk lot. A V1 + V2 pair is a
two-item bundle with the same `punkId` and different standards. A six-Punk lot
is six items, any supported mix, subject to duplicate checks and gas bounds.

The bid amount, reserve, start time, auction duration, and anti-sniping logic
should remain auction-level fields. Lots themselves should not expire; sellers
can cancel them at any time. Bidders bid on the bundle as one asset group.

## Storage Shape

The current public struct cannot hold dynamic items. Keep compact public summary
structs and store item arrays separately.

```solidity
struct BundleLot {
    address seller;
    uint96 reserveWei;
    uint8 itemCount;
    bytes32 itemHash;
}

struct BundleAuction {
    address seller;
    address latestBidder;
    uint96 latestBidWei;
    uint40 endTimestamp;
    uint8 itemCount;
    bytes32 itemHash;
    bool settled;
}

mapping(uint256 => BundleLot) public bundleLots;
mapping(uint256 => LotItem[]) internal bundleLotItems;

mapping(uint256 => BundleAuction) public bundleAuctions;
mapping(uint256 => LotItem[]) internal bundleAuctionItems;
```

`itemHash` gives offchain consumers and callers a stable commitment to the item
set without returning a dynamic array through a public mapping getter.

```solidity
function _itemHash(LotItem[] memory items) internal pure returns (bytes32) {
    return keccak256(abi.encode(items));
}
```

Add explicit getters for item arrays:

```solidity
function getBundleLotItems(uint256 lotId) external view returns (LotItem[] memory);
function getBundleAuctionItems(uint256 auctionId) external view returns (LotItem[] memory);
```

## API Shape

Prefer additive APIs first so the current single-Punk surface remains stable.

```solidity
function createBundleLot(
    LotItem[] calldata items,
    uint96 reserveWei
) external returns (uint256 lotId);

function updateBundleLot(uint256 lotId, uint96 reserveWei) external;
function cancelBundleLot(uint256 lotId) external;
function clearStaleBundleLot(uint256 lotId) external;

function openBundleAuction(uint256 lotId, uint96 expectedReserveWei)
    external
    payable
    returns (uint256 auctionId);

function settleBundle(uint256 auctionId) external;
```

The existing `createLot` can either stay as the legacy path or become a wrapper
around a one-item bundle internally. Keeping it as a wrapper is preferable over
removing it because it preserves existing frontend and indexer assumptions.

## Validation Rules

At lot creation:

- `items.length` must be between 1 and `MAX_PUNKS`.
- Every item standard must be `CRYPTOPUNKS` or `CRYPTOPUNKS_V1`.
- No duplicate `{standard, punkId}` items in the same lot.
- The seller must have every Punk in the right vault.
- `reserveWei` must be nonzero.
- If `weightBps` is enabled, all item weights must sum to `10_000`.

At auction open:

- Recheck reserve expectation.
- Recheck each saved item version.
- Recheck every Punk is still in the seller vault.
- Delete the lot before external custody moves.
- Increment each item version.
- Pull every Punk into auction escrow custody.

At stale-lot clearing:

- A bundle lot is stale if auction approval is revoked, if any item version
  changed, or if any Punk is no longer in the seller vault.
- If a Punk moved out of the seller vault, bump the affected item version so
  other lots that reference that exact seller item become stale too.

## Versioning and Invalidation

The current `sellerTokenVersion` mapping can be reused. Its key is already:

```solidity
keccak256(abi.encode(seller, tokenContract, tokenId))
```

For bundle lots, store the version for each item. Because Solidity structs with
dynamic arrays get awkward as public mapping values, this probably means a
parallel internal array:

```solidity
mapping(uint256 => uint64[]) internal bundleLotItemVersions;
```

When a bundle auction opens, increment every item key. This invalidates:

- Other bundle lots containing any of those items.
- Legacy single-Punk lots containing any of those items.

If the legacy single-Punk path remains separate, it must continue to increment
the same `sellerTokenVersion` key so bundle lots and legacy lots invalidate each
other.

## Settlement Accounting

This is the most important design constraint.

Current settlement does not directly transfer the escrowed Punk to the winner.
It runs through the CryptoPunks market sale path:

1. Escrow offers the Punk to the auction contract.
2. The auction contract buys it.
3. Proceeds are withdrawn or swept according to the market behavior.
4. The auction contract transfers the Punk to the winner.
5. The seller is paid once by the auction contract.

For bundles, do not pass the full hammer price into every item delivery. That
would produce misleading Punk market sale events and can create confusing
intermediate accounting.

Instead, split the hammer price into per-item delivery amounts that sum exactly
to the final bid.

### Equal Split

The simplest split is equal by count:

```solidity
uint256 base = hammerWei / itemCount;
uint256 remainder = hammerWei % itemCount;

for (uint256 i; i < itemCount; ++i) {
    LotItem memory item = items[i];
    uint256 itemWei = base + (i == 0 ? remainder : 0);
    _deliverPunk(
        item.standard,
        _tokenContractFor(item.standard),
        item.punkId,
        recipient,
        itemWei
    );
}
```

This is easy to reason about, but it can make a V2 + V1 pair look like a 50/50
sale in Punk market events even if the market would intuitively value the V2
side much higher.

### Weighted Split

Weighted splits are better if market event values matter.

```solidity
uint256 allocated;

for (uint256 i; i < itemCount; ++i) {
    LotItem memory item = items[i];
    uint256 itemWei = i == itemCount - 1
        ? hammerWei - allocated
        : hammerWei * item.weightBps / 10_000;
    allocated += itemWei;
    _deliverPunk(
        item.standard,
        _tokenContractFor(item.standard),
        item.punkId,
        recipient,
        itemWei
    );
}
```

The final item receives the rounding remainder. For a V1 + V2 pair, a seller
could choose 9,500 bps for the canonical Punk and 500 bps for the V1 Punk, or
any other explicit allocation. For six-Punk lots, the seller can choose equal
weights or item-specific weights.

Weighted split is the stronger long-term design, but it adds UI work and one
more validation rule. If shipping the first version quickly matters more than
event expressiveness, start with equal split and reserve `weightBps` for a
later migration.

## Atomicity

Bundle settlement should be all-or-nothing. If any item delivery fails, the
whole settlement must revert and the seller must not be paid.

The current settlement marks `settled = true` before delivery, but a revert
rolls that state change back. The same pattern can work for bundles. The
important part is to pay the seller only after all item deliveries succeed.

```solidity
storedAuction.settled = true;

for (...) {
    _deliverPunk(...);
}

_pushOrCredit(auction.seller, auction.latestBidWei);
```

This preserves the existing safety property: failed delivery does not leak
seller payment and does not permanently settle the auction.

## Events

The current events are single-item oriented. For bundles, add bundle-specific
events rather than overloading single-Punk event meanings.

```solidity
event BundleLotCreated(
    uint256 indexed lotId,
    address indexed seller,
    bytes32 indexed itemHash,
    uint8 itemCount,
    uint96 reserveWei
);

event BundleLotItem(
    uint256 indexed lotId,
    TokenStandard indexed standard,
    uint256 indexed punkId,
    uint16 weightBps
);

event BundleAuctionInitialised(
    uint256 indexed auctionId,
    address indexed seller,
    bytes32 indexed itemHash,
    uint8 itemCount,
    uint40 endTimestamp
);

event BundleSettled(
    uint256 indexed auctionId,
    address indexed winner,
    address indexed seller,
    uint256 finalWei,
    uint256 sellerWei,
    uint256 protocolWei
);
```

Emitting one `BundleLotItem` per item costs more gas, but it makes indexing
straightforward and avoids forcing indexers to reconstruct item arrays from
calldata.

## Offers

Do not include bundle offers in the first version.

Existing offers are single-Punk criteria offers. They match one standard and
one `punkId` at acceptance or auction start. Bundle offers need different
semantics:

- Exact item-set offers.
- Criteria for multiple items.
- Collection-style offers for any N matching Punks.
- Per-item or bundle-level settlement amounts.

Those are useful, but they are a separate product surface. Bundle lots and
bundle auctions can ship without changing offers.

## Gas Bound

Every major bundle operation is linear in `itemCount`:

- Creation validates every item and stores item data.
- Opening revalidates versions, pulls every Punk, and increments every version.
- Settlement runs one Punk market sale path per item.
- Clearing stale lots checks every item.

This is why the design needs `MAX_PUNKS`. A limit of 8 is conservative and
still covers V1 + V2 pairs and six-Punk lots. A limit of 16 may be reasonable
after gas tests, but should not be assumed without measuring mixed V1/V2
settlement.

## Migration Path

Recommended implementation sequence:

1. Add `LotItem`, bundle storage, item getters, and bundle events.
2. Implement `createBundleLot`, `updateBundleLot`, `cancelBundleLot`, and
   stale clearing.
3. Implement `openBundleAuction` using the existing escrow pull path in a loop.
4. Implement `settleBundle` with equal split first or weighted split if the UI
   can support it immediately.
5. Convert legacy `createLot` into a one-item wrapper only after bundle tests
   are stable.
6. Decide whether legacy `auctions` and new `bundleAuctions` should remain
   separate namespaces or converge into one shared auction namespace.

Separate namespaces are easier to add safely. A unified namespace is nicer for
frontends and indexers, but touches more existing assumptions.

## Test Plan

Minimum test coverage:

- Creates a one-item bundle equivalent to a current single-Punk lot.
- Creates and settles a V1 + V2 pair for the same `punkId`.
- Creates and settles a six-Punk mixed bundle.
- Rejects empty bundles.
- Rejects bundles over `MAX_PUNKS`.
- Rejects duplicate `{standard, punkId}` items.
- Rejects unsupported standards.
- Rejects creation when any Punk is missing from the seller vault.
- Invalidates a bundle lot when any item is opened through a legacy lot.
- Invalidates a legacy lot when its Punk is opened through a bundle lot.
- Clears a stale bundle when one item has moved out of the vault.
- Reverts settlement if canonical delivery fails and leaves the seller unpaid.
- Reverts settlement if V1 delivery fails and leaves the seller unpaid.
- Pays the seller exactly `latestBidWei` once.
- Leaves no ETH in the auction contract, Punk escrows, or pending withdrawals
  after successful settlement.
- Sends every item to the winner receiver, if a custom receiver is configured.
- Emits item events and settlement events with expected item counts and hashes.

## Open Questions

- Should the first version use equal settlement splits or seller-chosen
  `weightBps`?
- Should bundle lots and single-Punk lots share `lastLotId`, or should they use
  separate ID spaces?
- Should bundle auctions and single-Punk auctions share `lastAuctionId`, or
  should frontends call separate read paths?
- Is `MAX_PUNKS = 8` enough, or do real sellers need 16?
- Should pair lots get a convenience wrapper such as `createPairLot(uint16
punkId, ...)`, or should the generic bundle function be the only new path?
- Should item order be seller-defined, canonicalized by `{standard,punkId}`, or
  preserved but hashed exactly as provided?

## Current Lean

Use bounded Punk-specific bundles with `MAX_PUNKS = 8`, weighted settlement
splits, item arrays stored separately from compact public summary structs, and
additive bundle APIs. Keep offers single-Punk for now. Keep the current
single-Punk API as a compatibility wrapper once the bundle path is proven.
