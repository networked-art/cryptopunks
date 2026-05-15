// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  ICryptoPunksMarket
///
/// @notice Minimal surface of the original CryptoPunksMarket contract used by
///         vaults, auctions, and bid books in this repo.
interface ICryptoPunksMarket {
    /// @notice Active sell offer tuple from the original CryptoPunksMarket.
    struct Offer {
        bool isForSale;
        uint256 punkIndex;
        address seller;
        uint256 minValue;
        address onlySellTo;
    }

    // ─────────────────────────────────── Sales ──────────────────────────────────

    /// @notice Returns sale details for a Punk.
    function punksOfferedForSale(uint256 punkIndex)
        external
        view
        returns (
            bool isForSale,
            uint256 punkIndex_,
            address seller,
            uint256 minValue,
            address onlySellTo
        );

    /// @notice Returns the owner of a Punk.
    function punkIndexToAddress(uint256 punkIndex) external view returns (address);

    /// @notice Offers a Punk for public sale.
    function offerPunkForSale(uint256 punkIndex, uint256 minSalePriceInWei) external;

    /// @notice Offers a Punk for sale to one address.
    function offerPunkForSaleToAddress(
        uint256 punkIndex,
        uint256 minSalePriceInWei,
        address toAddress
    ) external;

    /// @notice Removes a Punk sale offer.
    function punkNoLongerForSale(uint256 punkIndex) external;

    /// @notice Buys a Punk that is offered for sale.
    function buyPunk(uint256 punkIndex) external payable;

    /// @notice Transfers a Punk to another address.
    function transferPunk(address to, uint256 punkIndex) external;

    // ─────────────────────────────────── Bids ───────────────────────────────────

    /// @notice Places a bid on a Punk. The market locks `msg.value` and
    ///         refunds any previously outbid bidder via `pendingWithdrawals`.
    function enterBidForPunk(uint256 punkIndex) external payable;

    /// @notice Withdraws the caller's standing bid on a Punk, returning the
    ///         locked ETH to the caller.
    function withdrawBidForPunk(uint256 punkIndex) external;

    /// @notice Accepts the standing bid for a Punk at >= minPrice.
    function acceptBidForPunk(uint256 punkIndex, uint256 minPrice) external;

    // ───────────────────────────────── Proceeds ─────────────────────────────────

    /// @notice Withdraws pending ETH from the Punk market.
    function withdraw() external;

    /// @notice ETH owed to `claimant` and awaiting withdrawal.
    function pendingWithdrawals(address claimant) external view returns (uint256);
}
