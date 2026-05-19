import { parseAbi } from 'viem'

export const PunksMarketAbi = parseAbi([
  'event BidPlaced(uint256 indexed bidId, address indexed bidder, uint96 bidWei, uint96 settlementWei, (uint256 requiredTraitMask, uint256 forbiddenTraitMask, uint256 anyOfTraitMask, uint256 requiredColorMask, uint256 forbiddenColorMask, uint256 anyOfColorMask, uint16 minPixelCount, uint16 maxPixelCount, uint8 minColorCount, uint8 maxColorCount) criteria, uint16[] includeIds, uint16[] excludeIds)',
  'event BidCancelled(uint256 indexed bidId)',
  'event BidAdjusted(uint256 indexed bidId, uint96 newBidWei)',
  'event BidAccepted(uint256 indexed bidId, uint256 indexed punkId, address indexed seller, address bidder, address caller, uint96 listingWei, uint96 bidWei, uint96 settlementWei)',
  'event PunkPurchased(uint256 indexed punkId, address indexed seller, address indexed recipient, address caller, uint96 listingWei)',
  'event Credited(address indexed account, uint256 amount)',
  'event Withdrawal(address indexed account, uint256 amount)',
])
