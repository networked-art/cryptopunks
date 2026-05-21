// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/IPunksAuction.sol";
import "../interfaces/IPunksVaultFactory.sol";

interface IAuctionWithdraw {
    function withdraw() external;
}

contract ToggleEtherReceiver {
    bool public rejectEther;

    receive() external payable {
        if (rejectEther) revert("reject ether");
    }

    function setRejectEther(bool reject) external {
        rejectEther = reject;
    }

    function openAuction(address auction, uint256 lotId, uint96 expectedReserveWei)
        external
        payable
        returns (uint256)
    {
        return IPunksAuction(auction).openAuction{value: msg.value}(
            lotId,
            expectedReserveWei
        );
    }

    function bid(address auction, uint256 auctionId) external payable {
        IPunksAuction(auction).bid{value: msg.value}(auctionId);
    }

    function withdrawCredit(address auction) external {
        IAuctionWithdraw(auction).withdraw();
    }
}

/// @notice Adversarial seller/bidder used to exercise the auction's
///         push/pull refund fallback and its reentrancy guard. It can act
///         as a lot seller (deploying its own vault) or as an auction
///         bidder, and on every inbound ETH transfer it can optionally
///         reject the funds and/or attempt to reenter the auction.
contract AuctionBot {
    IPunksAuction public immutable AUCTION;

    /// @notice When true, every inbound ETH transfer reverts.
    bool public rejectEther;

    /// @notice Reentry mode triggered on `receive`: 0 = none, 1 = settle,
    ///         2 = bid.
    uint8 public reentryMode;
    /// @notice Auction id the reentry attempt targets.
    uint256 public reentryAuctionId;
    /// @notice True once a reentry attempt has fired.
    bool public reentryObserved;
    /// @notice True when the most recent reentry attempt reverted.
    bool public reentryReverted;

    constructor(address auction) {
        AUCTION = IPunksAuction(auction);
    }

    function setRejectEther(bool reject) external {
        rejectEther = reject;
    }

    function armReentry(uint8 mode, uint256 auctionId) external {
        reentryMode = mode;
        reentryAuctionId = auctionId;
    }

    function ensureVault(address factory, address[] calldata operators) external {
        IPunksVaultFactory(factory).ensureMyVault(operators);
    }

    function createLot(
        IPunksAuction.LotItem[] calldata items,
        uint96 reserveWei,
        address onlySellTo
    ) external returns (uint256) {
        return AUCTION.createLot(items, reserveWei, onlySellTo);
    }

    function openAuction(uint256 lotId, uint96 expectedReserveWei)
        external
        payable
        returns (uint256)
    {
        return AUCTION.openAuction{value: msg.value}(lotId, expectedReserveWei);
    }

    function bid(uint256 auctionId) external payable {
        AUCTION.bid{value: msg.value}(auctionId);
    }

    function withdrawCredit() external {
        IAuctionWithdraw(address(AUCTION)).withdraw();
    }

    receive() external payable {
        uint8 mode = reentryMode;
        if (mode != 0) {
            reentryObserved = true;
            bool ok;
            if (mode == 1) {
                (ok,) = address(AUCTION).call(
                    abi.encodeWithSignature("settle(uint256)", reentryAuctionId)
                );
            } else {
                (ok,) = address(AUCTION).call(
                    abi.encodeWithSignature("bid(uint256)", reentryAuctionId)
                );
            }
            reentryReverted = !ok;
        }
        if (rejectEther) revert("reject ether");
    }
}
