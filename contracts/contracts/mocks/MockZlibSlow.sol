// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ZlibSlow} from "../lib/ZlibSlow.sol";

contract MockZlibSlow {
    function generateTokens(bytes memory input)
        external
        pure
        returns (
            uint32[] memory positions,
            uint8[] memory kinds,
            uint16[] memory values,
            uint16[] memory distances
        )
    {
        return ZlibSlow.generateTokens(input);
    }

    function generateTokenRange(bytes memory input, uint32 skipTokens, uint32 maxTokens)
        external
        pure
        returns (
            uint32[] memory positions,
            uint8[] memory kinds,
            uint16[] memory values,
            uint16[] memory distances
        )
    {
        return ZlibSlow.generateTokenRange(input, skipTokens, maxTokens);
    }
}
