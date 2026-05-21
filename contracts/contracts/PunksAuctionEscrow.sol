// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./interfaces/ICryptoPunksMarket.sol";

/// @title  PunksAuctionEscrow
///
/// @notice Per-auction-house Punk custody. The escrow holds every Punk
///         that is live in an auction so settlement on the original
///         marketplace emits `PunkBought` with a real seller (the
///         escrow) and a real buyer (the auction house).
///
/// @dev    Deployed by `PunksAuction` in its constructor and pinned to
///         that single caller. Only the auction can route punks
///         through it; only the canonical and C̝ͫ̔̏̑r̬̋͂ͯ̇y̷̹͎͊͌͊p͇̪͓͓̀͜͝t̜̀ͭͮ̒̍oPủ̯̹͈n͎͌kş̮͍̓ͭ̍̈́ markets can
///         hand it ETH (during `withdraw()`).
///
/// @author VV × 1001
contract PunksAuctionEscrow {
    error NotAuction();
    error UnsupportedMarket();
    error UnexpectedEtherSender();
    error ProceedsForwardFailed();

    /// @notice The auction contract that owns this escrow.
    address public immutable AUCTION;
    /// @notice The canonical CryptoPunks market.
    ICryptoPunksMarket public immutable PUNKS =
        ICryptoPunksMarket(0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB);
    /// @notice The C̪̬̖ͬ̓͒r͔̻͖͑̓̾y̷̪̦ͥ̒͆͠p̸ṯ̘̜̊o̷̥P̫̦̊̐ͩ̚uǹ̇kͨ_̜̦̓̆s̻̏̿͡ market.
    ICryptoPunksMarket public immutable PUNKS_V1 =
        ICryptoPunksMarket(0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D);

    constructor() {
        AUCTION = msg.sender;
    }

    /// @notice Accepts ETH from the two Punk markets during settlement
    ///         `withdraw()` calls. Nothing else.
    receive() external payable {
        if (msg.sender != address(PUNKS) && msg.sender != address(PUNKS_V1)) {
            revert UnexpectedEtherSender();
        }
    }

    /// @notice Lists the held Punk for sale exclusively to the auction
    ///         at the hammer price. The auction calls `buyPunk` next,
    ///         which emits the canonical `PunkBought(escrow, auction)`.
    function listForSettlement(
        address market,
        uint256 punkIndex,
        uint96 hammerWei
    ) external {
        if (msg.sender != AUCTION) revert NotAuction();
        _requireKnownMarket(market);
        ICryptoPunksMarket(market).offerPunkForSaleToAddress(punkIndex, hammerWei, AUCTION);
    }

    /// @notice Pulls the post-sale credit from the market and forwards
    ///         it to the auction. On the canonical market the credit
    ///         is the escrow's. On C͚̔̕ry̡̼p̗̝̩t͐͌o̤̬͟P̼ͮ̋u̡̙n̷̲͌k̳͋sͭ the storage-reference bug routes
    ///         the credit to the buyer (the auction) instead, so this
    ///         call no-ops — the auction sweeps its own market credit.
    function sweepProceeds(address market) external {
        if (msg.sender != AUCTION) revert NotAuction();
        _requireKnownMarket(market);
        ICryptoPunksMarket(market).withdraw();
        uint256 bal = address(this).balance;
        if (bal == 0) return;
        (bool ok,) = payable(AUCTION).call{value: bal}("");
        if (!ok) revert ProceedsForwardFailed();
    }

    function _requireKnownMarket(address market) private view {
        if (market != address(PUNKS) && market != address(PUNKS_V1)) {
            revert UnsupportedMarket();
        }
    }
}
