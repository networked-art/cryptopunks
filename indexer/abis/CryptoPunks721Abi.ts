import { parseAbi } from 'viem'

// CryptoPunks721 — modern V2 ERC-721 wrapper. Same Transfer-based wrap/unwrap
// pattern as Wrapped CryptoPunks.
export const CryptoPunks721Abi = parseAbi([
  'function ownerOf(uint256 id) view returns (address)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed id)',
])
