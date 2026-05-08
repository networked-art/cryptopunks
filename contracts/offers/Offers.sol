// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/IPunksAuction.sol";
import "../interfaces/ICryptoPunksMarket.sol";
import "../interfaces/ICryptoPunksTraits.sol";
import "../lib/PushPullEscrow.sol";

/// @title Offers
/// @notice Native ETH offers for CryptoPunks.
///         Inspired by MouseDev's CryptoPunksBids, concept by
///         mousedev.eth and kilo.
abstract contract Offers is IPunksAuction, PushPullEscrow {
    /// @notice Returns the last offer id that was created.
    uint256 public lastOfferId;

    /// @notice Returns public details for an offer.
    mapping(uint256 => Offer) public offers;

    /// @notice Returns the trait lookup contract used for offer filters.
    ICryptoPunksTraits public immutable TRAITS;

    /// @notice Creates the offer module with an optional trait lookup contract.
    constructor(address traits) {
        TRAITS = ICryptoPunksTraits(traits);
    }

    /// @notice Places an ETH offer for Punks that match your filters.
    function placeOffer(
        TokenStandard standard,
        uint96 amountWei,
        uint96 settlementWei,
        address receiver,
        TraitFilter[] calldata traitFilters,
        uint16[] calldata includeIds,
        uint16[] calldata excludeIds
    ) external payable returns (uint256 offerId) {
        _requireSupportedOfferStandard(standard);
        if (amountWei == 0) revert InvalidAmount();
        if (traitFilters.length > 0 && address(TRAITS) == address(0)) revert TraitsUnavailable();
        if (msg.value != uint256(amountWei) + uint256(settlementWei)) revert IncorrectPayment();

        unchecked {
            offerId = ++lastOfferId;
        }

        Offer storage storedOffer = offers[offerId];
        storedOffer.amountWei = amountWei;
        storedOffer.settlementWei = settlementWei;
        storedOffer.offerer = msg.sender;
        storedOffer.receiver = receiver;
        storedOffer.standard = standard;

        _storeOfferFilters(storedOffer, traitFilters, includeIds, excludeIds);

        emit OfferPlaced(
            offerId,
            standard,
            msg.sender,
            receiver,
            amountWei,
            settlementWei,
            traitFilters,
            includeIds,
            excludeIds
        );
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

    /// @notice Accepts an offer for a listed Punk.
    function acceptOffer(uint256 offerId, uint16 punkId) external nonReentrant {
        Offer memory offer = _activeOffer(offerId);
        _requireOfferMatchesPunk(offer, punkId);

        ICryptoPunksMarket market = _offerMarket(offer.standard);
        (address seller, uint256 listingWei) = _requireAcceptableListing(
            market, punkId, offer.amountWei
        );

        delete offers[offerId];

        address recipient = _offerRecipient(offer);
        _buyListedOfferPunk(offer.standard, punkId, listingWei, seller, recipient);

        _pushOrCredit(msg.sender, offer.settlementWei);

        uint256 excess = uint256(offer.amountWei) - listingWei;
        if (excess > 0) _pushOrCredit(offer.offerer, excess);

        emit OfferAccepted(
            offerId,
            offer.standard,
            punkId,
            seller,
            offer.offerer,
            recipient,
            listingWei,
            offer.settlementWei
        );
    }

    /// @notice Returns the filters saved for an offer.
    function getOfferFilters(uint256 offerId)
        external
        view
        returns (
            TraitFilter[] memory traitFilters,
            uint16[] memory includeIds,
            uint16[] memory excludeIds
        )
    {
        Offer storage offer = offers[offerId];
        return (offer.traitFilters, offer.includeIds, offer.excludeIds);
    }

    /// @dev Consumes an active offer after checking that it matches the Punk.
    function _consumeOfferForAuction(uint256 offerId, uint16 punkId)
        internal
        returns (Offer memory offer)
    {
        offer = _activeOffer(offerId);
        _requireOfferMatchesPunk(offer, punkId);
        delete offers[offerId];
    }

    /// @dev Loads an active offer and reverts if it is missing.
    function _activeOffer(uint256 offerId) internal view returns (Offer memory offer) {
        offer = offers[offerId];
        if (offer.offerer == address(0)) revert OfferNotActive();
    }

    function _offerForOfferer(uint256 offerId)
        private
        view
        returns (Offer storage offer)
    {
        offer = offers[offerId];
        if (offer.offerer == address(0)) revert OfferNotActive();
        if (offer.offerer != msg.sender) revert NotOfferer();
    }

    function _storeOfferFilters(
        Offer storage storedOffer,
        TraitFilter[] calldata traitFilters,
        uint16[] calldata includeIds,
        uint16[] calldata excludeIds
    ) private {
        uint256 len = traitFilters.length;
        for (uint256 i; i < len;) {
            storedOffer.traitFilters.push(traitFilters[i]);
            unchecked {
                ++i;
            }
        }

        len = includeIds.length;
        for (uint256 i; i < len;) {
            storedOffer.includeIds.push(includeIds[i]);
            unchecked {
                ++i;
            }
        }

        len = excludeIds.length;
        for (uint256 i; i < len;) {
            storedOffer.excludeIds.push(excludeIds[i]);
            unchecked {
                ++i;
            }
        }
    }

    /// @dev Checks include, exclude, and trait filters for a Punk.
    function _requireOfferMatchesPunk(Offer memory offer, uint16 punkId) internal view {
        uint256 len = offer.includeIds.length;
        if (len > 0) {
            bool included;
            for (uint256 i; i < len;) {
                if (offer.includeIds[i] == punkId) {
                    included = true;
                    break;
                }
                unchecked {
                    ++i;
                }
            }
            if (!included) revert PunkNotIncluded();
        }

        len = offer.excludeIds.length;
        for (uint256 i; i < len;) {
            if (offer.excludeIds[i] == punkId) revert PunkExcluded();
            unchecked {
                ++i;
            }
        }

        len = offer.traitFilters.length;
        if (len == 0) return;
        if (address(TRAITS) == address(0)) revert TraitsUnavailable();

        for (uint256 i; i < len;) {
            TraitFilter memory filter = offer.traitFilters[i];
            bool hasTrait = TRAITS.hasTrait(punkId, filter.traitId);
            if (filter.required != hasTrait) revert PunkTraitMismatch();
            unchecked {
                ++i;
            }
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

    /// @dev Reverts when the Punk standard is not supported by offers.
    function _requireSupportedOfferStandard(TokenStandard standard) internal pure {
        if (!_isSupportedOfferStandard(standard)) {
            revert UnsupportedStandard();
        }
    }

    function _isSupportedOfferStandard(TokenStandard standard) private pure returns (bool) {
        return standard == TokenStandard.CRYPTOPUNKS || standard == TokenStandard.CRYPTOPUNKS_V1;
    }

    /// @dev Resolves the Punk market for an offer standard.
    function _offerMarket(TokenStandard standard)
        internal
        view
        virtual
        returns (ICryptoPunksMarket);

    /// @dev Resolves the token contract for an offer standard.
    function _offerTokenContract(TokenStandard standard) internal view virtual returns (address);

    /// @dev Buys a listed Punk and sends it to the final recipient.
    function _buyListedOfferPunk(
        TokenStandard standard,
        uint16 punkId,
        uint256 listingWei,
        address seller,
        address recipient
    ) internal virtual;
}
