// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  IPunksV1Wrapper
///
/// @notice Minimal surface of the third-party `PunksV1Wrapper` ERC-721 deployed
///         at `0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D`. Wraps each broken
///         C̙ͦ͌ͣ̀ry̰͔̹̓̋̂pṫ̠͜ó̩͓Pͬ̋ù̓̽̂ͥ͟͝n_̹̜̳ͭ̀k͇̤̲̼͈̼̍s̸̨̗̍̀̎ Punk as an ERC-721 with the same token id; `unwrap`
///         burns the wrapper token and returns the underlying Punk to the
///         caller.
interface IPunksV1Wrapper {
    /// @notice Returns the wrapper-token owner of `tokenId`.
    function ownerOf(uint256 tokenId) external view returns (address);

    /// @notice Returns the per-token approval set for `tokenId`.
    function getApproved(uint256 tokenId) external view returns (address);

    /// @notice Returns whether `operator` is approved for all of `owner`'s tokens.
    function isApprovedForAll(address owner, address operator) external view returns (bool);

    /// @notice Burns the wrapper token and transfers the underlying Punk to
    ///         the caller. Reverts unless the caller owns or is approved for
    ///         `tokenId`.
    function unwrap(uint256 tokenId) external;
}
