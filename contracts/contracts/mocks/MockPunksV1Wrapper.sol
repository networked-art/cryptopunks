// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../interfaces/ICryptoPunksMarket.sol";

/// @notice Test double for the third-party `PunksV1Wrapper`. Mirrors the
///         `unwrap` semantics and the canonical V1 market wiring; ships a
///         `mockWrap` helper so tests can seed wrapper tokens without going
///         through the full V1 sale dance.
contract MockPunksV1Wrapper is ERC721 {
    /// @notice The V1 market the real wrapper forwards underlying Punks to.
    ICryptoPunksMarket public immutable PUNKS_V1 =
        ICryptoPunksMarket(0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D);

    constructor() ERC721("Mock V1 Wrapper", "MWPV1") {}

    /// @notice Mints a wrapper token. Callers must seed the V1 market so
    ///         that this contract owns the underlying Punk before unwrap.
    function mockWrap(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    /// @notice Burns the wrapper token and transfers the underlying Punk to
    ///         the caller. Reverts unless the caller owns or is approved for
    ///         `tokenId`.
    function unwrap(uint256 tokenId) external {
        address previousOwner = _update(address(0), tokenId, msg.sender);
        if (previousOwner == address(0)) revert ERC721NonexistentToken(tokenId);
        PUNKS_V1.transferPunk(msg.sender, tokenId);
    }
}
