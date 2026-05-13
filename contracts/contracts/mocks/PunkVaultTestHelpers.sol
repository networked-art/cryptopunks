// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

contract MockCallTarget {
    error TargetReverted(bytes data);

    uint256 public calls;
    address public lastSender;
    uint256 public lastValue;
    bytes public lastData;
    uint256 public stored;

    event Recorded(address indexed sender, uint256 value, bytes data);

    receive() external payable {
        ++calls;
        lastSender = msg.sender;
        lastValue = msg.value;
        lastData = "";
        emit Recorded(msg.sender, msg.value, "");
    }

    function record(bytes calldata data) external payable returns (bytes memory) {
        ++calls;
        lastSender = msg.sender;
        lastValue = msg.value;
        lastData = data;
        emit Recorded(msg.sender, msg.value, data);
        return abi.encode(msg.sender, msg.value, data, calls);
    }

    function setStored(uint256 value) external payable returns (uint256) {
        ++calls;
        lastSender = msg.sender;
        lastValue = msg.value;
        stored = value;
        emit Recorded(msg.sender, msg.value, abi.encode(value));
        return value;
    }

    function revertWith(bytes calldata data) external pure {
        revert TargetReverted(data);
    }
}

contract MockERC1271Owner {
    bytes4 internal constant MAGIC_VALUE = 0x1626ba7e;
    bytes4 internal constant INVALID_VALUE = 0xffffffff;

    mapping(bytes32 key => bool) public valid;

    function setValid(bytes32 hash, bytes calldata signature, bool isValid) external {
        valid[_key(hash, signature)] = isValid;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature)
        external
        view
        returns (bytes4)
    {
        return valid[_key(hash, signature)] ? MAGIC_VALUE : INVALID_VALUE;
    }

    function _key(bytes32 hash, bytes calldata signature) private pure returns (bytes32) {
        return keccak256(abi.encode(hash, signature));
    }
}

contract RejectEther {
    receive() external payable {
        revert("reject ether");
    }
}

contract MockStash {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    receive() external payable {}
}

contract MockStashFactory {
    function stashAddressFor(address owner) public view returns (address) {
        bytes32 salt = _salt(owner);
        bytes memory bytecode = abi.encodePacked(type(MockStash).creationCode, abi.encode(owner));
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode))
        );
        return address(uint160(uint256(hash)));
    }

    function deployStash(address owner) external returns (address deployedAddress) {
        address predicted = stashAddressFor(owner);
        if (predicted.code.length != 0) return predicted;
        deployedAddress = address(new MockStash{salt: _salt(owner)}(owner));
        require(deployedAddress == predicted, "stash mismatch");
    }

    function _salt(address owner) private pure returns (bytes32) {
        return bytes32(uint256(uint160(owner)));
    }
}
