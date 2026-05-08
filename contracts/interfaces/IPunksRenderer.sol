// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  IPunksRenderer
/// @notice Per-Punk visual encoders: RGBA bytes, run-length SVG, PNG-8.
/// @dev    All views read sealed primitives from `PunksData`. Renderer is
///         stateless and admin-less — see `decisions.md` §Architecture.
///
///         The `punkMarketplace*` variants additionally read live state from
///         the original CryptoPunks market contract and pick a background
///         color reflecting the Punk's current marketplace status.
interface IPunksRenderer {
    /// @notice Reverts when a flattened-PNG background has alpha != 0xFF.
    /// @dev    A non-opaque background produces ambiguous compositing. Define
    ///         the failure rather than emitting visually wrong PNGs.
    error InvalidBackground();

    /// @notice Reverts when an ERC721-style token id is outside 0..9999.
    error InvalidTokenId();

    /// @notice Address of the `PunksData` contract this renderer reads from.
    function dataContract() external view returns (address);

    /// @notice Comma-separated display attributes: head variant, then
    ///         accessories in canonical trait-id order.
    function punkAttributes(uint16 punkId) external view returns (string memory);

    /// @notice OpenSea-shaped metadata JSON. The `image` field embeds the
    ///         default-background SVG as a base64 data URI.
    /// @dev    This is raw JSON, not a URI. Use `tokenURI` for ERC721-style
    ///         data-URI metadata.
    function metadataJson(uint16 punkId) external view returns (string memory);

    /// @notice ERC721-compatible metadata URI for Punk ids 0..9999.
    function tokenURI(uint256 tokenId) external view returns (string memory);

    /// @notice 2304-byte RGBA expansion of a Punk image (24x24 x 4 bytes).
    function punkImage(uint16 punkId) external view returns (bytes memory);

    /// @notice Run-length SVG over a Larva-compatible `#638596` background.
    function punkSvg(uint16 punkId) external view returns (string memory);

    /// @notice PNG-8 indexed (PLTE + tRNS), transparent where the source is.
    function punkPng(uint16 punkId) external view returns (bytes memory);

    /// @notice PNG-8 indexed flattened against `backgroundRgba` (alpha must be
    ///         0xFF). The output uses a compact local palette and contains no
    ///         tRNS chunk.
    function punkPng(uint16 punkId, bytes4 backgroundRgba)
        external
        view
        returns (bytes memory);

    /// @notice Marketplace-aware RGBA background for a Punk. Resolution order:
    ///         offered for sale > active bid > wrapped (legacy or new) >
    ///         Larva default.
    /// @dev    All returned colors are opaque (alpha `0xff`). Returns
    ///         `0x638596ff` when no marketplace contract is configured or
    ///         none of the conditions match.
    function backgroundOf(uint16 punkId) external view returns (bytes4 rgba);

    /// @notice Run-length SVG with a marketplace-aware background. The Punk's
    ///         current marketplace state (for sale, bid, wrapped, default)
    ///         drives the background color.
    function punkMarketplaceSvg(uint16 punkId) external view returns (string memory);

    /// @notice PNG-8 indexed flattened against the marketplace-aware
    ///         background. The Punk's current marketplace state (for sale,
    ///         bid, wrapped, default) drives the background color.
    function punkMarketplacePng(uint16 punkId) external view returns (bytes memory);
}
