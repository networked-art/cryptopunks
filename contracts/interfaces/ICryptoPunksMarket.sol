// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice The subset of CryptoPunksMarket used by the auction house.
interface ICryptoPunksMarket {
    struct Offer {
        bool    isForSale;
        uint256 punkIndex;
        address seller;
        uint256 minValue;
        address onlySellTo;
    }

    function punksOfferedForSale(uint256 punkIndex) external view returns (
        bool    isForSale,
        uint256 punkIndex_,
        address seller,
        uint256 minValue,
        address onlySellTo
    );

    function punkIndexToAddress(uint256 punkIndex) external view returns (address);

    function offerPunkForSaleToAddress(uint256 punkIndex, uint256 minSalePriceInWei, address toAddress) external;

    function punkNoLongerForSale(uint256 punkIndex) external;

    function buyPunk(uint256 punkIndex) external payable;

    function transferPunk(address to, uint256 punkIndex) external;

    function withdraw() external;
}
