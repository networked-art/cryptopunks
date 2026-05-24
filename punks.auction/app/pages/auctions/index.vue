<template>
  <div class="container auctions-page">
    <header class="page-head">
      <h1>Auctions</h1>
      <p class="muted">
        CryptoPunks lots with native-ETH settlement through
        <a
          href="https://evm.now/address/0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb"
          >PunksAuction</a
        >. Open lots become 24-hour auctions the moment the first qualifying bid
        lands.
      </p>
    </header>

    <section class="section">
      <div
        v-if="!deployed"
        class="state empty muted"
      >
        Auctions and lots appear here once <code>PunksAuction</code> is
        deployed.
      </div>

      <template v-else>
        <div
          v-if="loadError"
          class="error"
        >
          Failed to load {{ loadError }}
        </div>
        <div
          v-if="pending && !marketEntries.length"
          class="state muted"
        >
          Loading auctions and lots…
        </div>
        <div
          v-else-if="!loadError && !marketEntries.length"
          class="state empty muted"
        >
          No auctions or open lots.
        </div>
        <div
          v-else-if="marketEntries.length"
          class="card-grid"
        >
          <template
            v-for="entry in marketEntries"
            :key="entry.key"
          >
            <LazyAuctionCard
              v-if="entry.kind === 'auction'"
              :auction="entry.auction"
            />
            <LazyLotCard
              v-else
              :lot="entry.lot"
            />
          </template>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  auctionStatus,
  type AuctionRecord,
  type LotRecord,
} from '~/utils/auction'

useSeoMeta({
  title: 'Auctions · Punks Auction',
  ogTitle: 'Auctions · Punks Auction',
  twitterTitle: 'Auctions · Punks Auction',
})

// MOCK DATA — `PunksAuction` has no live lots yet, so the list pages run on
// fixtures while the card UI is built. Swap back to `useAuctions()` /
// `useLots()` (from `useAuctionData.ts`) once there is on-chain data.
// TODO(indexer): Refactor this unified list as soon as live indexer integration
// lands so the API owns filtering and ordering.
const {
  auctions,
  pending: auctionsPending,
  error: auctionsError,
  deployed: auctionsDeployed,
} = useMockAuctions()
const {
  lots,
  pending: lotsPending,
  error: lotsError,
  deployed: lotsDeployed,
} = useMockLots()

type MarketEntry =
  | {
      kind: 'auction'
      key: string
      auction: AuctionRecord
    }
  | {
      kind: 'lot'
      key: string
      lot: LotRecord
    }

const now = useSeconds()
const deployed = auctionsDeployed && lotsDeployed
const pending = computed(() => auctionsPending.value || lotsPending.value)
const loadError = computed(() =>
  [
    auctionsError.value ? `auctions: ${auctionsError.value}` : '',
    lotsError.value ? `lots: ${lotsError.value}` : '',
  ]
    .filter(Boolean)
    .join('; '),
)

const sortedAuctions = computed(() =>
  [...auctions.value].sort(compareAuctionsByEndingSoon),
)

const sortedLots = computed(() =>
  [...lots.value].sort(compareLotsByAverageReserve),
)

const marketEntries = computed<MarketEntry[]>(() => [
  ...sortedAuctions.value.map((auction) => ({
    kind: 'auction' as const,
    key: `auction-${auction.id}`,
    auction,
  })),
  ...sortedLots.value.map((lot) => ({
    kind: 'lot' as const,
    key: `lot-${lot.id}`,
    lot,
  })),
])

function compareAuctionsByEndingSoon(
  a: AuctionRecord,
  b: AuctionRecord,
): number {
  const aStatus = auctionStatus(a, now.value)
  const bStatus = auctionStatus(b, now.value)
  const aLive = aStatus === 'live'
  const bLive = bStatus === 'live'

  if (aLive !== bLive) return aLive ? -1 : 1
  if (aLive && bLive) {
    return a.endTimestamp - b.endTimestamp || compareBigint(a.id, b.id)
  }

  return b.endTimestamp - a.endTimestamp || compareBigint(b.id, a.id)
}

function compareLotsByAverageReserve(a: LotRecord, b: LotRecord): number {
  const aCount = BigInt(Math.max(1, a.items.length))
  const bCount = BigInt(Math.max(1, b.items.length))
  const aScaled = a.reserveWei * bCount
  const bScaled = b.reserveWei * aCount

  return compareBigint(aScaled, bScaled) || compareBigint(a.id, b.id)
}

function compareBigint(a: bigint, b: bigint): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}
</script>

<style scoped>
.auctions-page {
  padding: var(--size-6) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
  min-width: 0;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(
      min(
        100%,
        calc(var(--size-9) + var(--size-9) + var(--size-9) + var(--size-9))
      ),
      1fr
    )
  );
  gap: var(--size-7);
  min-width: 0;
}

.card-grid > * {
  min-width: 0;
}

.state {
  margin: 0;
}

.empty {
  padding: var(--size-8);
  text-align: center;
  border: var(--border);
}

.error {
  color: var(--accent);
}
</style>
