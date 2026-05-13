// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/IPunksAuction.sol";
import "../interfaces/ICryptoPunksMarket.sol";
import "../interfaces/IPunksData.sol";
import "../lib/Punks.sol";
import "../lib/PushPullEscrow.sol";

/// @title  Offers
/// @notice Native ETH offers for CryptoPunks with mask-based filters and N-slot bundles.
///         Inspired by MouseDev's CryptoPunksBids.
abstract contract Offers is IPunksAuction, PushPullEscrow {
    using Punks for Punks.Filter;

    /// @notice Maximum slots per offer. Mirrors the lot item bound.
    uint8 internal constant MAX_LOT_ITEMS = 80;
    /// @notice Maximum entries in `OfferSlot.includeIds` per slot.
    uint8 internal constant MAX_INCLUDE_IDS = 64;
    /// @notice Maximum entries in `OfferSlot.excludeIds` per slot.
    uint8 internal constant MAX_EXCLUDE_IDS = 64;

    /// @notice Returns the last offer id that was created.
    uint256 public lastOfferId;

    /// @notice Returns the scalar fields of an offer (the dynamic `slots` are read via `getOfferSlots`).
    mapping(uint256 => Offer) public offers;

    /// @notice Returns the trait predicate contract used for offer matching.
    IPunksDataCriteria public immutable PUNKS_CRITERIA;
    /// @notice Returns the visual predicate contract used for offer matching.
    IPunksDataVisual public immutable PUNKS_VISUAL;

    /// @notice Creates the offer module bound to a `PunksData` deployment.
    constructor(address punksData) {
        if (punksData == address(0)) revert ZeroAddress();
        PUNKS_CRITERIA = IPunksDataCriteria(punksData);
        PUNKS_VISUAL = IPunksDataVisual(punksData);
    }

    /// @notice Places an ETH offer for one or more Punks that match the slot criteria.
    function placeOffer(
        uint96 amountWei,
        address receiver,
        OfferSlot[] calldata slots
    ) external payable returns (uint256 offerId) {
        if (amountWei == 0) revert InvalidAmount();
        if (msg.value != amountWei) revert IncorrectPayment();

        uint256 slotCount = slots.length;
        if (slotCount == 0 || slotCount > MAX_LOT_ITEMS) revert InvalidSlotCount();

        for (uint256 i; i < slotCount;) {
            _requireValidSlot(slots[i]);
            unchecked { ++i; }
        }

        unchecked { offerId = ++lastOfferId; }

        Offer storage stored = offers[offerId];
        stored.amountWei = amountWei;
        stored.offerer = msg.sender;
        stored.receiver = receiver;
        _storeOfferSlots(stored, slots);

        emit OfferPlaced(
            offerId,
            msg.sender,
            receiver,
            amountWei,
            uint8(slotCount)
        );
        _emitOfferSlotDetails(offerId, slots);
    }

    /// @notice Cancels your active offer and refunds its ETH.
    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = _offerForOfferer(offerId);
        uint96 refundWei = offer.amountWei;

        delete offers[offerId];
        _pushOrCredit(msg.sender, refundWei);

        emit OfferCancelled(offerId);
    }

    /// @notice Sets the offer amount. `msg.value` must equal the increase, or be zero for a decrease.
    function adjustOfferAmount(uint256 offerId, uint96 newAmountWei)
        external
        payable
        nonReentrant
    {
        if (newAmountWei == 0) revert InvalidAmount();
        Offer storage offer = _offerForOfferer(offerId);

        uint96 oldAmountWei = offer.amountWei;
        if (newAmountWei > oldAmountWei) {
            if (msg.value != newAmountWei - oldAmountWei) revert IncorrectPayment();
        } else {
            if (msg.value != 0) revert IncorrectPayment();
        }

        offer.amountWei = newAmountWei;

        if (newAmountWei < oldAmountWei) {
            _pushOrCredit(msg.sender, oldAmountWei - newAmountWei);
        }

        emit OfferAmountAdjusted(offerId, newAmountWei);
    }

    /// @notice Accepts a single-slot offer for a marketplace-listed Punk.
    function acceptOffer(
        uint256 offerId,
        uint16 punkId,
        uint96 expectedListingWei
    ) external nonReentrant {
        Offer memory offer = _activeOffer(offerId);
        if (offer.slots.length != 1) revert MultiSlotOfferRequiresLot();

        OfferSlot memory slot = offer.slots[0];
        TokenStandard standard = slot.standard;
        _requireSlotMatchesPunk(slot, standard, punkId);

        ICryptoPunksMarket market = _offerMarket(standard);
        (address seller, uint256 listingWei) = _requireAcceptableListing(
            market,
            punkId,
            offer.amountWei,
            expectedListingWei
        );

        delete offers[offerId];

        address recipient = _offerRecipient(offer);
        _buyListedOfferPunk(standard, punkId, listingWei, seller, recipient);

        uint256 excess = uint256(offer.amountWei) - listingWei;
        if (excess > 0) _pushOrCredit(offer.offerer, excess);

        emit OfferAccepted(
            offerId,
            punkId,
            seller,
            offer.offerer,
            recipient,
            listingWei
        );
    }

    /// @notice Returns the slots stored on an offer.
    function getOfferSlots(uint256 offerId) external view returns (OfferSlot[] memory) {
        return offers[offerId].slots;
    }

    /// @dev Loads an active offer copy and reverts if it is missing.
    function _activeOffer(uint256 offerId) internal view returns (Offer memory offer) {
        offer = offers[offerId];
        if (offer.offerer == address(0)) revert OfferNotActive();
    }

    /// @dev Loads the offer storage struct, ensuring the caller is the offerer.
    function _offerForOfferer(uint256 offerId)
        private
        view
        returns (Offer storage offer)
    {
        offer = offers[offerId];
        if (offer.offerer == address(0)) revert OfferNotActive();
        if (offer.offerer != msg.sender) revert NotOfferer();
    }

    /// @dev Validates a slot's filter and id-list bounds at place time.
    function _requireValidSlot(OfferSlot calldata slot) private pure {
        Punks.validate(slot.criteria);

        if (slot.includeIds.length > MAX_INCLUDE_IDS) revert TooManyIds();
        if (slot.excludeIds.length > MAX_EXCLUDE_IDS) revert TooManyIds();
    }

    /// @dev Copies offer slots from calldata into storage.
    function _storeOfferSlots(Offer storage stored, OfferSlot[] calldata slots) private {
        uint256 n = slots.length;
        for (uint256 i; i < n;) {
            OfferSlot calldata src = slots[i];
            OfferSlot storage dst = stored.slots.push();
            dst.criteria = src.criteria;
            dst.standard = src.standard;
            uint256 incLen = src.includeIds.length;
            for (uint256 j; j < incLen;) {
                dst.includeIds.push(src.includeIds[j]);
                unchecked { ++j; }
            }
            uint256 excLen = src.excludeIds.length;
            for (uint256 j; j < excLen;) {
                dst.excludeIds.push(src.excludeIds[j]);
                unchecked { ++j; }
            }
            unchecked { ++i; }
        }
    }

    /// @dev Emits one OfferSlotDetail per slot at place time.
    function _emitOfferSlotDetails(uint256 offerId, OfferSlot[] calldata slots) private {
        uint256 n = slots.length;
        for (uint256 i; i < n;) {
            OfferSlot calldata s = slots[i];
            emit OfferSlotDetail(
                offerId,
                uint8(i),
                s.standard,
                s.criteria,
                s.includeIds,
                s.excludeIds
            );
            unchecked { ++i; }
        }
    }

    /// @dev Reverts unless the slot matches `(standard, punkId)`.
    function _requireSlotMatchesPunk(
        OfferSlot memory slot,
        TokenStandard standard,
        uint16 punkId
    ) internal view {
        if (slot.standard != standard) revert OfferStandardMismatch();

        uint256 includeLen = slot.includeIds.length;
        if (includeLen > 0) {
            bool included;
            for (uint256 i; i < includeLen;) {
                if (slot.includeIds[i] == punkId) {
                    included = true;
                    break;
                }
                unchecked { ++i; }
            }
            if (!included) revert PunkNotIncluded();
        }

        uint256 excludeLen = slot.excludeIds.length;
        for (uint256 i; i < excludeLen;) {
            if (slot.excludeIds[i] == punkId) revert PunkExcluded();
            unchecked { ++i; }
        }

        if (!slot.criteria.matches(PUNKS_CRITERIA, PUNKS_VISUAL, punkId)) {
            revert PunkCriteriaMismatch();
        }
    }

    /// @dev Validates a Punk listing and returns its seller and price.
    function _requireAcceptableListing(
        ICryptoPunksMarket market,
        uint16 punkId,
        uint96 amountWei,
        uint96 expectedListingWei
    ) internal view returns (address seller, uint256 listingWei) {
        (bool isForSale,, address listingSeller, uint256 minValue, address onlySellTo) =
            market.punksOfferedForSale(punkId);

        if (!isForSale || listingSeller == address(0) || onlySellTo != address(this)) {
            revert ListingNotValid();
        }
        if (market.punkIndexToAddress(punkId) != listingSeller) revert ListingNotValid();
        if (minValue != expectedListingWei) {
            revert ListingPriceMismatch(expectedListingWei, minValue);
        }
        if (minValue > amountWei) revert ListingPriceTooHigh();

        return (listingSeller, minValue);
    }

    /// @dev Returns the requested receiver, or the offerer when none is set.
    function _offerRecipient(Offer memory offer) internal pure returns (address) {
        return offer.receiver == address(0) ? offer.offerer : offer.receiver;
    }

    /// @dev Resolves the Punk market for an offer standard.
    function _offerMarket(TokenStandard standard)
        internal
        view
        virtual
        returns (ICryptoPunksMarket);

    /// @dev Buys a listed Punk and sends it to the final recipient.
    function _buyListedOfferPunk(
        TokenStandard standard,
        uint16 punkId,
        uint256 listingWei,
        address seller,
        address recipient
    ) internal virtual;
}
