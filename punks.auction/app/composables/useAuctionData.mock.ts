/**
 * Mock `PunksAuction` data — stand-ins for the on-chain reads so the auction
 * and lot cards can be built while there are no live lots to point at. The
 * returned shape mirrors `useAuctions()` / `useLots()` / `useOffers()` in
 * `useAuctionData.ts`, so swapping back is a one-line change on list pages.
 */
import { parseEther, type Address } from 'viem'
import {
  emptyPunksFilter,
  ZERO_ADDRESS,
  type PunksFilter,
} from '@networked-art/punks-sdk'
import {
  TokenStandard,
  type AuctionRecord,
  type LotItem,
  type LotRecord,
  type OfferRecord,
  type OfferSlot,
  type TokenStandardValue,
} from '~/utils/auction'

const HOUR = 60 * 60
const MOCK_TIME_STEP = 5 * 60

/// Mainnet accounts with reverse ENS records, so mock rows exercise ENS display.
const ACCOUNTS = {
  jalil: '0xe11Da9560b51f8918295edC5ab9c0a90E9ADa20B',
  visualizevalue: '0xc8f8e2F59Dd95fF67c3d39109ecA2e2A017D4c8a',
  yougogirl: '0x90f64E01FfAE16490aeFe03C8ED7Dab6c66198C3',
} satisfies Record<string, Address>

const TRAITS = {
  beanie: 26,
} as const

const LARGE_OFFER_PUNK_IDS = [
  24, 89, 143, 242, 333, 415, 603, 721, 808, 999, 1112, 1290, 1401, 1555,
  1777, 2020, 2222, 2442, 2600, 2808, 3101, 3333, 3555, 3777,
] as const

function item(
  punkId: number,
  weightBps: number,
  standard: TokenStandardValue = TokenStandard.CryptoPunks,
): LotItem {
  return { standard, punkId, weightBps }
}

function criteria(overrides: Partial<PunksFilter> = {}): PunksFilter {
  return { ...emptyPunksFilter(), ...overrides }
}

function traitCriteria(traitId: number): PunksFilter {
  return criteria({ requiredTraitMask: 1n << BigInt(traitId) })
}

function slot(
  includeIds: number[],
  standard: TokenStandardValue = TokenStandard.CryptoPunks,
  overrides: Partial<Omit<OfferSlot, 'includeIds' | 'standard'>> = {},
): OfferSlot {
  return {
    criteria: overrides.criteria ?? criteria(),
    standard,
    includeIds,
    excludeIds: overrides.excludeIds ?? [],
  }
}

function createMockAuctions(): AuctionRecord[] {
  const now = Math.floor(Date.now() / (MOCK_TIME_STEP * 1000)) * MOCK_TIME_STEP

  return [
    // Live · single-Punk lot · the bold one-tile hero.
    {
      id: 7n,
      seller: ACCOUNTS.jalil,
      latestBidder: ACCOUNTS.yougogirl,
      latestBidWei: parseEther('6.4'),
      endTimestamp: now + 7 * HOUR + 12 * 60,
      settled: false,
      items: [item(3100, 10_000)],
    },
    // Live · four-Punk lot · one of them a V1.
    {
      id: 6n,
      seller: ACCOUNTS.visualizevalue,
      latestBidder: ACCOUNTS.jalil,
      latestBidWei: parseEther('14.25'),
      endTimestamp: now + 19 * HOUR,
      settled: false,
      items: [
        item(2924, 3_500),
        item(8348, 500, TokenStandard.CryptoPunksV1),
        item(5217, 3_500),
        item(1190, 2_500),
      ],
    },
    // Live · ending soon · big lot that overflows into a `+N` chip.
    {
      id: 5n,
      seller: ACCOUNTS.yougogirl,
      latestBidder: ACCOUNTS.visualizevalue,
      latestBidWei: parseEther('3.08'),
      endTimestamp: now + 38 * 60,
      settled: false,
      items: [
        item(1234, 1_111),
        item(4567, 1_111),
        item(9981, 1_111),
        item(222, 1_111),
        item(7777, 1_111),
        item(6529, 1_111),
        item(404, 1_111),
        item(8888, 1_111),
        item(31, 1_112),
      ],
    },
    // Past its end but not yet settled — the "Awaiting settlement" state.
    {
      id: 4n,
      seller: ACCOUNTS.jalil,
      latestBidder: ACCOUNTS.visualizevalue,
      latestBidWei: parseEther('9'),
      endTimestamp: now - (2 * HOUR + 30 * 60),
      settled: false,
      items: [item(512, 5_000), item(4242, 5_000)],
    },
  ]
}

