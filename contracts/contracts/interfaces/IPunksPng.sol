// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  IPunksPng
/// @notice PNG and canonical mosaic byte surfaces derived from `PunksData`.
interface IPunksPng {
    error InvalidBackground();
    error InvalidPunkId();
    error InvalidRowIndex();
    error InvalidColumnRange();
    error InvalidScanlineRange();
    error InvalidDeflateBlock();
    error InvalidCompositeChunk();

    /// @notice Returns the `PunksData` contract this encoder reads from.
    function dataContract() external view returns (address);

    /// @notice Transparent-background 24x24 PNG-8 for one Punk.
    function punkPng(uint16 punkId) external view returns (bytes memory);

    /// @notice Opaque-background 24x24 PNG-8 for one Punk.
    function punkPng(uint16 punkId, bytes4 backgroundRgba)
        external
        view
        returns (bytes memory);

    /// @notice Width and height of the canonical 10k Punk mosaic.
    function mosaicSize() external pure returns (uint16 width, uint16 height);

    /// @notice Number of chunks in the byte-exact canonical `punks.png` stream.
    function compositePngChunkCount() external pure returns (uint16);

    /// @notice One byte range chunk of the canonical `punks.png` stream.
    /// @dev Concatenating chunks `[0, compositePngChunkCount())` reconstructs
    ///      the canonical GitHub `punks.png` byte-for-byte.
    function compositePngChunk(uint16 chunkIndex) external view returns (bytes memory);

    /// @notice Columns and rows in the canonical 10k Punk mosaic.
    function mosaicGridSize() external pure returns (uint8 columns, uint8 rows);

    /// @notice Top-left pixel coordinate of `punkId` in the canonical mosaic.
    function mosaicCoordOf(uint16 punkId) external pure returns (uint16 x, uint16 y);

    /// @notice One Punk-row of the canonical mosaic as palette indexes.
    function mosaicIndexedRow(uint8 rowIndex) external view returns (bytes memory);

    /// @notice One Punk-row of the canonical mosaic as RGBA bytes.
    function mosaicRgbaRow(uint8 rowIndex) external view returns (bytes memory);

    /// @notice One Punk-row of PNG scanlines: 24 rows of filter byte 0 + RGBA.
    function mosaicScanlineRow(uint8 rowIndex) external view returns (bytes memory);

    /// @notice One 2400-pixel scanline of the canonical mosaic as palette indexes.
    function mosaicIndexedScanline(uint16 y) external view returns (bytes memory);

    /// @notice One 2400-pixel scanline of the canonical mosaic as RGBA bytes.
    function mosaicRgbaScanline(uint16 y) external view returns (bytes memory);

    /// @notice One PNG scanline: filter byte 0 plus one RGBA scanline.
    function mosaicPngScanline(uint16 y) external view returns (bytes memory);

    /// @notice A byte range from the inflated canonical PNG scanline stream.
    /// @dev The stream is 2400 rows of filter byte 0 plus 2400 RGBA pixels.
    function mosaicPngScanlineSlice(uint32 offset, uint32 length)
        external
        view
        returns (bytes memory);

    /// @notice Number of dynamic DEFLATE blocks in canonical `punks.png`.
    function referenceDeflateBlockCount() external pure returns (uint8);

    /// @notice Inflated scanline byte range and non-EOB token count for a block.
    function referenceDeflateBlock(uint8 blockIndex)
        external
        pure
        returns (uint32 startOffset, uint32 endOffset, uint16 tokenCount);

    /// @notice Raw-DEFLATE bit range for a block, excluding zlib wrapper bytes.
    function referenceDeflateBlockBits(uint8 blockIndex)
        external
        pure
        returns (uint32 startBit, uint32 endBit);

    /// @notice Canonical dynamic-DEFLATE block payload for `blockIndex`.
    /// @dev The returned bytes are the block bitstream padded with zero bits in
    ///      the final byte. Adjacent canonical blocks are bit-contiguous, so
    ///      callers assembling the full zlib stream must pack by bit length.
    function referenceDeflateBlockPayload(uint8 blockIndex)
        external
        view
        returns (bytes memory);

    /// @notice A column-window of one mosaic scanline as palette indexes.
    function mosaicIndexedScanlineChunk(uint16 y, uint8 startColumn, uint8 columnCount)
        external
        view
        returns (bytes memory);

    /// @notice A column-window of one mosaic scanline as RGBA bytes.
    function mosaicRgbaScanlineChunk(uint16 y, uint8 startColumn, uint8 columnCount)
        external
        view
        returns (bytes memory);

    /// @notice A column-window of one PNG scanline.
    /// @dev Includes the filter byte only when `startColumn == 0`, so
    ///      concatenating chunks left-to-right reconstructs the PNG scanline.
    function mosaicPngScanlineChunk(uint16 y, uint8 startColumn, uint8 columnCount)
        external
        view
        returns (bytes memory);

    /// @notice SHA-256 over all 10,000 24x24 RGBA Punk images in Punk-id order.
    function mosaicPixelsHash() external pure returns (bytes32);

    /// @notice SHA-256 of the canonical GitHub `punks.png`.
    function referencePngSha256() external pure returns (bytes32);

    /// @notice SHA-256 of concatenated IDAT payload bytes in canonical `punks.png`.
    function referenceIdatSha256() external pure returns (bytes32);

    /// @notice SHA-256 of inflated PNG scanlines in canonical `punks.png`.
    function referenceInflatedScanlinesSha256() external pure returns (bytes32);
}
