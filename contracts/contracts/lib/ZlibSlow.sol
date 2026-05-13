// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  ZlibSlow
/// @notice Small Solidity port of zlib level-9/default-strategy lazy LZ77 token selection.
library ZlibSlow {
    uint32 private constant MIN_MATCH = 3;
    uint32 private constant MAX_MATCH = 258;
    uint32 private constant MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1;
    uint32 private constant MAX_DIST = 32_768 - MIN_LOOKAHEAD;
    uint32 private constant TOO_FAR = 4_096;
    uint32 private constant HASH_BITS = 15;
    uint32 private constant HASH_SIZE = 32_768;
    uint32 private constant HASH_MASK = HASH_SIZE - 1;
    uint32 private constant HASH_SHIFT = 5;
    uint32 private constant GOOD_MATCH = 32;
    uint32 private constant MAX_LAZY_MATCH = 258;
    uint32 private constant NICE_MATCH = 258;
    uint32 private constant MAX_CHAIN_LENGTH = 4_096;

    struct Match {
        uint32 length;
        uint32 start;
    }

    function generateTokens(bytes memory input)
        internal
        pure
        returns (
            uint32[] memory positions,
            uint8[] memory kinds,
            uint16[] memory values,
            uint16[] memory distances
        )
    {
        return _generateTokens(input, 0, type(uint32).max);
    }

    function generateTokenRange(bytes memory input, uint32 skipTokens, uint32 maxTokens)
        internal
        pure
        returns (
            uint32[] memory positions,
            uint8[] memory kinds,
            uint16[] memory values,
            uint16[] memory distances
        )
    {
        return _generateTokens(input, skipTokens, maxTokens);
    }

    function generateTokenRangePacked(bytes memory input, uint32 skipTokens, uint32 maxTokens)
        internal
        pure
        returns (bytes memory tokens)
    {
        bytes memory raw = new bytes(input.length + MAX_MATCH);
        assembly ("memory-safe") {
            mcopy(add(raw, 0x20), add(input, 0x20), mload(input))
        }
        return _generateTokenRangePacked(
            raw,
            uint32(input.length),
            skipTokens,
            maxTokens,
            0,
            0,
            false
        );
    }

    function generateTokenRangePacked(
        bytes memory paddedInput,
        uint32 inputLength,
        uint32 skipTokens,
        uint32 maxTokens
    ) internal pure returns (bytes memory tokens) {
        return _generateTokenRangePacked(
            paddedInput,
            inputLength,
            skipTokens,
            maxTokens,
            0,
            0,
            false
        );
    }

    function generateTokenRangePackedFromPosition(
        bytes memory paddedInput,
        uint32 inputLength,
        uint32 baseOffset,
        uint32 startOffset,
        uint32 maxTokens
    ) internal pure returns (bytes memory tokens) {
        return _generateTokenRangePacked(
            paddedInput,
            inputLength,
            0,
            maxTokens,
            baseOffset,
            startOffset,
            true
        );
    }

    function _generateTokenRangePacked(
        bytes memory raw,
        uint32 inputLength,
        uint32 skipTokens,
        uint32 maxTokens,
        uint32 baseOffset,
        uint32 startOffset,
        bool byPosition
    ) private pure returns (bytes memory tokens) {
        if (maxTokens == 0) return new bytes(0);

        uint256 capacity = uint256(inputLength) + 1;
        if (maxTokens != type(uint32).max) capacity = maxTokens;
        tokens = new bytes(capacity * 5);

        bytes memory head = new bytes(HASH_SIZE * 4);
        bytes memory previous = new bytes(HASH_SIZE * 4);

        uint32 insertHash;
        uint32 strstart;
        uint32 lookahead = inputLength;
        uint32 matchLength = MIN_MATCH - 1;
        uint32 matchStart;
        bool matchAvailable;
        uint256 tokenIndex;
        uint256 tokenCount;
        uint256 stopToken = uint256(skipTokens) + maxTokens;

        while (lookahead > 0) {
            uint32 hashHead;
            if (lookahead >= MIN_MATCH) {
                (insertHash, hashHead) =
                    _insertString(raw, head, previous, strstart, insertHash);
            }

            uint32 previousLength = matchLength;
            uint32 previousMatch = matchStart;
            matchLength = MIN_MATCH - 1;

            if (
                hashHead != 0 && previousLength < MAX_LAZY_MATCH
                    && strstart - hashHead <= MAX_DIST
            ) {
                Match memory matchResult =
                    _longestMatch(raw, previous, strstart, hashHead, previousLength, lookahead);
                matchLength = matchResult.length;
                if (matchLength > previousLength) matchStart = matchResult.start;

                if (
                    matchLength <= 5 && matchLength == MIN_MATCH
                        && strstart - matchStart > TOO_FAR
                ) {
                    matchLength = MIN_MATCH - 1;
                }
            }

            if (previousLength >= MIN_MATCH && matchLength <= previousLength) {
                tokenCount = _storePackedToken(
                    tokens,
                    tokenCount,
                tokenIndex,
                skipTokens,
                stopToken,
                strstart - 1,
                baseOffset,
                startOffset,
                byPosition,
                1,
                uint16(previousLength),
                uint16(strstart - 1 - previousMatch)
            );
            ++tokenIndex;

                uint32 maxInsert = strstart + lookahead - MIN_MATCH;
                lookahead -= previousLength - 1;
                previousLength -= 2;
                while (previousLength != 0) {
                    ++strstart;
                    if (strstart <= maxInsert && strstart + 2 < inputLength) {
                        (insertHash,) =
                            _insertString(raw, head, previous, strstart, insertHash);
                    }
                    --previousLength;
                }
                matchAvailable = false;
                matchLength = MIN_MATCH - 1;
                ++strstart;
                if (byPosition ? tokenCount == maxTokens : tokenIndex == stopToken) break;
            } else if (matchAvailable) {
                tokenCount = _storePackedToken(
                    tokens,
                    tokenCount,
                    tokenIndex,
                    skipTokens,
                    stopToken,
                    strstart - 1,
                    baseOffset,
                    startOffset,
                    byPosition,
                    0,
                    _byteAt(raw, strstart - 1),
                    0
                );
                ++tokenIndex;
                ++strstart;
                --lookahead;
                if (byPosition ? tokenCount == maxTokens : tokenIndex == stopToken) break;
            } else {
                matchAvailable = true;
                ++strstart;
                --lookahead;
            }
        }

        if (matchAvailable) {
            tokenCount = _storePackedToken(
                tokens,
                tokenCount,
                tokenIndex,
                skipTokens,
                stopToken,
                strstart - 1,
                baseOffset,
                startOffset,
                byPosition,
                0,
                _byteAt(raw, strstart - 1),
                0
            );
        }

        assembly ("memory-safe") {
            mstore(tokens, mul(tokenCount, 5))
        }
    }

    function _generateTokens(bytes memory input, uint32 skipTokens, uint32 maxTokens)
        private
        pure
        returns (
            uint32[] memory positions,
            uint8[] memory kinds,
            uint16[] memory values,
            uint16[] memory distances
        )
    {
        if (maxTokens == 0) {
            positions = new uint32[](0);
            kinds = new uint8[](0);
            values = new uint16[](0);
            distances = new uint16[](0);
            return (positions, kinds, values, distances);
        }

        bytes memory raw = new bytes(input.length + MAX_MATCH);
        assembly ("memory-safe") {
            mcopy(add(raw, 0x20), add(input, 0x20), mload(input))
        }

        uint256 capacity = input.length + 1;
        if (maxTokens != type(uint32).max) capacity = maxTokens;
        positions = new uint32[](capacity);
        kinds = new uint8[](capacity);
        values = new uint16[](capacity);
        distances = new uint16[](capacity);

        bytes memory head = new bytes(HASH_SIZE * 4);
        bytes memory previous = new bytes(HASH_SIZE * 4);

        uint32 inputLength = uint32(input.length);
        uint32 insertHash;
        uint32 strstart;
        uint32 lookahead = inputLength;
        uint32 matchLength = MIN_MATCH - 1;
        uint32 matchStart;
        bool matchAvailable;
        uint256 tokenIndex;
        uint256 tokenCount;
        uint256 stopToken = uint256(skipTokens) + maxTokens;

        while (lookahead > 0) {
            uint32 hashHead;
            if (lookahead >= MIN_MATCH) {
                (insertHash, hashHead) =
                    _insertString(raw, head, previous, strstart, insertHash);
            }

            uint32 previousLength = matchLength;
            uint32 previousMatch = matchStart;
            matchLength = MIN_MATCH - 1;

            if (
                hashHead != 0 && previousLength < MAX_LAZY_MATCH
                    && strstart - hashHead <= MAX_DIST
            ) {
                Match memory matchResult =
                    _longestMatch(raw, previous, strstart, hashHead, previousLength, lookahead);
                matchLength = matchResult.length;
                if (matchLength > previousLength) matchStart = matchResult.start;

                if (
                    matchLength <= 5 && matchLength == MIN_MATCH
                        && strstart - matchStart > TOO_FAR
                ) {
                    matchLength = MIN_MATCH - 1;
                }
            }

            if (previousLength >= MIN_MATCH && matchLength <= previousLength) {
                tokenCount = _storeToken(
                    positions,
                    kinds,
                    values,
                    distances,
                    tokenCount,
                    tokenIndex,
                    skipTokens,
                    stopToken,
                    strstart - 1,
                    1,
                    uint16(previousLength),
                    uint16(strstart - 1 - previousMatch)
                );
                ++tokenIndex;

                uint32 maxInsert = strstart + lookahead - MIN_MATCH;
                lookahead -= previousLength - 1;
                previousLength -= 2;
                while (previousLength != 0) {
                    ++strstart;
                    if (strstart <= maxInsert && strstart + 2 < inputLength) {
                        (insertHash,) =
                            _insertString(raw, head, previous, strstart, insertHash);
                    }
                    --previousLength;
                }
                matchAvailable = false;
                matchLength = MIN_MATCH - 1;
                ++strstart;
                if (tokenIndex == stopToken) break;
            } else if (matchAvailable) {
                tokenCount = _storeToken(
                    positions,
                    kinds,
                    values,
                    distances,
                    tokenCount,
                    tokenIndex,
                    skipTokens,
                    stopToken,
                    strstart - 1,
                    0,
                    _byteAt(raw, strstart - 1),
                    0
                );
                ++tokenIndex;
                ++strstart;
                --lookahead;
                if (tokenIndex == stopToken) break;
            } else {
                matchAvailable = true;
                ++strstart;
                --lookahead;
            }
        }

        if (matchAvailable) {
            tokenCount = _storeToken(
                positions,
                kinds,
                values,
                distances,
                tokenCount,
                tokenIndex,
                skipTokens,
                stopToken,
                strstart - 1,
                0,
                _byteAt(raw, strstart - 1),
                0
            );
        }

        assembly ("memory-safe") {
            mstore(positions, tokenCount)
            mstore(kinds, tokenCount)
            mstore(values, tokenCount)
            mstore(distances, tokenCount)
        }
    }

    function _storeToken(
        uint32[] memory positions,
        uint8[] memory kinds,
        uint16[] memory values,
        uint16[] memory distances,
        uint256 tokenCount,
        uint256 tokenIndex,
        uint32 skipTokens,
        uint256 stopToken,
        uint32 position,
        uint8 kind,
        uint16 value,
        uint16 distance
    ) private pure returns (uint256) {
        if (tokenIndex >= skipTokens && tokenIndex < stopToken) {
            positions[tokenCount] = position;
            kinds[tokenCount] = kind;
            values[tokenCount] = value;
            distances[tokenCount] = distance;
            return tokenCount + 1;
        }
        return tokenCount;
    }

    function _storePackedToken(
        bytes memory tokens,
        uint256 tokenCount,
        uint256 tokenIndex,
        uint32 skipTokens,
        uint256 stopToken,
        uint32 position,
        uint32 baseOffset,
        uint32 startOffset,
        bool byPosition,
        uint8 kind,
        uint16 value,
        uint16 distance
    ) private pure returns (uint256) {
        if (byPosition) {
            if (tokenCount >= stopToken) return tokenCount;
            if (uint256(baseOffset) + position < startOffset) return tokenCount;
        } else if (tokenIndex < skipTokens || tokenIndex >= stopToken) {
            return tokenCount;
        }

        assembly ("memory-safe") {
            let ptr := add(add(tokens, 0x20), mul(tokenCount, 5))
            mstore8(ptr, kind)
            mstore8(add(ptr, 1), shr(8, value))
            mstore8(add(ptr, 2), value)
            mstore8(add(ptr, 3), shr(8, distance))
            mstore8(add(ptr, 4), distance)
        }
        return tokenCount + 1;
    }

    function _insertString(
        bytes memory raw,
        bytes memory head,
        bytes memory previous,
        uint32 position,
        uint32 insertHash
    ) private pure returns (uint32 nextHash, uint32 matchHead) {
        nextHash = _updateHash(insertHash, _byteAt(raw, position + MIN_MATCH - 1));
        matchHead = _getUint32(head, nextHash);
        _setUint32(previous, position & HASH_MASK, matchHead);
        _setUint32(head, nextHash, position);
    }

    function _longestMatch(
        bytes memory raw,
        bytes memory previous,
        uint32 strstart,
        uint32 currentMatch,
        uint32 previousLength,
        uint32 lookahead
    ) private pure returns (Match memory result) {
        uint32 chainLength = MAX_CHAIN_LENGTH;
        uint32 bestLength = previousLength;
        uint32 bestStart;
        uint32 niceMatch = _min(NICE_MATCH, lookahead);
        uint32 limit = strstart > MAX_DIST ? strstart - MAX_DIST : 0;
        if (previousLength >= GOOD_MATCH) chainLength >>= 2;

        uint16 scan0 = _byteAt(raw, strstart);
        uint16 scan1 = _byteAt(raw, strstart + 1);
        uint16 scanEnd1 = _byteAt(raw, strstart + bestLength - 1);
        uint16 scanEnd = _byteAt(raw, strstart + bestLength);
        uint32 matchPosition = currentMatch;

        while (matchPosition > limit && chainLength != 0) {
            if (
                _byteAt(raw, matchPosition + bestLength) == scanEnd
                    && _byteAt(raw, matchPosition + bestLength - 1) == scanEnd1
                    && _byteAt(raw, matchPosition) == scan0
                    && _byteAt(raw, matchPosition + 1) == scan1
            ) {
                uint32 length = 2;
                uint32 maxLength = _min(MAX_MATCH, lookahead);
                while (
                    length < maxLength
                        && _byteAt(raw, matchPosition + length)
                            == _byteAt(raw, strstart + length)
                ) {
                    ++length;
                }

                if (length > bestLength) {
                    bestLength = length;
                    bestStart = matchPosition;
                    if (length >= niceMatch) break;
                    scanEnd1 = _byteAt(raw, strstart + bestLength - 1);
                    scanEnd = _byteAt(raw, strstart + bestLength);
                }
            }

            matchPosition = _getUint32(previous, matchPosition & HASH_MASK);
            --chainLength;
        }

        result.length = _min(bestLength, lookahead);
        result.start = bestStart;
    }

    function _updateHash(uint32 hash, uint16 value) private pure returns (uint32) {
        return ((hash << HASH_SHIFT) ^ uint32(value)) & HASH_MASK;
    }

    function _byteAt(bytes memory raw, uint32 index) private pure returns (uint16 value) {
        assembly ("memory-safe") {
            value := byte(0, mload(add(add(raw, 0x20), index)))
        }
    }

    function _min(uint32 a, uint32 b) private pure returns (uint32) {
        return a <= b ? a : b;
    }

    function _getUint32(bytes memory data, uint32 index) private pure returns (uint32 value) {
        assembly ("memory-safe") {
            value := shr(224, mload(add(add(data, 0x20), mul(index, 4))))
        }
    }

    function _setUint32(bytes memory data, uint32 index, uint32 value) private pure {
        assembly ("memory-safe") {
            let ptr := add(add(data, 0x20), mul(index, 4))
            mstore8(ptr, shr(24, value))
            mstore8(add(ptr, 1), shr(16, value))
            mstore8(add(ptr, 2), shr(8, value))
            mstore8(add(ptr, 3), value)
        }
    }
}
