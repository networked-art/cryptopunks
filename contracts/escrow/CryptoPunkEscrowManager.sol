// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/ICryptoPunksAuctions.sol";
import "../interfaces/ICryptoPunksMarket.sol";
import "./CryptoPunksEscrow.sol";

/// @title CryptoPunkEscrowManager
/// @notice Wires canonical and V1 Punk markets to dedicated escrows.
abstract contract CryptoPunkEscrowManager {
    ICryptoPunksMarket public immutable PUNKS;
    CryptoPunksEscrow public immutable PUNKS_ESCROW;
    ICryptoPunksMarket public immutable PUNKS_V1;
    CryptoPunksEscrow public immutable PUNKS_ESCROW_V1;

    constructor(address punks, address punksV1) {
        if (punks == address(0) || punksV1 == address(0) || punks == punksV1) {
            revert ICryptoPunksAuctions.ZeroAddress();
        }

        PUNKS = ICryptoPunksMarket(punks);
        PUNKS_ESCROW = new CryptoPunksEscrow(punks, address(this));
        PUNKS_V1 = ICryptoPunksMarket(punksV1);
        PUNKS_ESCROW_V1 = new CryptoPunksEscrow(punksV1, address(this));
    }

    function _requirePunkContract(
        ICryptoPunksAuctions.TokenStandard standard,
        address tokenContract
    ) internal view {
        if (tokenContract != address(_punkMarketFor(standard))) {
            revert ICryptoPunksAuctions.PunkContractMismatch();
        }
    }

    function _maybeRequirePunkInVault(
        ICryptoPunksAuctions.TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) internal view {
        (ICryptoPunksMarket market, CryptoPunksEscrow escrow) = _punkRouteFor(standard);
        _requirePunkInSellerVault(escrow, market, seller, punkIndex);
    }

    function _punkStillInSellerVault(
        ICryptoPunksAuctions.TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) internal view returns (bool) {
        (ICryptoPunksMarket market, CryptoPunksEscrow escrow) = _punkRouteFor(standard);
        return _punkInVault(escrow, market, seller, punkIndex);
    }

    function _pullPunk(
        ICryptoPunksAuctions.TokenStandard standard,
        address tokenContract,
        address from,
        uint256 tokenId
    ) internal {
        (, CryptoPunksEscrow escrow) = _punkRouteFor(standard);
        _requirePunkContract(standard, tokenContract);
        escrow.pullFromVault(from, tokenId);
    }

    function _deliverPunk(
        ICryptoPunksAuctions.TokenStandard standard,
        address tokenContract,
        uint256 tokenId,
        address to,
        uint256 hammerWei
    ) internal {
        _requirePunkContract(standard, tokenContract);

        if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS) {
            PUNKS_ESCROW.offerToAuctions(tokenId, hammerWei);
            PUNKS.buyPunk{value: hammerWei}(tokenId);
            PUNKS_ESCROW.sweepProceeds();
            PUNKS.transferPunk(to, tokenId);
        } else if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS_V1) {
            PUNKS_ESCROW_V1.offerToAuctions(tokenId, hammerWei);
            PUNKS_V1.buyPunk{value: hammerWei}(tokenId);
            PUNKS_V1.withdraw();
            PUNKS_V1.transferPunk(to, tokenId);
        } else {
            revert ICryptoPunksAuctions.UnsupportedStandard();
        }
    }

    function _deliverPunkDirect(
        ICryptoPunksAuctions.TokenStandard standard,
        address tokenContract,
        uint256 tokenId,
        address to
    ) internal {
        (, CryptoPunksEscrow escrow) = _punkRouteFor(standard);
        _requirePunkContract(standard, tokenContract);
        escrow.transferPunkTo(tokenId, to);
    }

    function _isPunkReceiveSender(address account) internal view returns (bool) {
        return account == address(PUNKS_ESCROW) || account == address(PUNKS_V1);
    }

    function _punkMarketFor(ICryptoPunksAuctions.TokenStandard standard)
        internal
        view
        returns (ICryptoPunksMarket market)
    {
        (market,) = _punkRouteFor(standard);
    }

    function _punkRouteFor(ICryptoPunksAuctions.TokenStandard standard)
        private
        view
        returns (ICryptoPunksMarket market, CryptoPunksEscrow escrow)
    {
        if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS) {
            return (PUNKS, PUNKS_ESCROW);
        }
        if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS_V1) {
            return (PUNKS_V1, PUNKS_ESCROW_V1);
        }
        revert ICryptoPunksAuctions.UnsupportedStandard();
    }

    function _requirePunkInSellerVault(
        CryptoPunksEscrow escrow,
        ICryptoPunksMarket market,
        address seller,
        uint256 punkIndex
    ) private view {
        address vault = escrow.vaults(seller);
        if (vault == address(0) || market.punkIndexToAddress(punkIndex) != vault) {
            revert ICryptoPunksAuctions.PunkNotInVault();
        }
    }

    function _punkInVault(
        CryptoPunksEscrow escrow,
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