const mockLots: LotRecord[] = [
  // Public · two-Punk pair.
  {
    id: 13n,
    seller: ACCOUNTS.visualizevalue,
    reserveWei: parseEther('12'),
    onlySellTo: ZERO_ADDRESS,
    items: [item(604, 1_000), item(6965, 9_000)],
  },
  // Public · single Punk.
  {
    id: 12n,
    seller: ACCOUNTS.jalil,
    reserveWei: parseEther('5'),
    onlySellTo: ZERO_ADDRESS,
    items: [item(7804, 10_000)],
  },
  // Public · five-Punk bundle.
  {
    id: 11n,
    seller: ACCOUNTS.yougogirl,
    reserveWei: parseEther('22'),
    onlySellTo: ZERO_ADDRESS,
    items: [
      item(1000, 2_000),
      item(2000, 2_000),
      item(3000, 2_000),
      item(4000, 2_000),
      item(5000, 2_000),
    ],
  },
  // Private · reserved for a specific buyer.
  {
    id: 10n,
    seller: ACCOUNTS.jalil,
    reserveWei: parseEther('8.5'),
    onlySellTo: ACCOUNTS.yougogirl,
    items: [item(99, 3_333), item(1971, 3_333), item(8021, 3_334)],
  },
]

const mockOffers: OfferRecord[] = [
  // Large exact bundle offer — exercises `+N` previews and long slot lists.
  {
    id: 7n,
    offerer: ACCOUNTS.yougogirl,
    amountWei: parseEther('88'),
    slots: LARGE_OFFER_PUNK_IDS.map((punkId) => slot([punkId])),
  },
  // Matches lot #13 and demonstrates a two-slot bundle.
  {
    id: 4n,
    offerer: ACCOUNTS.yougogirl,
    amountWei: parseEther('15'),
    slots: [slot([604]), slot([6965])],
  },
  // Matches the single-Punk lot #12.
  {
    id: 3n,
    offerer: ACCOUNTS.jalil,
    amountWei: parseEther('5.5'),
    slots: [slot([7804])],
  },
  // Matches the five-Punk public bundle #11.
  {
    id: 2n,
    offerer: ACCOUNTS.visualizevalue,
    amountWei: parseEther('24'),
    slots: [
      slot([1000]),
      slot([2000]),
      slot([3000]),
      slot([4000]),
      slot([5000]),
    ],
  },
  // Matches the private lot #10 because the offerer is the allowed buyer.
  {
    id: 1n,
    offerer: ACCOUNTS.yougogirl,
    amountWei: parseEther('9'),
    slots: [slot([99]), slot([1971]), slot([8021])],
  },
  // Trait-style offer for the open book.
  {
    id: 5n,
    offerer: ACCOUNTS.jalil,
    amountWei: parseEther('2.75'),
    slots: [
      slot([], TokenStandard.CryptoPunks, {
        criteria: traitCriteria(TRAITS.beanie),
      }),
    ],
  },
  // V1-specific single-slot offer.
  {
    id: 6n,
    offerer: ACCOUNTS.visualizevalue,
    amountWei: parseEther('1.8'),
    slots: [slot([8348], TokenStandard.CryptoPunksV1)],
  },
]

export function useMockAuctions() {
  return {
    auctions: ref<AuctionRecord[]>(createMockAuctions()),
    pending: ref(false),
    error: ref<string | null>(null),
    deployed: true,
    refresh: async () => {},
  }
}

export function mockAuctionById(id: bigint | number): AuctionRecord | null {
  return (
    createMockAuctions().find((auction) => auction.id === BigInt(id)) ?? null
  )
}

export function useMockLots() {
  return {
    lots: ref<LotRecord[]>(mockLots),
    pending: ref(false),
    error: ref<string | null>(null),
    deployed: true,
    refresh: async () => {},
  }
}

export function mockLotById(id: bigint | number): LotRecord | null {
  return mockLots.find((lot) => lot.id === BigInt(id)) ?? null
}

export function useMockOffers() {
  return {
    offers: ref<OfferRecord[]>(mockOffers),
    pending: ref(false),
    error: ref<string | null>(null),
    deployed: true,
    refresh: async () => {},
  }
}

export function mockOfferById(id: bigint | number): OfferRecord | null {
  return mockOffers.find((offer) => offer.id === BigInt(id)) ?? null
}
