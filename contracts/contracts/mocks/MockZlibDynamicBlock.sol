// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ZlibDynamicBlock} from "../lib/ZlibDynamicBlock.sol";

contract MockZlibDynamicBlock {
    function encodeDynamicBlock(
        uint8[] memory kinds,
        uint16[] memory values,
        uint16[] memory distances,
        bool finalBlock
    ) external pure returns (bytes memory) {
        return ZlibDynamicBlock.encodeDynamicBlock(kinds, values, distances, finalBlock);
    }
}
