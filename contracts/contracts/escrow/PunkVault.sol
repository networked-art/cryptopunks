// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/IPunksAuction.sol";
import "../interfaces/ICryptoPunksMarket.sol";

/// @title PunkVault
/// @notice Per-user Punk custody box cloned by PunksEscrow.
/// @dev    Market-agnostic by design: the escrow names the market on every call,
///         which lets one vault hold canonical and V1 Punks at the same address.
contract PunkVault {
    /// @notice Returns the escrow that owns this vault.
    address public immutable OWNER;

    error NotOwner();

    /// @notice Creates a vault owned by one escrow.
    constructor(address owner_) {
        if (owner_ == address(0)) revert IPunksAuction.ZeroAddress();
        OWNER = owner_;
    }

    /// @notice Transfers a Punk on the named market as requested by the escrow.
    function transfer(address market, uint256 punkIndex, address to) external {
        if (msg.sender != OWNER) revert NotOwner();
        ICryptoPunksMarket(market).transferPunk(to, punkIndex);
    }
}
