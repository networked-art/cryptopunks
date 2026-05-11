// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IPunkTransferHelper {
    function transfer721PunkToStash(bytes32 _packedData) external;
    function transferLegacyWrappedPunkToStash(bytes32 _packedData) external;
}
