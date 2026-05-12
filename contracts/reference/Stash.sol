// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import {IAuction} from "./interfaces/IAuction.sol";
import {IWETH} from "./interfaces/IWETH.sol";
import {OrderType} from "./helpers/Enum.sol";
import {Order, PunkBid} from "./helpers/Struct.sol";
import {MerkleProofLib} from "lib/solady/src/utils/MerkleProofLib.sol";
import {SignatureCheckerLib} from "lib/solady/src/utils/SignatureCheckerLib.sol";
import {SafeTransferLib} from "lib/solady/src/utils/SafeTransferLib.sol";
import {IERC721} from "forge-std/interfaces/IERC721.sol";
import {IERC1155} from "forge-std/interfaces/IERC1155.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {ILegacyWrappedPunks} from "./interfaces/ILegacyWrappedPunks.sol";
import {ICryptoPunks721} from "./interfaces/ICryptoPunks721.sol";
import {ICryptoPunks} from "./interfaces/ICryptoPunks.sol";
import {IStashFactory} from "./interfaces/IStashFactory.sol";
import {IPunkTransferHelper} from "./interfaces/IPunkTransferHelper.sol";

/**
 * @title Stash
 * @author Yuga Labs
 * @custom:security-contact security@yugalabs.io
 * @notice A multipurpose user deployed contract.
 */
