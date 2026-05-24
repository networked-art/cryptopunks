/**
 * Mock `PunksAuction` data — stand-ins for the on-chain reads so the auction
 * and lot cards can be built while there are no live lots to point at. The
 * returned shape mirrors `useAuctions()` / `useLots()` in `useAuctionData.ts`,
 * so swapping back is a one-line change in `auctions.vue`.
 */
import { parseEther, type Address } from 'viem'
import { ZERO_ADDRESS } from '@networked-art/punks-sdk'
import {
  TokenStandard,
  type AuctionRecord,
  type LotItem,
  type LotRecord,
  type TokenStandardValue,
} from '~/utils/auction'

const HOUR = 60 * 60
const MOCK_TIME_STEP = 5 * 60

/// Throwaway accounts — ENS won't resolve, so the UI shows truncated hex.
const ACCOUNTS = {
  ada: '0x6b3a9f1c2d8e4a7b0c5d2e9f1a8b7c6d5e4f3a2b',
  blue: '0xa17f4c9e2b6d8a3f0c1e5d7b9a2c4e6f8d0b1a3c',
  cyrus: '0x2e9d7c5a3f1b8e6d4c2a0f9e7d5c3b1a9f8e7d6c',
  dot: '0xf04b8a2c6e1d9f3b7a5c0e2d8b4a6c1f3e9d7b5a',
  echo: '0x91c3e7a5d2f0b8c6a4e2d0f9b7c5a3e1d8f6b4a2',
  fern: '0x4d8b2f6a0c9e3d7b1a5f8c2e6d0b4a9c3f7e1d5b',
} satisfies Record<string, Address>

function item(
  punkId: number,
  weightBps: number,
  standard: TokenStandardValue = TokenStandard.CryptoPunks,
): LotItem {
  return { standard, punkId, weightBps }
}

function createMockAuctions(): AuctionRecord[] {
  const now =
    Math.floor(Date.now() / (MOCK_TIME_STEP * 1000)) * MOCK_TIME_STEP

  return [
    // Live · single-Punk lot · the bold one-tile hero.
    {
      id: 7n,
      seller: ACCOUNTS.ada,
      latestBidder: ACCOUNTS.blue,
      latestBidWei: parseEther('6.4'),
      endTimestamp: now + 7 * HOUR + 12 * 60,
      settled: false,
      items: [item(3100, 10_000)],
    },
    // Live · four-Punk lot · one of them a V1.
    {
      id: 6n,
      seller: ACCOUNTS.cyrus,
      latestBidder: ACCOUNTS.dot,
      latestBidWei: parseEther('14.25'),
      endTimestamp: now + 19 * HOUR,
      settled: false,
      items: [
        item(2924, 2_500),
        item(8348, 2_500, TokenStandard.CryptoPunksV1),
        item(5217, 2_500),
        item(1190, 2_500),
      ],
    },
    // Live · ending soon · big lot that overflows into a `+N` chip.
    {
      id: 5n,
      seller: ACCOUNTS.echo,
      latestBidder: ACCOUNTS.fern,
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
      seller: ACCOUNTS.ada,
      latestBidder: ACCOUNTS.dot,
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
    seller: ACCOUNTS.fern,
    reserveWei: parseEther('12'),
    onlySellTo: ZERO_ADDRESS,
    items: [item(604, 5_000), item(6965, 5_000)],
  },
  // Public · single Punk.
  {
    id: 12n,
    seller: ACCOUNTS.cyrus,
    reserveWei: parseEther('5'),
    onlySellTo: ZERO_ADDRESS,
    items: [item(7804, 10_000)],
  },
  // Public · five-Punk bundle.
  {
    id: 11n,
    seller: ACCOUNTS.echo,
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
    seller: ACCOUNTS.ada,
    reserveWei: parseEther('8.5'),
    onlySellTo: ACCOUNTS.blue,
    items: [item(99, 3_333), item(1971, 3_333), item(8021, 3_334)],
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

export function useMockLots() {
  return {
    lots: ref<LotRecord[]>(mockLots),
    pending: ref(false),
    error: ref<string | null>(null),
    deployed: true,
    refresh: async () => {},
  }
}
