// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./interfaces/IPunksAuction.sol";
import "./interfaces/ICryptoPunksMarket.sol";
import "./interfaces/IPunksVault.sol";
import "./interfaces/IPunksVaultFactory.sol";
import "./auction/PunkLots.sol";
import "./auction/PunkPurchaseOffers.sol";

/// @title  PunksAuction
///
/// @notice Zero-fee auction house for CryptoPunks with N-item lots and N-slot offers.
///
/// @dev    Sellers custody Punks in their own `PunksVault` (deployed via the
///         `PunksVaultFactory`) and approve this contract as operator. The
///         auction pulls Punks straight from the vault at sale start and
///         performs the canonical settlement round-trip from its own custody.
///
/// @author VV × 1001
contract PunksAuction is PunkLots, PunkPurchaseOffers {
    /// @notice Basis point denominator used for bid increments.
    uint256 internal constant BPS = 10_000;
    /// @notice Minimum increase over the previous bid.
    uint256 internal constant BID_INCREASE_BPS = 1_000;
    /// @notice Duration of every auction from initialization.
    uint40 internal constant AUCTION_DURATION = 24 hours;
    /// @notice Minimum time remaining after a late bid.
    uint40 internal constant BIDDING_GRACE_PERIOD = 15 minutes;

    /// @notice Returns the canonical CryptoPunks market.
    ICryptoPunksMarket public immutable PUNKS;
    /// @notice Returns the CryptoPunks V1 market.
    ICryptoPunksMarket public immutable PUNKS_V1;
    /// @notice Returns the per-user `PunksVault` factory.
    IPunksVaultFactory public immutable VAULTS;

    /// @notice Returns the last auction id that was created.
    uint256 public lastAuctionId;

    /// @notice Returns the scalar fields of an auction (items via `getAuctionItems`).
    mapping(uint256 => Auction) public auctions;

    /// @dev Dynamic item arrays for live auctions, keyed by auction id.
    mapping(uint256 => LotItem[]) internal auctionItems;

    /// @notice Creates the auction house wired to both Punk markets and the vault factory.
    constructor(address punks, address punksV1, address punksData, address vaultFactory)
        PunkPurchaseOffers(punksData)
    {
        if (punks == address(0) || punksV1 == address(0) || vaultFactory == address(0)) {
            revert ZeroAddress();
        }
        if (punks == punksV1) revert ZeroAddress();
        PUNKS = ICryptoPunksMarket(punks);
        PUNKS_V1 = ICryptoPunksMarket(punksV1);
        VAULTS = IPunksVaultFactory(vaultFactory);
    }

    // ─────────────────────────────────── ETH ────────────────────────────────────

    /// @notice Receives ETH from the two Punk markets during settlement
    ///         `withdraw()` calls. Nothing else.
    receive() external payable {
        if (msg.sender != address(PUNKS) && msg.sender != address(PUNKS_V1)) {
            revert UnexpectedEtherSender();
        }
    }

    // ───────────────────────────────── Auctions ────────────────────────────────

    /// @inheritdoc IPunksAuction
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

    /// @inheritdoc IPunksAuction
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

    /// @inheritdoc IPunksAuction
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

    /// @inheritdoc IPunksAuction
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

    // ─────────────────────────────────── Views ──────────────────────────────────

    /// @inheritdoc IPunksAuction
    function currentMinBidWei(uint256 auctionId) external view returns (uint96) {
        return _currentMinBidWei(auctions[auctionId].latestBidWei);
    }

    /// @inheritdoc IPunksAuction
    function auctionActive(uint256 auctionId) external view returns (bool) {
        Auction storage auction = auctions[auctionId];
        return auction.endTimestamp != 0 && block.timestamp <= auction.endTimestamp;
    }

    /// @inheritdoc IPunksAuction
    function endTimestampOf(uint256 auctionId) external view returns (uint40) {
        return auctions[auctionId].endTimestamp;
    }

    /// @inheritdoc IPunksAuction
    function getAuctionItems(uint256 auctionId) external view returns (LotItem[] memory) {
        return auctionItems[auctionId];
    }

    // ───────────────────────────────── Settlement ───────────────────────────────

    /// @inheritdoc IPunksAuction
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

    // ───────────────────────────────── Internals ─────────────────────────────────

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

    /// @dev Delivers each bundled Punk with its weighted ETH allocation.
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

    // ─────────────────────────── Vault interactions ─────────────────────────────

    /// @dev Resolves the Punk market contract for a standard.
    function _marketFor(TokenStandard standard) private view returns (ICryptoPunksMarket) {
        return standard == TokenStandard.CRYPTOPUNKS ? PUNKS : PUNKS_V1;
    }

    /// @dev Returns the Punk market contract address for a standard.
    function _tokenContractFor(TokenStandard standard) internal view override returns (address) {
        return address(_marketFor(standard));
    }

    /// @dev Pre-check at lot create time: the seller's vault must be
    ///      deployed and the auction must be approved as operator on it.
    function _requireAuctionApproved(address seller) internal view override {
        address vault = VAULTS.predictVault(seller);
        if (vault.code.length == 0) revert VaultNotDeployed();
        if (!IPunksVault(vault).isOperator(address(this))) {
            revert AuctionNotApproved();
        }
    }

    /// @dev Best-effort approval check for stale-lot cleanup.
    function _auctionStillApproved(address seller) internal view override returns (bool) {
        address vault = VAULTS.predictVault(seller);
        if (vault.code.length == 0) return false;
        try IPunksVault(vault).isOperator(address(this)) returns (bool approved) {
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
    ) internal view override {
        if (
            _marketFor(standard).punkIndexToAddress(punkIndex)
                != VAULTS.predictVault(seller)
        ) revert PunkNotInVault();
    }

    /// @dev Returns true when the seller's vault still holds the Punk.
    function _punkStillInSellerVault(
        TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) internal view override returns (bool) {
        address vault = VAULTS.predictVault(seller);
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
        IPunksVault(VAULTS.predictVault(seller))
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
