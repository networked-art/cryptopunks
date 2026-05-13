// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../lib/Punks.sol";

/// @title  IPunksAuction
/// @notice Public types, events, errors, and core API for the zero-fee Punk auction house.
interface IPunksAuction {
    /// @notice Punks-only standards. ERC721/ERC1155 placeholders are not part of this contract.
    enum TokenStandard {
        CRYPTOPUNKS,
        CRYPTOPUNKS_V1
    }

    struct LotItem {
        TokenStandard standard;
        uint16 punkId;
        uint16 weightBps;
    }

    struct OfferSlot {
        Punks.Filter criteria;
        TokenStandard standard;
        uint16[] includeIds;
        uint16[] excludeIds;
    }

    struct Lot {
        address seller;
        uint96 reserveWei;
        uint8 itemCount;
        bytes32 itemHash;
    }

    struct Auction {
        address seller;
        address latestBidder;
        uint96 latestBidWei;
        uint40 endTimestamp;
        uint8 itemCount;
        bytes32 itemHash;
        bool settled;
    }

    struct Offer {
        uint96 amountWei;
        address offerer;
        OfferSlot[] slots;
    }

    event LotCreated(
        uint256 indexed lotId,
        address indexed seller,
        bytes32 indexed itemHash,
        uint8 itemCount,
        uint96 reserveWei
    );
    event LotItemDetail(
        uint256 indexed lotId,
        uint8 indexed itemIndex,
        TokenStandard standard,
        uint16 punkId,
        uint16 weightBps
    );
    event LotCancelled(uint256 indexed lotId);
    event LotCleared(uint256 indexed lotId, address indexed cleaner);
    event LotUpdated(uint256 indexed lotId, uint96 reserveWei);

