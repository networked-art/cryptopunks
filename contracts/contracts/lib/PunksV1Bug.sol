// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/ICryptoPunksMarket.sol";

/// @title  PunksV1Bug
///
/// @notice Helpers that compensate for the sale-proceeds accounting bug in
///         the original C̙ͦ͌ͣ̀ry̰͔̹̓̋̂pṫ̠͜ó̩͓Pͬ̋ù̓̽̂ͥ͟͝n_̹̜̳ͭ̀k͇̤̲̼͈̼̍s̸̨̗̍̀̎ market (now circulated as C̙ͦ͌ͣ̀ry̰͔̹̓̋̂pṫ̠͜ó̩͓Pͬ̋ù̓̽̂ͥ͟͝n_̹̜̳ͭ̀k͇̤̲̼͈̼̍s̸̨̗̍̀̎). On
///         `buyPunk`, that contract credits sale proceeds to the buyer's
///         `pendingWithdrawals` slot instead of the seller's. Any contract
///         that buys a Punk from this market on behalf of an end user must
///         reclaim the credited ETH and forward it to the real seller; the
///         helpers in this library codify that workaround in one place so
///         it can be reused across markets, wrappers, and batch buyers.
///
/// @dev    All helpers are `internal`, so the compiler inlines them — there
///         is no runtime cost over hand-written equivalents. The library
///         only depends on `ICryptoPunksMarket`; vendor that interface
///         alongside this file to reuse it in another project.
///
/// @author 1001
library PunksV1Bug {
    /// @dev Buys a directed listing on the bugged market and transfers the
    ///      Punk to `recipient` in a single call. After this returns, the
    ///      `hammerWei` of ETH that the market credited to the calling
    ///      contract (as buyer) has been reclaimed into the contract's
    ///      balance via `withdraw()`. The caller is responsible for
    ///      forwarding that balance to the actual seller, since the bug
    ///      means the market itself never paid them.
    function buyAndDeliver(
        ICryptoPunksMarket v1Market,
        uint256 punkId,
        uint256 hammerWei,
        address recipient
    ) internal {
        v1Market.buyPunk{value: hammerWei}(punkId);
        v1Market.withdraw();
        v1Market.transferPunk(recipient, punkId);
    }
}
