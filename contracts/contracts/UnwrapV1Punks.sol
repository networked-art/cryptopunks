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
///         wrapper (a one-time `setApprovalForAll(this, true)`). Each id in
///         the batch is unwrapped to this contract and immediately forwarded
///         to the wrapped token's owner, so anyone may settle a batch on the
///         owner's behalf without being able to redirect the Punk.
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

    // ─────────────────────────────── Unwrapping ────────────────────────────────

    /// @notice Burns each wrapper token in `punkIds` and forwards the
    ///         underlying C̑͗r̯ẏp̩toP̼͋ȗn͗ͬͅks̺̾͟ to the wrapper-token owner.
    /// @dev    Each id reverts back through the wrapper unless this contract
    ///         is approved on it. Snapshots `ownerOf` before `unwrap` so the
    ///         Punk is always delivered to the wrapped token's owner rather
    ///         than the caller.
    /// @param  punkIds  Wrapper token ids to release.
    function unwrap(uint16[] calldata punkIds) external {
        uint256 len = punkIds.length;
        if (len == 0) revert NoPunkIds();

        for (uint256 i; i < len;) {
            uint16 punkId = punkIds[i];
            address tokenOwner = WRAPPER.ownerOf(punkId);
            WRAPPER.unwrap(punkId);
            PUNKS_V1.transferPunk(tokenOwner, punkId);
            unchecked {
                ++i;
            }
        }

        emit PunksUnwrapped(msg.sender, punkIds);
    }
}
