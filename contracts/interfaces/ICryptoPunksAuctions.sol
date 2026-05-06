// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title ICryptoPunksAuctions
/// @notice Public types, events, errors, and core API for the zero-fee Punk auction house.
interface ICryptoPunksAuctions {
    /// @notice Numeric values match NetworkedAuctions for punk standards.
    enum TokenStandard { ERC721, ERC1155, CRYPTOPUNKS, CRYPTOPUNKS_V1 }

    struct Lot {
        address seller;
        address tokenContract;
        uint256 tokenId;
        TokenStandard standard;
        uint96  reserveWei;
        uint40  expiresAt;
        uint64  version;
    }

    struct Auction {
        address seller;
        address tokenContract;
        uint256 tokenId;
        TokenStandard standard;
        address latestBidder;
        uint96  latestBidWei;
        uint40  endTimestamp;
        bool    settled;
    }

    event LotCreated(
        uint256 indexed lotId,
        address indexed seller,
        address indexed tokenContract,
        uint256 tokenId,
        TokenStandard standard,
        uint96  reserveWei,
        uint40  expiresAt
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
        uint40  endTimestamp
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
    event DeliveryDeferred(uint256 indexed auctionId, address indexed winner);
    event SettledTokenClaimed(uint256 indexed auctionId, address indexed winner, address indexed to);

    error ZeroAddress();
    error InvalidAmount();
    error InvalidExpiry();
    error UnsupportedStandard();
    error TooManyTokens();
    error PunkContractMismatch();
    error PunkNotInVault();
    error NotAuctions();

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
    error NotWinner();
    error NoPendingDelivery();

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

    function openAuction(uint256 lotId, uint96 expectedReserveWei) external payable returns (uint256 auctionId);

    function bid(uint256 auctionId) external payable;

    function settle(uint256 auctionId) external;

    function claimSettledToken(uint256 auctionId, address to) external;

    function currentMinBidWei(uint256 auctionId) external view returns (uint96);

    function auctionActive(uint256 auctionId) external view returns (bool);

    function endTimestampOf(uint256 auctionId) external view returns (uint40);
}
