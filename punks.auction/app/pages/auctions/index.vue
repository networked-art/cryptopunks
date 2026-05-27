<template>
  <div class="container auctions-page">
    <header class="page-head">
      <div class="page-head-text">
        <h1>Auctions</h1>
        <p class="muted">
          Open lots become 24 hour auctions when their initial reserve is met.
        </p>
      </div>
      <Button
        class="primary icon-button page-head-action"
        to="/lots/new"
      >
        <Icon name="lucide:plus" />
        <span class="label-full">Create lot</span>
        <span class="label-short">New</span>
      </Button>
    </header>

    <section class="section">
      <div
        v-if="loadError"
        class="error"
      >
        Failed to load {{ loadError }}
      </div>
      <div
        v-if="pending && !marketEntries.length"
        class="loading"
      >
        <Spinner label="Loading auctions and lots" />
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
        <div :class="['card-grid', { fill: marketEntries.length >= 3 }]">
          <template
            v-for="entry in marketEntries"
            :key="entry.key"
          >
            <LazyAuctionCard
              v-if="entry.kind === 'auction'"
              :auction="entry.auction"
              lift
            />
            <LazyLotCard
              v-else
              :lot="entry.lot"
              lift
            />
          </template>
        </div>
      </div>
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
defineOgImage('Default', {
  title: 'Live auctions',
  description: 'Open lots and 24h auctions for CryptoPunks.',
})

const {
  auctions,
  pending: auctionsPending,
  error: auctionsError,
  refresh: refreshAuctions,
} = useAuctions()
const {
  lots,
  pending: lotsPending,
  error: lotsError,
  refresh: refreshLots,
} = useLots()

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

.page-head-text > h1 {
  margin: 0;
}

.page-head-text > .muted {
  margin: 0;
}

.page-head-action {
  overflow: hidden;
}

.label-short {
  display: none;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, min(100%, 15rem));
  justify-content: start;
  gap: var(--size-8) var(--size-4);
  min-width: 0;

  @media (min-width: 960px) {
    gap: var(--size-8);
  }
}

.card-grid.fill {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
}

.card-grid > * {
  min-width: 0;
}

.state,
.block-note {
  margin: 0;
}

.loading {
  padding: var(--size-8);
  text-align: center;
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
  .page-head {
    align-items: center;
  }

  .page-head-text > .muted {
    display: none;
  }

  .label-full {
    display: none;
  }

  .label-short {
    display: inline;
  }

  .card-grid {
    grid-template-columns: repeat(auto-fill, min(100%, 11rem));
  }

  .card-grid.fill {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
  }
}

@media (max-width: 420px) {
  .card-grid,
  .card-grid.fill {
    grid-template-columns: 1fr;
  }
}
</style>
