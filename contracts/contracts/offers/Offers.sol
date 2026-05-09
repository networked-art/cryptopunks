// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/IPunksAuction.sol";
import "../interfaces/ICryptoPunksMarket.sol";
import "../interfaces/IPunksData.sol";
import "../lib/PushPullEscrow.sol";

/// @title  Offers
/// @notice Native ETH offers for CryptoPunks with mask-based filters and N-slot bundles.
///         Inspired by MouseDev's CryptoPunksBids, concept by mousedev.eth and kilo.
abstract contract Offers is IPunksAuction, PushPullEscrow {
    /// @notice Maximum slots per offer. Mirrors the lot item bound.
    uint8 internal constant MAX_LOT_ITEMS = 100;
    /// @notice Maximum entries in `OfferSlot.includeIds` per slot.
    uint8 internal constant MAX_INCLUDE_IDS = 64;
    /// @notice Maximum entries in `OfferSlot.excludeIds` per slot.
    uint8 internal constant MAX_EXCLUDE_IDS = 64;
    /// @notice Sealed-dataset upper bound for the per-Punk color count.
    uint8 internal constant COLOR_COUNT_MAX = 14;

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
        uint96 settlementWei,
        address receiver,
        OfferSlot[] calldata slots
    ) external payable returns (uint256 offerId) {
        if (amountWei == 0) revert InvalidAmount();
        if (msg.value != uint256(amountWei) + uint256(settlementWei)) revert IncorrectPayment();

        uint256 slotCount = slots.length;
        if (slotCount == 0 || slotCount > MAX_LOT_ITEMS) revert InvalidSlotCount();

        uint16 traitCount = PUNKS_CRITERIA.traitCount();
        for (uint256 i; i < slotCount;) {
            _requireValidSlot(slots[i], traitCount);
            unchecked { ++i; }
        }

        unchecked { offerId = ++lastOfferId; }

        Offer storage stored = offers[offerId];
        stored.amountWei = amountWei;
        stored.settlementWei = settlementWei;
        stored.offerer = msg.sender;
        stored.receiver = receiver;
        _storeOfferSlots(stored, slots);

        emit OfferPlaced(
            offerId,
            msg.sender,
            receiver,
            amountWei,
            settlementWei,
            uint8(slotCount)
        );
        _emitOfferSlotDetails(offerId, slots);
    }

    /// @notice Cancels your active offer and refunds its ETH.
    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = _offerForOfferer(offerId);
        uint256 refundWei = uint256(offer.amountWei) + uint256(offer.settlementWei);

        delete offers[offerId];
        _pushOrCredit(msg.sender, refundWei);

        emit OfferCancelled(offerId);
    }

    /// @notice Increases or decreases the offer amount.
    function adjustOfferAmount(uint256 offerId, uint96 weiToAdjust, bool increase)
        external
        payable
        nonReentrant
    {
        Offer storage offer = _offerForOfferer(offerId);

        uint96 oldAmountWei = offer.amountWei;
        if (increase) {
            if (msg.value != weiToAdjust) revert IncorrectPayment();
            offer.amountWei = oldAmountWei + weiToAdjust;
        } else {
            if (msg.value != 0) revert IncorrectPayment();
            if (weiToAdjust > oldAmountWei) revert NegativeAdjustmentHigherThanCurrentOffer();
            offer.amountWei = oldAmountWei - weiToAdjust;
            _pushOrCredit(msg.sender, weiToAdjust);
        }

        emit OfferAmountAdjusted(offerId, offer.amountWei);
    }

    /// @notice Increases or decreases the seller settlement amount.
    function adjustOfferSettlement(uint256 offerId, uint96 weiToAdjust, bool increase)
        external
        payable
        nonReentrant
    {
        Offer storage offer = _offerForOfferer(offerId);

        uint96 oldSettlementWei = offer.settlementWei;
        if (increase) {
            if (msg.value != weiToAdjust) revert IncorrectPayment();
            offer.settlementWei = oldSettlementWei + weiToAdjust;
        } else {
            if (msg.value != 0) revert IncorrectPayment();
            if (weiToAdjust > oldSettlementWei) revert NegativeAdjustmentHigherThanCurrentOffer();
            offer.settlementWei = oldSettlementWei - weiToAdjust;
            _pushOrCredit(msg.sender, weiToAdjust);
        }

        emit OfferSettlementAdjusted(offerId, offer.settlementWei);
    }

    /// @notice Accepts a single-slot offer for a marketplace-listed Punk.
    function acceptOffer(uint256 offerId, uint16 punkId) external nonReentrant {
        Offer memory offer = _activeOffer(offerId);
        if (offer.slots.length != 1) revert MultiSlotOfferRequiresLot();

        OfferSlot memory slot = offer.slots[0];
        TokenStandard standard = slot.standard;
        _requireSlotMatchesPunk(slot, standard, punkId);

        ICryptoPunksMarket market = _offerMarket(standard);
        (address seller, uint256 listingWei) = _requireAcceptableListing(market, punkId, offer.amountWei);

        delete offers[offerId];

        address recipient = _offerRecipient(offer);
        _buyListedOfferPunk(standard, punkId, listingWei, seller, recipient);

        _pushOrCredit(msg.sender, offer.settlementWei);

        uint256 excess = uint256(offer.amountWei) - listingWei;
        if (excess > 0) _pushOrCredit(offer.offerer, excess);

        emit OfferAccepted(
            offerId,
            punkId,
            seller,
            offer.offerer,
            recipient,
            listingWei,
            offer.settlementWei
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

    /// @dev Validates a slot's masks, color range, and id-list bounds at place time.
    function _requireValidSlot(OfferSlot calldata slot, uint16 traitCount) private pure {
        OfferCriteria calldata c = slot.criteria;

        uint256 canonicalMask = traitCount >= 256
            ? type(uint256).max
            : ((uint256(1) << traitCount) - 1);
        if ((c.requiredTraitMask & ~canonicalMask) != 0) revert InvalidTraitMask();
        if ((c.forbiddenTraitMask & ~canonicalMask) != 0) revert InvalidTraitMask();
        if ((c.anyOfTraitMask & ~canonicalMask) != 0) revert InvalidTraitMask();
        if ((c.requiredTraitMask & c.forbiddenTraitMask) != 0) revert InvalidTraitMask();
        if ((c.forbiddenTraitMask & c.anyOfTraitMask) != 0) revert InvalidTraitMask();

        if (c.maxColorCount != 0) {
            if (c.minColorCount > c.maxColorCount) revert InvalidColorCountRange();
            if (c.maxColorCount > COLOR_COUNT_MAX) revert InvalidColorCountRange();
        } else if (c.minColorCount != 0) {
            revert InvalidColorCountRange();
        }

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
                s.criteria.requiredTraitMask,
                s.criteria.forbiddenTraitMask,
                s.criteria.anyOfTraitMask,
                s.criteria.minColorCount,
                s.criteria.maxColorCount,
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

        OfferCriteria memory c = slot.criteria;
        if ((c.requiredTraitMask | c.forbiddenTraitMask | c.anyOfTraitMask) != 0) {
            if (
                !PUNKS_CRITERIA.hasTraits(
                    punkId,
                    c.requiredTraitMask,
                    c.forbiddenTraitMask,
                    c.anyOfTraitMask
                )
            ) {
                revert PunkTraitMismatch();
            }
        }

        if (c.maxColorCount != 0) {
            uint8 cc = PUNKS_VISUAL.colorCountOf(punkId);
            if (cc < c.minColorCount || cc > c.maxColorCount) revert PunkVisualMismatch();
        }
    }

    /// @dev Validates a Punk listing and returns its seller and price.
    function _requireAcceptableListing(
        ICryptoPunksMarket market,
        uint16 punkId,
        uint96 amountWei
    ) internal view returns (address seller, uint256 listingWei) {
        (bool isForSale,, address listingSeller, uint256 minValue, address onlySellTo) =
            market.punksOfferedForSale(punkId);

        if (!isForSale || listingSeller == address(0) || onlySellTo != address(this)) {
            revert ListingNotValid();
        }
        if (market.punkIndexToAddress(punkId) != listingSeller) revert ListingNotValid();
        if (minValue > amountWei) revert ListingPriceTooHigh();

        return (listingSeller, minValue);
    }

    /// @dev Returns the requested receiver, or the offerer when none is set.
    function _offerRecipient(Offer memory offer) internal pure returns (address) {
        return offer.receiver == address(0) ? offer.offerer : offer.receiver;
    }

    /// @dev Refunds the settlement amount to the offerer.
    function _refundOfferSettlement(Offer memory offer) internal {
        _pushOrCredit(offer.offerer, offer.settlementWei);
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
