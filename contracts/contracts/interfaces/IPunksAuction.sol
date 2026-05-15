// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../lib/Punks.sol";

/// @title  IPunksAuction
///
/// @notice Public types, events, errors, and core API for the zero-fee
///         CryptoPunks auction house.
///
/// @author VV × 1001
interface IPunksAuction {
    // ─────────────────────────────────── Types ──────────────────────────────────

    /// @notice Punks-only standards. ERC721/ERC1155 placeholders are not part
    ///         of this contract.
    enum TokenStandard {
        CRYPTOPUNKS,
        CRYPTOPUNKS_V1
    }

    /// @notice One Punk inside a stored lot or live auction.
    /// @dev    `weightBps` controls how the final sale amount is allocated
    ///         across bundled items for canonical market settlement events.
    struct LotItem {
        TokenStandard standard;
        uint16 punkId;
        uint16 weightBps;
    }

    /// @notice One position in a purchase offer's matching bundle.
    /// @dev    `criteria` is evaluated against `PunksData`; include/exclude
    ///         lists pin or block specific Punk ids after the filter check.
    struct OfferSlot {
        Punks.Filter criteria;
        TokenStandard standard;
        uint16[] includeIds;
        uint16[] excludeIds;
    }

    /// @notice Scalar fields for a seller lot.
    /// @dev    Dynamic item details are emitted as `LotItemDetail` and read
    ///         through `getLotItems`.
    struct Lot {
        address seller;
        uint96 reserveWei;
        uint8 itemCount;
        bytes32 itemHash;
    }

    /// @notice Scalar fields for a live auction.
    /// @dev    Dynamic item details are inherited from the source lot and read
    ///         through `getAuctionItems`.
    struct Auction {
        address seller;
        address latestBidder;
        uint96 latestBidWei;
        uint40 endTimestamp;
        uint8 itemCount;
        bytes32 itemHash;
        bool settled;
    }

    /// @notice Native ETH offer for one or more Punk slots.
    /// @dev    `slots` is dynamic and read through `getOfferSlots`.
    struct Offer {
        uint96 amountWei;
        address offerer;
        OfferSlot[] slots;
    }

    // ─────────────────────────────────── Events ─────────────────────────────────

    /// @notice Emitted when a seller creates a lot.
    event LotCreated(
        uint256 indexed lotId,
        address indexed seller,
        bytes32 indexed itemHash,
        uint8 itemCount,
        uint96 reserveWei
    );

    /// @notice Emitted once for each Punk stored on a newly created lot.
    event LotItemDetail(
        uint256 indexed lotId,
        uint8 indexed itemIndex,
        TokenStandard standard,
        uint16 punkId,
        uint16 weightBps
    );

    /// @notice Emitted when a seller cancels a lot.
    event LotCancelled(uint256 indexed lotId);

    /// @notice Emitted when anyone clears a lot that is no longer valid.
    event LotCleared(uint256 indexed lotId, address indexed cleaner);

    /// @notice Emitted when a seller updates a lot reserve.
    event LotUpdated(uint256 indexed lotId, uint96 reserveWei);

    /// @notice Emitted when a lot becomes a live auction.
    event AuctionInitialised(
        uint256 indexed auctionId,
        address indexed seller,
        bytes32 indexed itemHash,
        uint8 itemCount,
        uint40 endTimestamp
    );

    /// @notice Emitted for the initial bid and every later auction bid.
    event Bid(uint256 indexed auctionId, address indexed bidder, uint256 amountWei);

    /// @notice Emitted when a late bid extends an auction.
    event AuctionExtended(uint256 indexed auctionId, uint40 endTimestamp);

    /// @notice Emitted once for each Punk delivered during auction settlement.
    event AuctionItemDelivered(
        uint256 indexed auctionId,
        uint8 indexed itemIndex,
        TokenStandard standard,
        uint16 punkId,
        address recipient,
        uint96 itemWei
    );

    /// @notice Emitted when an auction is settled.
    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        address indexed seller,
        uint256 finalWei,
        uint256 sellerWei,
        uint256 protocolWei
    );

    /// @notice Emitted when an offerer locks ETH for a new purchase offer.
    event OfferPlaced(
        uint256 indexed offerId,
        address indexed offerer,
        uint96 amountWei,
        uint8 slotCount
    );

    /// @notice Emitted once for each matching slot on a newly placed offer.
    event OfferSlotDetail(
        uint256 indexed offerId,
        uint8 indexed slotIndex,
        TokenStandard standard,
        Punks.Filter criteria,
        uint16[] includeIds,
        uint16[] excludeIds
    );

    /// @notice Emitted when an offerer cancels an active offer.
    event OfferCancelled(uint256 indexed offerId);

    /// @notice Emitted when an offerer changes the locked offer amount.
    event OfferAmountAdjusted(uint256 indexed offerId, uint96 newAmountWei);

    /// @notice Emitted when a listed Punk is bought for a single-slot offer.
    event OfferAccepted(
        uint256 indexed offerId,
        uint256 indexed punkId,
        address indexed seller,
        address offerer,
        uint256 amountWei
    );

    /// @notice Emitted when a seller accepts an offer against a stored lot.
    event OfferAcceptedFromLot(
        uint256 indexed offerId,
        uint256 indexed lotId,
        address indexed seller,
        address offerer,
        uint96 amountWei
    );

    /// @notice Emitted when an offer is used as the first bid for a lot auction.
    event OfferAuctionInitialised(
        uint256 indexed offerId,
        uint256 indexed auctionId,
        uint256 indexed lotId,
        address seller,
        address offerer,
        uint96 amountWei
    );

    // ─────────────────────────────────── Errors ─────────────────────────────────

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

    // ─────────────────────────────────── Lots ───────────────────────────────────

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

    // ───────────────────────────────── Auctions ────────────────────────────────

    /// @notice Opens a lot as a live auction with your first bid.
    function openAuction(uint256 lotId, uint96 expectedReserveWei)
        external
        payable
        returns (uint256 auctionId);

    /// @notice Places a bid on a live auction.
    function bid(uint256 auctionId) external payable;

    // ────────────────────────────────── Offers ─────────────────────────────────

    /// @notice Places an ETH offer for Punks that match a list of slot criteria.
    function placeOffer(
        uint96 amountWei,
        OfferSlot[] calldata slots
    ) external payable returns (uint256 offerId);

    /// @notice Cancels your active offer and refunds its ETH.
    function cancelOffer(uint256 offerId) external;

    /// @notice Sets the offer amount. `msg.value` must equal the increase,
    ///         or be zero for a decrease.
    function adjustOfferAmount(uint256 offerId, uint96 newAmountWei) external payable;

    /// @notice Accepts a single-slot offer for a listed Punk using a pinned
    ///         listing price.
    function acceptOffer(uint256 offerId, uint16 punkId, uint96 expectedListingWei) external;

    /// @notice Accepts an offer against a stored lot when it still meets the
    ///         caller's minimum.
    function acceptOfferFromLot(uint256 offerId, uint256 lotId, uint96 minAmountWei) external;

    /// @notice Starts an auction from an offer when it still meets the
    ///         caller's minimum.
    function startAuctionFromOffer(uint256 offerId, uint256 lotId, uint96 minAmountWei)
        external
        returns (uint256 auctionId);

    // ─────────────────────────────────── Views ──────────────────────────────────

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
