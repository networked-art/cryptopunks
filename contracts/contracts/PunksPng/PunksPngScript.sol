// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../lib/BlobStorage.sol";

/// @title  PunksPngScript
///
/// @notice Onchain storage for the canonical `punks.png` renderer script.
///
///         The script is a pure-ES JavaScript module that consumes
///         `PunksData.indexedPixelsOf` + `PunksData.paletteRgbaBytes` and
///         emits the exact byte stream of the canonical `punks.png`
///         (sha256 `referencePngSha256`).
///
///         Anyone can fetch the source via `script()`, verify it against
///         `scriptHash()`, evaluate it, and reproduce the canonical PNG.
///         The on-chain script is the renderer's source of truth; the
///         SDK ships the same file for offline ergonomics.
///
/// @author 1001
contract PunksPngScript {
    using BlobStorage for BlobStorage.Chunk[];

    /// @notice keccak256 of the canonical script bytes, set at `seal`.
    bytes32 private _scriptHash;

    /// @notice sha256 of the canonical PNG this script produces against
    ///         sealed `PunksData`. Matches `PunksPng.REFERENCE_PNG_SHA256`.
    bytes32 public constant REFERENCE_PNG_SHA256 =
        0xac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b;

    /// @notice Account allowed to append script chunks until `seal` flips
    ///         `isSealed`. Cleared on seal.
    address public owner;

    /// @notice Returns true once the script is sealed and immutable.
    bool public isSealed;

    BlobStorage.Chunk[] private _scriptChunks;

    error AlreadySealed();
    error EmptyScript();
    error NotOwner();
    error ScriptHashMismatch();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenUnsealed() {
        if (isSealed) revert AlreadySealed();
        _;
    }

    /// @notice Sets the temporary loader.
    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
    }

    /// @notice Appends `data` as the next script chunk. Each chunk is
    ///         capped at 24,575 bytes (SSTORE2 deployment limit).
    function appendScriptChunk(uint16 chunkIndex, bytes calldata data)
        external
        whenUnsealed
        onlyOwner
    {
        _scriptChunks.append(chunkIndex, data);
    }

    /// @notice Seals the script and pins `scriptHash` to keccak256 of the
    ///         stored bytes. Caller must pass the expected hash so an
    ///         accidental partial upload cannot accidentally lock the
    ///         contract.
    function seal(bytes32 expectedScriptHash) external whenUnsealed onlyOwner {
        uint256 total = _scriptChunks.totalLength();
        if (total == 0) revert EmptyScript();

        bytes memory body = _scriptChunks.read(0, total);
        bytes32 actual = keccak256(body);
        if (actual != expectedScriptHash) revert ScriptHashMismatch();

        _scriptHash = actual;
        isSealed = true;
        owner = address(0);
    }

    /// @notice Returns the full canonical renderer source.
    function script() external view returns (bytes memory) {
        return _scriptChunks.read(0, _scriptChunks.totalLength());
    }

    /// @notice Returns a slice of the canonical renderer source.
    /// @dev    Provided for callers that need to stream the source in
    ///         pieces; large blobs return-bomb naive callers.
    function scriptSlice(uint256 offset, uint256 length)
        external
        view
        returns (bytes memory)
    {
        return _scriptChunks.read(offset, length);
    }

    /// @notice Returns the total script length in bytes.
    function scriptLength() external view returns (uint256) {
        return _scriptChunks.totalLength();
    }

    /// @notice Returns the script chunk count (each chunk is one SSTORE2
    ///         pointer).
    function scriptChunkCount() external view returns (uint256) {
        return _scriptChunks.length;
    }

    /// @notice Returns keccak256 of the full script. Zero until sealed.
    function scriptHash() external view returns (bytes32) {
        return _scriptHash;
    }

    /// @notice Returns sha256 of the canonical PNG the script produces.
    function referencePngSha256() external pure returns (bytes32) {
        return REFERENCE_PNG_SHA256;
    }
}
