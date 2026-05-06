// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/ICryptoPunksAuctions.sol";
import "../interfaces/ICryptoPunksMarket.sol";

/// @title PunkVault
/// @notice Per-user Punk custody box cloned by CryptoPunksEscrow.
contract PunkVault {
    address public immutable OWNER;
    ICryptoPunksMarket public immutable PUNKS;

    error NotOwner();

    constructor(address owner_, address punks_) {
        if (owner_ == address(0) || punks_ == address(0)) revert ICryptoPunksAuctions.ZeroAddress();
        OWNER = owner_;
        PUNKS = ICryptoPunksMarket(punks_);
    }

    function transfer(uint256 punkIndex, address to) external {
        if (msg.sender != OWNER) revert NotOwner();
        PUNKS.transferPunk(to, punkIndex);
    }
}
