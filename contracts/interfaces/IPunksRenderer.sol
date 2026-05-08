// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  IPunksRenderer
/// @notice Per-Punk visual encoders: RGBA bytes, run-length SVG, PNG-8.
/// @dev    All views read sealed primitives from `PunksData`. Renderer is
///         stateless and admin-less — see `decisions.md` §Architecture.
interface IPunksRenderer {
    /// @notice Reverts when a flattened-PNG background has alpha != 0xFF.
    /// @dev    A non-opaque background produces ambiguous compositing. Define
    ///         the failure rather than emitting visually wrong PNGs.
    error InvalidBackground();

    /// @notice Address of the `PunksData` contract this renderer reads from.
    function dataContract() external view returns (address);

    /// @notice 2304-byte RGBA expansion of a Punk image (24x24 x 4 bytes).
    function punkImage(uint16 punkId) external view returns (bytes memory);

    /// @notice Run-length SVG over a Larva-compatible `#638596` background.
    function punkImageSvg(uint16 punkId) external view returns (string memory);

    /// @notice PNG-8 indexed (PLTE + tRNS), transparent where the source is.
    function punkPng(uint16 punkId) external view returns (bytes memory);

    /// @notice PNG-8 indexed flattened against `backgroundRgba` (alpha must be
    ///         0xFF). The output uses a compact local palette and contains no
    ///         tRNS chunk.
    function punkPng(uint16 punkId, bytes4 backgroundRgba)
        external
        view
        returns (bytes memory);
}
