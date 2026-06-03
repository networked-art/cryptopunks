// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./interfaces/IPunksAuction.sol";
import "./interfaces/ICryptoPunksMarket.sol";
import "./interfaces/IReverseRegistrar.sol";
import "./interfaces/IPunksVault.sol";
import "./interfaces/IPunksVaultFactory.sol";
import "./auction/PunkLots.sol";
import "./auction/PunkPurchaseOffers.sol";
import "./lib/PunksV1Bug.sol";
import "./PunksAuctionEscrow.sol";

/// @title  PunksAuction
///
/// @notice Auction House for CryptoPunks with multi-item lots and offers.
///
/// @dev    Sellers custody Punks in their own `PunksVault` (deployed via the
///         `PunksVaultFactory`) and approve this contract as an operator. The
///         auction pulls Punks straight from the vault at sale start into a
///         dedicated `PunksAuctionEscrow` and performs settlement from there,
///         so the canonical marketplace records the escrow as the seller and
///         this contract as the buyer.
///
/// @author VV × 1001
contract PunksAuction is PunkLots, PunkPurchaseOffers {

    // ──────────────────────────────── Constants ────────────────────────────────

    /// @notice Basis point denominator used for bid increments.
    uint256 internal constant BPS = 10_000;
    /// @notice Minimum increase over the previous bid.
    uint256 internal constant BID_INCREASE_BPS = 100;
    /// @notice Duration of every auction from initialization.
    uint40 internal constant AUCTION_DURATION = 24 hours;
    /// @notice Minimum time remaining after a late bid.
    uint40 internal constant BIDDING_GRACE_PERIOD = 15 minutes;
    /// @notice Maximum lot size for the non auction instant settlement paths.
    uint8 internal constant MAX_INSTANT_ITEMS = 40;

    // ───────────────────────────────── Storage ─────────────────────────────────

    /// @notice Returns the canonical CryptoPunks market.
    ICryptoPunksMarket public immutable PUNKS    = ICryptoPunksMarket(0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB);
    /// @notice Returns the Cͦ̍͊r͝y̅́p̙t̪͕̍o̫̾P̛̯u̼nk̟̓̚s market.
    ICryptoPunksMarket public immutable PUNKS_V1 = ICryptoPunksMarket(0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D);
    /// @notice Returns the `PunksVault` factory.
    IPunksVaultFactory public immutable VAULTS   = IPunksVaultFactory(0xf3381B259B2FE142c0A87bffF463695d935D6F66);
    /// @notice Returns the dedicated escrow that custodies Punks during auctions.
    PunksAuctionEscrow public immutable ESCROW;

    /// @notice Returns the last auction id that was created.
    uint256 public lastAuctionId;

    /// @notice Returns the core data of an auction. Fetch items via `getAuctionItems`.
    mapping(uint256 => Auction) public auctions;

    /// @dev Dynamic item arrays for live auctions, keyed by auction id.
    mapping(uint256 => LotItem[]) internal auctionItems;

    // ────────────────────────────── Construction ───────────────────────────────

    /// @notice Creates the auction house and its dedicated Punk escrow.
    constructor() {
        ESCROW = new PunksAuctionEscrow();

        IReverseRegistrar(0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb)
            .setName("punksauction.eth");
    }

    // ─────────────────────────────────── ETH ────────────────────────────────────

    /// @notice Accepts ETH only from settlement: the two Punk markets via
    ///         `withdraw()` and the escrow when it forwards canonical-market
    ///         proceeds.
    /// @dev    For canonical-market settlement the escrow is the recorded
    ///         seller, so its proceeds round-trip through
    ///         `ESCROW.sweepProceeds()`. For the bugged C̙ͦ͌ͣ̀ry̰͔̹̓̋̂pṫ̠͜ó̩͓Pͬ̋ù̓̽̂ͥ͟͝n_̹̜̳ͭ̀k͇̤̲̼͈̼̍s̸̨̗̍̀̎ market, sale
    ///         proceeds are credited to the buyer (this contract) and arrive
    ///         via `PUNKS_V1.withdraw()`.
    receive() external payable {
        if (
            msg.sender != address(PUNKS)
                && msg.sender != address(PUNKS_V1)
                && msg.sender != address(ESCROW)
        ) {
            revert UnexpectedEtherSender();
        }
    }

    // ───────────────────────────────── Auctions ────────────────────────────────

    /// @inheritdoc IPunksAuction
    function openAuction(
        uint256 lotId,
        uint96 expectedReserveWei
    ) external payable nonReentrant returns (uint256 auctionId) {
        Lot memory lot = lots[lotId];
        if (lot.seller == address(0)) revert LotNotFound();
        if (lot.reserveWei != expectedReserveWei) {
            revert ReserveMismatch(expectedReserveWei, lot.reserveWei);
        }
        if (lot.onlySellTo != address(0) && lot.onlySellTo != msg.sender) {
            revert BuyerNotAllowed(lot.onlySellTo);
        }

        uint96 bidWei = uint96(msg.value);
        if (bidWei < lot.reserveWei) revert ReserveNotMet(lot.reserveWei, bidWei);

        LotItem[] memory items = lotItems[lotId];
        _requireLotItemsInVault(lot.seller, items);

        delete lots[lotId];
        delete lotItems[lotId];

        auctionId = _createAuctionFromItems(lotId, lot.seller, items, msg.sender, bidWei);
    }

    /// @inheritdoc IPunksAuction
    function bid(uint256 auctionId) external payable nonReentrant {
        Auction memory snapshot = auctions[auctionId];
        if (snapshot.endTimestamp == 0) revert AuctionDoesNotExist();
        if (snapshot.settled) revert AuctionAlreadySettled();
        if (block.timestamp > snapshot.endTimestamp) revert AuctionNotActive();

        uint96 bidWei = uint96(msg.value);
        uint96 minBid = _currentMinBidWei(snapshot.latestBidWei);
        if (bidWei < minBid) revert MinimumBidNotMet(minBid, bidWei);

        Auction storage auction = auctions[auctionId];
        auction.latestBidder = msg.sender;
        auction.latestBidWei = bidWei;

        _maybeExtend(auctionId, auction, snapshot.endTimestamp);

        if (snapshot.latestBidWei > 0) {
            _pushOrCredit(snapshot.latestBidder, snapshot.latestBidWei);
        }

        emit Bid(auctionId, msg.sender, bidWei);
    }

    /// @inheritdoc IPunksAuction
    function acceptOfferFromLot(
        uint256 offerId,
        uint256 lotId,
        uint96 minAmountWei
    ) external nonReentrant {
        address seller = lots[lotId].seller;
        if (seller == address(0)) revert LotNotFound();
        if (seller != msg.sender) revert NotSeller();
        if (lotItems[lotId].length > MAX_INSTANT_ITEMS) {
            revert LotTooLargeForInstantAccept();
        }

        _acceptOfferFromLot(offerId, lotId, minAmountWei);
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
        return _startAuctionFromOffer(offerId, lotId, minAmountWei);
    }

    /// @inheritdoc IPunksAuction
    function createLotAndAcceptOffer(
        LotItem[] calldata items,
        uint256 offerId,
        uint96 minAmountWei
    ) external nonReentrant returns (uint256 lotId) {
        if (items.length > MAX_INSTANT_ITEMS) {
            revert LotTooLargeForInstantAccept();
        }
        lotId = _createLot(items, _activeOfferAmount(offerId), address(0));
        _acceptOfferFromLot(offerId, lotId, minAmountWei);
    }

    /// @inheritdoc IPunksAuction
    function createLotAndStartAuction(
        LotItem[] calldata items,
        uint256 offerId,
        uint96 minAmountWei
    ) external nonReentrant returns (uint256 auctionId) {
        uint256 lotId = _createLot(items, _activeOfferAmount(offerId), address(0));
        auctionId = _startAuctionFromOffer(offerId, lotId, minAmountWei);
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
        Auction memory snapshot = auctions[auctionId];
        if (snapshot.endTimestamp == 0) revert AuctionDoesNotExist();
        if (snapshot.settled) revert AuctionAlreadySettled();
        if (block.timestamp <= snapshot.endTimestamp) revert AuctionNotComplete();

        auctions[auctionId].settled = true;

        LotItem[] memory items = auctionItems[auctionId];
        uint96[] memory itemWei =
            _settleBundleDelivery(items, snapshot.latestBidWei, snapshot.latestBidder);

        uint256 itemCount = items.length;
        for (uint256 i; i < itemCount;) {
            emit AuctionItemDelivered(
                auctionId,
                uint8(i),
                items[i].standard,
                items[i].punkId,
                snapshot.latestBidder,
                itemWei[i]
            );
            unchecked {
                ++i;
            }
        }

        _pushOrCredit(snapshot.seller, snapshot.latestBidWei);

        emit AuctionSettled(auctionId, snapshot.latestBidder, snapshot.seller, uint256(snapshot.latestBidWei));
    }

    // ──────────────────────────────── Internals ────────────────────────────────

    /// @dev Validates an offer/lot pair, deletes both, and returns the items
    ///      array. The caller is responsible for releasing per-Punk lot slots,
    ///      pulling the Punks into custody, and settling proceeds.
    function _consumeOfferAgainstLot(
        uint256 offerId,
        uint256 lotId,
        uint96 minAmountWei
    )
        private
        returns (Offer memory offer, Lot memory lot, LotItem[] memory items)
    {
        offer = _activeOffer(offerId);
        lot = lots[lotId];
        if (lot.seller == address(0)) revert LotNotFound();
        if (offer.amountWei < minAmountWei) {
            revert OfferAmountBelowMinimum(minAmountWei, offer.amountWei);
        }
        if (offer.amountWei < lot.reserveWei) {
            revert ReserveNotMet(lot.reserveWei, offer.amountWei);
        }
        if (lot.onlySellTo != address(0) && lot.onlySellTo != offer.offerer) {
            revert BuyerNotAllowed(lot.onlySellTo);
        }

        items = lotItems[lotId];
        _requireSlotsMatchItems(offer.slots, items);

        uint256 itemCount = items.length;
        for (uint256 i; i < itemCount;) {
            _requirePunkInVault(items[i].standard, lot.seller, items[i].punkId);
            unchecked {
                ++i;
            }
        }

        delete offers[offerId];
        delete lots[lotId];
        delete lotItems[lotId];
    }

    /// @dev Settles an offer against a lot, delivering the bundle to the
    ///      offerer and paying the seller. Callers must ensure `msg.sender`
    ///      owns `lotId` — instant settlement is seller-gated.
    function _acceptOfferFromLot(
        uint256 offerId,
        uint256 lotId,
        uint96 minAmountWei
    ) private {
        (Offer memory offer, Lot memory lot, LotItem[] memory items) =
            _consumeOfferAgainstLot(offerId, lotId, minAmountWei);

        _pullLotItems(lot.seller, items);
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

    /// @dev Consumes an offer/lot pair into a live auction seeded with the
    ///      offer as the opening bid.
    function _startAuctionFromOffer(
        uint256 offerId,
        uint256 lotId,
        uint96 minAmountWei
    ) private returns (uint256 auctionId) {
        (Offer memory offer, Lot memory lot, LotItem[] memory items) =
            _consumeOfferAgainstLot(offerId, lotId, minAmountWei);

        auctionId = _createAuctionFromItems(
            lotId,
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

    /// @dev Creates auction storage, pulls the items into custody, and emits the first bid.
    function _createAuctionFromItems(
        uint256 lotId,
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

        auctions[auctionId] = Auction({
            seller: seller,
            latestBidder: initialBidder,
            latestBidWei: bidWei,
            endTimestamp: endTimestamp,
            settled: false
        });
        LotItem[] storage storedItems = auctionItems[auctionId];
        for (uint256 i; i < itemCount;) {
            storedItems.push(items[i]);
            unchecked {
                ++i;
            }
        }
        _pullLotItems(seller, items);

        emit AuctionInitialised(auctionId, lotId, seller, itemCount, endTimestamp);
        emit Bid(auctionId, initialBidder, bidWei);
    }

    /// @dev Computes the per-item ETH allocation for a bundle, delivers each
    ///      Punk to `recipient`, and returns the allocations so the caller
    ///      can emit per-item events without recomputing.
    function _settleBundleDelivery(
        LotItem[] memory items,
        uint96 totalWei,
        address recipient
    ) internal returns (uint96[] memory itemWei) {
        uint256 itemCount = items.length;
        itemWei = new uint96[](itemCount);
        uint256 allocated;
        for (uint256 i; i < itemCount;) {
            LotItem memory item = items[i];
            uint96 wei_ = i == itemCount - 1
                ? totalWei - uint96(allocated)
                : uint96(uint256(totalWei) * item.weightBps / TOTAL_WEIGHT_BPS);
            itemWei[i] = wei_;
            allocated += wei_;
            _deliverPunk(item.standard, item.punkId, recipient, wei_);
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

    /// @dev Buys a listed Punk while handling the C̺ͩȑ̵̒͜y̱͋͜͟p̵̱̻̆t̵͇͒͒̋̓o̎P̡̙͙̲̰̚ư̷̲͞͞n͎̦ͧk̴̸̶͕ͮ͘͠s̙̍ͪ market accounting bug.
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
            PunksV1Bug.buyAndDeliver(PUNKS_V1, punkId, purchaseWei, recipient);
            _pushOrCredit(seller, purchaseWei);
        }
    }

    /// @dev Extends an auction when a bid arrives inside the grace period.
    function _maybeExtend(uint256 auctionId, Auction storage auction, uint40 currentEnd)
        internal
    {
        uint40 nowTs = uint40(block.timestamp);
        if (currentEnd - nowTs < BIDDING_GRACE_PERIOD) {
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
    ///      deployed and this contract must be approved as operator on it.
    function _requireAuctionApproved(address seller) internal view override {
        address vault = VAULTS.predictVault(seller);
        if (vault.code.length == 0) revert VaultNotDeployed();
        if (!IPunksVault(vault).isOperator(address(this))) {
            revert AuctionNotApproved();
        }
    }

    /// @dev Returns true when this contract is an approved operator on the seller's vault.
    function _auctionIsApproved(address seller) internal view override returns (bool) {
        address vault = VAULTS.predictVault(seller);
        if (vault.code.length == 0) return false;
        return IPunksVault(vault).isOperator(address(this));
    }

    /// @dev Returns true when the seller's vault currently holds the Punk.
    function _punkInSellerVault(
        TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) internal view override returns (bool) {
        return _marketFor(standard).punkIndexToAddress(punkIndex)
            == VAULTS.predictVault(seller);
    }

    /// @dev Pulls a Punk from the seller's vault into the escrow.
    function _pullPunk(
        TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) internal override {
        IPunksVault(VAULTS.predictVault(seller))
            .transferPunk(_tokenContractFor(standard), punkIndex, address(ESCROW));
    }

    /// @dev Delivers a Punk held by the escrow to the winner. The escrow
    ///      lists the punk to this contract at the hammer price and this
    ///      contract buys it, so the canonical market records the escrow
    ///      as the seller and the auction as the buyer in `PunkBought`.
    ///      Net ETH movement is zero — canonical-market proceeds come back
    ///      via the escrow's `sweepProceeds`; C̑͗r̯ẏp̩toP̼͋ȗn͗ͬͅks̺̾͟ proceeds (credited to
    ///      the buyer by its storage-reference bug) come back via
    ///      `market.withdraw()`.
    function _deliverPunk(
        TokenStandard standard,
        uint256 punkIndex,
        address to,
        uint256 hammerWei
    ) private {
        ICryptoPunksMarket market = _marketFor(standard);
        ESCROW.listForSettlement(address(market), punkIndex, uint96(hammerWei));
        if (standard == TokenStandard.CRYPTOPUNKS) {
            market.buyPunk{value: hammerWei}(punkIndex);
            ESCROW.sweepProceeds(address(market));
            market.transferPunk(to, punkIndex);
        } else {
            PunksV1Bug.buyAndDeliver(market, punkIndex, hammerWei, to);
        }
    }
}