    event AuctionInitialised(
        uint256 indexed auctionId,
        address indexed seller,
        bytes32 indexed itemHash,
        uint8 itemCount,
        uint40 endTimestamp
    );
    event Bid(uint256 indexed auctionId, address indexed bidder, uint256 amountWei);
    event AuctionExtended(uint256 indexed auctionId, uint40 endTimestamp);
    event AuctionItemDelivered(
        uint256 indexed auctionId,
        uint8 indexed itemIndex,
        TokenStandard standard,
        uint16 punkId,
        address recipient,
        uint96 itemWei
    );
    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        address indexed seller,
        uint256 finalWei,
        uint256 sellerWei,
        uint256 protocolWei
    );

    event OfferPlaced(
        uint256 indexed offerId,
        address indexed offerer,
        uint96 amountWei,
        uint8 slotCount
    );
    event OfferSlotDetail(
        uint256 indexed offerId,
        uint8 indexed slotIndex,
        TokenStandard standard,
        Punks.Filter criteria,
        uint16[] includeIds,
        uint16[] excludeIds
    );
    event OfferCancelled(uint256 indexed offerId);
    event OfferAmountAdjusted(uint256 indexed offerId, uint96 newAmountWei);
    event OfferAccepted(
        uint256 indexed offerId,
        uint256 indexed punkId,
        address indexed seller,
        address offerer,
        uint256 amountWei
    );
    event OfferAcceptedFromLot(
        uint256 indexed offerId,
        uint256 indexed lotId,
        address indexed seller,
        address offerer,
        uint96 amountWei
    );
    event OfferAuctionInitialised(
        uint256 indexed offerId,
        uint256 indexed auctionId,
        uint256 indexed lotId,
        address seller,
        address offerer,
        uint96 amountWei
    );

    error ZeroAddress();
    error UnexpectedEtherSender();
    error InvalidAmount();
    error TooManyTokens();
    error PunkNotInVault();
    error VaultNotDeployed();
    error AuctionNotApproved();
    error NotAuctions();
    error IncorrectPayment();
    error NotOfferer();
    error OfferNotActive();
    error ListingNotValid();
    error ListingPriceMismatch(uint96 expectedListingWei, uint256 actualListingWei);
    error ListingPriceTooHigh();
    error PunkNotIncluded();
    error PunkExcluded();
    error PunkCriteriaMismatch();

    error InvalidItemCount();
    error DuplicateLotItem();
    error InvalidWeights();
    error InvalidSlotCount();
    error SlotItemCountMismatch();
    error MultiSlotOfferRequiresLot();
    error OfferStandardMismatch();
    error TooManyIds();

    error LotNotFound();
    error LotNotStale();
    error NotSeller();
    error PunkAlreadyInLot(uint256 lotId);
    error ReserveMismatch(uint96 expectedReserveWei, uint96 actualReserveWei);
    error ReserveNotMet();
    error OfferAmountBelowMinimum(uint96 minAmountWei, uint96 actualAmountWei);

    error AuctionDoesNotExist();
    error AuctionNotActive();
    error AuctionAlreadySettled();
    error AuctionNotComplete();
    error MinimumBidNotMet();

    /// @notice Creates a lot of one or more Punks that can be opened as an auction.
    function createLot(
        LotItem[] calldata items,
        uint96 reserveWei
    ) external returns (uint256 lotId);

    /// @notice Updates the reserve price for your lot.
    function updateLot(uint256 lotId, uint96 reserveWei) external;

    /// @notice Cancels your lot.
    function cancelLot(uint256 lotId) external;

    /// @notice Clears one lot that is no longer valid.
    function clearStaleLot(uint256 lotId) external;

    /// @notice Clears several lots that are no longer valid.
    function clearStaleLots(uint256[] calldata lotIds) external;

    /// @notice Opens a lot as a live auction with your first bid.
    function openAuction(uint256 lotId, uint96 expectedReserveWei)
        external
        payable
        returns (uint256 auctionId);

    /// @notice Places a bid on a live auction.
    function bid(uint256 auctionId) external payable;

    /// @notice Places an ETH offer for Punks that match a list of slot criteria.
    function placeOffer(
        uint96 amountWei,
        OfferSlot[] calldata slots
    ) external payable returns (uint256 offerId);

    /// @notice Cancels your active offer and refunds its ETH.
    function cancelOffer(uint256 offerId) external;

    /// @notice Sets the offer amount. `msg.value` must equal the increase, or be zero for a decrease.
    function adjustOfferAmount(uint256 offerId, uint96 newAmountWei) external payable;

    /// @notice Accepts a single-slot offer for a listed Punk using a pinned listing price.
    function acceptOffer(uint256 offerId, uint16 punkId, uint96 expectedListingWei) external;

    /// @notice Accepts an offer against a stored lot when it still meets the caller's minimum.
    function acceptOfferFromLot(uint256 offerId, uint256 lotId, uint96 minAmountWei) external;

    /// @notice Starts an auction from an offer when it still meets the caller's minimum.
    function startAuctionFromOffer(uint256 offerId, uint256 lotId, uint96 minAmountWei)
        external
        returns (uint256 auctionId);

    /// @notice Returns the items stored on a lot.
    function getLotItems(uint256 lotId) external view returns (LotItem[] memory);

    /// @notice Returns the items stored on an auction.
    function getAuctionItems(uint256 auctionId) external view returns (LotItem[] memory);

    /// @notice Returns the slots stored on an offer.
    function getOfferSlots(uint256 offerId) external view returns (OfferSlot[] memory);

    /// @notice Settles a completed auction.
    function settle(uint256 auctionId) external;

    /// @notice Returns the minimum bid needed for an auction.
    function currentMinBidWei(uint256 auctionId) external view returns (uint96);

    /// @notice Checks whether an auction is still open.
    function auctionActive(uint256 auctionId) external view returns (bool);

    /// @notice Returns when an auction ends.
    function endTimestampOf(uint256 auctionId) external view returns (uint40);
}
