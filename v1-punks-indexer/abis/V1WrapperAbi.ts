import { parseAbi } from 'viem'

export const V1WrapperAbi = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
])
