// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/IPunksAuction.sol";
import "../interfaces/ICryptoPunksMarket.sol";
import "./PunksEscrow.sol";

/// @title PunksEscrowManager
/// @notice Custody surface used by the auction house: one escrow, two markets.
/// @dev    The escrow holds the per-user vaults and brokers every Punk move
///         between vault custody, escrow custody, and final recipients.
abstract contract PunksEscrowManager {
    /// @notice Returns the canonical CryptoPunks market.
    ICryptoPunksMarket public immutable PUNKS;
    /// @notice Returns the CryptoPunks V1 market.
    ICryptoPunksMarket public immutable PUNKS_V1;
    /// @notice Returns the unified escrow shared by both Punk standards.
    PunksEscrow public immutable PUNKS_ESCROW;

    /// @notice Wires the manager to both Punk markets and instantiates the escrow.
    constructor(address punks, address punksV1) {
        if (punks == address(0) || punksV1 == address(0) || punks == punksV1) {
            revert IPunksAuction.ZeroAddress();
        }

        PUNKS = ICryptoPunksMarket(punks);
        PUNKS_V1 = ICryptoPunksMarket(punksV1);
        PUNKS_ESCROW = new PunksEscrow(punks, punksV1, address(this));
    }

    /// @dev Registers the seller's vault if missing — idempotent and free for repeats.
    function _ensureSellerVault(address seller) internal {
        PUNKS_ESCROW.ensureVault(seller);
    }

    /// @dev Returns the Punk market contract for a standard.
    function _tokenContractFor(IPunksAuction.TokenStandard standard)
        internal
        view
        returns (address)
    {
        return address(_marketFor(standard));
    }

    /// @dev Reverts when the seller's vault does not currently hold the Punk.
    function _requirePunkInVault(
        IPunksAuction.TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) internal view {
        ICryptoPunksMarket market = _marketFor(standard);
        address vault = PUNKS_ESCROW.vaults(seller);
        if (vault == address(0) || market.punkIndexToAddress(punkIndex) != vault) {
            revert IPunksAuction.PunkNotInVault();
        }
    }

    /// @dev Returns true when the seller's vault still holds the Punk.
    function _punkStillInSellerVault(
        IPunksAuction.TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) internal view returns (bool) {
        address vault = PUNKS_ESCROW.vaults(seller);
        if (vault == address(0)) return false;

        try _marketFor(standard).punkIndexToAddress(punkIndex) returns (address owner) {
            return owner == vault;
        } catch {
            return false;
        }
    }

    /// @dev Pulls a Punk from the seller's vault into escrow custody.
    function _pullPunk(
        IPunksAuction.TokenStandard standard,
        address from,
        uint256 punkIndex
    ) internal {
        PUNKS_ESCROW.pullFromVault(standard, from, punkIndex);
    }

    /// @dev Delivers a Punk to the winner, recording the hammer price as a
    ///      market sale event. Canonical proceeds are swept from the escrow;
    ///      V1 settles directly to this contract via the V1 market's withdraw().
    function _deliverPunk(
        IPunksAuction.TokenStandard standard,
        uint256 punkIndex,
        address to,
        uint256 hammerWei
    ) internal {
        PUNKS_ESCROW.offerToAuctions(standard, punkIndex, hammerWei);

        if (standard == IPunksAuction.TokenStandard.CRYPTOPUNKS) {
            PUNKS.buyPunk{value: hammerWei}(punkIndex);
            PUNKS_ESCROW.sweepProceeds();
            PUNKS.transferPunk(to, punkIndex);
        } else {
            PUNKS_V1.buyPunk{value: hammerWei}(punkIndex);
            PUNKS_V1.withdraw();
            PUNKS_V1.transferPunk(to, punkIndex);
        }
    }

    /// @dev Returns true for contracts allowed to fund the auction house's `receive`.
    function _isPunkReceiveSender(address account) internal view returns (bool) {
        return account == address(PUNKS_ESCROW) || account == address(PUNKS_V1);
    }

    /// @dev Resolves the Punk market for a standard.
    function _marketFor(IPunksAuction.TokenStandard standard)
        internal
        view
        returns (ICryptoPunksMarket)
    {
        return standard == IPunksAuction.TokenStandard.CRYPTOPUNKS ? PUNKS : PUNKS_V1;
    }
}
