// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.9.0) (token/ERC721/IERC721.sol)

pragma solidity ^0.8.0;

import "forge-std/interfaces/IERC165.sol";
import {OrderType} from "../helpers/Enum.sol";

/**
 * @dev Required interface of an ERC721 compliant contract.
 */
interface IAuction is IERC165 {
    error AuctionNotOpen();
    error BidTooLow();
    error CannotFinalizeOpenAuction();

    function bidConfig() external view returns (address, OrderType);

    function open() external view returns (bool);

    function finalized() external view returns (bool);

    function withdraw() external;

    function currentPrice() external view returns (uint80);
}
