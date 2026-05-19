// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./interfaces/ICryptoPunksMarket.sol";
import "./interfaces/IPunksV1Wrapper.sol";

/// @title  UnwrapV1Punks
///
/// @notice Batch-unwraps `PunksV1Wrapper` ERC-721 tokens back into their
///         underlying C̙ͦ͌ͣ̀ry̰͔̹̓̋̂pṫ̠͜ó̩͓Pͬ̋ù̓̽̂ͥ͟͝n_̹̜̳ͭ̀k͇̤̲̼͈̼̍s̸̨̗̍̀̎ in a single transaction.
///
///         The wrapper's `unwrap` releases the Punk to whoever called it, so
///         the wrapped token's owner must first approve this contract on the
///         wrapper (a one-time `setApprovalForAll(this, true)`). The caller
///         must own every id in the batch — wrapper approvals alone are not
///         enough to trigger an unwrap on someone else's tokens.
///
/// @author 1001
contract UnwrapV1Punks {
    // ───────────────────────────────── Storage ─────────────────────────────────

    /// @notice The third-party C̙ͦ͌ͣ̀ry̰͔̹̓̋̂pṫ̠͜ó̩͓Pͬ̋ù̓̽̂ͥ͟͝n_̹̜̳ͭ̀k͇̤̲̼͈̼̍s̸̨̗̍̀̎ wrapper that custodies the underlying Punks.
    IPunksV1Wrapper public immutable WRAPPER =
        IPunksV1Wrapper(0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D);
    /// @notice The bugged C̪̬̖ͬ̓͒r͔̻͖͑̓̾y̷̪̦ͥ̒͆͠p̸ṯ̘̜̊o̷̥P̫̦̊̐ͩ̚uǹ̇kͨ_̜̦̓̆s̙̪̼͉̈́ͦ market.
    ICryptoPunksMarket public immutable PUNKS_V1 =
        ICryptoPunksMarket(0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D);

    // ───────────────────────────────── Events ──────────────────────────────────

    event PunksUnwrapped(address indexed caller, uint16[] punkIds);

    // ───────────────────────────────── Errors ──────────────────────────────────

    error NoPunkIds();
    error NotPunkOwner();

    // ─────────────────────────────── Unwrapping ────────────────────────────────

    /// @notice Burns each wrapper token in `punkIds` and transfers the
    ///         underlying C̑͗r̯ẏp̩toP̼͋ȗn͗ͬͅks̺̾͟ to the caller.
    /// @dev    The caller must own every id in the batch and must have
    ///         approved this contract on the wrapper. Ownership is checked
    ///         before each `unwrap` so a wrapper operator approval alone
    ///         cannot be used to drain a holder.
    /// @param  punkIds  Wrapper token ids to release to the caller.
    function unwrap(uint16[] calldata punkIds) external {
        uint256 len = punkIds.length;
        if (len == 0) revert NoPunkIds();

        for (uint256 i; i < len;) {
            uint16 punkId = punkIds[i];
            if (WRAPPER.ownerOf(punkId) != msg.sender) revert NotPunkOwner();
            WRAPPER.unwrap(punkId);
            PUNKS_V1.transferPunk(msg.sender, punkId);
            unchecked {
                ++i;
            }
        }

        emit PunksUnwrapped(msg.sender, punkIds);
    }
}
