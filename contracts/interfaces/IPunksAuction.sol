// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title IPunksAuction
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

    function createLot(
        address tokenContract,
        uint256 tokenId,
        TokenStandard standard,
        uint96 reserveWei,
        uint40 expiresAt
    ) external returns (uint256 lotId);

    function updateLot(uint256 lotId, uint96 reserveWei, uint40 expiresAt) external;

    function cancelLot(uint256 lotId) external;

    function clearStaleLot(uint256 lotId) external;

    function clearStaleLots(uint256[] calldata lotIds) external;

    function openAuction(uint256 lotId, uint96 expectedReserveWei)
        external
        payable
        returns (uint256 auctionId);

    function bid(uint256 auctionId) external payable;

    function placeOffer(
        TokenStandard standard,
        uint96 amountWei,
        uint96 settlementWei,
        address receiver,
        TraitFilter[] calldata traitFilters,
        uint16[] calldata includeIds,
        uint16[] calldata excludeIds
    ) external payable returns (uint256 offerId);

    function cancelOffer(uint256 offerId) external;

    function adjustOfferAmount(
        uint256 offerId,
        uint96 weiToAdjust,
        bool increase
    ) external payable;

    function adjustOfferSettlement(
        uint256 offerId,
        uint96 weiToAdjust,
        bool increase
    ) external payable;

    function acceptOffer(uint256 offerId, uint16 punkId) external;

    function startAuctionFromOffer(uint256 offerId, uint16 punkId)
        external
        returns (uint256 auctionId);

    function getOfferFilters(uint256 offerId)
        external
        view
        returns (
            TraitFilter[] memory traitFilters,
            uint16[] memory includeIds,
            uint16[] memory excludeIds
        );

    function settle(uint256 auctionId) external;

    function currentMinBidWei(uint256 auctionId) external view returns (uint96);

    function auctionActive(uint256 auctionId) external view returns (bool);

    function endTimestampOf(uint256 auctionId) external view returns (uint40);
}
