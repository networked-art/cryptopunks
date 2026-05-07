// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Minimal SSTORE2-style bytecode blob storage.
/// @dev Runtime code is `STOP || data`; reads skip the leading STOP byte.
library BytecodeBlob {
    uint256 internal constant MAX_DATA_SIZE = 24_575;

    error BlobTooLarge();
    error BlobWriteFailed();
    error BlobPointerEmpty();
    error BlobReadOutOfBounds();

    function write(bytes memory data) internal returns (address pointer) {
        uint256 dataLength = data.length;
        if (dataLength == 0 || dataLength > MAX_DATA_SIZE) revert BlobTooLarge();

        bytes memory runtime = abi.encodePacked(hex"00", data);
        bytes memory initCode = abi.encodePacked(
            bytes1(0x61),
            bytes2(uint16(runtime.length)),
            hex"80600a3d393df3",
            runtime
        );

        assembly ("memory-safe") {
            pointer := create(0, add(initCode, 0x20), mload(initCode))
        }
        if (pointer == address(0)) revert BlobWriteFailed();
    }

    function dataSize(address pointer) internal view returns (uint256 size) {
        size = pointer.code.length;
        if (size == 0) revert BlobPointerEmpty();
        unchecked {
            size -= 1;
        }
    }

    function read(address pointer, uint256 start, uint256 length)
        internal
        view
        returns (bytes memory data)
    {
        uint256 size = dataSize(pointer);
        if (start > size || length > size - start) revert BlobReadOutOfBounds();

        data = new bytes(length);
        assembly ("memory-safe") {
            extcodecopy(pointer, add(data, 0x20), add(start, 1), length)
        }
    }
}
