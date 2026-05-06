// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/ICryptoPunksAuctions.sol";
import "../interfaces/ICryptoPunksMarket.sol";
import "./CryptoPunksEscrow.sol";

/// @title CryptoPunkEscrowManager
/// @notice Wires canonical and V1 Punk markets to dedicated escrows.
abstract contract CryptoPunkEscrowManager {
    ICryptoPunksMarket public immutable PUNKS;
    CryptoPunksEscrow  public immutable PUNKS_ESCROW;
    ICryptoPunksMarket public immutable PUNKS_V1;
    CryptoPunksEscrow  public immutable PUNKS_ESCROW_V1;

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
        if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS) {
            if (tokenContract != address(PUNKS)) revert ICryptoPunksAuctions.PunkContractMismatch();
        } else if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS_V1) {
            if (tokenContract != address(PUNKS_V1)) revert ICryptoPunksAuctions.PunkContractMismatch();
        }
    }

    function _maybeRequirePunkInVault(
        ICryptoPunksAuctions.TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) internal view {
        if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS) {
            _requirePunkInSellerVault(PUNKS_ESCROW, PUNKS, seller, punkIndex);
        } else if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS_V1) {
            _requirePunkInSellerVault(PUNKS_ESCROW_V1, PUNKS_V1, seller, punkIndex);
        }
    }

    function _punkStillInSellerVault(
        ICryptoPunksAuctions.TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) internal view returns (bool) {
        if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS) {
            return _punkInVault(PUNKS_ESCROW, PUNKS, seller, punkIndex);
        }
        if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS_V1) {
            return _punkInVault(PUNKS_ESCROW_V1, PUNKS_V1, seller, punkIndex);
        }
        revert ICryptoPunksAuctions.UnsupportedStandard();
    }

    function _pullPunk(
        ICryptoPunksAuctions.TokenStandard standard,
        address tokenContract,
        address from,
        uint256 tokenId
    ) internal {
        if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS) {
            if (tokenContract != address(PUNKS)) revert ICryptoPunksAuctions.PunkContractMismatch();
            PUNKS_ESCROW.pullFromVault(from, tokenId);
        } else if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS_V1) {
            if (tokenContract != address(PUNKS_V1)) revert ICryptoPunksAuctions.PunkContractMismatch();
            PUNKS_ESCROW_V1.pullFromVault(from, tokenId);
        } else {
            revert ICryptoPunksAuctions.UnsupportedStandard();
        }
    }

    function _deliverPunk(
        ICryptoPunksAuctions.TokenStandard standard,
        address tokenContract,
        uint256 tokenId,
        address to,
        uint256 hammerWei
    ) internal {
        if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS) {
            if (tokenContract != address(PUNKS)) revert ICryptoPunksAuctions.PunkContractMismatch();
            PUNKS_ESCROW.offerToAuctions(tokenId, hammerWei);
            PUNKS.buyPunk{value: hammerWei}(tokenId);
            PUNKS_ESCROW.sweepProceeds();
            PUNKS.transferPunk(to, tokenId);
        } else if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS_V1) {
            if (tokenContract != address(PUNKS_V1)) revert ICryptoPunksAuctions.PunkContractMismatch();
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
        _requirePunkContract(standard, tokenContract);

        if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS) {
            PUNKS_ESCROW.transferPunkTo(tokenId, to);
        } else if (standard == ICryptoPunksAuctions.TokenStandard.CRYPTOPUNKS_V1) {
            PUNKS_ESCROW_V1.transferPunkTo(tokenId, to);
        } else {
            revert ICryptoPunksAuctions.UnsupportedStandard();
        }
    }

    function _isPunkReceiveSender(address account) internal view returns (bool) {
        return account == address(PUNKS_ESCROW) || account == address(PUNKS_V1);
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
