import { parseAbi } from 'viem'

// CryptoPunks V2 — same event surface as V1. The V2 contract is the canonical
// CryptoPunks contract from block 3_914_495 onward.
export const CryptoPunksV2Abi = parseAbi([
  'function punkIndexToAddress(uint256 punkIndex) view returns (address)',
  'function punksOfferedForSale(uint256 punkIndex) view returns (bool isForSale, uint256 punkIndex, address seller, uint256 minValue, address onlySellTo)',
  'function punkBids(uint256 punkIndex) view returns (bool hasBid, uint256 punkIndex, address bidder, uint256 value)',
  'event Assign(address indexed to, uint256 punkIndex)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event PunkTransfer(address indexed from, address indexed to, uint256 punkIndex)',
  'event PunkOffered(uint256 indexed punkIndex, uint256 minValue, address indexed toAddress)',
  'event PunkNoLongerForSale(uint256 indexed punkIndex)',
  'event PunkBidEntered(uint256 indexed punkIndex, uint256 value, address indexed fromAddress)',
  'event PunkBidWithdrawn(uint256 indexed punkIndex, uint256 value, address indexed fromAddress)',
  'event PunkBought(uint256 indexed punkIndex, uint256 value, address indexed fromAddress, address indexed toAddress)',
])
