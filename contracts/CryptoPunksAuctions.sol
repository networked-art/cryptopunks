// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./escrow/CryptoPunkEscrowManager.sol";
import "./interfaces/ICryptoPunksAuctions.sol";
import "./lib/PushPullEscrow.sol";

/// @title CryptoPunksAuctions
/// @notice Zero-fee auction house for CryptoPunks.
contract CryptoPunksAuctions is
    ICryptoPunksAuctions,
    CryptoPunkEscrowManager,
    PushPullEscrow
{
    uint256 internal constant BPS = 10_000;
    uint256 internal constant BID_INCREASE_BPS = 1_000;
    uint40  internal constant AUCTION_DURATION = 24 hours;
    uint40  internal constant BIDDING_GRACE_PERIOD = 15 minutes;
    uint256 internal constant DELIVER_GAS_LIMIT = 500_000;

    uint256 public lastLotId;
    uint256 public lastAuctionId;

    mapping(uint256 => Lot) public lots;
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => bool) public pendingDelivery;

    mapping(bytes32 => uint64) public sellerTokenVersion;

    constructor(address punks, address punksV1)
        CryptoPunkEscrowManager(punks, punksV1)
    {}

    receive() external payable {
        if (!_isPunkReceiveSender(msg.sender)) revert();
    }

    function createLot(
        address tokenContract,
        uint256 tokenId,
        TokenStandard standard,
        uint96 reserveWei,
        uint40 expiresAt
    ) external returns (uint256 id) {
        _validateLotArgs(msg.sender, tokenContract, tokenId, standard, reserveWei, expiresAt);

        unchecked { id = ++lastLotId; }
        lots[id] = Lot({
            seller: msg.sender,
            tokenContract: tokenContract,
            tokenId: tokenId,
            standard: standard,
            reserveWei: reserveWei,
            expiresAt: expiresAt,
            version: sellerTokenVersion[_tokenKey(msg.sender, tokenContract, tokenId)]
        });

        emit LotCreated(id, msg.sender, tokenContract, tokenId, standard, reserveWei, expiresAt);
    }

    function updateLot(
        uint256 id,
        uint96 reserveWei,
        uint40 expiresAt
    ) external {
        Lot storage lot = lots[id];
        if (lot.seller == address(0)) revert LotNotFound();
        if (lot.seller != msg.sender) revert NotSeller();
        if (reserveWei == 0) revert InvalidAmount();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();

        lot.reserveWei = reserveWei;
        lot.expiresAt = expiresAt;

        emit LotUpdated(id, reserveWei, expiresAt);
    }

    function cancelLot(uint256 id) external {
        Lot storage lot = lots[id];
        if (lot.seller == address(0)) revert LotNotFound();
        if (lot.seller != msg.sender) revert NotSeller();

        delete lots[id];
        emit LotCancelled(id);
    }

    function clearStaleLot(uint256 id) external {
        _clearStaleLot(id);
    }

    function clearStaleLots(uint256[] calldata ids) external {
        uint256 len = ids.length;
        for (uint256 i; i < len;) {
            _clearStaleLot(ids[i]);
            unchecked { ++i; }
        }
    }

    function openAuction(
        uint256 id,
        uint96 expectedReserveWei
    ) external payable nonReentrant returns (uint256 auctionId) {
        Lot memory lot = lots[id];
        if (lot.seller == address(0)) revert LotNotFound();
        if (block.timestamp >= lot.expiresAt) revert LotExpired();
        if (lot.reserveWei != expectedReserveWei) {
            revert ReserveMismatch(expectedReserveWei, lot.reserveWei);
        }

        bytes32 tokenKey = _tokenKey(lot.seller, lot.tokenContract, lot.tokenId);
        if (lot.version != sellerTokenVersion[tokenKey]) revert LotExpired();

        uint96 bidWei = _checkedUint96(msg.value);
        if (bidWei < lot.reserveWei) revert ReserveNotMet();

        delete lots[id];
        unchecked { ++sellerTokenVersion[tokenKey]; }

        auctionId = _createAuction(lot, msg.sender, bidWei);
    }

    function bid(uint256 auctionId) external payable nonReentrant {
        Auction storage auction = auctions[auctionId];
        if (auction.endTimestamp == 0) revert AuctionDoesNotExist();
        if (auction.settled) revert AuctionAlreadySettled();
        if (block.timestamp > auction.endTimestamp) revert AuctionNotActive();

        uint96 bidWei = _checkedUint96(msg.value);
        if (bidWei < _currentMinBidWei(auction.latestBidWei)) revert MinimumBidNotMet();

        address previousBidder = auction.latestBidder;
        uint96 previousBidWei = auction.latestBidWei;

        auction.latestBidder = msg.sender;
        auction.latestBidWei = bidWei;

        _maybeExtend(auctionId, auction);

        if (previousBidWei > 0) {
            _pushOrCredit(previousBidder, previousBidWei);
        }

        emit Bid(auctionId, msg.sender, bidWei);
    }

    function currentMinBidWei(uint256 auctionId) external view returns (uint96) {
        return _currentMinBidWei(auctions[auctionId].latestBidWei);
    }

    function auctionActive(uint256 auctionId) external view returns (bool) {
        Auction storage auction = auctions[auctionId];
        return auction.endTimestamp != 0 && block.timestamp <= auction.endTimestamp;
    }

    function endTimestampOf(uint256 auctionId) external view returns (uint40) {
        return auctions[auctionId].endTimestamp;
    }

    function settle(uint256 auctionId) external nonReentrant {
        Auction storage storedAuction = auctions[auctionId];
        Auction memory auction = storedAuction;
        if (auction.endTimestamp == 0) revert AuctionDoesNotExist();
        if (auction.settled) revert AuctionAlreadySettled();
        if (block.timestamp <= auction.endTimestamp) revert AuctionNotComplete();

        storedAuction.settled = true;

        bool delivered = _tryDeliver(auction, auction.latestBidder);
        if (!delivered) {
            pendingDelivery[auctionId] = true;
            emit DeliveryDeferred(auctionId, auction.latestBidder);
        }

        _pushOrCredit(auction.seller, auction.latestBidWei);

        emit AuctionSettled(
            auctionId,
            auction.latestBidder,
            auction.seller,
            auction.latestBidWei,
            auction.latestBidWei,
            0
        );
    }

    function claimSettledToken(uint256 auctionId, address to) external nonReentrant {
        Auction memory auction = auctions[auctionId];
        if (auction.endTimestamp == 0) revert AuctionDoesNotExist();
        if (msg.sender != auction.latestBidder) revert NotWinner();
        if (!pendingDelivery[auctionId]) revert NoPendingDelivery();

        address recipient = to == address(0) ? msg.sender : to;
        delete pendingDelivery[auctionId];

        _deliverPunkDirect(auction.standard, auction.tokenContract, auction.tokenId, recipient);

        emit SettledTokenClaimed(auctionId, msg.sender, recipient);
    }

    function _externalDeliver(
        TokenStandard standard,
        address tokenContract,
        uint256 tokenId,
        address to,
        uint256 hammerWei
    ) external {
        if (msg.sender != address(this)) revert NotAuctions();
        _deliverPunk(standard, tokenContract, tokenId, to, hammerWei);
    }

    function _createAuction(
        Lot memory lot,
        address bidder,
        uint96 bidWei
    ) internal returns (uint256 auctionId) {
        unchecked { auctionId = ++lastAuctionId; }

        uint40 endTimestamp = uint40(block.timestamp) + AUCTION_DURATION;

        auctions[auctionId] = Auction({
            seller: lot.seller,
            tokenContract: lot.tokenContract,
            tokenId: lot.tokenId,
            standard: lot.standard,
            latestBidder: bidder,
            latestBidWei: bidWei,
            endTimestamp: endTimestamp,
            settled: false
        });

        _pullPunk(lot.standard, lot.tokenContract, lot.seller, lot.tokenId);

        emit AuctionInitialised(
            auctionId,
            lot.tokenContract,
            lot.tokenId,
            lot.seller,
            lot.standard,
            endTimestamp
        );
        emit Bid(auctionId, bidder, bidWei);
    }

    function _clearStaleLot(uint256 id) internal {
        Lot memory lot = lots[id];
        if (lot.seller == address(0)) revert LotNotFound();

        bytes32 tokenKey = _tokenKey(lot.seller, lot.tokenContract, lot.tokenId);
        bool versionStale = lot.version != sellerTokenVersion[tokenKey];
        bool sellerStillOwns = _punkStillInSellerVault(lot.standard, lot.seller, lot.tokenId);
        bool expired = block.timestamp >= lot.expiresAt;

        if (!versionStale && !expired && sellerStillOwns) revert LotNotStale();

        delete lots[id];

        if (!sellerStillOwns) {
            unchecked { ++sellerTokenVersion[tokenKey]; }
        }

        emit LotCleared(id, msg.sender);
    }

    function _validateLotArgs(
        address seller,
        address tokenContract,
        uint256 tokenId,
        TokenStandard standard,
        uint96 reserveWei,
        uint40 expiresAt
    ) internal view {
        if (tokenContract == address(0)) revert ZeroAddress();
        if (reserveWei == 0) revert InvalidAmount();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();
        _requireSupportedPunkStandard(standard);
        _requirePunkContract(standard, tokenContract);
        _maybeRequirePunkInVault(standard, seller, tokenId);
    }

    function _requireSupportedPunkStandard(TokenStandard standard) internal pure {
        if (
            standard != TokenStandard.CRYPTOPUNKS &&
            standard != TokenStandard.CRYPTOPUNKS_V1
        ) {
            revert UnsupportedStandard();
        }
    }

    function _tryDeliver(Auction memory auction, address to) internal returns (bool) {
        try this._externalDeliver{gas: DELIVER_GAS_LIMIT}(
            auction.standard,
            auction.tokenContract,
            auction.tokenId,
            to,
            uint256(auction.latestBidWei)
        ) {
            return true;
        } catch {
            return false;
        }
    }

    function _maybeExtend(uint256 auctionId, Auction storage auction) internal {
        uint40 nowTs = uint40(block.timestamp);
        uint40 timeRemaining = auction.endTimestamp - nowTs;
        if (timeRemaining < BIDDING_GRACE_PERIOD) {
            uint40 newEnd = nowTs + BIDDING_GRACE_PERIOD;
            auction.endTimestamp = newEnd;
            emit AuctionExtended(auctionId, newEnd);
        }
    }

    function _currentMinBidWei(uint96 prevWei) internal pure returns (uint96) {
        uint256 next = (uint256(prevWei) * (BPS + BID_INCREASE_BPS) + BPS - 1) / BPS;
        return next > type(uint96).max ? type(uint96).max : uint96(next);
    }

    function _checkedUint96(uint256 value) internal pure returns (uint96) {
        if (value > type(uint96).max) revert TooManyTokens();
        return uint96(value);
    }

    function _tokenKey(
        address seller,
        address tokenContract,
        uint256 tokenId
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(seller, tokenContract, tokenId));
    }
}
