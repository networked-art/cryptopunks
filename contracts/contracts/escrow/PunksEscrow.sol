// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "@openzeppelin/contracts/proxy/Clones.sol";

import "../interfaces/IPunksAuction.sol";
import "../interfaces/ICryptoPunksMarket.sol";
import "../lib/PushPullEscrow.sol";
import "./PunkVault.sol";

/// @title PunksEscrow
/// @notice Custody intermediary for canonical CryptoPunks and CryptoPunks V1.
/// @dev    Each user owns exactly one vault, deterministic across both markets,
///         so a deposit to `predictVault(user)` is safe regardless of standard.
contract PunksEscrow {
    /// @notice Returns the canonical CryptoPunks market.
    ICryptoPunksMarket public immutable PUNKS;
    /// @notice Returns the CryptoPunks V1 market.
    ICryptoPunksMarket public immutable PUNKS_V1;
    /// @notice Returns the auction house allowed to manage this escrow.
    address public immutable AUCTIONS;
    /// @notice Returns the vault implementation cloned for each user.
    address public immutable VAULT_IMPLEMENTATION;

    /// @notice Returns the vault address registered for a user.
    mapping(address => address) public vaults;

    event VaultRegistered(address indexed user, address indexed vault);

    modifier onlyAuctions() {
        if (msg.sender != AUCTIONS) revert IPunksAuction.NotAuctions();
        _;
    }

    /// @notice Creates an escrow wired to both CryptoPunks markets and one auction house.
    constructor(address punks, address punksV1, address auctions) {
        if (punks == address(0) || punksV1 == address(0) || auctions == address(0)) {
            revert IPunksAuction.ZeroAddress();
        }
        if (punks == punksV1) revert IPunksAuction.ZeroAddress();

        PUNKS = ICryptoPunksMarket(punks);
        PUNKS_V1 = ICryptoPunksMarket(punksV1);
        AUCTIONS = auctions;
        VAULT_IMPLEMENTATION = address(new PunkVault(address(this)));
    }

    /// @notice Receives ETH from the canonical Punk market during settlement.
    /// @dev    V1 settlement routes ETH directly to the auction house; the
    ///         escrow never holds V1 proceeds.
    receive() external payable {
        if (msg.sender != address(PUNKS)) revert IPunksAuction.UnexpectedEtherSender();
    }

    /// @notice Returns the deterministic vault address for a user.
    /// @dev    Safe to deposit to before `ensureVault` is called — the address
    ///         is identical whether or not the clone has been instantiated.
    function predictVault(address user) public view returns (address) {
        return Clones.predictDeterministicAddress(VAULT_IMPLEMENTATION, _salt(user), address(this));
    }

    /// @notice Creates the vault for a user if one does not already exist.
    function ensureVault(address user) external returns (address) {
        return _ensureVault(user);
    }

    /// @notice Moves a Punk from a seller's vault into escrow custody.
    function pullFromVault(
        IPunksAuction.TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) external onlyAuctions {
        ICryptoPunksMarket market = _marketFor(standard);
        address vault = _vaultHoldingPunk(market, seller, punkIndex);
        PunkVault(vault).transfer(address(market), punkIndex, address(this));
    }

    /// @notice Moves a Punk you deposited back from your vault to you.
    /// @dev    Auto-deploys the vault clone if needed, so a user who deposited
    ///         to `predictVault` can reclaim without a separate `ensureVault`.
    function reclaim(IPunksAuction.TokenStandard standard, uint256 punkIndex) external {
        ICryptoPunksMarket market = _marketFor(standard);
        address vault = _ensureVault(msg.sender);
        if (market.punkIndexToAddress(punkIndex) != vault) {
            revert IPunksAuction.PunkNotInVault();
        }
        PunkVault(vault).transfer(address(market), punkIndex, msg.sender);
    }

    /// @notice Offers an escrowed Punk to the auction house at a fixed price.
    function offerToAuctions(
        IPunksAuction.TokenStandard standard,
        uint256 punkIndex,
        uint256 priceWei
    ) external onlyAuctions {
        _marketFor(standard).offerPunkForSaleToAddress(punkIndex, priceWei, AUCTIONS);
    }

    /// @notice Forwards canonical Punk sale proceeds to the auction house.
    /// @dev    V1 has no equivalent: the V1 market's accounting bug credits
    ///         the buyer (the auction house) directly.
    function sweepProceeds() external onlyAuctions {
        PUNKS.withdraw();
        uint256 amount = address(this).balance;
        if (amount > 0) {
            (bool ok,) = payable(AUCTIONS).call{value: amount}("");
            if (!ok) revert PushPullEscrow.FailedWithdrawal();
        }
    }

    /// @dev Resolves the market contract for a Punks standard.
    function _marketFor(IPunksAuction.TokenStandard standard)
        private
        view
        returns (ICryptoPunksMarket)
    {
        return standard == IPunksAuction.TokenStandard.CRYPTOPUNKS ? PUNKS : PUNKS_V1;
    }

    /// @dev Salt the deterministic clone with the user's address, so the vault
    ///      address is identical across networks and predictable offchain.
    function _salt(address user) private pure returns (bytes32) {
        return bytes32(uint256(uint160(user)));
    }

    /// @dev Registers the user's vault if missing — idempotent for repeats.
    function _ensureVault(address user) private returns (address vault) {
        vault = vaults[user];
        if (vault != address(0)) return vault;

        vault = Clones.cloneDeterministic(VAULT_IMPLEMENTATION, _salt(user));
        vaults[user] = vault;
        emit VaultRegistered(user, vault);
    }

    /// @dev Returns the user's registered vault iff the named market shows the
    ///      vault as the current owner of the Punk. Used by the auction house's
    ///      `pullFromVault` path, which requires the vault to already exist.
    function _vaultHoldingPunk(
        ICryptoPunksMarket market,
        address user,
        uint256 punkIndex
    ) private view returns (address vault) {
        vault = vaults[user];
        if (vault == address(0) || market.punkIndexToAddress(punkIndex) != vault) {
            revert IPunksAuction.PunkNotInVault();
        }
    }
}
