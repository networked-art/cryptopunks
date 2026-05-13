// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./interfaces/IPunksAuction.sol";
import "./interfaces/ICryptoPunksMarket.sol";
import "./interfaces/IPunkVault.sol";
import "./interfaces/IPunkVaultFactory.sol";
import "./offers/Offers.sol";

/// @title PunksAuction
/// @notice Zero-fee auction house for CryptoPunks with N-item lots and N-slot offers.
/// @dev    Sellers custody Punks in their own `PunkVault` (deployed via the
///         `PunkVaultFactory`) and approve this contract as operator. The
///         auction pulls Punks straight from the vault at sale start and
///         performs the canonical settlement round-trip from its own custody.
contract PunksAuction is IPunksAuction, Offers {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant BID_INCREASE_BPS = 1_000;
    uint16 internal constant TOTAL_WEIGHT_BPS = 10_000;
    uint40 internal constant AUCTION_DURATION = 24 hours;
    uint40 internal constant BIDDING_GRACE_PERIOD = 15 minutes;

    /// @notice Returns the canonical CryptoPunks market.
    ICryptoPunksMarket public immutable PUNKS;
    /// @notice Returns the CryptoPunks V1 market.
    ICryptoPunksMarket public immutable PUNKS_V1;
    /// @notice Returns the per-user `PunkVault` factory.
    IPunkVaultFactory public immutable PUNK_VAULTS;

    /// @notice Returns the last lot id that was created.
    uint256 public lastLotId;
    /// @notice Returns the last auction id that was created.
    uint256 public lastAuctionId;

    /// @notice Returns the scalar fields of a lot (items via `getLotItems`).
    mapping(uint256 => Lot) public lots;
    /// @notice Returns the scalar fields of an auction (items via `getAuctionItems`).
    mapping(uint256 => Auction) public auctions;
    /// @notice Returns the active lot id holding a seller's Punk, or 0 if none.
    /// @dev    Keyed by `keccak256(seller, tokenContract, punkId)`. A non-zero
    ///         entry reserves that Punk for one lot at a time — first-wins.
    mapping(bytes32 => uint256) public lotForPunk;

    mapping(uint256 => LotItem[]) internal lotItems;
    mapping(uint256 => LotItem[]) internal auctionItems;

    /// @notice Creates the auction house wired to both Punk markets and the vault factory.
    constructor(address punks, address punksV1, address punksData, address vaultFactory)
        Offers(punksData)
    {
        if (punks == address(0) || punksV1 == address(0) || vaultFactory == address(0)) {
            revert ZeroAddress();
        }
        if (punks == punksV1) revert ZeroAddress();
        PUNKS = ICryptoPunksMarket(punks);
        PUNKS_V1 = ICryptoPunksMarket(punksV1);
        PUNK_VAULTS = IPunkVaultFactory(vaultFactory);
    }

    /// @notice Receives ETH from the two Punk markets during settlement
    ///         `withdraw()` calls. Nothing else.
    receive() external payable {
        if (msg.sender != address(PUNKS) && msg.sender != address(PUNKS_V1)) {
            revert UnexpectedEtherSender();
        }
    }

    /// @notice Creates a lot of one or more Punks that can be opened as an auction.
    /// @dev    Pre-checks that the seller's vault is deployed and has approved
    ///         this auction as operator — surfaces misconfiguration up front
    ///         instead of at pull time.
    function createLot(
        LotItem[] calldata items,
        uint96 reserveWei
    ) external returns (uint256 id) {
        if (reserveWei == 0) revert InvalidAmount();
        _requireAuctionApproved(msg.sender);
        _validateLotItems(items);

        uint8 itemCount = uint8(items.length);
        bytes32 itemHash = keccak256(abi.encode(items));

        unchecked {
            id = ++lastLotId;
        }

        lots[id] = Lot({
            seller: msg.sender,
            reserveWei: reserveWei,
            itemCount: itemCount,
            itemHash: itemHash
        });

        emit LotCreated(id, msg.sender, itemHash, itemCount, reserveWei);

        LotItem[] storage storedItems = lotItems[id];
        for (uint256 i; i < itemCount;) {
            LotItem calldata item = items[i];
            storedItems.push(item);
            bytes32 key = _tokenKey(msg.sender, _tokenContractFor(item.standard), item.punkId);
            lotForPunk[key] = id;
            emit LotItemDetail(id, uint8(i), item.standard, item.punkId, item.weightBps);
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Updates the reserve price for your lot.
    function updateLot(uint256 id, uint96 reserveWei) external {
        Lot storage lot = lots[id];
        if (lot.seller == address(0)) revert LotNotFound();
        if (lot.seller != msg.sender) revert NotSeller();
        if (reserveWei == 0) revert InvalidAmount();

        lot.reserveWei = reserveWei;

        emit LotUpdated(id, reserveWei);
    }

    /// @notice Cancels your lot.
    function cancelLot(uint256 id) external {
        Lot storage lot = lots[id];
        if (lot.seller == address(0)) revert LotNotFound();
        if (lot.seller != msg.sender) revert NotSeller();

        _releaseLotSlots(lot.seller, lotItems[id]);
        delete lots[id];
        delete lotItems[id];

        emit LotCancelled(id);
    }

    /// @notice Clears one lot that is no longer valid.
    function clearStaleLot(uint256 id) external {
        _clearStaleLot(id);
    }

    /// @notice Clears several lots that are no longer valid.
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
        if (lot.reserveWei != expectedReserveWei) {
            revert ReserveMismatch(expectedReserveWei, lot.reserveWei);
        }

        uint96 bidWei = _checkedUint96(msg.value);
        if (bidWei < lot.reserveWei) revert ReserveNotMet();

        LotItem[] memory items = lotItems[id];
        _requireLotItemsValidForOpen(lot.seller, items);

        delete lots[id];
        delete lotItems[id];

        auctionId = _createAuctionFromItems(lot.seller, items, msg.sender, bidWei);
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

        _maybeExtend(auctionId, auction);

        if (previousBidWei > 0) {
            _pushOrCredit(previousBidder, previousBidWei);
        }

        emit Bid(auctionId, msg.sender, bidWei);
    }

    /// @notice Accepts an offer against a stored lot.
    function acceptOfferFromLot(
        uint256 offerId,
        uint256 lotId,
        uint96 minAmountWei
    ) external nonReentrant {
        Offer memory offer = _activeOffer(offerId);
        Lot memory lot = lots[lotId];
        if (lot.seller == address(0)) revert LotNotFound();
        if (offer.amountWei < minAmountWei) {
            revert OfferAmountBelowMinimum(minAmountWei, offer.amountWei);
        }
        if (offer.amountWei < lot.reserveWei) revert ReserveNotMet();

        LotItem[] memory items = lotItems[lotId];
        if (offer.slots.length != items.length) revert SlotItemCountMismatch();

        uint256 itemCount = items.length;
        for (uint256 i; i < itemCount;) {
            LotItem memory item = items[i];
            _requireSlotMatchesPunk(offer.slots[i], item.standard, item.punkId);
            _requirePunkInVault(item.standard, lot.seller, item.punkId);
            unchecked {
                ++i;
            }
        }

        delete offers[offerId];
        delete lots[lotId];
        delete lotItems[lotId];

        for (uint256 i; i < itemCount;) {
            LotItem memory item = items[i];
            delete lotForPunk[_tokenKey(lot.seller, _tokenContractFor(item.standard), item.punkId)];
            _pullPunk(item.standard, lot.seller, item.punkId);
            unchecked {
                ++i;
            }
        }

        _settleBundleDelivery(items, offer.amountWei, offer.offerer);

        _pushOrCredit(lot.seller, offer.amountWei);

        emit OfferAcceptedFromLot(
            offerId,
            lotId,
            lot.seller,
            offer.offerer,
            offer.amountWei
        );
    }

    /// @notice Starts an auction by using an existing offer as the first bid for a stored lot.
    function startAuctionFromOffer(
        uint256 offerId,
        uint256 lotId,
        uint96 minAmountWei
    )
        external
        nonReentrant
        returns (uint256 auctionId)
    {
        Offer memory offer = _activeOffer(offerId);
        Lot memory lot = lots[lotId];
        if (lot.seller == address(0)) revert LotNotFound();
        if (offer.amountWei < minAmountWei) {
            revert OfferAmountBelowMinimum(minAmountWei, offer.amountWei);
        }
        if (offer.amountWei < lot.reserveWei) revert ReserveNotMet();

        LotItem[] memory items = lotItems[lotId];
        if (offer.slots.length != items.length) revert SlotItemCountMismatch();

        uint256 itemCount = items.length;
        for (uint256 i; i < itemCount;) {
            LotItem memory item = items[i];
            _requireSlotMatchesPunk(offer.slots[i], item.standard, item.punkId);
            _requirePunkInVault(item.standard, lot.seller, item.punkId);
            unchecked {
                ++i;
            }
        }

        delete offers[offerId];
        delete lots[lotId];
        delete lotItems[lotId];

        auctionId = _createAuctionFromItems(
            lot.seller,
            items,
            offer.offerer,
            offer.amountWei
        );

        emit OfferAuctionInitialised(
            offerId,
            auctionId,
            lotId,
            lot.seller,
            offer.offerer,
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

    /// @notice Returns the active lot id holding a seller's Punk, or 0 if none.
    function activeLotFor(address seller, TokenStandard standard, uint16 punkId)
        external
        view
        returns (uint256)
    {
        return lotForPunk[_tokenKey(seller, _tokenContractFor(standard), punkId)];
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
        address recipient = auction.latestBidder;

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
        uint96 bidWei
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
        LotItem[] storage storedItems = auctionItems[auctionId];
        for (uint256 i; i < itemCount;) {
            LotItem memory item = items[i];
            storedItems.push(item);
            delete lotForPunk[_tokenKey(seller, _tokenContractFor(item.standard), item.punkId)];
            _pullPunk(item.standard, seller, item.punkId);
            unchecked {
                ++i;
            }
        }

        emit AuctionInitialised(auctionId, seller, itemHash, itemCount, endTimestamp);
        emit Bid(auctionId, initialBidder, bidWei);
    }

    /// @dev Removes a lot that is no longer approved or whose custody slipped out of the vault.
    function _clearStaleLot(uint256 id) internal {
        Lot memory lot = lots[id];
        if (lot.seller == address(0)) revert LotNotFound();

        LotItem[] memory items = lotItems[id];
        bool stale = !_auctionStillApproved(lot.seller);
        if (!stale) {
            uint256 itemCount = items.length;
            for (uint256 i; i < itemCount;) {
                if (!_punkStillInSellerVault(items[i].standard, lot.seller, items[i].punkId)) {
                    stale = true;
                    break;
                }
                unchecked {
                    ++i;
                }
            }
        }
        if (!stale) revert LotNotStale();

        _releaseLotSlots(lot.seller, items);
        delete lots[id];
        delete lotItems[id];

        emit LotCleared(id, msg.sender);
    }

    /// @dev Validates lot items at create time: count, weights, duplicates,
    ///      vault custody, and per-item slot availability (one lot per Punk).
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
            LotItem calldata item = items[i];
            bytes32 key = _tokenKey(msg.sender, _tokenContractFor(item.standard), item.punkId);
            uint256 existingLot = lotForPunk[key];
            if (existingLot != 0) revert PunkAlreadyInLot(existingLot);
            _requirePunkInVault(item.standard, msg.sender, item.punkId);
            unchecked {
                ++i;
            }
        }
    }

    /// @dev Checks vault custody at open/accept/start time. The lot's existence
    ///      already implies its slot reservations are intact (first-wins).
    function _requireLotItemsValidForOpen(address seller, LotItem[] memory items) internal view {
        uint256 n = items.length;
        for (uint256 i; i < n;) {
            LotItem memory item = items[i];
            _requirePunkInVault(item.standard, seller, item.punkId);
            unchecked {
                ++i;
            }
        }
    }

    /// @dev Frees the per-Punk lot slots held by an items array, so the seller
    ///      can list those Punks again. Safe to call regardless of current
    ///      slot value: with first-wins, `lotForPunk[key]` for these items is
    ///      always either 0 or the lot being released.
    function _releaseLotSlots(address seller, LotItem[] memory items) private {
        uint256 n = items.length;
        for (uint256 i; i < n;) {
            LotItem memory item = items[i];
            delete lotForPunk[_tokenKey(seller, _tokenContractFor(item.standard), item.punkId)];
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
        uint256 purchaseWei,
        address seller,
        address recipient
    ) internal override {
        if (standard == TokenStandard.CRYPTOPUNKS) {
            PUNKS.buyPunk{value: purchaseWei}(punkId);
            PUNKS.transferPunk(recipient, punkId);
        } else {
            PUNKS_V1.buyPunk{value: purchaseWei}(punkId);
            PUNKS_V1.withdraw();
            PUNKS_V1.transferPunk(recipient, punkId);
            _pushOrCredit(seller, purchaseWei);
        }
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

    /// @dev Builds the key that identifies a seller's holding of one Punk
    ///      across the `lotForPunk` reservation mapping.
    function _tokenKey(
        address seller,
        address tokenContract,
        uint256 tokenId
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(seller, tokenContract, tokenId));
    }

    // ───────────────────── Vault interaction helpers ──────────────────────

    /// @dev Resolves the Punk market contract for a standard.
    function _marketFor(TokenStandard standard) private view returns (ICryptoPunksMarket) {
        return standard == TokenStandard.CRYPTOPUNKS ? PUNKS : PUNKS_V1;
    }

    /// @dev Returns the Punk market contract address for a standard.
    function _tokenContractFor(TokenStandard standard) private view returns (address) {
        return address(_marketFor(standard));
    }

    /// @dev Pre-check at lot create time: the seller's vault must be
    ///      deployed and the auction must be approved as operator on it.
    function _requireAuctionApproved(address seller) private view {
        address vault = PUNK_VAULTS.predictVault(seller);
        if (vault.code.length == 0) revert VaultNotDeployed();
        if (!IPunkVault(vault).isOperator(address(this))) {
            revert AuctionNotApproved();
        }
    }

    /// @dev Best-effort approval check for stale-lot cleanup.
    function _auctionStillApproved(address seller) private view returns (bool) {
        address vault = PUNK_VAULTS.predictVault(seller);
        if (vault.code.length == 0) return false;
        try IPunkVault(vault).isOperator(address(this)) returns (bool approved) {
            return approved;
        } catch {
            return false;
        }
    }

    /// @dev Reverts when the seller's vault does not currently hold the Punk.
    function _requirePunkInVault(
        TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) private view {
        if (
            _marketFor(standard).punkIndexToAddress(punkIndex)
                != PUNK_VAULTS.predictVault(seller)
        ) revert PunkNotInVault();
    }

    /// @dev Returns true when the seller's vault still holds the Punk.
    function _punkStillInSellerVault(
        TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) private view returns (bool) {
        address vault = PUNK_VAULTS.predictVault(seller);
        try _marketFor(standard).punkIndexToAddress(punkIndex) returns (address holder) {
            return holder == vault;
        } catch {
            return false;
        }
    }

    /// @dev Pulls a Punk from the seller's vault into this contract's custody.
    function _pullPunk(
        TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) private {
        IPunkVault(PUNK_VAULTS.predictVault(seller))
            .transferPunk(_tokenContractFor(standard), punkIndex, address(this));
    }

    /// @dev Delivers a Punk that is already in this contract's custody to the
    ///      winner. Round-trips the hammer through `buyPunk` so the market
    ///      emits a real-priced `PunkBought`. Net ETH movement is zero — the
    ///      proceeds land back here via `withdraw()`.
    function _deliverPunk(
        TokenStandard standard,
        uint256 punkIndex,
        address to,
        uint256 hammerWei
    ) private {
        ICryptoPunksMarket market = _marketFor(standard);
        market.offerPunkForSaleToAddress(punkIndex, hammerWei, address(this));
        market.buyPunk{value: hammerWei}(punkIndex);
        market.withdraw();
        market.transferPunk(to, punkIndex);
    }
}
