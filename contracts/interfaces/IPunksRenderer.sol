// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  IPunksRenderer
/// @notice Per-Punk encoders for RGBA, SVG, PNG-8, and metadata.
/// @dev    Stateless renderer; marketplace variants read the CryptoPunks market.
interface IPunksRenderer {
    /// @notice Reverts when a flattened-PNG background is not opaque.
    error InvalidBackground();

    /// @notice Reverts when an ERC721-style token id is outside 0..9999.
    error InvalidTokenId();

    /// @notice Address of the `PunksData` contract this renderer reads from.
    function dataContract() external view returns (address);

    /// @notice Comma-separated attributes: head variant, then accessories by trait id.
    function punkAttributes(uint16 punkId) external view returns (string memory);

    /// @notice Raw OpenSea-style metadata JSON with embedded SVG and color data.
    /// @dev    Use `tokenURI` for ERC721 data-URI metadata.
    function metadataJson(uint16 punkId) external view returns (string memory);

    /// @notice ERC721-compatible metadata URI for Punk ids 0..9999.
    function tokenURI(uint256 tokenId) external view returns (string memory);

    /// @notice 2304-byte RGBA expansion of a Punk image (24x24 x 4 bytes).
    function punkImage(uint16 punkId) external view returns (bytes memory);

    /// @notice Run-length SVG over a Larva-compatible `#638596` background.
    function punkSvg(uint16 punkId) external view returns (string memory);

    /// @notice PNG-8 indexed (PLTE + tRNS), transparent where the source is.
    function punkPng(uint16 punkId) external view returns (bytes memory);

    /// @notice PNG-8 flattened against `backgroundRgba`; alpha must be 0xFF.
    /// @dev    Uses a compact local palette and no tRNS chunk.
    function punkPng(uint16 punkId, bytes4 backgroundRgba)
        external
        view
        returns (bytes memory);

    /// @notice Marketplace-aware RGBA background for a Punk.
    /// @dev    Resolution: sale > bid > C721 wrapper > wrapper > default; all opaque.
    function backgroundOf(uint16 punkId) external view returns (bytes4 rgba);

    /// @notice Run-length SVG with a marketplace-aware background.
    function punkMarketplaceSvg(uint16 punkId) external view returns (string memory);

    /// @notice PNG-8 flattened against the marketplace-aware background.
    function punkMarketplacePng(uint16 punkId) external view returns (bytes memory);
}
