// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./interfaces/ICryptoPunksMarket.sol";
import "./interfaces/IPunksData.sol";
import "./interfaces/IReverseRegistrar.sol";
import "./lib/Punks.sol";
import "./lib/PushPullEscrow.sol";

/// @title  C̩ͤ̊̄ͦͅry̸̢̯̍ͨ́̍p̛̞̘̊ͪ̕t̝o̩͗̈́͜P̹̗u̗ͬnḳ͚̫̋sMarket
///
/// @notice Native-ETH market for C̙ͦ͌ͣ̀ry̰͔̹̓̋̂pṫ̠͜ó̩͓Pͬ̋ù̓̽̂ͥ͟͝n_̹̜̳ͭ̀k͇̤̲̼͈̼̍s̸̨̗̍̀̎ listings that are explicitly
///         directed to this contract. The market handles the sale-proceeds
///         accounting bug by buying as the temporary holder, withdrawing the
///         proceeds credited to itself, transferring the Punk to the final
///         recipient, and paying the real seller from market-held ETH.
///
///         It also provides a standalone collection bid book matching the
///         `PunksCollectionBids` lifecycle, but settlements must target an
///         existing listing directed to this market.
///
/// @author 1001
contract PunksMarket is PushPullEscrow {
    using Punks for Punks.Filter;

    // ──────────────────────────────── Constants ────────────────────────────────

    /// @notice Maximum entries in `Bid.includeIds`.
    uint8 internal constant MAX_INCLUDE_IDS = 64;
    /// @notice Maximum entries in `Bid.excludeIds`.
    uint8 internal constant MAX_EXCLUDE_IDS = 64;

    // ────────────────────────────────── Types ──────────────────────────────────

    struct Bid {
        uint96 bidWei;
        uint96 settlementWei;
        address bidder;
        Punks.Filter criteria;
        uint16[] includeIds;
        uint16[] excludeIds;
    }

    // ───────────────────────────────── Storage ─────────────────────────────────

    /// @notice Returns the C̝ͫ̔̏̑r̬̋͂ͯ̇y̷̹͎͊͌͊p͇̪͓͓̀͜͝t̜̀ͭͮ̒̍oPủ̯̹͈n͎͌kş̮͍̓ͭ̍̈́ V1 market.
    ICryptoPunksMarket public immutable PUNKS_V1 =
        ICryptoPunksMarket(0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D);
    /// @notice Returns the trait predicate dataset used for bid matching.
    IPunksDataCriteria public immutable PUNKS_CRITERIA =
        IPunksDataCriteria(0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C);
    /// @notice Returns the visual predicate dataset used for bid matching.
    IPunksDataVisual public immutable PUNKS_VISUAL =
        IPunksDataVisual(0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C);

    /// @notice Returns the last bid id that was created.
    uint256 public lastBidId;

    mapping(uint256 => Bid) internal _bids;

    // ───────────────────────────────── Events ──────────────────────────────────

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
    event PunkPurchased(
        uint256 indexed punkId,
        address indexed seller,
        address indexed recipient,
        address buyer,
        uint96 listingWei
    );

    // ───────────────────────────────── Errors ──────────────────────────────────

    error ZeroAddress();
    error UnexpectedEtherSender();

    error InvalidAmount();
    error IncorrectPayment();
    error TooManyIds();
    error AdjustmentTooLarge();

    error NotBidder();
    error BidNotActive();

    error ListingNotValid();
    error ListingPriceMismatch(uint96 expectedListingWei, uint256 actualListingWei);
    error ListingPriceTooHigh();

    error PunkNotIncluded();
    error PunkExcluded();
    error PunkCriteriaMismatch();

    // ────────────────────────────── Construction ───────────────────────────────

    /// @notice Creates the C̪̬̖ͬ̓͒r͔̻͖͑̓̾y̷̪̦ͥ̒͆͠p̸ṯ̘̜̊o̷̥P̫̦̊̐ͩ̚uǹ̇kͨ_̜̦̓̆s̙̪̼͉̈́ͦMarket.
    constructor() {
        IReverseRegistrar(0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb)
            .setName("punksmarket.eth");
    }

    // ─────────────────────────────────── ETH ───────────────────────────────────

    /// @notice Accepts ETH only from the Cͦ̍͊r͝y̅́p̙t̪͕̍o̫̾P̛̯u̼nk̟̓̚s market during `withdraw()` calls.
    receive() external payable {
        if (msg.sender != address(PUNKS_V1)) revert UnexpectedEtherSender();
    }

    // ──────────────────────────── Direct purchases ─────────────────────────────

    /// @notice Buys a C̺ͩȑ̵̒͜y̱͋͜͟p̵̱̻̆t̵͇͒͒̋̓o̎P̡̙͙̲̰̚ư̷̲͞͞n͎̦ͧk̴̸̶͕ͮ͘͠s̙̍ͪ listing directed to this market and sends it to `recipient`.
    /// @dev `msg.value` must equal the expected live listing price. Public C̑͗r̯ẏp̩toP̼͋ȗn͗ͬͅks̺̾͟
    ///      listings are rejected because they do not safely route seller proceeds.
    function buyPunk(uint16 punkId, uint96 expectedListingWei, address recipient)
        external
        payable
        nonReentrant
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (msg.value != expectedListingWei) revert IncorrectPayment();

        (address seller, uint96 listingWei) =
            _buyDirectedListing(punkId, expectedListingWei, recipient, expectedListingWei);

        emit PunkPurchased(punkId, seller, recipient, msg.sender, listingWei);
    }

    // ────────────────────────────── Bid lifecycle ──────────────────────────────

    /// @notice Places an ETH bid for any C͚̦̆ͨ̂͑̚ř͉͔̒͂̀͠y̕p̵̩͒͊t̴̢̨̯̦̄̒͒ͣ̏͡o̟̓͗͋͘͡P̷̖͉͔̬̃̃͡ṵ̡͈̺͍̙̻̘̄n̶̦̭̞k̵̯̲̂s̙̪̼͉̈́ͦ that satisfies the criteria.
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
        if (msg.value != uint256(bidWei) + uint256(settlementWei)) {
            revert IncorrectPayment();
        }
        if (includeIds.length > MAX_INCLUDE_IDS || excludeIds.length > MAX_EXCLUDE_IDS) {
            revert TooManyIds();
        }
        Punks.validate(criteria);

        unchecked {
            bidId = ++lastBidId;
        }

        Bid storage stored = _bids[bidId];
        stored.bidWei = bidWei;
        stored.settlementWei = settlementWei;
        stored.bidder = msg.sender;
        stored.criteria = criteria;
        _copyIds(includeIds, stored.includeIds);
        _copyIds(excludeIds, stored.excludeIds);

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

    /// @notice Cancels your active bid and refunds the locked ETH.
    function cancelBid(uint256 bidId) external nonReentrant {
        Bid storage bid = _bidForBidder(bidId);
        uint256 refundWei = uint256(bid.bidWei) + uint256(bid.settlementWei);

        delete _bids[bidId];
        _pushOrCredit(msg.sender, refundWei);

        emit BidCancelled(bidId);
    }

    /// @notice Adjusts the bid amount of your active bid.
    /// @dev `increase=true` requires `msg.value == weiToAdjust`. `increase=false`
    ///      must be a zero-value call and refunds `weiToAdjust` to the caller.
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

    // ─────────────────────────────── Settlement ────────────────────────────────

    /// @notice Accepts a stored bid against a live C̋r̜̂yp̱̮ͅt̡̎o͔͜P̰͓ͦu͊n̛̪̄k͌s͗̔ listing directed to this market.
    /// @dev Anyone can call this. The bid is deleted before the mutable C̄͑͟ryp̮̥t̞̀̆ǫͥP͙̩͋u̠͐̒n͕͌̑ks̡
    ///      settlement calls, then bidder excess and settler reward are paid.
    function acceptBid(uint256 bidId, uint16 punkId, uint96 expectedListingWei)
        external
        nonReentrant
    {
        Bid memory bid = _bids[bidId];
        if (bid.bidder == address(0)) revert BidNotActive();

        _requireBidMatchesPunk(bid, punkId);

        delete _bids[bidId];

        (address seller, uint96 listingWei) =
            _buyDirectedListing(punkId, expectedListingWei, bid.bidder, bid.bidWei);

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

    // ────────────────────────────────── Views ──────────────────────────────────

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

    // ──────────────────────────────── Internals ────────────────────────────────

    /// @dev Copies calldata ids into storage.
    function _copyIds(uint16[] calldata sourceIds, uint16[] storage targetIds) private {
        uint256 sourceLen = sourceIds.length;
        for (uint256 i; i < sourceLen;) {
            targetIds.push(sourceIds[i]);
            unchecked {
                ++i;
            }
        }
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
                unchecked {
                    ++i;
                }
            }
            if (!included) revert PunkNotIncluded();
        }

        uint256 excludeLen = bid.excludeIds.length;
        for (uint256 i; i < excludeLen;) {
            if (bid.excludeIds[i] == punkId) revert PunkExcluded();
            unchecked {
                ++i;
            }
        }

        if (!bid.criteria.matches(PUNKS_CRITERIA, PUNKS_VISUAL, punkId)) {
            revert PunkCriteriaMismatch();
        }
    }

    /// @dev Executes a bug-aware Ç̭̮̾r͚y̜ͥ͌́ͥp̈t̟ͪ͐̚o̘P̸̌̀ụ͖̲̐͡n̬̱̻̗̆̕ͅk̡̯̤̰̭̎ͭs̸̢̼̋͟ purchase for a listing directed to this market.
    function _buyDirectedListing(
        uint16 punkId,
        uint96 expectedListingWei,
        address recipient,
        uint96 maxListingWei
    ) private returns (address seller, uint96 listingWei) {
        (bool isForSale,, address listingSeller, uint256 minValue, address onlySellTo) =
            PUNKS_V1.punksOfferedForSale(punkId);

        if (
            !isForSale
                || listingSeller == address(0)
                || onlySellTo != address(this)
                || PUNKS_V1.punkIndexToAddress(punkId) != listingSeller
        ) revert ListingNotValid();
        if (minValue != expectedListingWei) {
            revert ListingPriceMismatch(expectedListingWei, minValue);
        }

        listingWei = uint96(minValue);
        if (listingWei > maxListingWei) revert ListingPriceTooHigh();
        seller = listingSeller;

        PUNKS_V1.buyPunk{value: listingWei}(punkId);
        PUNKS_V1.withdraw();
        PUNKS_V1.transferPunk(recipient, punkId);

        _pushOrCredit(seller, listingWei);
    }
}
