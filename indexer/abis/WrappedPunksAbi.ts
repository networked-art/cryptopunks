import { parseAbi } from 'viem'

// Wrapped CryptoPunks — original V2 ERC-721 wrapper. Mint = from is zero,
// burn = to is zero, otherwise a wrapped transfer.
export const WrappedPunksAbi = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  // Emitted when a user calls `registerProxy()` to set up their personal
  // UserProxy. The proxy address is per-user and used as the wrap path's
  // intermediary. Args are non-indexed.
  'event ProxyRegistered(address user, address proxy)',
])
