// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "@openzeppelin/contracts/proxy/Clones.sol";

import "../interfaces/IPunksAuction.sol";
import "../interfaces/ICryptoPunksMarket.sol";
import "../lib/PushPullEscrow.sol";
import "./PunkVault.sol";

/// @title PunksEscrow
/// @notice Custody intermediary for one CryptoPunks market.
contract PunksEscrow {
    /// @notice Returns the Punk market used by this escrow.
    ICryptoPunksMarket public immutable PUNKS;
    /// @notice Returns the auction house allowed to manage this escrow.
    address public immutable AUCTIONS;
    /// @notice Returns the vault implementation used for user vaults.
    address public immutable VAULT_IMPLEMENTATION;

    /// @notice Returns the vault address registered for a user.
    mapping(address => address) public vaults;

    event VaultRegistered(address indexed user, address indexed vault);

    modifier onlyAuctions() {
        if (msg.sender != AUCTIONS) revert IPunksAuction.NotAuctions();
        _;
    }

    /// @notice Creates an escrow for one Punk market.
    constructor(address punks, address auctions) {
        if (punks == address(0) || auctions == address(0)) {
            revert IPunksAuction.ZeroAddress();
        }
        PUNKS = ICryptoPunksMarket(punks);
        AUCTIONS = auctions;
        VAULT_IMPLEMENTATION = address(new PunkVault(address(this), punks));
    }

    /// @notice Receives ETH from the Punk market.
    receive() external payable {
        if (msg.sender != address(PUNKS)) revert IPunksAuction.UnexpectedEtherSender();
    }

    /// @notice Returns the vault address a user will receive.
    /// @dev Uses CREATE2 clone prediction with the user address as the salt.
    function predictVault(address user) public view returns (address) {
        return Clones.predictDeterministicAddress(VAULT_IMPLEMENTATION, _salt(user), address(this));
    }

    /// @notice Creates a vault for a user if one does not exist.
    function ensureVault(address user) external returns (address vault) {
        vault = vaults[user];
        if (vault != address(0)) return vault;

        vault = Clones.cloneDeterministic(VAULT_IMPLEMENTATION, _salt(user));
        vaults[user] = vault;
        emit VaultRegistered(user, vault);
    }

    /// @notice Moves a Punk from a seller vault into escrow custody.
    function pullFromVault(address seller, uint256 punkIndex) external onlyAuctions {
        address vault = _vaultHoldingPunk(seller, punkIndex);
        PunkVault(vault).transfer(punkIndex, address(this));
    }

    /// @notice Moves your Punk from your vault back to you.
    function reclaim(uint256 punkIndex) external {
        address vault = _vaultHoldingPunk(msg.sender, punkIndex);
        PunkVault(vault).transfer(punkIndex, msg.sender);
    }

    /// @notice Offers an escrowed Punk to the auction house.
    function offerToAuctions(uint256 punkIndex, uint256 priceWei) external onlyAuctions {
        PUNKS.offerPunkForSaleToAddress(punkIndex, priceWei, AUCTIONS);
    }

    /// @notice Sends Punk sale proceeds to the auction house.
    function sweepProceeds() external onlyAuctions {
        PUNKS.withdraw();
        uint256 amount = address(this).balance;
        if (amount > 0) {
            (bool ok,) = payable(AUCTIONS).call{value: amount}("");
            if (!ok) revert PushPullEscrow.FailedWithdrawal();
        }
    }

    function _salt(address user) private pure returns (bytes32) {
        return bytes32(uint256(uint160(user)));
    }

    function _vaultHoldingPunk(address user, uint256 punkIndex)
        private
        view
        returns (address vault)
    {
        vault = vaults[user];
        if (vault == address(0) || PUNKS.punkIndexToAddress(punkIndex) != vault) {
            revert IPunksAuction.PunkNotInVault();
        }
    }
}
