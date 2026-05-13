// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ZlibBitWriter} from "./ZlibBitWriter.sol";
import {ZlibSymbols} from "./ZlibSymbols.sol";
import {ZlibTrees} from "./ZlibTrees.sol";

/// @title  ZlibDynamicBlock
/// @notice Emits one dynamic-Huffman DEFLATE block from an explicit token stream.
library ZlibDynamicBlock {
    uint16 private constant L_CODES = 286;
    uint16 private constant D_CODES = 30;
    uint16 private constant BL_CODES = 19;
    uint16 private constant END_BLOCK = 256;
    uint8 private constant MAX_BITS = 15;
    uint8 private constant MAX_BL_BITS = 7;

    error InvalidTokenArrays();
    error InvalidPackedTokens();
    error InvalidTokenKind();
    error InvalidLiteral();
    error MissingCode();

    function encodeDynamicBlock(
        uint8[] memory kinds,
        uint16[] memory values,
        uint16[] memory distances,
        bool finalBlock
    ) internal pure returns (bytes memory out) {
        out = new bytes(8192 + kinds.length * 8);
        uint256 bitOffset = writeDynamicBlock(out, 0, kinds, values, distances, finalBlock);
        return ZlibBitWriter.trim(out, bitOffset);
    }

    function encodeDynamicBlockPacked(bytes memory tokens, bool finalBlock)
        internal
        pure
        returns (bytes memory out)
    {
        if (tokens.length % 5 != 0) revert InvalidPackedTokens();
        out = new bytes(8192 + (tokens.length / 5) * 8);
        uint256 bitOffset = writeDynamicBlockPacked(out, 0, tokens, finalBlock);
        return ZlibBitWriter.trim(out, bitOffset);
    }

    function writeDynamicBlock(
        bytes memory out,
        uint256 bitOffset,
        uint8[] memory kinds,
        uint16[] memory values,
        uint16[] memory distances,
        bool finalBlock
    ) internal pure returns (uint256) {
        if (kinds.length != values.length || values.length != distances.length) {
            revert InvalidTokenArrays();
        }

        (
            uint8[] memory literalLengths,
            uint16 literalMaxCode,
            uint8[] memory distanceLengths,
            uint16 distanceMaxCode,
            uint8[] memory bitLengthLengths,
            uint16 bitLengthMaxCode,
            uint8 maxBlIndex
        ) = _buildTrees(kinds, values, distances);

        uint16[] memory bitLengthCodes =
            ZlibTrees.buildCanonicalCodes(bitLengthLengths, bitLengthMaxCode);
        uint16[] memory literalCodes =
            ZlibTrees.buildCanonicalCodes(literalLengths, literalMaxCode);
        uint16[] memory distanceCodes =
            ZlibTrees.buildCanonicalCodes(distanceLengths, distanceMaxCode);

        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, finalBlock ? 1 : 0, 1);
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, 2, 2);
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, literalMaxCode + 1 - 257, 5);
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, distanceMaxCode, 5);
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, maxBlIndex + 1 - 4, 4);

        for (uint8 rank; rank <= maxBlIndex; ++rank) {
            bitOffset = ZlibBitWriter.writeBits(
                out,
                bitOffset,
                _lengthAt(bitLengthLengths, _codeLengthOrder(rank)),
                3
            );
            if (rank == maxBlIndex) break;
        }

        bitOffset = _sendTree(
            out,
            bitOffset,
            literalLengths,
            literalMaxCode,
            bitLengthLengths,
            bitLengthCodes
        );
        bitOffset = _sendTree(
            out,
            bitOffset,
            distanceLengths,
            distanceMaxCode,
            bitLengthLengths,
            bitLengthCodes
        );

        bitOffset = _writeTokenBody(
            out,
            bitOffset,
            kinds,
            values,
            distances,
            literalLengths,
            literalCodes,
            distanceLengths,
            distanceCodes
        );

        return bitOffset;
    }

    function writeDynamicBlockPacked(
        bytes memory out,
        uint256 bitOffset,
        bytes memory tokens,
        bool finalBlock
    ) internal pure returns (uint256) {
        if (tokens.length % 5 != 0) revert InvalidPackedTokens();

        (
            uint8[] memory literalLengths,
            uint16 literalMaxCode,
            uint8[] memory distanceLengths,
            uint16 distanceMaxCode,
            uint8[] memory bitLengthLengths,
            uint16 bitLengthMaxCode,
            uint8 maxBlIndex
        ) = _buildTreesPacked(tokens);

        uint16[] memory bitLengthCodes =
            ZlibTrees.buildCanonicalCodes(bitLengthLengths, bitLengthMaxCode);
        uint16[] memory literalCodes =
            ZlibTrees.buildCanonicalCodes(literalLengths, literalMaxCode);
        uint16[] memory distanceCodes =
            ZlibTrees.buildCanonicalCodes(distanceLengths, distanceMaxCode);

        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, finalBlock ? 1 : 0, 1);
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, 2, 2);
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, literalMaxCode + 1 - 257, 5);
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, distanceMaxCode, 5);
        bitOffset = ZlibBitWriter.writeBits(out, bitOffset, maxBlIndex + 1 - 4, 4);

        for (uint8 rank; rank <= maxBlIndex; ++rank) {
            bitOffset = ZlibBitWriter.writeBits(
                out,
                bitOffset,
                _lengthAt(bitLengthLengths, _codeLengthOrder(rank)),
                3
            );
            if (rank == maxBlIndex) break;
        }

        bitOffset = _sendTree(
            out,
            bitOffset,
            literalLengths,
            literalMaxCode,
            bitLengthLengths,
            bitLengthCodes
        );
        bitOffset = _sendTree(
            out,
            bitOffset,
            distanceLengths,
            distanceMaxCode,
            bitLengthLengths,
            bitLengthCodes
        );

        return _writePackedTokenBody(
            out,
            bitOffset,
            tokens,
            literalLengths,
            literalCodes,
            distanceLengths,
            distanceCodes
        );
    }

    function _buildTrees(
        uint8[] memory kinds,
        uint16[] memory values,
        uint16[] memory distances
    )
        private
        pure
        returns (
            uint8[] memory literalLengths,
            uint16 literalMaxCode,
            uint8[] memory distanceLengths,
            uint16 distanceMaxCode,
            uint8[] memory bitLengthLengths,
            uint16 bitLengthMaxCode,
            uint8 maxBlIndex
        )
    {
        uint32[] memory literalFreqs = new uint32[](L_CODES);
        uint32[] memory distanceFreqs = new uint32[](D_CODES);
        literalFreqs[END_BLOCK] = 1;

        for (uint256 i; i < kinds.length; ++i) {
            if (kinds[i] == 0) {
                if (values[i] > 255) revert InvalidLiteral();
                literalFreqs[values[i]]++;
            } else if (kinds[i] == 1) {
                ZlibSymbols.Symbol memory lengthCode = ZlibSymbols.lengthSymbol(values[i]);
                ZlibSymbols.Symbol memory distanceCode =
                    ZlibSymbols.distanceSymbol(distances[i]);
                literalFreqs[lengthCode.symbol]++;
                distanceFreqs[distanceCode.symbol]++;
            } else {
                revert InvalidTokenKind();
            }
        }

        (literalLengths, literalMaxCode) =
            ZlibTrees.buildBitLengths(literalFreqs, L_CODES, MAX_BITS);
        (distanceLengths, distanceMaxCode) =
            ZlibTrees.buildBitLengths(distanceFreqs, D_CODES, MAX_BITS);

        uint32[] memory bitLengthFreqs = new uint32[](BL_CODES);
        ZlibTrees.scanTree(bitLengthFreqs, literalLengths, literalMaxCode);
        ZlibTrees.scanTree(bitLengthFreqs, distanceLengths, distanceMaxCode);
        (bitLengthLengths, bitLengthMaxCode) =
            ZlibTrees.buildBitLengths(bitLengthFreqs, BL_CODES, MAX_BL_BITS);

        maxBlIndex = uint8(BL_CODES - 1);
        while (
            maxBlIndex >= 3
                && _lengthAt(bitLengthLengths, _codeLengthOrder(maxBlIndex)) == 0
        ) {
            --maxBlIndex;
        }
        if (maxBlIndex < 3) maxBlIndex = 3;
    }

    function _buildTreesPacked(bytes memory tokens)
        private
        pure
        returns (
            uint8[] memory literalLengths,
            uint16 literalMaxCode,
            uint8[] memory distanceLengths,
            uint16 distanceMaxCode,
            uint8[] memory bitLengthLengths,
            uint16 bitLengthMaxCode,
            uint8 maxBlIndex
        )
    {
        uint32[] memory literalFreqs = new uint32[](L_CODES);
        uint32[] memory distanceFreqs = new uint32[](D_CODES);
        literalFreqs[END_BLOCK] = 1;

        for (uint256 offset; offset < tokens.length; offset += 5) {
            uint8 kind = _tokenKind(tokens, offset);
            uint16 value = _tokenValue(tokens, offset);
            if (kind == 0) {
                if (value > 255) revert InvalidLiteral();
                literalFreqs[value]++;
            } else if (kind == 1) {
                ZlibSymbols.Symbol memory lengthCode = ZlibSymbols.lengthSymbol(value);
                ZlibSymbols.Symbol memory distanceCode =
                    ZlibSymbols.distanceSymbol(_tokenDistance(tokens, offset));
                literalFreqs[lengthCode.symbol]++;
                distanceFreqs[distanceCode.symbol]++;
            } else {
                revert InvalidTokenKind();
            }
        }

        (literalLengths, literalMaxCode) =
            ZlibTrees.buildBitLengths(literalFreqs, L_CODES, MAX_BITS);
        (distanceLengths, distanceMaxCode) =
            ZlibTrees.buildBitLengths(distanceFreqs, D_CODES, MAX_BITS);

        uint32[] memory bitLengthFreqs = new uint32[](BL_CODES);
        ZlibTrees.scanTree(bitLengthFreqs, literalLengths, literalMaxCode);
        ZlibTrees.scanTree(bitLengthFreqs, distanceLengths, distanceMaxCode);
        (bitLengthLengths, bitLengthMaxCode) =
            ZlibTrees.buildBitLengths(bitLengthFreqs, BL_CODES, MAX_BL_BITS);

        maxBlIndex = uint8(BL_CODES - 1);
        while (
            maxBlIndex >= 3
                && _lengthAt(bitLengthLengths, _codeLengthOrder(maxBlIndex)) == 0
        ) {
            --maxBlIndex;
        }
        if (maxBlIndex < 3) maxBlIndex = 3;
    }

    function _sendTree(
        bytes memory out,
        uint256 bitOffset,
        uint8[] memory lengths,
        uint16 maxCode,
        uint8[] memory bitLengthLengths,
        uint16[] memory bitLengthCodes
    ) private pure returns (uint256) {
        (uint8[] memory symbols, uint8[] memory extraBits, uint8[] memory extraValues) =
            ZlibTrees.encodeTree(lengths, maxCode);

        for (uint256 i; i < symbols.length; ++i) {
            bitOffset = _writeCode(
                out,
                bitOffset,
                bitLengthCodes,
                bitLengthLengths,
                symbols[i]
            );
            if (extraBits[i] != 0) {
                bitOffset =
                    ZlibBitWriter.writeBits(out, bitOffset, extraValues[i], extraBits[i]);
            }
        }

        return bitOffset;
    }

    function _writeTokenBody(
        bytes memory out,
        uint256 bitOffset,
        uint8[] memory kinds,
        uint16[] memory values,
        uint16[] memory distances,
        uint8[] memory literalLengths,
        uint16[] memory literalCodes,
        uint8[] memory distanceLengths,
        uint16[] memory distanceCodes
    ) private pure returns (uint256) {
        for (uint256 i; i < kinds.length; ++i) {
            if (kinds[i] == 0) {
                bitOffset = _writeCode(
                    out,
                    bitOffset,
                    literalCodes,
                    literalLengths,
                    uint8(values[i])
                );
            } else {
                ZlibSymbols.Symbol memory lengthCode = ZlibSymbols.lengthSymbol(values[i]);
                bitOffset = _writeCode(
                    out,
                    bitOffset,
                    literalCodes,
                    literalLengths,
                    lengthCode.symbol
                );
                if (lengthCode.extraBits != 0) {
                    bitOffset = ZlibBitWriter.writeBits(
                        out,
                        bitOffset,
                        lengthCode.extraValue,
                        lengthCode.extraBits
                    );
                }

                ZlibSymbols.Symbol memory distanceCode =
                    ZlibSymbols.distanceSymbol(distances[i]);
                bitOffset = _writeCode(
                    out,
                    bitOffset,
                    distanceCodes,
                    distanceLengths,
                    distanceCode.symbol
                );
                if (distanceCode.extraBits != 0) {
                    bitOffset = ZlibBitWriter.writeBits(
                        out,
                        bitOffset,
                        distanceCode.extraValue,
                        distanceCode.extraBits
                    );
                }
            }
        }

        return _writeCode(
            out,
            bitOffset,
            literalCodes,
            literalLengths,
            END_BLOCK
        );
    }

    function _writePackedTokenBody(
        bytes memory out,
        uint256 bitOffset,
        bytes memory tokens,
        uint8[] memory literalLengths,
        uint16[] memory literalCodes,
        uint8[] memory distanceLengths,
        uint16[] memory distanceCodes
    ) private pure returns (uint256) {
        for (uint256 offset; offset < tokens.length; offset += 5) {
            uint8 kind = _tokenKind(tokens, offset);
            uint16 value = _tokenValue(tokens, offset);
            if (kind == 0) {
                bitOffset = _writeCode(
                    out,
                    bitOffset,
                    literalCodes,
                    literalLengths,
                    value
                );
            } else {
                ZlibSymbols.Symbol memory lengthCode = ZlibSymbols.lengthSymbol(value);
                bitOffset = _writeCode(
                    out,
                    bitOffset,
                    literalCodes,
                    literalLengths,
                    lengthCode.symbol
                );
                if (lengthCode.extraBits != 0) {
                    bitOffset = ZlibBitWriter.writeBits(
                        out,
                        bitOffset,
                        lengthCode.extraValue,
                        lengthCode.extraBits
                    );
                }

                ZlibSymbols.Symbol memory distanceCode =
                    ZlibSymbols.distanceSymbol(_tokenDistance(tokens, offset));
                bitOffset = _writeCode(
                    out,
                    bitOffset,
                    distanceCodes,
                    distanceLengths,
                    distanceCode.symbol
                );
                if (distanceCode.extraBits != 0) {
                    bitOffset = ZlibBitWriter.writeBits(
                        out,
                        bitOffset,
                        distanceCode.extraValue,
                        distanceCode.extraBits
                    );
                }
            }
        }

        return _writeCode(
            out,
            bitOffset,
            literalCodes,
            literalLengths,
            END_BLOCK
        );
    }

    function _writeCode(
        bytes memory out,
        uint256 bitOffset,
        uint16[] memory codes,
        uint8[] memory lengths,
        uint16 symbol
    ) private pure returns (uint256) {
        if (symbol >= lengths.length || lengths[symbol] == 0) revert MissingCode();
        return ZlibBitWriter.writeBits(out, bitOffset, codes[symbol], lengths[symbol]);
    }

    function _lengthAt(uint8[] memory lengths, uint8 index) private pure returns (uint8) {
        return index < lengths.length ? lengths[index] : 0;
    }

    function _tokenKind(bytes memory tokens, uint256 offset) private pure returns (uint8 value) {
        assembly ("memory-safe") {
            value := byte(0, mload(add(add(tokens, 0x20), offset)))
        }
    }

    function _tokenValue(bytes memory tokens, uint256 offset) private pure returns (uint16 value) {
        assembly ("memory-safe") {
            value := shr(240, mload(add(add(tokens, 0x21), offset)))
        }
    }

    function _tokenDistance(bytes memory tokens, uint256 offset)
        private
        pure
        returns (uint16 value)
    {
        assembly ("memory-safe") {
            value := shr(240, mload(add(add(tokens, 0x23), offset)))
        }
    }

    function _codeLengthOrder(uint8 rank) private pure returns (uint8) {
        uint8[19] memory order = [
            uint8(16),
            uint8(17),
            uint8(18),
            uint8(0),
            uint8(8),
            uint8(7),
            uint8(9),
            uint8(6),
            uint8(10),
            uint8(5),
            uint8(11),
            uint8(4),
            uint8(12),
            uint8(3),
            uint8(13),
            uint8(2),
            uint8(14),
            uint8(1),
            uint8(15)
        ];
        return order[rank];
    }
}
