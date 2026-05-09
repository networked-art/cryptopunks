// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  IPunksMarket
/// @notice Minimal read surface of the original CryptoPunksMarket contract
///         deployed at `0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb`. Only the
///         public mapping getters required by `PunksRenderer.backgroundOf` are
///         declared here.
interface IPunksMarket {
    /// @notice Owner mapping: `punkIndexToAddress[punkId]` → owner.
    function punkIndexToAddress(uint256 punkId) external view returns (address);

    /// @notice Active sell offer for a Punk. Tuple matches the contract's
    ///         `Offer` struct: `(isForSale, punkIndex, seller, minValue, onlySellTo)`.
    function punksOfferedForSale(uint256 punkId)
        external
        view
        returns (
            bool isForSale,
            uint256 punkIndex,
            address seller,
            uint256 minValue,
            address onlySellTo
        );

    /// @notice Active bid for a Punk. Tuple matches the contract's `Bid`
    ///         struct: `(hasBid, punkIndex, bidder, value)`.
    function punkBids(uint256 punkId)
        external
        view
        returns (bool hasBid, uint256 punkIndex, address bidder, uint256 value);
}
