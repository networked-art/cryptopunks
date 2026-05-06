// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./escrow/CryptoPunkEscrowManager.sol";
import "./interfaces/ICryptoPunksAuctions.sol";
import "./interfaces/ICryptoPunksTraits.sol";
import "./lib/PushPullEscrow.sol";

/// @title CryptoPunksAuctions
/// @notice Zero-fee auction house for CryptoPunks.
///         Standing bid subsystem inspired by MouseDev's CryptoPunksBids,
///         concept by mousedev.eth and kilo.
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
    uint256 public lastStandingBidId;

    mapping(uint256 => Lot) public lots;
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => bool) public pendingDelivery;
    mapping(uint256 => address) public auctionReceivers;
    mapping(uint256 => StandingBid) public standingBids;

    mapping(bytes32 => uint64) public sellerTokenVersion;

    ICryptoPunksTraits public immutable TRAITS;

    constructor(address punks, address punksV1, address traits)
        CryptoPunkEscrowManager(punks, punksV1)
    {
        TRAITS = ICryptoPunksTraits(traits);
    }

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

        auctionId = _createAuction(lot, msg.sender, bidWei, address(0));
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
        delete auctionReceivers[auctionId];

        _maybeExtend(auctionId, auction);

        if (previousBidWei > 0) {
            _pushOrCredit(previousBidder, previousBidWei);
        }

        emit Bid(auctionId, msg.sender, bidWei);
    }

    function currentMinBidWei(uint256 auctionId) external view returns (uint96) {
        return _currentMinBidWei(auctions[auctionId].latestBidWei);
    }

    function placeBid(
        TokenStandard standard,
        uint96 bidWei,
        uint96 settlementWei,
        address receiver,
        TraitFilter[] calldata traitFilters,
        uint16[] calldata includeIds,
        uint16[] calldata excludeIds
    ) external payable returns (uint256 bidId) {
        _requireSupportedPunkStandard(standard);
        if (bidWei == 0) revert InvalidAmount();
        if (traitFilters.length > 0 && address(TRAITS) == address(0)) revert TraitsUnavailable();
        if (msg.value != uint256(bidWei) + uint256(settlementWei)) revert IncorrectPayment();

        unchecked { bidId = ++lastStandingBidId; }

        StandingBid storage storedBid = standingBids[bidId];
        storedBid.bidWei = bidWei;
        storedBid.settlementWei = settlementWei;
        storedBid.bidder = msg.sender;
        storedBid.receiver = receiver;
        storedBid.standard = standard;

        uint256 len = traitFilters.length;
        for (uint256 i; i < len;) {
            storedBid.traitFilters.push(traitFilters[i]);
            unchecked { ++i; }
        }

        len = includeIds.length;
        for (uint256 i; i < len;) {
            storedBid.includeIds.push(includeIds[i]);
            unchecked { ++i; }
        }

        len = excludeIds.length;
        for (uint256 i; i < len;) {
            storedBid.excludeIds.push(excludeIds[i]);
            unchecked { ++i; }
        }

        emit StandingBidPlaced(
            bidId,
            standard,
            msg.sender,
            receiver,
            bidWei,
            settlementWei,
            traitFilters,
            includeIds,
            excludeIds
        );
    }

    function cancelBid(uint256 bidId) external nonReentrant {
        StandingBid memory standingBid = _activeStandingBid(bidId);
        if (standingBid.bidder != msg.sender) revert NotBidder();

        delete standingBids[bidId];
        _pushOrCredit(msg.sender, uint256(standingBid.bidWei) + uint256(standingBid.settlementWei));

        emit StandingBidRemoved(bidId);
    }

    function adjustBidPrice(uint256 bidId, uint96 weiToAdjust, bool increase)
        external
        payable
        nonReentrant
    {
        StandingBid storage standingBid = standingBids[bidId];
        if (standingBid.bidder == address(0)) revert StandingBidNotActive();
        if (standingBid.bidder != msg.sender) revert NotBidder();

        uint96 oldBidWei = standingBid.bidWei;
        if (increase) {
            if (msg.value != weiToAdjust) revert IncorrectPayment();
            standingBid.bidWei = oldBidWei + weiToAdjust;
        } else {
            if (msg.value != 0) revert IncorrectPayment();
            if (weiToAdjust > oldBidWei) revert NegativeAdjustmentHigherThanCurrentBid();
            standingBid.bidWei = oldBidWei - weiToAdjust;
            _pushOrCredit(msg.sender, weiToAdjust);
        }

        emit StandingBidAdjusted(bidId, standingBid.bidWei);
    }

    function adjustBidSettlementPrice(uint256 bidId, uint96 weiToAdjust, bool increase)
        external
        payable
        nonReentrant
    {
        StandingBid storage standingBid = standingBids[bidId];
        if (standingBid.bidder == address(0)) revert StandingBidNotActive();
        if (standingBid.bidder != msg.sender) revert NotBidder();

        uint96 oldSettlementWei = standingBid.settlementWei;
        if (increase) {
            if (msg.value != weiToAdjust) revert IncorrectPayment();
            standingBid.settlementWei = oldSettlementWei + weiToAdjust;
        } else {
            if (msg.value != 0) revert IncorrectPayment();
            if (weiToAdjust > oldSettlementWei) revert NegativeAdjustmentHigherThanCurrentBid();
            standingBid.settlementWei = oldSettlementWei - weiToAdjust;
            _pushOrCredit(msg.sender, weiToAdjust);
        }

        emit StandingBidSettlementAdjusted(bidId, standingBid.settlementWei);
    }

    function acceptBid(uint256 bidId, uint16 punkId) external nonReentrant {
        StandingBid memory standingBid = _activeStandingBid(bidId);
        _requireBidMatchesPunk(standingBid, punkId);

        ICryptoPunksMarket market = _marketForStandard(standingBid.standard);
        (address seller, uint256 listingWei) = _requireAcceptableListing(
            market, punkId, standingBid.bidWei
        );

        delete standingBids[bidId];

        address recipient = _standingBidRecipient(standingBid);
        if (standingBid.standard == TokenStandard.CRYPTOPUNKS) {
            PUNKS.buyPunk{value: listingWei}(punkId);
            PUNKS.transferPunk(recipient, punkId);
        } else {
            PUNKS_V1.buyPunk{value: listingWei}(punkId);
            PUNKS_V1.withdraw();
            PUNKS_V1.transferPunk(recipient, punkId);
            _pushOrCredit(seller, listingWei);
        }

        _pushOrCredit(msg.sender, standingBid.settlementWei);

        uint256 excess = uint256(standingBid.bidWei) - listingWei;
        if (excess > 0) _pushOrCredit(standingBid.bidder, excess);

        emit StandingBidAccepted(
            bidId,
            standingBid.standard,
            punkId,
            seller,
            standingBid.bidder,
            recipient,
            listingWei,
            standingBid.settlementWei
        );
    }

    function acceptBidToAuction(uint256 bidId, uint16 punkId)
        external
        nonReentrant
        returns (uint256 auctionId)
    {
        StandingBid memory standingBid = _activeStandingBid(bidId);
        _requireBidMatchesPunk(standingBid, punkId);

        address tokenContract = _tokenContractForStandard(standingBid.standard);
        _maybeRequirePunkInVault(standingBid.standard, msg.sender, punkId);

        delete standingBids[bidId];
        _pushOrCredit(standingBid.bidder, standingBid.settlementWei);

        bytes32 tokenKey = _tokenKey(msg.sender, tokenContract, punkId);
        unchecked { ++sellerTokenVersion[tokenKey]; }

        auctionId = _createAuction(
            Lot({
                seller: msg.sender,
                tokenContract: tokenContract,
                tokenId: punkId,
                standard: standingBid.standard,
                reserveWei: standingBid.bidWei,
                expiresAt: uint40(block.timestamp),
                version: 0
            }),
            standingBid.bidder,
            standingBid.bidWei,
            _standingBidRecipient(standingBid)
        );

        emit StandingBidAuctionInitialised(
            bidId,
            auctionId,
            punkId,
            msg.sender,
            standingBid.bidder,
            _standingBidRecipient(standingBid),
            standingBid.bidWei
        );
    }

    function getBidFilters(uint256 bidId)
        external
        view
        returns (
            TraitFilter[] memory traitFilters,
            uint16[] memory includeIds,
            uint16[] memory excludeIds
        )
    {
        StandingBid storage standingBid = standingBids[bidId];
        return (standingBid.traitFilters, standingBid.includeIds, standingBid.excludeIds);
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

        bool delivered = _tryDeliver(auction, _auctionRecipient(auctionId, auction.latestBidder));
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

        address recipient = to == address(0) ? _auctionRecipient(auctionId, msg.sender) : to;
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
        uint96 bidWei,
        address receiver
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
        if (receiver != address(0) && receiver != bidder) {
            auctionReceivers[auctionId] = receiver;
        }

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

    function _activeStandingBid(uint256 bidId) internal view returns (StandingBid memory standingBid) {
        standingBid = standingBids[bidId];
        if (standingBid.bidder == address(0)) revert StandingBidNotActive();
    }

    function _requireBidMatchesPunk(StandingBid memory standingBid, uint16 punkId) internal view {
        uint256 len = standingBid.includeIds.length;
        if (len > 0) {
            bool included;
            for (uint256 i; i < len;) {
                if (standingBid.includeIds[i] == punkId) {
                    included = true;
                    break;
                }
                unchecked { ++i; }
            }
            if (!included) revert PunkNotIncluded();
        }

        len = standingBid.excludeIds.length;
        for (uint256 i; i < len;) {
            if (standingBid.excludeIds[i] == punkId) revert PunkExcluded();
            unchecked { ++i; }
        }

        len = standingBid.traitFilters.length;
        if (len == 0) return;
        if (address(TRAITS) == address(0)) revert TraitsUnavailable();

        for (uint256 i; i < len;) {
            TraitFilter memory filter = standingBid.traitFilters[i];
            bool hasTrait = TRAITS.hasTrait(punkId, filter.traitId);
            if (filter.required != hasTrait) revert PunkTraitMismatch();
            unchecked { ++i; }
        }
    }

    function _requireAcceptableListing(
        ICryptoPunksMarket market,
        uint16 punkId,
        uint96 bidWei
    ) internal view returns (address seller, uint256 listingWei) {
        (bool isForSale,, address listingSeller, uint256 minValue, address onlySellTo) =
            market.punksOfferedForSale(punkId);

        if (!isForSale || listingSeller == address(0) || onlySellTo != address(this)) {
            revert ListingNotValid();
        }
        if (market.punkIndexToAddress(punkId) != listingSeller) revert ListingNotValid();
        if (minValue > bidWei) revert ListingPriceTooHigh();

        return (listingSeller, minValue);
    }

    function _marketForStandard(TokenStandard standard) internal view returns (ICryptoPunksMarket) {
        if (standard == TokenStandard.CRYPTOPUNKS) return PUNKS;
        if (standard == TokenStandard.CRYPTOPUNKS_V1) return PUNKS_V1;
        revert UnsupportedStandard();
    }

    function _tokenContractForStandard(TokenStandard standard) internal view returns (address) {
        if (standard == TokenStandard.CRYPTOPUNKS) return address(PUNKS);
        if (standard == TokenStandard.CRYPTOPUNKS_V1) return address(PUNKS_V1);
        revert UnsupportedStandard();
    }

    function _standingBidRecipient(StandingBid memory standingBid) internal pure returns (address) {
        return standingBid.receiver == address(0) ? standingBid.bidder : standingBid.receiver;
    }

    function _auctionRecipient(uint256 auctionId, address bidder_) internal view returns (address) {
        address receiver = auctionReceivers[auctionId];
        return receiver == address(0) ? bidder_ : receiver;
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
