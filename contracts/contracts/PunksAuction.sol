// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./escrow/PunksEscrowManager.sol";
import "./interfaces/IPunksAuction.sol";
import "./interfaces/ICryptoPunksMarket.sol";
import "./offers/Offers.sol";

/// @title PunksAuction
/// @notice Zero-fee auction house for CryptoPunks with N-item lots and N-slot offers.
contract PunksAuction is IPunksAuction, PunksEscrowManager, Offers {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant BID_INCREASE_BPS = 1_000;
    uint16 internal constant TOTAL_WEIGHT_BPS = 10_000;
    uint40 internal constant AUCTION_DURATION = 24 hours;
    uint40 internal constant BIDDING_GRACE_PERIOD = 15 minutes;

    /// @notice Returns the last lot id that was created.
    uint256 public lastLotId;
    /// @notice Returns the last auction id that was created.
    uint256 public lastAuctionId;

    /// @notice Returns the scalar fields of a lot (items via `getLotItems`).
    mapping(uint256 => Lot) public lots;
    /// @notice Returns the scalar fields of an auction (items via `getAuctionItems`).
    mapping(uint256 => Auction) public auctions;
    /// @notice Returns the receiver set for an auction winner.
    mapping(uint256 => address) public winnerReceivers;

    /// @notice Returns the version used to expire old lots for a seller's Punk.
    mapping(bytes32 => uint64) public sellerTokenVersion;

    mapping(uint256 => LotItem[]) internal lotItems;
    mapping(uint256 => uint64[]) internal lotItemVersions;
    mapping(uint256 => LotItem[]) internal auctionItems;

    /// @notice Creates the auction house wired to the canonical and V1 Punk markets.
    constructor(address punks, address punksV1, address punksData)
        PunksEscrowManager(punks, punksV1)
        Offers(punksData)
    {}

    /// @notice Receives ETH from trusted Punk market flows.
    receive() external payable {
        if (!_isPunkReceiveSender(msg.sender)) revert UnexpectedEtherSender();
    }

    /// @notice Creates a lot of one or more Punks that can be opened as an auction.
    /// @dev    Idempotently registers the seller's vault so first-time sellers
    ///         do not need a separate `ensureVault` transaction.
    function createLot(
        LotItem[] calldata items,
        uint96 reserveWei,
        uint40 expiresAt
    ) external returns (uint256 id) {
        if (reserveWei == 0) revert InvalidAmount();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();
        _ensureSellerVault(msg.sender);
        _validateLotItems(items);

        uint8 itemCount = uint8(items.length);
        bytes32 itemHash = keccak256(abi.encode(items));

        unchecked {
            id = ++lastLotId;
        }

        lots[id] = Lot({
            seller: msg.sender,
            reserveWei: reserveWei,
            expiresAt: expiresAt,
            itemCount: itemCount,
            itemHash: itemHash
        });

        emit LotCreated(id, msg.sender, itemHash, itemCount, reserveWei, expiresAt);

        LotItem[] storage storedItems = lotItems[id];
        uint64[] storage versions = lotItemVersions[id];
        for (uint256 i; i < itemCount;) {
            LotItem calldata item = items[i];
            storedItems.push(item);
            bytes32 key = _tokenKey(msg.sender, _tokenContractFor(item.standard), item.punkId);
            versions.push(sellerTokenVersion[key]);
            emit LotItemDetail(id, uint8(i), item.standard, item.punkId, item.weightBps);
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Updates the reserve price and expiry for your lot.
    function updateLot(uint256 id, uint96 reserveWei, uint40 expiresAt) external {
        Lot storage lot = lots[id];
        if (lot.seller == address(0)) revert LotNotFound();
        if (lot.seller != msg.sender) revert NotSeller();
        if (reserveWei == 0) revert InvalidAmount();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();

        lot.reserveWei = reserveWei;
        lot.expiresAt = expiresAt;

        emit LotUpdated(id, reserveWei, expiresAt);
    }

    /// @notice Cancels your lot.
    function cancelLot(uint256 id) external {
        Lot storage lot = lots[id];
        if (lot.seller == address(0)) revert LotNotFound();
        if (lot.seller != msg.sender) revert NotSeller();

        delete lots[id];
        delete lotItems[id];
        delete lotItemVersions[id];

        emit LotCancelled(id);
    }

    /// @notice Clears one lot that is expired or no longer valid.
    function clearStaleLot(uint256 id) external {
        _clearStaleLot(id);
    }

    /// @notice Clears several lots that are expired or no longer valid.
    function clearStaleLots(uint256[] calldata ids) external {
        uint256 len = ids.length;
        for (uint256 i; i < len;) {
            _clearStaleLot(ids[i]);
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Opens a lot as a live auction with your first bid.
    function openAuction(
        uint256 id,
        uint96 expectedReserveWei
    ) external payable nonReentrant returns (uint256 auctionId) {
        Lot memory lot = lots[id];
        if (lot.seller == address(0)) revert LotNotFound();
        if (block.timestamp >= lot.expiresAt) revert LotExpired();
        if (lot.reserveWei != expectedReserveWei) {
            revert ReserveMismatch(expectedReserveWei, lot.reserveWei);
        }

        uint96 bidWei = _checkedUint96(msg.value);
        if (bidWei < lot.reserveWei) revert ReserveNotMet();

        LotItem[] memory items = lotItems[id];
        uint64[] memory versions = lotItemVersions[id];
        _requireLotItemsValidForOpen(lot.seller, items, versions);

        delete lots[id];
        delete lotItems[id];
        delete lotItemVersions[id];

        auctionId = _createAuctionFromItems(lot.seller, items, msg.sender, bidWei, address(0));
    }

    /// @notice Places a bid on a live auction.
    function bid(uint256 auctionId) external payable nonReentrant {
        Auction storage auction = auctions[auctionId];
        if (auction.endTimestamp == 0) revert AuctionDoesNotExist();
        if (auction.settled) revert AuctionAlreadySettled();
        if (block.timestamp > auction.endTimestamp) revert AuctionNotActive();

        uint96 bidWei = _checkedUint96(msg.value);
        if (bidWei < _currentMinBidWei(auction.latestBidWei)) revert MinimumBidNotMet();

        address previousBidder = auction.latestBidder;
        uint96 previousBidWei = auction.latestBidWei;

        auction.latestBidder = msg.sender;
        auction.latestBidWei = bidWei;
        delete winnerReceivers[auctionId];

        _maybeExtend(auctionId, auction);

        if (previousBidWei > 0) {
            _pushOrCredit(previousBidder, previousBidWei);
        }

        emit Bid(auctionId, msg.sender, bidWei);
    }

    /// @notice Accepts an offer against a stored lot.
    function acceptOfferFromLot(uint256 offerId, uint256 lotId) external nonReentrant {
        Offer memory offer = _activeOffer(offerId);
        Lot memory lot = lots[lotId];
        if (lot.seller == address(0)) revert LotNotFound();
        if (block.timestamp >= lot.expiresAt) revert LotExpired();
        if (offer.amountWei < lot.reserveWei) revert ReserveNotMet();

        LotItem[] memory items = lotItems[lotId];
        uint64[] memory versions = lotItemVersions[lotId];
        if (offer.slots.length != items.length) revert SlotItemCountMismatch();

        uint256 itemCount = items.length;
        for (uint256 i; i < itemCount;) {
            LotItem memory item = items[i];
            _requireSlotMatchesPunk(offer.slots[i], item.standard, item.punkId);
            bytes32 key = _tokenKey(lot.seller, _tokenContractFor(item.standard), item.punkId);
            if (versions[i] != sellerTokenVersion[key]) revert LotExpired();
            _requirePunkInVault(item.standard, lot.seller, item.punkId);
            unchecked {
                ++i;
            }
        }

        delete offers[offerId];
        delete lots[lotId];
        delete lotItems[lotId];
        delete lotItemVersions[lotId];

        for (uint256 i; i < itemCount;) {
            LotItem memory item = items[i];
            bytes32 key = _tokenKey(lot.seller, _tokenContractFor(item.standard), item.punkId);
            unchecked {
                ++sellerTokenVersion[key];
            }
            _pullPunk(item.standard, lot.seller, item.punkId);
            unchecked {
                ++i;
            }
        }

        address recipient = _offerRecipient(offer);
        _settleBundleDelivery(items, offer.amountWei, recipient);

        _pushOrCredit(lot.seller, offer.amountWei);
        _pushOrCredit(msg.sender, offer.settlementWei);

        emit OfferAcceptedFromLot(
            offerId,
            lotId,
            lot.seller,
            offer.offerer,
            recipient,
            offer.amountWei,
            offer.settlementWei
        );
    }

    /// @notice Starts an auction by using an existing offer as the first bid for a stored lot.
    function startAuctionFromOffer(uint256 offerId, uint256 lotId)
        external
        nonReentrant
        returns (uint256 auctionId)
    {
        Offer memory offer = _activeOffer(offerId);
        Lot memory lot = lots[lotId];
        if (lot.seller == address(0)) revert LotNotFound();
        if (block.timestamp >= lot.expiresAt) revert LotExpired();
        if (offer.amountWei < lot.reserveWei) revert ReserveNotMet();

        LotItem[] memory items = lotItems[lotId];
        uint64[] memory versions = lotItemVersions[lotId];
        if (offer.slots.length != items.length) revert SlotItemCountMismatch();

        uint256 itemCount = items.length;
        for (uint256 i; i < itemCount;) {
            LotItem memory item = items[i];
            _requireSlotMatchesPunk(offer.slots[i], item.standard, item.punkId);
            bytes32 key = _tokenKey(lot.seller, _tokenContractFor(item.standard), item.punkId);
            if (versions[i] != sellerTokenVersion[key]) revert LotExpired();
            _requirePunkInVault(item.standard, lot.seller, item.punkId);
            unchecked {
                ++i;
            }
        }

        delete offers[offerId];
        delete lots[lotId];
        delete lotItems[lotId];
        delete lotItemVersions[lotId];

        _refundOfferSettlement(offer);

        address recipient = _offerRecipient(offer);
        auctionId = _createAuctionFromItems(
            lot.seller,
            items,
            offer.offerer,
            offer.amountWei,
            recipient
        );

        emit OfferAuctionInitialised(
            offerId,
            auctionId,
            lotId,
            lot.seller,
            offer.offerer,
            recipient,
            offer.amountWei
        );
    }

    /// @notice Returns the minimum bid needed for an auction.
    function currentMinBidWei(uint256 auctionId) external view returns (uint96) {
        return _currentMinBidWei(auctions[auctionId].latestBidWei);
    }

    /// @notice Checks whether an auction is still open.
    function auctionActive(uint256 auctionId) external view returns (bool) {
        Auction storage auction = auctions[auctionId];
        return auction.endTimestamp != 0 && block.timestamp <= auction.endTimestamp;
    }

    /// @notice Returns when an auction ends.
    function endTimestampOf(uint256 auctionId) external view returns (uint40) {
        return auctions[auctionId].endTimestamp;
    }

    /// @notice Returns the items stored on a lot.
    function getLotItems(uint256 lotId) external view returns (LotItem[] memory) {
        return lotItems[lotId];
    }

    /// @notice Returns the items stored on an auction.
    function getAuctionItems(uint256 auctionId) external view returns (LotItem[] memory) {
        return auctionItems[auctionId];
    }

    /// @notice Settles a completed auction.
    function settle(uint256 auctionId) external nonReentrant {
        Auction storage storedAuction = auctions[auctionId];
        Auction memory auction = storedAuction;
        if (auction.endTimestamp == 0) revert AuctionDoesNotExist();
        if (auction.settled) revert AuctionAlreadySettled();
        if (block.timestamp <= auction.endTimestamp) revert AuctionNotComplete();

        storedAuction.settled = true;

        LotItem[] memory items = auctionItems[auctionId];
        uint96 totalWei = auction.latestBidWei;
        address recipient = _auctionRecipient(auctionId, auction.latestBidder);

        uint256 itemCount = items.length;
        uint256 allocated;
        for (uint256 i; i < itemCount;) {
            LotItem memory item = items[i];
            uint96 itemWei = i == itemCount - 1
                ? totalWei - uint96(allocated)
                : uint96(uint256(totalWei) * item.weightBps / TOTAL_WEIGHT_BPS);
            allocated += itemWei;
            _deliverPunk(item.standard, item.punkId, recipient, itemWei);
            emit AuctionItemDelivered(
                auctionId,
                uint8(i),
                item.standard,
                item.punkId,
                recipient,
                itemWei
            );
            unchecked {
                ++i;
            }
        }

        _pushOrCredit(auction.seller, totalWei);

        emit AuctionSettled(
            auctionId,
            auction.latestBidder,
            auction.seller,
            uint256(totalWei),
            uint256(totalWei),
            0
        );
    }

    /// @dev Creates auction storage, pulls the items into custody, and emits the first bid.
    function _createAuctionFromItems(
        address seller,
        LotItem[] memory items,
        address initialBidder,
        uint96 bidWei,
        address receiver
    ) internal returns (uint256 auctionId) {
        unchecked {
            auctionId = ++lastAuctionId;
        }

        uint40 endTimestamp = uint40(block.timestamp) + AUCTION_DURATION;
        uint8 itemCount = uint8(items.length);
        bytes32 itemHash = keccak256(abi.encode(items));

        auctions[auctionId] = Auction({
            seller: seller,
            latestBidder: initialBidder,
            latestBidWei: bidWei,
            endTimestamp: endTimestamp,
            itemCount: itemCount,
            itemHash: itemHash,
            settled: false
        });
        if (receiver != address(0) && receiver != initialBidder) {
            winnerReceivers[auctionId] = receiver;
        }

        LotItem[] storage storedItems = auctionItems[auctionId];
        for (uint256 i; i < itemCount;) {
            LotItem memory item = items[i];
            storedItems.push(item);
            bytes32 key = _tokenKey(seller, _tokenContractFor(item.standard), item.punkId);
            unchecked {
                ++sellerTokenVersion[key];
            }
            _pullPunk(item.standard, seller, item.punkId);
            unchecked {
                ++i;
            }
        }

        emit AuctionInitialised(auctionId, seller, itemHash, itemCount, endTimestamp);
        emit Bid(auctionId, initialBidder, bidWei);
    }

    /// @dev Removes a stale lot and bumps the seller token version when custody changed.
    function _clearStaleLot(uint256 id) internal {
        Lot memory lot = lots[id];
        if (lot.seller == address(0)) revert LotNotFound();

        LotItem[] memory items = lotItems[id];
        uint64[] memory versions = lotItemVersions[id];
        uint256 itemCount = items.length;

        bool versionStale;
        bool[] memory itemLeftVault = new bool[](itemCount);
        bool anyLeftVault;
        for (uint256 i; i < itemCount;) {
            LotItem memory item = items[i];
            bytes32 key = _tokenKey(lot.seller, _tokenContractFor(item.standard), item.punkId);
            if (versions[i] != sellerTokenVersion[key]) versionStale = true;
            if (!_punkStillInSellerVault(item.standard, lot.seller, item.punkId)) {
                itemLeftVault[i] = true;
                anyLeftVault = true;
            }
            unchecked {
                ++i;
            }
        }

        bool expired = block.timestamp >= lot.expiresAt;
        if (!versionStale && !expired && !anyLeftVault) revert LotNotStale();

        delete lots[id];
        delete lotItems[id];
        delete lotItemVersions[id];

        if (anyLeftVault) {
            for (uint256 i; i < itemCount;) {
                if (itemLeftVault[i]) {
                    LotItem memory item = items[i];
                    bytes32 key = _tokenKey(
                        lot.seller,
                        _tokenContractFor(item.standard),
                        item.punkId
                    );
                    unchecked {
                        ++sellerTokenVersion[key];
                    }
                }
                unchecked {
                    ++i;
                }
            }
        }

        emit LotCleared(id, msg.sender);
    }

    /// @dev Validates lot items at create time: count, weights, duplicates, vault custody.
    function _validateLotItems(LotItem[] calldata items) internal view {
        uint256 n = items.length;
        if (n == 0 || n > MAX_LOT_ITEMS) revert InvalidItemCount();

        uint256 weightSum;
        for (uint256 i; i < n;) {
            uint16 w = items[i].weightBps;
            if (w == 0) revert InvalidWeights();
            weightSum += w;
            unchecked {
                ++i;
            }
        }
        if (weightSum != TOTAL_WEIGHT_BPS) revert InvalidWeights();

        for (uint256 i; i < n;) {
            for (uint256 j = i + 1; j < n;) {
                if (
                    items[i].standard == items[j].standard
                        && items[i].punkId == items[j].punkId
                ) {
                    revert DuplicateLotItem();
                }
                unchecked {
                    ++j;
                }
            }
            unchecked {
                ++i;
            }
        }

        for (uint256 i; i < n;) {
            _requirePunkInVault(items[i].standard, msg.sender, items[i].punkId);
            unchecked {
                ++i;
            }
        }
    }

    /// @dev Checks per-item version snapshots and vault custody at open/accept/start time.
    function _requireLotItemsValidForOpen(
        address seller,
        LotItem[] memory items,
        uint64[] memory versions
    ) internal view {
        uint256 n = items.length;
        for (uint256 i; i < n;) {
            LotItem memory item = items[i];
            bytes32 key = _tokenKey(seller, _tokenContractFor(item.standard), item.punkId);
            if (versions[i] != sellerTokenVersion[key]) revert LotExpired();
            _requirePunkInVault(item.standard, seller, item.punkId);
            unchecked {
                ++i;
            }
        }
    }

    /// @dev Per-item delivery loop with weighted ETH allocation.
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
            unchecked {
                ++i;
            }
        }
    }

    /// @dev Resolves the Punk market used by the offer flow.
    function _offerMarket(TokenStandard standard)
        internal
        view
        override
        returns (ICryptoPunksMarket)
    {
        return _marketFor(standard);
    }

    /// @dev Buys a listed Punk while handling the V1 market accounting bug.
    function _buyListedOfferPunk(
        TokenStandard standard,
        uint16 punkId,
        uint256 listingWei,
        address seller,
        address recipient
    ) internal override {
        if (standard == TokenStandard.CRYPTOPUNKS) {
            PUNKS.buyPunk{value: listingWei}(punkId);
            PUNKS.transferPunk(recipient, punkId);
        } else {
            PUNKS_V1.buyPunk{value: listingWei}(punkId);
            PUNKS_V1.withdraw();
            PUNKS_V1.transferPunk(recipient, punkId);
            _pushOrCredit(seller, listingWei);
        }
    }

    /// @dev Returns the custom receiver for a winner, or the bidder when none is set.
    function _auctionRecipient(uint256 auctionId, address bidder) internal view returns (address) {
        address receiver = winnerReceivers[auctionId];
        return receiver == address(0) ? bidder : receiver;
    }

    /// @dev Extends an auction when a bid arrives inside the grace period.
    function _maybeExtend(uint256 auctionId, Auction storage auction) internal {
        uint40 nowTs = uint40(block.timestamp);
        uint40 timeRemaining = auction.endTimestamp - nowTs;
        if (timeRemaining < BIDDING_GRACE_PERIOD) {
            uint40 newEnd = nowTs + BIDDING_GRACE_PERIOD;
            auction.endTimestamp = newEnd;
            emit AuctionExtended(auctionId, newEnd);
        }
    }

    /// @dev Calculates the next bid using the configured basis point increase.
    function _currentMinBidWei(uint96 prevWei) internal pure returns (uint96) {
        uint256 next = (uint256(prevWei) * (BPS + BID_INCREASE_BPS) + BPS - 1) / BPS;
        return next > type(uint96).max ? type(uint96).max : uint96(next);
    }

    /// @dev Casts an ETH amount to uint96 after checking the upper bound.
    function _checkedUint96(uint256 value) internal pure returns (uint96) {
        if (value > type(uint96).max) revert TooManyTokens();
        return uint96(value);
    }

    /// @dev Builds the key used to version a seller's Punk lot membership.
    function _tokenKey(
        address seller,
        address tokenContract,
        uint256 tokenId
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(seller, tokenContract, tokenId));
    }
}
