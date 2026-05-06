// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "@openzeppelin/contracts/proxy/Clones.sol";

import "../interfaces/ICryptoPunksAuctions.sol";
import "../interfaces/ICryptoPunksMarket.sol";
import "../lib/PushPullEscrow.sol";
import "./PunkVault.sol";

/// @title CryptoPunksEscrow
/// @notice Custody intermediary for one CryptoPunks market.
contract CryptoPunksEscrow {
    ICryptoPunksMarket public immutable PUNKS;
    address public immutable AUCTIONS;
    address public immutable VAULT_IMPLEMENTATION;

    mapping(address => address) public vaults;

    event VaultRegistered(address indexed user, address indexed vault);

    modifier onlyAuctions() {
        if (msg.sender != AUCTIONS) revert ICryptoPunksAuctions.NotAuctions();
        _;
    }

    constructor(address punks, address auctions) {
        if (punks == address(0) || auctions == address(0)) revert ICryptoPunksAuctions.ZeroAddress();
        PUNKS = ICryptoPunksMarket(punks);
        AUCTIONS = auctions;
        VAULT_IMPLEMENTATION = address(new PunkVault(address(this), punks));
    }

    receive() external payable {
        if (msg.sender != address(PUNKS)) revert();
    }

    function predictVault(address user) public view returns (address) {
        return Clones.predictDeterministicAddress(
            VAULT_IMPLEMENTATION,
            _salt(user),
            address(this)
        );
    }

    function ensureVault(address user) external returns (address vault) {
        vault = vaults[user];
        if (vault != address(0)) return vault;

        vault = Clones.cloneDeterministic(VAULT_IMPLEMENTATION, _salt(user));
        vaults[user] = vault;
        emit VaultRegistered(user, vault);
    }

    function pullFromVault(address seller, uint256 punkIndex) external onlyAuctions {
        address vault = vaults[seller];
        if (vault == address(0)) revert ICryptoPunksAuctions.PunkNotInVault();
        if (PUNKS.punkIndexToAddress(punkIndex) != vault) revert ICryptoPunksAuctions.PunkNotInVault();
        PunkVault(vault).transfer(punkIndex, address(this));
    }

    function reclaim(uint256 punkIndex) external {
        address vault = vaults[msg.sender];
        if (vault == address(0)) revert ICryptoPunksAuctions.PunkNotInVault();
        if (PUNKS.punkIndexToAddress(punkIndex) != vault) revert ICryptoPunksAuctions.PunkNotInVault();
        PunkVault(vault).transfer(punkIndex, msg.sender);
    }

    function transferPunkTo(uint256 punkIndex, address to) external onlyAuctions {
        PUNKS.transferPunk(to, punkIndex);
    }

    function offerToAuctions(uint256 punkIndex, uint256 priceWei) external onlyAuctions {
        PUNKS.offerPunkForSaleToAddress(punkIndex, priceWei, AUCTIONS);
    }

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
}
