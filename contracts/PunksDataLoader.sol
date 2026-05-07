// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./interfaces/IPunksData.sol";
import "./lib/BytecodeBlob.sol";

/// @title PunksDataLoader
/// @notice Write-side mixin for loading and sealing the Punk data blobs.
abstract contract PunksDataLoader is IPunksDataLoader {
    using BytecodeBlob for address;

    uint16 public constant PUNK_COUNT = 10_000;
    uint16 public constant TRAIT_COUNT = 111;
    uint16 public constant BITMAP_WORD_COUNT = 40;
    uint16 public constant MAX_COLOR_COUNT = 222;
    uint16 public constant PIXEL_COUNT_MIN = 148;
    uint16 public constant PIXEL_COUNT_MAX = 332;
    uint8 public constant COLOR_COUNT_MIN = 2;
    uint8 public constant COLOR_COUNT_MAX = 14;
    uint8 public constant PUNK_WIDTH = 24;
    uint8 public constant PUNK_HEIGHT = 24;
    uint16 public constant PIXELS_PER_PUNK = 576;

    uint256 internal constant CANONICAL_TRAIT_MASK = (uint256(1) << TRAIT_COUNT) - 1;
    uint256 internal constant CANONICAL_COLOR_MASK = (uint256(1) << MAX_COLOR_COUNT) - 1;
    uint256 internal constant TRAIT_META_RECORD_SIZE = 6;
    uint256 internal constant TRAIT_META_HEADER_SIZE = uint256(TRAIT_COUNT) * TRAIT_META_RECORD_SIZE;
    uint256 internal constant WORD_BYTES = 32;
    uint256 internal constant PIXEL_OFFSET_BYTES = 3;
    uint256 internal constant BITS_PER_BYTE = 8;
    uint256 internal constant UINT8_MASK = 0xff;
    uint256 internal constant UINT16_MASK = 0xffff;
    uint256 internal constant SCALAR_BITS = 48;
    uint256 internal constant SCALARS_PER_WORD = 5;
    uint256 internal constant SCALAR_MASK = (uint256(1) << SCALAR_BITS) - 1;
    uint256 internal constant PIXEL_COUNT_SHIFT = 0;
    uint256 internal constant COLOR_COUNT_SHIFT = 16;
    uint256 internal constant ATTRIBUTE_COUNT_SHIFT = 24;
    uint256 internal constant PUNK_TYPE_SHIFT = 32;
    uint256 internal constant HEAD_VARIANT_SHIFT = 40;
    uint256 internal constant MAX_ATTRIBUTE_COUNT = 7;
    uint256 internal constant PALETTE_RGBA_BYTES_PER_COLOR = 4;
    uint256 internal constant PALETTE_RGB_BYTES_PER_COLOR = 3;
    uint256 internal constant VISIBLE_BITMAP_BYTES = uint256(PIXELS_PER_PUNK) / BITS_PER_BYTE;
    uint256 internal constant COMPRESSED_PIXEL_HEADER_SIZE = 1 + VISIBLE_BITMAP_BYTES;

    address public admin;

    bytes32 internal _datasetHash;

    struct Chunk {
        address pointer;
        uint32 endOffset;
    }

    mapping(uint16 pairIndex => uint256 packedMasks) internal _traitMaskPairs;
    mapping(uint16 punkId => uint256 mask) internal _colorMasks;
    mapping(uint16 wordIndex => uint256 packedScalars) internal _packedScalarWords;
    mapping(uint8 colorId => uint32 pixels) internal _colorSupplies;
    mapping(BlobId blobId => Chunk[] chunks) internal _blobChunks;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert ZeroAddress();
        admin = initialAdmin;
    }

    function loadTraitMaskPairs(uint16 startPairIndex, uint256[] calldata packedPairs)
        external
        onlyAdmin
    {
        uint256 len = packedPairs.length;
        if (uint256(startPairIndex) + len > PUNK_COUNT / 2) revert InvalidLength();

        for (uint256 i; i < len;) {
            uint256 packed = packedPairs[i];
            uint256 low = uint128(packed);
            uint256 high = packed >> 128;
            if ((low & ~CANONICAL_TRAIT_MASK) != 0 || (high & ~CANONICAL_TRAIT_MASK) != 0) {
                revert InvalidMask();
            }
            _traitMaskPairs[uint16(uint256(startPairIndex) + i)] = packed;
            unchecked {
                ++i;
            }
        }
    }

    function loadColorMasks(uint16 startPunkId, uint256[] calldata masks) external onlyAdmin {
        uint256 len = masks.length;
        if (uint256(startPunkId) + len > PUNK_COUNT) revert InvalidLength();

        for (uint256 i; i < len;) {
            uint256 mask = masks[i];
            if ((mask & ~CANONICAL_COLOR_MASK) != 0 || (mask & 1) != 0) revert InvalidMask();
            _colorMasks[uint16(uint256(startPunkId) + i)] = mask;
            unchecked {
                ++i;
            }
        }
    }

    function loadPackedScalars(uint16 startWordIndex, uint256[] calldata words)
        external
        onlyAdmin
    {
        uint256 len = words.length;
        uint256 wordCount = _scalarWordCount();
        if (uint256(startWordIndex) + len > wordCount) revert InvalidLength();

        for (uint256 i; i < len;) {
            uint256 word = words[i];
            _validateScalarWord(word);
            _packedScalarWords[uint16(uint256(startWordIndex) + i)] = word;
            unchecked {
                ++i;
            }
        }
    }

    function loadColorSupplies(uint8 startColorId, uint32[] calldata supplies) external onlyAdmin {
        uint256 len = supplies.length;
        if (uint256(startColorId) + len > MAX_COLOR_COUNT) revert InvalidLength();

        for (uint256 i; i < len;) {
            _colorSupplies[uint8(uint256(startColorId) + i)] = supplies[i];
            unchecked {
                ++i;
            }
        }
    }

    function loadBlobChunk(BlobId blobId, uint16 chunkIndex, bytes calldata data)
        external
        onlyAdmin
    {
        Chunk[] storage chunks = _blobChunks[blobId];
        if (chunkIndex != chunks.length) revert InvalidChunkIndex();

        address pointer = BytecodeBlob.write(data);
        uint256 prevEnd = chunkIndex == 0 ? 0 : chunks[chunkIndex - 1].endOffset;
        uint256 newEnd = prevEnd + data.length;
        if (newEnd > type(uint32).max) revert InvalidLength();
        chunks.push(Chunk({pointer: pointer, endOffset: uint32(newEnd)}));
    }

    function seal(DatasetCommitment calldata commitment) external onlyAdmin {
        if (
            commitment.traitCatalogHash == bytes32(0) || commitment.punkMaskHash == bytes32(0)
                || commitment.paletteHash == bytes32(0) || commitment.indexedPixelsHash == bytes32(0)
                || commitment.compressedPixelsHash == bytes32(0)
        ) revert InvalidHash();

        _requireBlobLength(
            BlobId.TraitBitmaps,
            uint256(TRAIT_COUNT) * BITMAP_WORD_COUNT * WORD_BYTES
        );
        if (_blobLength(BlobId.TraitMeta) < TRAIT_META_HEADER_SIZE) revert InvalidLength();
        _requireBlobLength(
            BlobId.Palette,
            uint256(MAX_COLOR_COUNT) * PALETTE_RGBA_BYTES_PER_COLOR
        );
        _requireBlobLength(
            BlobId.PixelOffsets,
            (uint256(PUNK_COUNT) + 1) * PIXEL_OFFSET_BYTES
        );
        if (_blobLength(BlobId.CompressedPixels) == 0) revert InvalidLength();
        _requireBlobLength(
            BlobId.ColorBitmaps,
            uint256(MAX_COLOR_COUNT) * BITMAP_WORD_COUNT * WORD_BYTES
        );
        _requireBlobLength(
            BlobId.PixelCountBitmaps,
            (uint256(PIXEL_COUNT_MAX) - PIXEL_COUNT_MIN + 1) * BITMAP_WORD_COUNT * WORD_BYTES
        );
        _requireBlobLength(
            BlobId.ColorCountBitmaps,
            (uint256(COLOR_COUNT_MAX) - COLOR_COUNT_MIN + 1) * BITMAP_WORD_COUNT * WORD_BYTES
        );

        bytes32 committedDatasetHash = keccak256(
            abi.encode(
                commitment.traitCatalogHash,
                commitment.punkMaskHash,
                commitment.paletteHash,
                commitment.indexedPixelsHash,
                commitment.compressedPixelsHash
            )
        );

        _datasetHash = committedDatasetHash;
        admin = address(0);

        emit DatasetCommitted(
            commitment.traitCatalogHash,
            commitment.punkMaskHash,
            commitment.paletteHash,
            commitment.indexedPixelsHash,
            commitment.compressedPixelsHash,
            committedDatasetHash
        );
    }

    function datasetHash() public view virtual returns (bytes32) {
        return _datasetHash;
    }

    function _readBlob(BlobId blobId, uint256 offset, uint256 length)
        internal
        view
        returns (bytes memory out)
    {
        if (length == 0) return new bytes(0);

        Chunk[] storage chunks = _blobChunks[blobId];
        uint256 chunkCount = chunks.length;
        if (chunkCount == 0) revert BlobReadOutOfBounds(blobId, offset, length);

        uint256 totalLength = chunks[chunkCount - 1].endOffset;
        if (offset >= totalLength || length > totalLength - offset) {
            revert BlobReadOutOfBounds(blobId, offset, length);
        }

        out = new bytes(length);

        uint256 lo;
        uint256 hi = chunkCount;
        while (lo < hi) {
            uint256 mid = (lo + hi) >> 1;
            if (chunks[mid].endOffset <= offset) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }

        uint256 copied;
        uint256 chunkStart = lo == 0 ? 0 : chunks[lo - 1].endOffset;
        while (copied < length) {
            Chunk storage chunk = chunks[lo];
            uint256 chunkEnd = chunk.endOffset;
            uint256 readStart = offset + copied - chunkStart;
            uint256 readLength = chunkEnd - chunkStart - readStart;
            uint256 remaining = length - copied;
            if (readLength > remaining) readLength = remaining;

            bytes memory part = chunk.pointer.read(readStart, readLength);
            _copyBytes(part, out, copied, readLength);
            copied += readLength;

            chunkStart = chunkEnd;
            unchecked {
                ++lo;
            }
        }
    }

    function _blobLength(BlobId blobId) internal view returns (uint256) {
        Chunk[] storage chunks = _blobChunks[blobId];
        uint256 len = chunks.length;
        if (len == 0) return 0;
        return chunks[len - 1].endOffset;
    }

    function _copyBytes(bytes memory src, bytes memory dst, uint256 dstOffset, uint256 length)
        private
        pure
    {
        for (uint256 i; i < length;) {
            dst[dstOffset + i] = src[i];
            unchecked {
                ++i;
            }
        }
    }

    function _requireBlobLength(BlobId blobId, uint256 expected) private view {
        if (_blobLength(blobId) != expected) revert InvalidLength();
    }

    function _validateScalarWord(uint256 word) private pure {
        if (word >> (SCALARS_PER_WORD * SCALAR_BITS) != 0) revert InvalidScalar();
        for (uint256 i; i < SCALARS_PER_WORD;) {
            uint256 scalar = (word >> (i * SCALAR_BITS)) & SCALAR_MASK;
            uint256 pixelCount = (scalar >> PIXEL_COUNT_SHIFT) & UINT16_MASK;
            uint256 colorCountValue = (scalar >> COLOR_COUNT_SHIFT) & UINT8_MASK;
            uint256 attributeCount = (scalar >> ATTRIBUTE_COUNT_SHIFT) & UINT8_MASK;
            uint256 punkType = (scalar >> PUNK_TYPE_SHIFT) & UINT8_MASK;
            uint256 headVariant = (scalar >> HEAD_VARIANT_SHIFT) & UINT8_MASK;
            if (
                pixelCount < PIXEL_COUNT_MIN || pixelCount > PIXEL_COUNT_MAX
                    || colorCountValue < COLOR_COUNT_MIN || colorCountValue > COLOR_COUNT_MAX
                    || attributeCount > MAX_ATTRIBUTE_COUNT
                    || punkType > uint8(IPunksDataCriteria.PunkType.Zombie)
                    || headVariant > uint8(IPunksDataCriteria.HeadVariant.Zombie)
            ) revert InvalidScalar();
            unchecked {
                ++i;
            }
        }
    }

    function _scalarWordCount() private pure returns (uint256) {
        return (uint256(PUNK_COUNT) + SCALARS_PER_WORD - 1) / SCALARS_PER_WORD;
    }
}
