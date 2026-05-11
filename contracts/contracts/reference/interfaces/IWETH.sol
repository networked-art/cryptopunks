// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.23;

interface IWETH {
    function transfer(address dst, uint256 wad) external;
    function transferFrom(address src, address dst, uint256 wad) external;
    function deposit() external payable;
    function withdraw(uint256 wad) external;
    function balanceOf(address user) external view returns (uint256);
    function approve(address guy, uint256 wad) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}
