// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/IPunksAuction.sol";
import "../interfaces/ICryptoPunksMarket.sol";
import "./PunksEscrow.sol";

/// @title PunksEscrowManager
/// @notice Wires canonical and V1 Punk markets to dedicated escrows.
abstract contract PunksEscrowManager {
    /// @notice Returns the canonical CryptoPunks market.
    ICryptoPunksMarket public immutable PUNKS;
    /// @notice Returns the escrow used for canonical CryptoPunks.
    PunksEscrow public immutable PUNKS_ESCROW;
    /// @notice Returns the CryptoPunks V1 market.
    ICryptoPunksMarket public immutable PUNKS_V1;
    /// @notice Returns the escrow used for CryptoPunks V1.
    PunksEscrow public immutable PUNKS_ESCROW_V1;

    /// @notice Creates escrow routes for the canonical and V1 Punk markets.
    constructor(address punks, address punksV1) {
        if (punks == address(0) || punksV1 == address(0) || punks == punksV1) {
            revert IPunksAuction.ZeroAddress();
        }

        PUNKS = ICryptoPunksMarket(punks);
        PUNKS_ESCROW = new PunksEscrow(punks, address(this));
        PUNKS_V1 = ICryptoPunksMarket(punksV1);
        PUNKS_ESCROW_V1 = new PunksEscrow(punksV1, address(this));
    }

    /// @dev Returns the Punk market contract for a Punk standard.
    function _tokenContractFor(IPunksAuction.TokenStandard standard)
        internal
        view
        returns (address)
    {
        return address(_punkMarketFor(standard));
    }

    /// @dev Reverts when a token contract does not match the selected Punk standard.
    function _requirePunkContract(
        IPunksAuction.TokenStandard standard,
        address tokenContract
    ) internal view {
        if (tokenContract != address(_punkMarketFor(standard))) {
            revert IPunksAuction.PunkContractMismatch();
        }
    }

    /// @dev Reverts when the seller does not have the Punk in the right vault.
    function _maybeRequirePunkInVault(
        IPunksAuction.TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) internal view {
        (ICryptoPunksMarket market, PunksEscrow escrow) = _punkRouteFor(standard);
        _requirePunkInSellerVault(escrow, market, seller, punkIndex);
    }

    /// @dev Checks whether the seller still has the Punk in the right vault.
    function _punkStillInSellerVault(
        IPunksAuction.TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) internal view returns (bool) {
        (ICryptoPunksMarket market, PunksEscrow escrow) = _punkRouteFor(standard);
        return _punkInVault(escrow, market, seller, punkIndex);
    }

    /// @dev Pulls a Punk from the seller vault into escrow custody.
    function _pullPunk(
        IPunksAuction.TokenStandard standard,
        address tokenContract,
        address from,
        uint256 tokenId
    ) internal {
        (, PunksEscrow escrow) = _punkRouteFor(standard);
        _requirePunkContract(standard, tokenContract);
        escrow.pullFromVault(from, tokenId);
    }

    /// @dev Completes delivery for a won Punk and handles V1 settlement rules.
    function _deliverPunk(
        IPunksAuction.TokenStandard standard,
        address tokenContract,
        uint256 tokenId,
        address to,
        uint256 hammerWei
    ) internal {
        _requirePunkContract(standard, tokenContract);

        if (standard == IPunksAuction.TokenStandard.CRYPTOPUNKS) {
            PUNKS_ESCROW.offerToAuctions(tokenId, hammerWei);
            PUNKS.buyPunk{value: hammerWei}(tokenId);
            PUNKS_ESCROW.sweepProceeds();
            PUNKS.transferPunk(to, tokenId);
        } else {
            PUNKS_ESCROW_V1.offerToAuctions(tokenId, hammerWei);
            PUNKS_V1.buyPunk{value: hammerWei}(tokenId);
            PUNKS_V1.withdraw();
            PUNKS_V1.transferPunk(to, tokenId);
        }
    }

    /// @dev Returns true for contracts allowed to send ETH to the auction house.
    function _isPunkReceiveSender(address account) internal view returns (bool) {
        return account == address(PUNKS_ESCROW) || account == address(PUNKS_V1);
    }

    /// @dev Returns the market for a Punk standard.
    function _punkMarketFor(IPunksAuction.TokenStandard standard)
        internal
        view
        returns (ICryptoPunksMarket market)
    {
        (market,) = _punkRouteFor(standard);
    }

    function _punkRouteFor(IPunksAuction.TokenStandard standard)
        private
        view
        returns (ICryptoPunksMarket market, PunksEscrow escrow)
    {
        if (standard == IPunksAuction.TokenStandard.CRYPTOPUNKS) {
            return (PUNKS, PUNKS_ESCROW);
        }
        return (PUNKS_V1, PUNKS_ESCROW_V1);
    }

    function _requirePunkInSellerVault(
        PunksEscrow escrow,
        ICryptoPunksMarket market,
        address seller,
        uint256 punkIndex
    ) private view {
        address vault = escrow.vaults(seller);
        if (vault == address(0) || market.punkIndexToAddress(punkIndex) != vault) {
            revert IPunksAuction.PunkNotInVault();
        }
    }

    function _punkInVault(
        PunksEscrow escrow,
        ICryptoPunksMarket market,
        address seller,
        uint256 punkIndex
    ) private view returns (bool) {
        address vault = escrow.vaults(seller);
        if (vault == address(0)) return false;

        try market.punkIndexToAddress(punkIndex) returns (address owner) {
            return owner == vault;
        } catch {
            return false;
        }
    }
}
