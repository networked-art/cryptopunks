// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/IPunksAuction.sol";
import "../interfaces/ICryptoPunksMarket.sol";

/// @title PunkVault
/// @notice Per-user Punk custody box cloned by PunksEscrow.
contract PunkVault {
    /// @notice Returns the escrow that owns this vault.
    address public immutable OWNER;
    /// @notice Returns the Punk market used by this vault.
    ICryptoPunksMarket public immutable PUNKS;

    error NotOwner();

    /// @notice Creates a vault for one Punk market.
    constructor(address owner_, address punks_) {
        if (owner_ == address(0) || punks_ == address(0)) {
            revert IPunksAuction.ZeroAddress();
        }
        OWNER = owner_;
        PUNKS = ICryptoPunksMarket(punks_);
    }

    /// @notice Transfers a Punk as requested by the escrow.
    function transfer(uint256 punkIndex, address to) external {
        if (msg.sender != OWNER) revert NotOwner();
        PUNKS.transferPunk(to, punkIndex);
    }
}
