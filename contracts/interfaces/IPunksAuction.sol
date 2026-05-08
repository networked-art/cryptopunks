// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  IPunksAuction
/// @notice Public types, events, errors, and core API for the zero-fee Punk auction house.
interface IPunksAuction {
    /// @notice Numeric values match NetworkedAuctions for punk standards.
    enum TokenStandard {
        ERC721,
        ERC1155,
        CRYPTOPUNKS,
        CRYPTOPUNKS_V1
    }

    struct TraitFilter {
        bool required;
        uint16 traitId;
    }

    struct Lot {
        address seller;
        address tokenContract;
        uint256 tokenId;
        TokenStandard standard;
        uint96 reserveWei;
        uint40 expiresAt;
        uint64 version;
    }

    struct Auction {
        address seller;
        address tokenContract;
        uint256 tokenId;
        TokenStandard standard;
        address latestBidder;
        uint96 latestBidWei;
        uint40 endTimestamp;
        bool settled;
    }

    struct Offer {
        uint96 amountWei;
        uint96 settlementWei;
        address offerer;
        address receiver;
        TokenStandard standard;
        TraitFilter[] traitFilters;
        uint16[] includeIds;
        uint16[] excludeIds;
    }

    event LotCreated(
        uint256 indexed lotId,
        address indexed seller,
        address indexed tokenContract,
        uint256 tokenId,
        TokenStandard standard,
        uint96 reserveWei,
        uint40 expiresAt
    );
    event LotCancelled(uint256 indexed lotId);
    event LotCleared(uint256 indexed lotId, address indexed cleaner);
    event LotUpdated(uint256 indexed lotId, uint96 reserveWei, uint40 expiresAt);

    event AuctionInitialised(
        uint256 indexed auctionId,
        address indexed tokenContract,
        uint256 indexed tokenId,
        address seller,
        TokenStandard standard,
        uint40 endTimestamp
    );
    event Bid(uint256 indexed auctionId, address indexed bidder, uint256 amountWei);
    event AuctionExtended(uint256 indexed auctionId, uint40 endTimestamp);
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
        TokenStandard indexed standard,
        address indexed offerer,
        address receiver,
        uint96 amountWei,
        uint96 settlementWei,
        TraitFilter[] traitFilters,
        uint16[] includeIds,
        uint16[] excludeIds
    );
    event OfferCancelled(uint256 indexed offerId);
    event OfferAmountAdjusted(uint256 indexed offerId, uint96 newAmountWei);
    event OfferSettlementAdjusted(uint256 indexed offerId, uint96 newSettlementWei);
    event OfferAccepted(
        uint256 indexed offerId,
        TokenStandard indexed standard,
        uint256 indexed punkId,
        address seller,
        address offerer,
        address receiver,
        uint256 listingWei,
        uint256 settlementWei
    );
    event OfferAuctionInitialised(
        uint256 indexed offerId,
        uint256 indexed auctionId,
        uint256 indexed punkId,
        address seller,
        address offerer,
        address receiver,
        uint256 amountWei
    );

    error ZeroAddress();
    error UnexpectedEtherSender();
    error InvalidAmount();
    error InvalidExpiry();
    error UnsupportedStandard();
    error TooManyTokens();
    error PunkContractMismatch();
    error PunkNotInVault();
    error NotAuctions();
    error IncorrectPayment();
    error NotOfferer();
    error OfferNotActive();
    error NegativeAdjustmentHigherThanCurrentOffer();
    error ListingNotValid();
    error ListingPriceTooHigh();
    error PunkNotIncluded();
    error PunkExcluded();
    error TraitsUnavailable();
    error PunkTraitMismatch();

    error LotNotFound();
    error LotExpired();
    error LotNotStale();
    error NotSeller();
    error ReserveMismatch(uint96 expectedReserveWei, uint96 actualReserveWei);
    error ReserveNotMet();

    error AuctionDoesNotExist();
    error AuctionNotActive();
    error AuctionAlreadySettled();
    error AuctionNotComplete();
    error MinimumBidNotMet();

    /// @notice Creates a lot that can be opened as an auction.
    function createLot(
        address tokenContract,
        uint256 tokenId,
        TokenStandard standard,
        uint96 reserveWei,
        uint40 expiresAt
    ) external returns (uint256 lotId);

    /// @notice Updates the reserve price and expiry for your lot.
    function updateLot(uint256 lotId, uint96 reserveWei, uint40 expiresAt) external;

    /// @notice Cancels your lot.
    function cancelLot(uint256 lotId) external;

    /// @notice Clears one lot that is expired or no longer valid.
    function clearStaleLot(uint256 lotId) external;

    /// @notice Clears several lots that are expired or no longer valid.
    function clearStaleLots(uint256[] calldata lotIds) external;

    /// @notice Opens a lot as a live auction with your first bid.
    function openAuction(uint256 lotId, uint96 expectedReserveWei)
        external
        payable
        returns (uint256 auctionId);

    /// @notice Places a bid on a live auction.
    function bid(uint256 auctionId) external payable;

    /// @notice Places an ETH offer for Punks that match your filters.
    function placeOffer(
        TokenStandard standard,
        uint96 amountWei,
        uint96 settlementWei,
        address receiver,
        TraitFilter[] calldata traitFilters,
        uint16[] calldata includeIds,
        uint16[] calldata excludeIds
    ) external payable returns (uint256 offerId);

    /// @notice Cancels your active offer and refunds its ETH.
    function cancelOffer(uint256 offerId) external;

    /// @notice Increases or decreases the offer amount.
    function adjustOfferAmount(
        uint256 offerId,
        uint96 weiToAdjust,
        bool increase
    ) external payable;

    /// @notice Increases or decreases the seller settlement amount.
    function adjustOfferSettlement(
        uint256 offerId,
        uint96 weiToAdjust,
        bool increase
    ) external payable;

    /// @notice Accepts an offer for a listed Punk.
    function acceptOffer(uint256 offerId, uint16 punkId) external;

    /// @notice Starts an auction by using an existing offer as the first bid.
    function startAuctionFromOffer(uint256 offerId, uint16 punkId)
        external
        returns (uint256 auctionId);

    /// @notice Returns the filters saved for an offer.
    function getOfferFilters(uint256 offerId)
        external
        view
        returns (
            TraitFilter[] memory traitFilters,
            uint16[] memory includeIds,
            uint16[] memory excludeIds
        );

    /// @notice Settles a completed auction.
    function settle(uint256 auctionId) external;

    /// @notice Returns the minimum bid needed for an auction.
    function currentMinBidWei(uint256 auctionId) external view returns (uint96);

    /// @notice Checks whether an auction is still open.
    function auctionActive(uint256 auctionId) external view returns (bool);

    /// @notice Returns when an auction ends.
    function endTimestampOf(uint256 auctionId) external view returns (uint40);
}
