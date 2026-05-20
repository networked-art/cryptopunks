export const punksMarketAbi = [
  {
    inputs: [],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [],
    name: 'AdjustmentTooLarge',
    type: 'error',
  },
  {
    inputs: [],
    name: 'BidNotActive',
    type: 'error',
  },
  {
    inputs: [],
    name: 'FailedWithdrawal',
    type: 'error',
  },
  {
    inputs: [],
    name: 'IncorrectPayment',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidAmount',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidColorCountRange',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidColorMask',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidPixelCountRange',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidTraitMask',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ListingNotValid',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint96',
        name: 'expectedListingWei',
        type: 'uint96',
      },
      {
        internalType: 'uint256',
        name: 'actualListingWei',
        type: 'uint256',
      },
    ],
    name: 'ListingPriceMismatch',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ListingPriceTooHigh',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NoBalanceToWithdraw',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NotBidder',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PunkCriteriaMismatch',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PunkExcluded',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PunkNotIncluded',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ReentrancyGuardReentrantCall',
    type: 'error',
  },
  {
    inputs: [],
    name: 'TooManyIds',
    type: 'error',
  },
  {
    inputs: [],
    name: 'UnexpectedEtherSender',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ZeroAddress',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'bidId',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: 'punkId',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'seller',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'bidder',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'caller',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint96',
        name: 'listingWei',
        type: 'uint96',
      },
      {
        indexed: false,
        internalType: 'uint96',
        name: 'bidWei',
        type: 'uint96',
      },
      {
        indexed: false,
        internalType: 'uint96',
        name: 'settlementWei',
        type: 'uint96',
      },
    ],
    name: 'BidAccepted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'bidId',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint96',
        name: 'newBidWei',
        type: 'uint96',
      },
    ],
    name: 'BidAdjusted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'bidId',
        type: 'uint256',
      },
    ],
    name: 'BidCancelled',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'bidId',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'bidder',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint96',
        name: 'bidWei',
        type: 'uint96',
      },
      {
        indexed: false,
        internalType: 'uint96',
        name: 'settlementWei',
        type: 'uint96',
      },
      {
        components: [
          {
            internalType: 'uint256',
            name: 'requiredTraitMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'forbiddenTraitMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'anyOfTraitMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'requiredColorMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'forbiddenColorMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'anyOfColorMask',
            type: 'uint256',
          },
          {
            internalType: 'uint16',
            name: 'minPixelCount',
            type: 'uint16',
          },
          {
            internalType: 'uint16',
            name: 'maxPixelCount',
            type: 'uint16',
          },
          {
            internalType: 'uint8',
            name: 'minColorCount',
            type: 'uint8',
          },
          {
            internalType: 'uint8',
            name: 'maxColorCount',
            type: 'uint8',
          },
        ],
        indexed: false,
        internalType: 'struct Punks.Filter',
        name: 'criteria',
        type: 'tuple',
      },
      {
        indexed: false,
        internalType: 'uint16[]',
        name: 'includeIds',
        type: 'uint16[]',
      },
      {
        indexed: false,
        internalType: 'uint16[]',
        name: 'excludeIds',
        type: 'uint16[]',
      },
    ],
    name: 'BidPlaced',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'Credited',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'punkId',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'seller',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'recipient',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'caller',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint96',
        name: 'listingWei',
        type: 'uint96',
      },
    ],
    name: 'PunkPurchased',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'Withdrawal',
    type: 'event',
  },
  {
    inputs: [],
    name: 'PUNKS_CRITERIA',
    outputs: [
      {
        internalType: 'contract IPunksDataCriteria',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'PUNKS_DATA',
    outputs: [
      {
        internalType: 'contract IPunksData',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'PUNKS_V1',
    outputs: [
      {
        internalType: 'contract ICryptoPunksMarket',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'PUNKS_VISUAL',
    outputs: [
      {
        internalType: 'contract IPunksDataVisual',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'bidId',
        type: 'uint256',
      },
      {
        internalType: 'uint16',
        name: 'punkId',
        type: 'uint16',
      },
      {
        internalType: 'uint96',
        name: 'expectedListingWei',
        type: 'uint96',
      },
    ],
    name: 'acceptBid',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'bidId',
        type: 'uint256',
      },
      {
        internalType: 'uint96',
        name: 'weiToAdjust',
        type: 'uint96',
      },
      {
        internalType: 'bool',
        name: 'increase',
        type: 'bool',
      },
    ],
    name: 'adjustBidPrice',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    name: 'balances',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'bidId',
        type: 'uint256',
      },
    ],
    name: 'bids',
    outputs: [
      {
        internalType: 'uint96',
        name: 'bidWei',
        type: 'uint96',
      },
      {
        internalType: 'uint96',
        name: 'settlementWei',
        type: 'uint96',
      },
      {
        internalType: 'address',
        name: 'bidder',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint16',
        name: 'punkId',
        type: 'uint16',
      },
      {
        internalType: 'uint256',
        name: 'fromId',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'count',
        type: 'uint256',
      },
    ],
    name: 'bidsMatchingPunk',
    outputs: [
      {
        internalType: 'uint256[]',
        name: 'bidIds',
        type: 'uint256[]',
      },
      {
        internalType: 'uint256',
        name: 'nextId',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint16',
        name: 'punkId',
        type: 'uint16',
      },
      {
        internalType: 'uint96',
        name: 'expectedListingWei',
        type: 'uint96',
      },
      {
        internalType: 'address',
        name: 'recipient',
        type: 'address',
      },
    ],
    name: 'buyPunk',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'bidId',
        type: 'uint256',
      },
    ],
    name: 'cancelBid',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'bidId',
        type: 'uint256',
      },
    ],
    name: 'getBidCriteria',
    outputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'requiredTraitMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'forbiddenTraitMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'anyOfTraitMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'requiredColorMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'forbiddenColorMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'anyOfColorMask',
            type: 'uint256',
          },
          {
            internalType: 'uint16',
            name: 'minPixelCount',
            type: 'uint16',
          },
          {
            internalType: 'uint16',
            name: 'maxPixelCount',
            type: 'uint16',
          },
          {
            internalType: 'uint8',
            name: 'minColorCount',
            type: 'uint8',
          },
          {
            internalType: 'uint8',
            name: 'maxColorCount',
            type: 'uint8',
          },
        ],
        internalType: 'struct Punks.Filter',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'bidId',
        type: 'uint256',
      },
    ],
    name: 'getBidExcludeIds',
    outputs: [
      {
        internalType: 'uint16[]',
        name: '',
        type: 'uint16[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'bidId',
        type: 'uint256',
      },
    ],
    name: 'getBidIncludeIds',
    outputs: [
      {
        internalType: 'uint16[]',
        name: '',
        type: 'uint16[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'lastBidId',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'bidId',
        type: 'uint256',
      },
      {
        internalType: 'uint16',
        name: 'punkId',
        type: 'uint16',
      },
    ],
    name: 'matchesPunk',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint96',
        name: 'bidWei',
        type: 'uint96',
      },
      {
        internalType: 'uint96',
        name: 'settlementWei',
        type: 'uint96',
      },
      {
        components: [
          {
            internalType: 'uint256',
            name: 'requiredTraitMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'forbiddenTraitMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'anyOfTraitMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'requiredColorMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'forbiddenColorMask',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'anyOfColorMask',
            type: 'uint256',
          },
          {
            internalType: 'uint16',
            name: 'minPixelCount',
            type: 'uint16',
          },
          {
            internalType: 'uint16',
            name: 'maxPixelCount',
            type: 'uint16',
          },
          {
            internalType: 'uint8',
            name: 'minColorCount',
            type: 'uint8',
          },
          {
            internalType: 'uint8',
            name: 'maxColorCount',
            type: 'uint8',
          },
        ],
        internalType: 'struct Punks.Filter',
        name: 'criteria',
        type: 'tuple',
      },
      {
        internalType: 'uint16[]',
        name: 'includeIds',
        type: 'uint16[]',
      },
      {
        internalType: 'uint16[]',
        name: 'excludeIds',
        type: 'uint16[]',
      },
    ],
    name: 'placeBid',
    outputs: [
      {
        internalType: 'uint256',
        name: 'bidId',
        type: 'uint256',
      },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    stateMutability: 'payable',
    type: 'receive',
  },
] as const
