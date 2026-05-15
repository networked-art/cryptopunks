// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./interfaces/ICryptoPunksMarket.sol";
import "./interfaces/IPunksData.sol";
import "./lib/Punks.sol";
import "./lib/PushPullEscrow.sol";

/// @title  PunksCollectionBids
///
/// @notice Standalone, native-ETH collection bid book for canonical
///         CryptoPunks. A bidder locks ETH for any Punk that matches a
///         `Punks.Filter` (with optional include / exclude id lists) and may
///         attach a settlement reward so anyone can fulfil the bid against a
///         live marketplace listing on the bidder's behalf.
///
///         Inspired by MouseDev's `CryptoPunksBidsV2` but matches against the
///         new PunksData contract (traits + colors).
///
/// @author 1001
contract PunksCollectionBids is PushPullEscrow {
    using Punks for Punks.Filter;

    /// @notice Maximum entries in `Bid.includeIds`.
    uint8 internal constant MAX_INCLUDE_IDS = 64;
    /// @notice Maximum entries in `Bid.excludeIds`.
    uint8 internal constant MAX_EXCLUDE_IDS = 64;

    struct Bid {
        uint96 bidWei;
        uint96 settlementWei;
        address bidder;
        Punks.Filter criteria;
        uint16[] includeIds;
        uint16[] excludeIds;
    }

    /// @notice Returns the canonical CryptoPunks market.
    ICryptoPunksMarket public immutable PUNKS;
    /// @notice Returns the trait predicate dataset used for bid matching.
    IPunksDataCriteria public immutable PUNKS_CRITERIA;
    /// @notice Returns the visual predicate dataset used for bid matching.
    IPunksDataVisual public immutable PUNKS_VISUAL;

    /// @notice Returns the last bid id that was created.
    uint256 public lastBidId;

    mapping(uint256 => Bid) internal _bids;

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
    event BidSettlementAdjusted(uint256 indexed bidId, uint96 newSettlementWei);
    event BidAccepted(
        uint256 indexed bidId,
        uint256 indexed punkId,
        address indexed seller,
        address bidder,
        address settler,
        uint96 listingWei,
        uint96 bidWei,
        uint96 settlementWei
    );

    error ZeroAddress();
    error InvalidAmount();
    error IncorrectPayment();
    error NotBidder();
    error BidNotActive();
    error TooManyIds();
    error AdjustmentTooLarge();
    error ListingNotValid();
    error ListingPriceMismatch(uint96 expectedListingWei, uint256 actualListingWei);
    error ListingPriceTooHigh();
    error PunkNotIncluded();
    error PunkExcluded();
    error PunkCriteriaMismatch();

    /// @notice Creates the bid book bound to a Punks market and `PunksData` deployment.
    constructor(address punks, address punksData) {
        if (punks == address(0) || punksData == address(0)) revert ZeroAddress();
        PUNKS = ICryptoPunksMarket(punks);
        PUNKS_CRITERIA = IPunksDataCriteria(punksData);
        PUNKS_VISUAL = IPunksDataVisual(punksData);
    }

    /// @notice Places an ETH bid for any canonical Punk that satisfies the criteria.
    /// @dev `msg.value` must equal `bidWei + settlementWei`. The criteria is
    ///      validated against the canonical trait/color bit space at place time.
    function placeBid(
        uint96 bidWei,
        uint96 settlementWei,
        Punks.Filter calldata criteria,
        uint16[] calldata includeIds,
        uint16[] calldata excludeIds
    ) external payable returns (uint256 bidId) {
        if (bidWei == 0) revert InvalidAmount();
        if (msg.value != uint256(bidWei) + uint256(settlementWei)) revert IncorrectPayment();
        if (includeIds.length > MAX_INCLUDE_IDS || excludeIds.length > MAX_EXCLUDE_IDS) {
            revert TooManyIds();
        }
        Punks.validate(criteria);

        unchecked { bidId = ++lastBidId; }

        Bid storage stored = _bids[bidId];
        stored.bidWei = bidWei;
        stored.settlementWei = settlementWei;
        stored.bidder = msg.sender;
        stored.criteria = criteria;
        uint256 incLen = includeIds.length;
        for (uint256 i; i < incLen;) {
            stored.includeIds.push(includeIds[i]);
            unchecked { ++i; }
        }
        uint256 excLen = excludeIds.length;
        for (uint256 i; i < excLen;) {
            stored.excludeIds.push(excludeIds[i]);
            unchecked { ++i; }
        }

        emit BidPlaced(
            bidId,
            msg.sender,
            bidWei,
            settlementWei,
            criteria,
            includeIds,
            excludeIds
        );
    }

    /// @notice Cancels your active bid and refunds the locked ETH (bid + settlement).
    function cancelBid(uint256 bidId) external nonReentrant {
        Bid storage bid = _bidForBidder(bidId);
        uint96 refundWei = bid.bidWei + bid.settlementWei;

        delete _bids[bidId];
        _pushOrCredit(msg.sender, refundWei);

        emit BidCancelled(bidId);
    }

    /// @notice Adjusts the bid amount of your active bid.
    /// @dev `increase=true` requires `msg.value == weiToAdjust`. `increase=false`
    ///      must be a zero-value call and refunds `weiToAdjust` to the caller.
    ///      The bid amount must remain strictly positive after the adjustment.
    function adjustBidPrice(uint256 bidId, uint96 weiToAdjust, bool increase)
        external
        payable
        nonReentrant
    {
        if (weiToAdjust == 0) revert InvalidAmount();
        Bid storage bid = _bidForBidder(bidId);

        uint96 newBidWei;
        if (increase) {
            if (msg.value != weiToAdjust) revert IncorrectPayment();
            newBidWei = bid.bidWei + weiToAdjust;
        } else {
            if (msg.value != 0) revert IncorrectPayment();
            if (weiToAdjust >= bid.bidWei) revert AdjustmentTooLarge();
            newBidWei = bid.bidWei - weiToAdjust;
        }

        bid.bidWei = newBidWei;
        if (!increase) _pushOrCredit(msg.sender, weiToAdjust);

        emit BidAdjusted(bidId, newBidWei);
    }

    /// @notice Adjusts the settlement reward of your active bid.
    /// @dev `increase=true` requires `msg.value == weiToAdjust`. `increase=false`
    ///      must be a zero-value call and refunds `weiToAdjust` to the caller.
    ///      The settlement reward may decrease all the way to zero.
    function adjustBidSettlementPrice(uint256 bidId, uint96 weiToAdjust, bool increase)
        external
        payable
        nonReentrant
    {
        if (weiToAdjust == 0) revert InvalidAmount();
        Bid storage bid = _bidForBidder(bidId);

        uint96 newSettlementWei;
        if (increase) {
            if (msg.value != weiToAdjust) revert IncorrectPayment();
            newSettlementWei = bid.settlementWei + weiToAdjust;
        } else {
            if (msg.value != 0) revert IncorrectPayment();
            if (weiToAdjust > bid.settlementWei) revert AdjustmentTooLarge();
            newSettlementWei = bid.settlementWei - weiToAdjust;
        }

        bid.settlementWei = newSettlementWei;
        if (!increase) _pushOrCredit(msg.sender, weiToAdjust);

        emit BidSettlementAdjusted(bidId, newSettlementWei);
    }

    /// @notice Accepts a bid for a canonical marketplace-listed Punk using a pinned listing price.
    /// @dev Buys the Punk at the current listing price, transfers it to the
    ///      bidder, refunds the bidder for any excess, and pays the
    ///      settlement reward to the caller.
    function acceptBid(uint256 bidId, uint16 punkId, uint96 expectedListingWei)
        external
        nonReentrant
    {
        Bid memory bid = _bids[bidId];
        if (bid.bidder == address(0)) revert BidNotActive();

        _requireBidMatchesPunk(bid, punkId);
        (address seller, uint96 listingWei) =
            _requireAcceptableListing(punkId, bid.bidWei, expectedListingWei);

        delete _bids[bidId];

        PUNKS.buyPunk{value: listingWei}(punkId);
        PUNKS.transferPunk(bid.bidder, punkId);

        _pushOrCredit(msg.sender, bid.settlementWei);
        _pushOrCredit(bid.bidder, bid.bidWei - listingWei);

        emit BidAccepted(
            bidId,
            punkId,
            seller,
            bid.bidder,
            msg.sender,
            listingWei,
            bid.bidWei,
            bid.settlementWei
        );
    }

    /// @notice Returns the scalar fields of a bid.
    function bids(uint256 bidId)
        external
        view
        returns (uint96 bidWei, uint96 settlementWei, address bidder)
    {
        Bid storage bid = _bids[bidId];
        return (bid.bidWei, bid.settlementWei, bid.bidder);
    }

    /// @notice Returns the trait/visual filter stored on a bid.
    function getBidCriteria(uint256 bidId) external view returns (Punks.Filter memory) {
        return _bids[bidId].criteria;
    }

    /// @notice Returns the include id list stored on a bid.
    function getBidIncludeIds(uint256 bidId) external view returns (uint16[] memory) {
        return _bids[bidId].includeIds;
    }

    /// @notice Returns the exclude id list stored on a bid.
    function getBidExcludeIds(uint256 bidId) external view returns (uint16[] memory) {
        return _bids[bidId].excludeIds;
    }

    /// @dev Loads bid storage and ensures the caller is the bidder.
    function _bidForBidder(uint256 bidId) private view returns (Bid storage bid) {
        bid = _bids[bidId];
        if (bid.bidder == address(0)) revert BidNotActive();
        if (bid.bidder != msg.sender) revert NotBidder();
    }

    /// @dev Reverts unless the bid's filter and id lists allow `punkId`.
    function _requireBidMatchesPunk(Bid memory bid, uint16 punkId) internal view {
        uint256 includeLen = bid.includeIds.length;
        if (includeLen > 0) {
            bool included;
            for (uint256 i; i < includeLen;) {
                if (bid.includeIds[i] == punkId) {
                    included = true;
                    break;
                }
                unchecked { ++i; }
            }
            if (!included) revert PunkNotIncluded();
        }

        uint256 excludeLen = bid.excludeIds.length;
        for (uint256 i; i < excludeLen;) {
            if (bid.excludeIds[i] == punkId) revert PunkExcluded();
            unchecked { ++i; }
        }

        if (!bid.criteria.matches(PUNKS_CRITERIA, PUNKS_VISUAL, punkId)) {
            revert PunkCriteriaMismatch();
        }
    }

    /// @dev Validates the canonical Punk listing and returns its seller and price.
    function _requireAcceptableListing(
        uint16 punkId,
        uint96 bidWei,
        uint96 expectedListingWei
    ) internal view returns (address seller, uint96 listingWei) {
        (bool isForSale,, address listingSeller, uint256 minValue, address onlySellTo) =
            PUNKS.punksOfferedForSale(punkId);

        if (
            !isForSale
                || listingSeller == address(0)
                || (onlySellTo != address(0) && onlySellTo != address(this))
        ) revert ListingNotValid();
        if (PUNKS.punkIndexToAddress(punkId) != listingSeller) revert ListingNotValid();
        if (minValue != expectedListingWei) {
            revert ListingPriceMismatch(expectedListingWei, minValue);
        }
        if (minValue > bidWei) revert ListingPriceTooHigh();

        return (listingSeller, uint96(minValue));
    }
}
