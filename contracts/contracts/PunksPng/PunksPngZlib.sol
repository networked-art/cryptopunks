// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../lib/ZlibDynamicBlock.sol";
import "../lib/ZlibSlow.sol";

/// @title  PunksPngZlib
/// @notice Stateless helper for the canonical `punks.png` zlib compressor path.
contract PunksPngZlib {
    error TokenRangeIncomplete();

    function generatedTokenRangeLength(
        bytes memory input,
        uint32 skipTokens,
        uint32 maxTokens
    ) external pure returns (uint256) {
        bytes memory tokens = ZlibSlow.generateTokenRangePacked(input, skipTokens, maxTokens);
        return tokens.length / 5;
    }

    function encodeDynamicBlockFromTokenRange(
        bytes memory input,
        uint32 skipTokens,
        uint16 tokenCount,
        bool finalBlock
    ) external pure returns (bytes memory) {
        bytes memory tokens = ZlibSlow.generateTokenRangePacked(input, skipTokens, tokenCount);
        if (tokens.length != uint256(tokenCount) * 5) revert TokenRangeIncomplete();

        return ZlibDynamicBlock.encodeDynamicBlockPacked(tokens, finalBlock);
    }
}
