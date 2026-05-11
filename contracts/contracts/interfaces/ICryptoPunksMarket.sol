// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice The subset of CryptoPunksMarket used by the auction house.
interface ICryptoPunksMarket {
    struct Offer {
        bool isForSale;
        uint256 punkIndex;
        address seller;
        uint256 minValue;
        address onlySellTo;
    }

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

    /// @notice Accepts the standing bid for a Punk at >= minPrice.
    function acceptBidForPunk(uint256 punkIndex, uint256 minPrice) external;

    /// @notice Withdraws pending ETH from the Punk market.
    function withdraw() external;
}
