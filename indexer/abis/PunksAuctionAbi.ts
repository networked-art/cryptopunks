import { parseAbi } from 'viem'

export const PunksAuctionAbi = parseAbi([
  'event LotCreated(uint256 indexed lotId, address indexed seller, bytes32 indexed itemHash, uint8 itemCount, uint96 reserveWei, address onlySellTo)',
  'event LotItemDetail(uint256 indexed lotId, uint8 indexed itemIndex, uint8 standard, uint16 punkId, uint16 weightBps)',
  'event LotUpdated(uint256 indexed lotId, uint96 reserveWei, address onlySellTo)',
  'event LotCancelled(uint256 indexed lotId)',
  'event LotCleared(uint256 indexed lotId, address indexed cleaner)',
  'event AuctionInitialised(uint256 indexed auctionId, uint256 indexed lotId, address indexed seller, uint8 itemCount, uint40 endTimestamp)',
  'event Bid(uint256 indexed auctionId, address indexed bidder, uint256 amountWei)',
  'event AuctionExtended(uint256 indexed auctionId, uint40 endTimestamp)',
  'event AuctionItemDelivered(uint256 indexed auctionId, uint8 indexed itemIndex, uint8 standard, uint16 punkId, address recipient, uint96 itemWei)',
  'event AuctionSettled(uint256 indexed auctionId, address indexed winner, address indexed seller, uint256 finalWei)',
  'event OfferPlaced(uint256 indexed offerId, address indexed offerer, uint96 amountWei, uint8 slotCount)',
  'event OfferSlotDetail(uint256 indexed offerId, uint8 indexed slotIndex, uint8 standard, (uint256 requiredTraitMask, uint256 forbiddenTraitMask, uint256 anyOfTraitMask, uint256 requiredColorMask, uint256 forbiddenColorMask, uint256 anyOfColorMask, uint16 minPixelCount, uint16 maxPixelCount, uint8 minColorCount, uint8 maxColorCount) criteria, uint16[] includeIds, uint16[] excludeIds)',
  'event OfferCancelled(uint256 indexed offerId)',
  'event OfferAmountAdjusted(uint256 indexed offerId, uint96 newAmountWei)',
  'event OfferAccepted(uint256 indexed offerId, uint256 indexed punkId, address indexed seller, address offerer, uint256 amountWei)',
  'event OfferAcceptedFromLot(uint256 indexed offerId, uint256 indexed lotId, address indexed seller, address offerer, uint96 amountWei)',
  'event OfferAuctionInitialised(uint256 indexed offerId, uint256 indexed auctionId, uint256 indexed lotId, address seller, address offerer, uint96 amountWei)',
  'event Credited(address indexed account, uint256 amount)',
  'event Withdrawal(address indexed account, uint256 amount)',
])
