// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  ZlibSymbols
/// @notice DEFLATE length and distance symbol mapping helpers.
library ZlibSymbols {
    struct Symbol {
        uint16 symbol;
        uint8 extraBits;
        uint16 extraValue;
    }

    error InvalidMatchLength();
    error InvalidMatchDistance();

    function lengthSymbol(uint16 length) internal pure returns (Symbol memory code) {
        if (length == 258) return Symbol({symbol: 285, extraBits: 0, extraValue: 0});
        if (length < 3 || length > 258) revert InvalidMatchLength();

        uint16 n = length - 3;
        if (n < 8) return Symbol({symbol: 257 + n, extraBits: 0, extraValue: 0});

        uint16 base = 11;
        uint16 symbol = 265;
        for (uint8 extraBits = 1; extraBits <= 5; ++extraBits) {
            uint16 span = uint16(1) << extraBits;
            uint16 groupSize = span * 4;
            if (length < base + groupSize) {
                uint16 index = (length - base) / span;
                return Symbol({
                    symbol: symbol + index,
                    extraBits: extraBits,
                    extraValue: length - (base + index * span)
                });
            }
            base += groupSize;
            symbol += 4;
        }

        revert InvalidMatchLength();
    }

    function distanceSymbol(uint16 distance) internal pure returns (Symbol memory code) {
        if (distance == 0 || distance > 32_768) revert InvalidMatchDistance();
        if (distance <= 4) {
            return Symbol({symbol: distance - 1, extraBits: 0, extraValue: 0});
        }

        uint16 base = 5;
        uint16 symbol = 4;
        for (uint8 extraBits = 1; extraBits <= 13; ++extraBits) {
            uint16 span = uint16(1) << extraBits;
            uint16 groupSize = span * 2;
            if (distance < base + groupSize) {
                uint16 index = (distance - base) / span;
                return Symbol({
                    symbol: symbol + index,
                    extraBits: extraBits,
                    extraValue: distance - (base + index * span)
                });
            }
            base += groupSize;
            symbol += 2;
        }

        revert InvalidMatchDistance();
    }
}
