<template>
  <div class="container auctions-page">
    <header class="page-head">
      <div class="page-head-row">
        <h1>Auctions</h1>
        <div class="head-actions">
          <Button
            class="primary icon-button"
            to="/lots/new"
          >
            <Icon name="lucide:plus" />
            <span>Create lot</span>
          </Button>
        </div>
      </div>
      <p class="muted">
        Open lots become 24 hour auctions when their initial reserve is met.
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
          class="market-stack"
        >
          <div class="card-grid">
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

const {
  auctions,
  pending: auctionsPending,
  error: auctionsError,
  deployed: auctionsDeployed,
  refresh: refreshAuctions,
} = useAuctions()
const {
  lots,
  pending: lotsPending,
  error: lotsError,
  deployed: lotsDeployed,
  refresh: refreshLots,
} = useLots()
const { auctions: mockAuctions, deployed: mockAuctionsDeployed } =
  useMockAuctions()
const { lots: mockLots, deployed: mockLotsDeployed } = useMockLots()

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
const displayAuctions = computed(() =>
  auctions.value.length || auctionsPending.value
    ? auctions.value
    : mockAuctions.value,
)
const displayLots = computed(() =>
  lots.value.length || lotsPending.value ? lots.value : mockLots.value,
)
const isMock = computed(
  () =>
    (!auctions.value.length && displayAuctions.value.length) ||
    (!lots.value.length && displayLots.value.length),
)
const deployed = computed(
  () =>
    (auctionsDeployed && lotsDeployed) ||
    (mockAuctionsDeployed && mockLotsDeployed),
)
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
  [...displayAuctions.value].sort(compareAuctionsByEndingSoon),
)

const sortedLots = computed(() =>
  [...displayLots.value].sort(compareLotsByAverageReserve),
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

function refreshMarket() {
  void refreshAuctions()
  void refreshLots()
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
  padding: var(--size-8) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-8);
}

.section,
.market-stack {
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
  min-width: 0;
}

.page-head-row {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(320px, 1.2fr);
  align-items: start;
  gap: var(--size-4);
}

.head-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--size-3);
  min-width: 0;
}

.head-actions > .button {
  align-self: flex-end;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
  gap: var(--size-8) var(--size-4);
  min-width: 0;

  @media (min-width: 960px) {
    gap: var(--size-8);
  }
}

.card-grid > * {
  min-width: 0;
}

.state,
.block-note {
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

@media (max-width: 860px) {
  .page-head-row {
    grid-template-columns: 1fr;
  }
}
</style>
