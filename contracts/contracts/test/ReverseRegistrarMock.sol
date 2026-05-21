// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  ReverseRegistrarMock
/// @notice Test double for ENS Reverse Registrar constructor calls.
contract ReverseRegistrarMock {
    uint256 public calls;
    address public lastCaller;
    string public lastName;
    mapping(address caller => string name) public nameOf;

    function setName(string memory name) external returns (bytes32) {
        ++calls;
        lastCaller = msg.sender;
        lastName = name;
        nameOf[msg.sender] = name;
        return keccak256(abi.encode(msg.sender, name, calls));
    }
}
