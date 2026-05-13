// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  ZlibTrees
/// @notice Small Solidity port of zlib's heap-based Huffman tree helpers.
/// @dev    This mirrors `trees.c:build_tree` through `gen_bitlen`. It returns
///         code lengths and `gen_codes`-style bit-reversed canonical codes.
///         DEFLATE bit emission lives in later compressor layers.
library ZlibTrees {
    uint8 internal constant REP_3_6 = 16;
    uint8 internal constant REPZ_3_10 = 17;
    uint8 internal constant REPZ_11_138 = 18;

    struct Node {
        uint32 freq;
        uint16 dad;
        uint8 len;
    }

    error InvalidElementCount();
    error InvalidMaxLength();

    function buildBitLengths(
        uint32[] memory frequencies,
        uint16 elementCount,
        uint8 maxLength
    ) internal pure returns (uint8[] memory lengths, uint16 maxCode) {
        if (elementCount == 0 || frequencies.length < elementCount) {
            revert InvalidElementCount();
        }
        if (maxLength == 0 || maxLength > 15) revert InvalidMaxLength();

        uint256 heapCapacity = uint256(elementCount) * 2 + 1;
        Node[] memory tree = new Node[](heapCapacity);
        uint16[] memory heap = new uint16[](heapCapacity);
        uint8[] memory depth = new uint8[](heapCapacity);
        uint16[] memory bitLengthCounts = new uint16[](16);

        int256 signedMaxCode = -1;
        uint16 heapLength;
        uint16 heapMax = uint16(heapCapacity);

        for (uint16 n; n < elementCount; ++n) {
            uint32 freq = frequencies[n];
            tree[n].freq = freq;
            if (freq != 0) {
                heap[++heapLength] = n;
                signedMaxCode = int256(uint256(n));
            }
        }

        while (heapLength < 2) {
            uint16 node = signedMaxCode < 2
                ? uint16(uint256(++signedMaxCode))
                : uint16(0);
            heap[++heapLength] = node;
            tree[node].freq = 1;
        }

        for (uint16 n = heapLength / 2; n >= 1; --n) {
            _pqdownheap(tree, heap, depth, heapLength, n);
            if (n == 1) break;
        }

        uint16 nextNode = elementCount;
        do {
            uint16 first = heap[1];
            heap[1] = heap[heapLength--];
            _pqdownheap(tree, heap, depth, heapLength, 1);

            uint16 second = heap[1];
            heap[--heapMax] = first;
            heap[--heapMax] = second;

            tree[nextNode].freq = tree[first].freq + tree[second].freq;
            depth[nextNode] = _max(depth[first], depth[second]) + 1;
            tree[first].dad = nextNode;
            tree[second].dad = nextNode;
            heap[1] = nextNode++;
            _pqdownheap(tree, heap, depth, heapLength, 1);
        } while (heapLength >= 2);

        heap[--heapMax] = heap[1];
        maxCode = uint16(uint256(signedMaxCode));
        _generateBitLengths(
            tree,
            heap,
            bitLengthCounts,
            heapMax,
            uint16(heapCapacity),
            maxCode,
            maxLength
        );

        lengths = new uint8[](uint256(maxCode) + 1);
        for (uint16 i; i <= maxCode; ++i) {
            lengths[i] = tree[i].len;
            if (i == maxCode) break;
        }
    }

    function buildCanonicalCodes(uint8[] memory lengths, uint16 maxCode)
        internal
        pure
        returns (uint16[] memory codes)
    {
        if (lengths.length <= maxCode) revert InvalidElementCount();

        uint16[] memory bitLengthCounts = new uint16[](16);
        for (uint16 i; i <= maxCode; ++i) {
            uint8 len = lengths[i];
            if (len > 15) revert InvalidMaxLength();
            if (len != 0) bitLengthCounts[len]++;
            if (i == maxCode) break;
        }

        uint16[] memory nextCode = new uint16[](16);
        uint16 code;
        for (uint8 bits = 1; bits <= 15; ++bits) {
            code = uint16((uint256(code) + bitLengthCounts[bits - 1]) << 1);
            nextCode[bits] = code;
        }

        codes = new uint16[](uint256(maxCode) + 1);
        for (uint16 symbol; symbol <= maxCode; ++symbol) {
            uint8 len = lengths[symbol];
            if (len != 0) {
                codes[symbol] = _reverseBits(nextCode[len]++, len);
            }
            if (symbol == maxCode) break;
        }
    }

    function scanTree(
        uint32[] memory bitLengthFrequencies,
        uint8[] memory lengths,
        uint16 maxCode
    ) internal pure {
        if (bitLengthFrequencies.length < 19 || lengths.length <= maxCode) {
            revert InvalidElementCount();
        }

        uint16 previousLength = type(uint16).max;
        uint8 currentLength;
        uint16 nextLength = lengths[0];
        uint16 count;
        uint16 maxCount = 7;
        uint16 minCount = 4;

        if (nextLength == 0) {
            maxCount = 138;
            minCount = 3;
        }

        for (uint16 n; n <= maxCode; ++n) {
            currentLength = uint8(nextLength);
            nextLength = n == maxCode ? 0xffff : lengths[n + 1];
            if (++count < maxCount && currentLength == nextLength) {
                if (n == maxCode) break;
                continue;
            } else if (count < minCount) {
                bitLengthFrequencies[currentLength] += count;
            } else if (currentLength != 0) {
                if (previousLength != currentLength) {
                    bitLengthFrequencies[currentLength]++;
                }
                bitLengthFrequencies[REP_3_6]++;
            } else if (count <= 10) {
                bitLengthFrequencies[REPZ_3_10]++;
            } else {
                bitLengthFrequencies[REPZ_11_138]++;
            }

            count = 0;
            previousLength = currentLength;
            if (nextLength == 0) {
                maxCount = 138;
                minCount = 3;
            } else if (currentLength == nextLength) {
                maxCount = 6;
                minCount = 3;
            } else {
                maxCount = 7;
                minCount = 4;
            }

            if (n == maxCode) break;
        }
    }

    function encodeTree(
        uint8[] memory lengths,
        uint16 maxCode
    )
        internal
        pure
        returns (
            uint8[] memory symbols,
            uint8[] memory extraBits,
            uint8[] memory extraValues
        )
    {
        if (lengths.length <= maxCode) revert InvalidElementCount();

        symbols = new uint8[](uint256(maxCode) + 1);
        extraBits = new uint8[](uint256(maxCode) + 1);
        extraValues = new uint8[](uint256(maxCode) + 1);

        uint16 previousLength = type(uint16).max;
        uint8 currentLength;
        uint16 nextLength = lengths[0];
        uint16 count;
        uint16 maxCount = 7;
        uint16 minCount = 4;
        uint256 out;

        if (nextLength == 0) {
            maxCount = 138;
            minCount = 3;
        }

        for (uint16 n; n <= maxCode; ++n) {
            currentLength = uint8(nextLength);
            nextLength = n == maxCode ? 0xffff : lengths[n + 1];
            if (++count < maxCount && currentLength == nextLength) {
                if (n == maxCode) break;
                continue;
            } else if (count < minCount) {
                do {
                    symbols[out++] = currentLength;
                } while (--count != 0);
            } else if (currentLength != 0) {
                if (previousLength != currentLength) {
                    symbols[out++] = currentLength;
                    --count;
                }
                symbols[out] = REP_3_6;
                extraBits[out] = 2;
                extraValues[out++] = uint8(count - 3);
            } else if (count <= 10) {
                symbols[out] = REPZ_3_10;
                extraBits[out] = 3;
                extraValues[out++] = uint8(count - 3);
            } else {
                symbols[out] = REPZ_11_138;
                extraBits[out] = 7;
                extraValues[out++] = uint8(count - 11);
            }

            count = 0;
            previousLength = currentLength;
            if (nextLength == 0) {
                maxCount = 138;
                minCount = 3;
            } else if (currentLength == nextLength) {
                maxCount = 6;
                minCount = 3;
            } else {
                maxCount = 7;
                minCount = 4;
            }

            if (n == maxCode) break;
        }

        assembly ("memory-safe") {
            mstore(symbols, out)
            mstore(extraBits, out)
            mstore(extraValues, out)
        }
    }

    function _generateBitLengths(
        Node[] memory tree,
        uint16[] memory heap,
        uint16[] memory bitLengthCounts,
        uint16 heapMax,
        uint16 heapCapacity,
        uint16 maxCode,
        uint8 maxLength
    ) private pure {
        uint16 overflow;
        tree[heap[heapMax]].len = 0;

        for (uint16 heapIndex = heapMax + 1; heapIndex < heapCapacity; ++heapIndex) {
            uint16 n = heap[heapIndex];
            uint8 bits = tree[tree[n].dad].len + 1;
            if (bits > maxLength) {
                bits = maxLength;
                ++overflow;
            }
            tree[n].len = bits;
            if (n > maxCode) continue;
            bitLengthCounts[bits]++;
        }

        if (overflow == 0) return;

        do {
            uint8 bits = maxLength - 1;
            while (bitLengthCounts[bits] == 0) --bits;
            bitLengthCounts[bits]--;
            bitLengthCounts[bits + 1] += 2;
            bitLengthCounts[maxLength]--;
            overflow -= 2;
        } while (overflow > 0);

        uint16 h = heapCapacity;
        for (uint8 bits = maxLength; bits != 0; --bits) {
            uint16 count = bitLengthCounts[bits];
            while (count != 0) {
                uint16 m = heap[--h];
                if (m > maxCode) continue;
                tree[m].len = bits;
                --count;
            }
        }
    }

    function _pqdownheap(
        Node[] memory tree,
        uint16[] memory heap,
        uint8[] memory depth,
        uint16 heapLength,
        uint16 start
    ) private pure {
        uint16 value = heap[start];
        uint16 k = start;
        uint16 j = k << 1;
        while (j <= heapLength) {
            if (
                j < heapLength
                    && _smaller(tree, heap[j + 1], heap[j], depth)
            ) ++j;
            if (_smaller(tree, value, heap[j], depth)) break;
            heap[k] = heap[j];
            k = j;
            j <<= 1;
        }
        heap[k] = value;
    }

    function _smaller(
        Node[] memory tree,
        uint16 left,
        uint16 right,
        uint8[] memory depth
    ) private pure returns (bool) {
        return tree[left].freq < tree[right].freq
            || (tree[left].freq == tree[right].freq && depth[left] <= depth[right]);
    }

    function _max(uint8 a, uint8 b) private pure returns (uint8) {
        return a >= b ? a : b;
    }

    function _reverseBits(uint16 code, uint8 len) private pure returns (uint16) {
        uint16 result;
        for (uint8 i; i < len; ++i) {
            result = (result << 1) | (code & 1);
            code >>= 1;
        }
        return result;
    }
}