contract Stash {
    // --------------------- STASH EVENTS ---------------------

    /// @dev Emitted when an order is placed.
    event OrderPlaced(Order order);

    /// @dev Emitted when an order is updated.
    event OrderUpdated(Order originalOrder, Order updatedOrder);

    /// @dev Emitted when an order is removed, either because it was filled or the auction was finalized.
    event OrderRemoved(Order order);

    /// @dev Emitted when a punk bid is canceled.
    event PunkBidCanceled(uint256 indexed bidNonce);

    /// @dev Emitted when the Stash's global nonce is incremented, cancelling all Punk bids.
    event AllPunkBidsCanceled();

    /// @dev Emitted when a punk bid is accepted.
    event PunkBidAccepted(uint256 indexed price, uint256 indexed punkIndex);

    // --------------------- CUSTOM ERRORS ---------------------

    /// @dev The punk bid has expired.
    error BidExpired();

    /// @dev The bid either has zero units or does not include the CryptoPunks address.
    error InvalidBid();

    /// @dev The bid has been used or canceled.
    error BidCanceled();

    /// @dev The caller is not authorized to perform this action.
    error Unauthorized();

    /// @dev The order does not exist. It may have been filled, canceled, or never existed.
    error OrderNotFound();

    /// @dev The merkle proof provided does not match the CryptoPunk Bid.
    error InvalidProof();

    /// @dev The vault already has 10 orders for the given payment token.
    error TooManyOrders();

    /// @dev The order type is not supported by the Stash.
    error UnknownOrderType();

    /// @dev The Punk is either not listed for sale, or there was an error paying the caller.
    error FailedToBuyPunk();

    /// @dev This Stash does not have an active bid on the auction that is attempting to process the order.
    error NoBidForAuction();

    /// @dev The provided signature does not match the provided CryptoPunk bid.
    error InvalidSignature();

    /// @dev The caller is not a valid auction contract, as determined by the StashFactory.
    error CallerNotAuction();

    /// @dev Payment to the Stash owner failed.
    error FailedToWithdraw();

    /// @dev The Stash has already been initialized.
    error AlreadyInitialized();

    /// @dev The order is being altered in a way that is not allowed by the order type.
    error InvalidOrderAlteration();

    /// @dev An order or withdrawal is being requested for an amount that exceeds the available balance.
    error RequestExceedsAvailableBalance();

    /// @dev An auction is attempting to pull more funds than the Stash owner has approved from the Stash.
    error CannotTransferMoreThanBidAmount();

    // --------------------- MODIFIERS ---------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert CallerNotAuction();
        _;
    }

    // ----------------- CONSTANTS & IMMUTABLES -----------------

    uint256 private constant _VERSION = 1;
    bytes32 private constant _COLLECTION_BID_ROOT = bytes32(0);
    bytes32 private constant _ORDER_TYPEHASH =
        keccak256("Order(uint16 numberOfUnits,uint80 pricePerUnit,address auction)");
    bytes32 private constant _PUNK_BID_TYPEHASH = keccak256(
        "PunkBid(Order order,uint256 accountNonce,uint256 bidNonce,uint256 expiration,bytes32 root)Order(uint16 numberOfUnits,uint80 pricePerUnit,address auction)"
    );

    ICryptoPunks private immutable _CRYPTOPUNKS;
    ILegacyWrappedPunks private immutable _LEGACY_WRAPPED_PUNKS;
    ICryptoPunks721 private immutable _CRYPTOPUNKS_721;
    IWETH private immutable _WETH;
    IStashFactory private immutable _STASH_FACTORY;
    IPunkTransferHelper private immutable _PUNK_TRANSFER_HELPER;

    // -------------------- CONSTRUCTOR --------------------

    constructor(
        address stashFactory,
        address weth,
        address punks,
        address legacyWrappedPunks,
        address cryptoPunksWrapped,
        address punkTransferHelper
    ) {
        _STASH_FACTORY = IStashFactory(stashFactory);
        _WETH = IWETH(weth);
        _CRYPTOPUNKS = ICryptoPunks(punks);
        _LEGACY_WRAPPED_PUNKS = ILegacyWrappedPunks(legacyWrappedPunks);
        _CRYPTOPUNKS_721 = ICryptoPunks721(cryptoPunksWrapped);
        _PUNK_TRANSFER_HELPER = IPunkTransferHelper(punkTransferHelper);
        _initialized = true;
    }

    // --------------------- STORAGE ---------------------

    /// @dev Whether or not the contract has been initialized.
    bool private _initialized;

    /// @notice The permanent and immutable owner of the stash. Set once at initialization.
    address public owner;

    /// @notice The current nonce of the stash owner's account. Used for punk bidding, can be incremented to cancel all open bids.
    uint56 public punkAccountNonce;

    /// @notice A mapping of punk bid nonces to the number of times they can be used.
    mapping(uint256 punkBidNonce => uint256 usesRemaining) public punkBidNonceUsesRemaining;

    /// @notice A mapping of punk bid nonces to whether or not they have been used.
    mapping(uint256 punkBidNonce => bool isUsed) public usedPunkBidNonces;

    /// @notice Returns an array of all current orders for a given payment token.
    mapping(address paymentToken => Order[] orders) public paymentTokenToOrders;

    // --------------------- EXTERNAL ---------------------

    // allow receiving ETH.
    receive() external payable {}

    /**
     * @notice Initializes the contract. This is called only once upon deployment by the StashFactory.
     * @param _owner The permanent and immutable owner of the stash.
     */
    function initialize(address _owner) external {
        if (_initialized) revert AlreadyInitialized();

        owner = _owner;
        _initialized = true;
    }

    /**
     * @notice Places an order for an auction. If one exists, it will be replaced or incremented depending on the order type.
     * @param pricePerUnit The price per unit of the order.
     * @param numberOfUnits The number of units included in the order.
     * @dev The stash owner must initiate this transaction by calling the corresponding bid function on a valid auction contract.
     */
    function placeOrder(uint80 pricePerUnit, uint16 numberOfUnits) external payable {
        // Prevent unwanted bids by enforcing that the user initiated the transaction and that the caller is a registered auction.
        if (tx.origin != owner) revert Unauthorized();
        if (!_STASH_FACTORY.isAuction(msg.sender)) revert CallerNotAuction();

        (address paymentToken, OrderType orderType) = IAuction(msg.sender).bidConfig();

        uint256 paymentTokenBalance = _balanceOfToken(paymentToken);
        (uint256 lockedAmount, uint256 finalizedIndexes) = _totalLockedAndStaleBids(paymentToken);

        uint256 _availableLiquidity;
        unchecked {
            // Locked amount cannot exceed paymentTokenBalance.
            _availableLiquidity = paymentTokenBalance - lockedAmount;
        }

        _cleanStaleBids(paymentToken, finalizedIndexes);

        Order memory newOrder = Order(numberOfUnits, pricePerUnit, msg.sender);

        Order[] storage _orders = paymentTokenToOrders[paymentToken];

        for (uint256 i = 0; i < _orders.length; ++i) {
            Order storage _order = _orders[i];
            if (_order.auction == msg.sender) {
                // cache the existing order to emit an event later.
                Order memory existingOrder = _order;

                // This will check that the stash has funds to cover the order, and modify the existing order in place.
                _replaceOrIncrementExistingOrders(_order, numberOfUnits, pricePerUnit, _availableLiquidity, orderType);

                emit OrderUpdated(existingOrder, _order);

                return;
            }
        }

        if (_bidDeltaExceedsLiquidity(0, uint256(numberOfUnits) * pricePerUnit, _availableLiquidity)) {
            revert RequestExceedsAvailableBalance();
        }

        _orders.push(newOrder);

        /**
         * Limit the number of orders to 10 to prevent gas issues. Realistically, there will only ever be one order
         * per payment token at a time. This is just a safety measure.
         */
        if (_orders.length > 10) revert TooManyOrders();

        emit OrderPlaced(newOrder);
    }

    /**
     * @notice Processes an order for a given auction, transferring payment to the auction contract.
     * @param costPerUnit The cost per unit of the order.
     * @param numberOfUnits The number of units to process.
     * @dev This function is called by the auction contract, which should handle minting corresponding units
     * as part of the transaction. The order's numberOfUnits will be lowered by numberOfUnits, and the order will be
     * removed if numberOfUnits is equal to the order's numberOfUnits.
     */
    function processOrder(uint80 costPerUnit, uint16 numberOfUnits) external {
        if (!_STASH_FACTORY.isAuction(msg.sender)) revert CallerNotAuction();
        (address paymentToken,) = IAuction(msg.sender).bidConfig();

        Order[] storage _orders = paymentTokenToOrders[paymentToken];
        for (uint256 i = 0; i < _orders.length;) {
            Order storage _order = _orders[i];
            if (_order.auction == msg.sender) {
                if (costPerUnit > _order.pricePerUnit || numberOfUnits > _order.numberOfUnits) {
                    revert CannotTransferMoreThanBidAmount();
                }

                if (numberOfUnits == _order.numberOfUnits) {
                    _removeBid(paymentToken, i);
                } else {
                    // cache the existing order to emit an event later.
                    Order memory _originalOrder = _order;

                    unchecked {
                        _order.numberOfUnits -= numberOfUnits;
                    }

                    emit OrderUpdated(_originalOrder, _order);
                }

                _transferTokens(paymentToken, uint256(numberOfUnits) * costPerUnit);
                return;
            } else {
                unchecked {
                    ++i;
                }
            }
        }

        revert NoBidForAuction();
    }

    /**
     * @notice Allows selling a punk to the stash. A valid signature from the stash owner is required for successful execution.
     * @param bid The bid that was signed off-chain.
     * @param punkIndex The id of the punk to sell. Must be included in the bid's merkle tree.
     * @param signature The signed bid.
     * @param proof The merkle proof for the punkIndex.
     * @dev This function will revert if the bid is invalid, expired, or canceled. It will also revert if the bid.
     * does not contain the punkIndex in its merkle tree. If the bid is valid, the punk will be transferred to the stash.
     * owner and the bid's numberOfUnits will be decremented. If numberOfUnits is 1, the bid will be marked as used.
     */
    function processPunkBid(PunkBid calldata bid, uint256 punkIndex, bytes memory signature, bytes32[] calldata proof)
        external
    {
        uint256 availableETH = availableLiquidity(address(0));

        Order calldata order = bid.order;
        uint256 bidPrice = order.pricePerUnit;

        if (order.numberOfUnits == 0) revert InvalidBid();
        if (order.auction != address(_CRYPTOPUNKS)) revert InvalidBid();
        if (punkAccountNonce != bid.accountNonce) revert BidCanceled();
        if (usedPunkBidNonces[bid.bidNonce]) revert BidCanceled();
        if (bid.expiration > 0 && block.timestamp > bid.expiration) revert BidExpired();
        if (!_isValidSignature(bid, signature)) revert InvalidSignature();

        if (bid.root != _COLLECTION_BID_ROOT) {
            if (!MerkleProofLib.verifyCalldata(proof, bid.root, keccak256(abi.encode(punkIndex)))) {
                revert InvalidProof();
            }
        }

        // if balance is too low, we try to use owner's approved weth to supplement.
        if (bidPrice > availableETH) {
            _swapWETH(bidPrice - availableETH);
        }

        uint256 remainingUnits = punkBidNonceUsesRemaining[bid.bidNonce];

        // we have already checked if the nonce is marked as used, so if remainingUnits is 0, this is the first use.
        if (remainingUnits == 0) {
            if (order.numberOfUnits == 1) {
                usedPunkBidNonces[bid.bidNonce] = true;
            } else {
                unchecked {
                    punkBidNonceUsesRemaining[bid.bidNonce] = order.numberOfUnits - 1;
                }
            }
            // If remainingUnits is greater than 1, decrement it.
        } else if (remainingUnits > 1) {
            unchecked {
                --punkBidNonceUsesRemaining[bid.bidNonce];
            }
            // remainingUnits is 1 - this is the last use, so mark the nonce as used.
        } else {
            delete punkBidNonceUsesRemaining[bid.bidNonce];
            usedPunkBidNonces[bid.bidNonce] = true;
        }

        (bool isPunkForSaleInLegacyMarketplace,,, uint256 minValue,) = _CRYPTOPUNKS.punksOfferedForSale(punkIndex);
        uint256 amountDueToCaller;

        // if the punk is listed for sale, we can infer that it is unwrapped.
        if (isPunkForSaleInLegacyMarketplace) {
            if (minValue > bidPrice) {
                revert CannotTransferMoreThanBidAmount();
            } else if (minValue < bidPrice) {
                /**
                 * If the punk is listed under the bid, incentivize MEV fulfillment by paying the difference to the caller.
                 * We cache the value to be used after finalization to avoid reentrancy issues.
                 */
                unchecked {
                    amountDueToCaller = bidPrice - minValue;
                }
            }

            _CRYPTOPUNKS.buyPunk{value: minValue}(punkIndex);
            // If it is not listed, we can still fulfill the bid if the punk is wrapped in the legacy or 721 wrapper.
        } else {
            /**
             * If the punk is wrapped in the legacy wrapper or CryptoPunks721, we need to unwrap it. Owners of Legacy Wrapped
             * Punks or CryptoPunks721 have to approve their punks to the PunkTransferHelper. To prevent the Stash owner from
             * maliciously replacing the bid with a lower price after the wrapped punk has already been approved, while unwrapped
             * punk bids can be fulfilled by anybody, processing bids using punks that are wrapped will verify that msg.sender is
             * the owner of the punk.
             */

            address _unwrappedCryptoPunkOwner = _CRYPTOPUNKS.punkIndexToAddress(punkIndex);

            bytes32 _punkIndexAndOwnerAddressPacked;

            assembly {
                // Shift _punkIndex left by 160 bits to make room for the _assetContract
                let shiftedPunkIndex := shl(160, punkIndex)
                // Combine shifted _punkIndex with _assetContract
                _punkIndexAndOwnerAddressPacked := or(shiftedPunkIndex, caller())
            }

            if (_unwrappedCryptoPunkOwner == address(_LEGACY_WRAPPED_PUNKS)) {
                // Transfer punk to stash for unwrapping. This implicitly checks that caller is owner of wrapped punk to prevent malicious bid replacement:
                _PUNK_TRANSFER_HELPER.transferLegacyWrappedPunkToStash(_punkIndexAndOwnerAddressPacked);
                // Unwrap punk:
                _LEGACY_WRAPPED_PUNKS.burn(punkIndex);
            } else if (_unwrappedCryptoPunkOwner == address(_CRYPTOPUNKS_721)) {
                // Transfer punk to stash for unwrapping. This implicitly checks that caller is owner of wrapped punk to prevent malicious bid replacement:
                _PUNK_TRANSFER_HELPER.transfer721PunkToStash(_punkIndexAndOwnerAddressPacked);
                // Unwrap punk:
                _CRYPTOPUNKS_721.unwrapPunk(punkIndex);
            } else {
                revert FailedToBuyPunk();
            }

            // set bidPrice as amount to pay caller. Caller will always be the stash owner in this case:
            amountDueToCaller = bidPrice;
        }

        _CRYPTOPUNKS.transferPunk(owner, punkIndex);
        if (amountDueToCaller > 0) {
            (bool callerPaid,) = payable(msg.sender).call{value: amountDueToCaller}("");
            if (!callerPaid) revert FailedToBuyPunk();
        }

        emit PunkBidAccepted(bidPrice, punkIndex);
    }

    /**
     * @notice Cancels a bid.
     * @param bidNonce The nonce of the bid to cancel.
     */
    function cancelPunkBid(uint256 bidNonce) external onlyOwner {
        usedPunkBidNonces[bidNonce] = true;

        emit PunkBidCanceled(bidNonce);
    }

    /**
     * @notice increments the global account nonce, canceling all existing offchain bids.
     * @dev a very motivated stash owner could overflow their nonce, but there would be no benefit to doing so.
     */
    function cancelAllPunkBids() external onlyOwner {
        unchecked {
            ++punkAccountNonce;
        }

        emit AllPunkBidsCanceled();
    }

    // --------------------- WITHDRAWALS ---------------------

    /**
     * @notice Used by the CryptoPunks721 contract to wrap punks. Punks must be deposited to the Stash for wrapping.
     * @param punkIndex The index of the punk to wrap.
     */
    function wrapPunk(uint256 punkIndex) external {
        if (msg.sender != address(_CRYPTOPUNKS_721)) revert Unauthorized();

        _CRYPTOPUNKS.transferPunk(address(_CRYPTOPUNKS_721), punkIndex);
    }

    /**
     * @notice withdraws funds from the stash.
     * @param tokenAddress The address of the token to withdraw. Zero address for ETH.
     * @param amount The amount to withdraw in wei.
     * @dev This function allows withdrawal of funds that are not committed to an active bid. It will also
     * clean up any stale bids that have been finalized or expired.
     */
    function withdraw(address tokenAddress, uint256 amount) external onlyOwner {
        (uint256 _lockedAmount, uint256 finalizedIndexes) = _totalLockedAndStaleBids(tokenAddress);

        uint256 tokenBalance = _balanceOfToken(tokenAddress);

        uint256 availableToWithdraw = tokenBalance - _lockedAmount;
        if (amount > availableToWithdraw) revert RequestExceedsAvailableBalance();

        _cleanStaleBids(tokenAddress, finalizedIndexes);

        _transferTokens(tokenAddress, amount);
    }

    /**
     * @notice Convenience function to withdraw ERC721 tokens from the stash.
     * @param tokenAddress The address of the token to withdraw.
     * @param tokenIds An array of token IDs to withdraw.
     */
    function withdrawERC721(address tokenAddress, uint256[] calldata tokenIds) external onlyOwner {
        IERC721 tokenContract = IERC721(tokenAddress);

        for (uint256 i = 0; i < tokenIds.length; ++i) {
            tokenContract.transferFrom(address(this), owner, tokenIds[i]);
        }
    }

    /**
     * @notice Convenience function to withdraw ERC1155 tokens from the stash.
     * @param tokenAddress The address of the token to withdraw.
     * @param tokenIds An array of token IDs to withdraw.
     * @param amounts An array of amounts to withdraw.
     */
    function withdrawERC1155(address tokenAddress, uint256[] calldata tokenIds, uint256[] calldata amounts)
        external
        onlyOwner
    {
        IERC1155 tokenContract = IERC1155(tokenAddress);

        for (uint256 i = 0; i < tokenIds.length; ++i) {
            tokenContract.safeTransferFrom(address(this), owner, tokenIds[i], amounts[i], "");
        }
    }

    /**
     * @notice Convenience function to withdraw CryptoPunks from the stash.
     * @param tokenIds An array of punk IDs to withdraw.
     */
    function withdrawPunks(uint256[] calldata tokenIds) external onlyOwner {
        for (uint256 i = 0; i < tokenIds.length; ++i) {
            _CRYPTOPUNKS.transferPunk(owner, tokenIds[i]);
        }
    }

    // --------------------- VIEW ---------------------

    /**
     * @notice Fetches a bid corresponding to an auction.
     * @param auction The address of the auction to fetch a bid for.
     * @return bid The bid corresponding to the auction.
     */
    function getOrder(address auction) external view returns (Order memory) {
        (address paymentToken,) = IAuction(auction).bidConfig();
        Order[] storage _orders = paymentTokenToOrders[paymentToken];

        for (uint256 i = 0; i < _orders.length; ++i) {
            Order storage bid = _orders[i];
            if (bid.auction == auction) {
                if (!IAuction(bid.auction).finalized()) {
                    return bid;
                } else {
                    // If the auction is finalized, the bid is invalid.
                    revert OrderNotFound();
                }
            }
        }

        revert OrderNotFound();
    }

    /**
     * @notice Fetches the total amount of locked funds for a given token.
     * @param tokenAddress The address of the token to fetch the locked amount for. Zero address for ETH.
     */
    function totalLocked(address tokenAddress) external view returns (uint256 lockedAmount) {
        (lockedAmount,) = _totalLockedAndStaleBids(tokenAddress);
    }

    /**
     * @notice Fetches the total amount of available funds for a given token.
     * @param tokenAddress The address of the token to fetch the available amount for. Zero address for ETH.
     */
    function availableLiquidity(address tokenAddress) public view returns (uint256 availableAmount) {
        uint256 tokenBalance = _balanceOfToken(tokenAddress);
        (uint256 lockedAmount,) = _totalLockedAndStaleBids(tokenAddress);
        availableAmount = tokenBalance - lockedAmount;
    }

    /**
     * @notice convenience function that returns the total amount of useable ETH and WETH.
     * @return availableAmount The total amount of useable ETH and WETH.
     */
    function availableLiquidityWETHAndETH() public view returns (uint256 availableAmount) {
        uint256 wethHeldByOwner = _WETH.balanceOf(owner);
        uint256 wethApprovedByOwner = _WETH.allowance(owner, address(this));
        uint256 availableWETH = wethHeldByOwner > wethApprovedByOwner ? wethApprovedByOwner : wethHeldByOwner;

        availableAmount = availableWETH + availableLiquidity(address(_WETH)) + availableLiquidity(address(0));
    }

    /**
     * @notice Returns the current version of this particular Stash.
     * @return _VERSION The current version of this Stash.
     */
    function version() external pure returns (uint256) {
        return _VERSION;
    }

    // --------------------- ERC165 ---------------------

    function onERC1155Received(address, address, uint256, uint256, bytes memory) public virtual returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] memory, uint256[] memory, bytes memory)
        public
        virtual
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    function onERC721Received(address, address, uint256, bytes memory) public virtual returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // --------------------- INTERNAL ---------------------

    function _transferTokens(address tokenAddress, uint256 amount) internal {
        if (tokenAddress == address(0)) {
            (bool success,) = payable(msg.sender).call{value: amount}("");
            if (!success) revert FailedToWithdraw();
        } else {
            SafeTransferLib.safeTransfer(tokenAddress, msg.sender, amount);
        }
    }

    function _replaceOrIncrementExistingOrders(
        Order storage existingOrder,
        uint16 updatedNumberOfUnits,
        uint80 updatedPricePerUnit,
        uint256 _availableLiquidity,
        OrderType _type
    ) internal {
        if (_type == OrderType.UNREPLACEABLE) revert InvalidOrderAlteration();

        uint16 newTotalNumberOfUnits;

        if (_type == OrderType.SUBSEQUENT_BIDS_REPLACE_EXISTING_PRICE_INCREASE_REQUIRED) {
            if (existingOrder.pricePerUnit >= updatedPricePerUnit) {
                revert InvalidOrderAlteration();
            } else {
                // `numberOfUnits` is allowed to decrease as long as `pricePerUnit` increases.
                newTotalNumberOfUnits = updatedNumberOfUnits;
            }
        } else if (_type == OrderType.SUBSEQUENT_BIDS_OVERWRITE_PRICE_AND_ADD_UNITS) {
            newTotalNumberOfUnits = existingOrder.numberOfUnits + updatedNumberOfUnits;
        } else {
            revert UnknownOrderType();
        }

        if (
            _bidDeltaExceedsLiquidity(
                uint256(existingOrder.numberOfUnits) * existingOrder.pricePerUnit,
                uint256(newTotalNumberOfUnits) * updatedPricePerUnit,
                _availableLiquidity
            )
        ) revert RequestExceedsAvailableBalance();

        existingOrder.numberOfUnits = newTotalNumberOfUnits;
        existingOrder.pricePerUnit = updatedPricePerUnit;
    }

    // internal helpers
    function _swapWETH(uint256 wethAmount) internal {
        uint256 availableBalance = availableLiquidity(address(_WETH));

        // if existing balance is high enough just withdraw it and return early.
        if (availableBalance >= wethAmount) {
            _WETH.withdraw(wethAmount);
            return;
        }

        uint256 amountToTransfer = wethAmount;
        // if existing balance is not high enough but greater than 0, decrement the amount needed by the existing balance.
        if (availableBalance > 0 && availableBalance < wethAmount) {
            unchecked {
                amountToTransfer -= availableBalance;
            }
        }
        _WETH.transferFrom(owner, address(this), amountToTransfer);
        _WETH.withdraw(wethAmount);
    }

    // --------------------- INTERNAL VIEW ---------------------

    function _isValidSignature(PunkBid calldata bid, bytes memory signature) internal view returns (bool) {
        Order calldata order = bid.order;

        bytes32 hashStruct = keccak256(
            abi.encode(
                _PUNK_BID_TYPEHASH,
                keccak256(abi.encode(_ORDER_TYPEHASH, order.numberOfUnits, order.pricePerUnit, order.auction)),
                bid.accountNonce,
                bid.bidNonce,
                bid.expiration,
                bid.root
            )
        );

        bytes32 _domainHash = keccak256(
            abi.encode(
                keccak256("EIP712Domain(uint256 chainId,address verifyingContract)"), block.chainid, address(this)
            )
        );
        bytes32 hash = keccak256(abi.encodePacked("\x19\x01", _domainHash, hashStruct));

        // This lib does not include a malleability check, however, the bidNonce will prevent signature reuse.
        return SignatureCheckerLib.isValidSignatureNow(owner, hash, signature);
    }

    function _totalAmountBid(Order storage _order) internal view returns (uint256) {
        return uint256(_order.numberOfUnits) * _order.pricePerUnit;
    }

    function _balanceOfToken(address tokenAddress) internal view returns (uint256) {
        if (tokenAddress == address(0)) {
            return address(this).balance;
        } else {
            return IERC20(tokenAddress).balanceOf(address(this));
        }
    }

    function _totalLockedAndStaleBids(address tokenAddress)
        internal
        view
        returns (uint256 _lockedAmount, uint256 finalizedIndexes)
    {
        Order[] storage _orders = paymentTokenToOrders[tokenAddress];

        for (uint256 i = 0; i < _orders.length; ++i) {
            Order storage order = _orders[i];
            IAuction auction = IAuction(order.auction);

            if (auction.finalized()) {
                finalizedIndexes = finalizedIndexes | (1 << i);
            } else {
                (address paymentToken,) = auction.bidConfig();
                if (tokenAddress == paymentToken) {
                    unchecked {
                        _lockedAmount += _totalAmountBid(order);
                    }
                }
            }
        }
    }

    function _cleanStaleBids(address tokenAddress, uint256 finalizedIndexes) internal {
        Order[] storage _orders = paymentTokenToOrders[tokenAddress];

        // If there are no bids to process, exit early.
        if (_orders.length == 0) return;

        // Otherwise, use a while loop to iterate and clean up stale bids.
        uint256 i = _orders.length;

        while (i > 0) {
            unchecked {
                --i;
            }
            if ((finalizedIndexes & (1 << i)) != 0) {
                _removeBid(tokenAddress, i);
                // If the last bid is removed, break out of the loop.
                if (_orders.length == 0) break;
            }
        }
    }

    function _removeBid(address _key, uint256 _bidIndex) internal {
        Order[] storage _orders = paymentTokenToOrders[_key];
        Order memory orderToRemove = _orders[_bidIndex];

        if (_bidIndex != _orders.length - 1) {
            _orders[_bidIndex] = _orders[_orders.length - 1];
        }
        _orders.pop();

        emit OrderRemoved(orderToRemove);
    }

    function _bidDeltaExceedsLiquidity(uint256 existingTotal, uint256 newTotal, uint256 _availableLiquidity)
        internal
        pure
        returns (bool)
    {
        if (newTotal > existingTotal && newTotal - existingTotal > _availableLiquidity) {
            return true;
        }

        return false;
    }
}
