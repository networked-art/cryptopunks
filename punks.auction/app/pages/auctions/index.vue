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
      <h2 class="section-title">Running auctions</h2>
      <div
        v-if="auctionsPending && !activeAuctions.length"
        class="state muted"
      >
        Loading auctions…
      </div>
      <div
        v-else-if="!deployed"
        class="state empty muted"
      >
        Auctions appear here once <code>PunksAuction</code> is deployed.
      </div>
      <div
        v-else-if="auctionsError"
        class="error"
      >
        Failed to load auctions: {{ auctionsError }}
      </div>
      <div
        v-else-if="!activeAuctions.length"
        class="state empty muted"
      >
        No active auctions.
      </div>
      <div
        v-else
        class="card-grid"
      >
        <LazyAuctionCard
          v-for="auction in activeAuctions"
          :key="String(auction.id)"
          :auction="auction"
        />
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Open lots</h2>
      <div
        v-if="lotsPending && !sortedLots.length"
        class="state muted"
      >
        Loading lots…
      </div>
      <div
        v-else-if="!deployed"
        class="state empty muted"
      >
        Lots appear here once <code>PunksAuction</code> is deployed.
      </div>
      <div
        v-else-if="lotsError"
        class="error"
      >
        Failed to load lots: {{ lotsError }}
      </div>
      <div
        v-else-if="!sortedLots.length"
        class="state empty muted"
      >
        No open lots.
      </div>
      <div
        v-else
        class="card-grid"
      >
        <LazyLotCard
          v-for="lot in sortedLots"
          :key="String(lot.id)"
          :lot="lot"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { auctionStatus } from '~/utils/auction'

useSeoMeta({
  title: 'Auctions · Punks Auction',
  ogTitle: 'Auctions · Punks Auction',
  twitterTitle: 'Auctions · Punks Auction',
})

// MOCK DATA — `PunksAuction` has no live lots yet, so the list pages run on
// fixtures while the card UI is built. Swap back to `useAuctions()` /
// `useLots()` (from `useAuctionData.ts`) once there is on-chain data.
const {
  auctions,
  pending: auctionsPending,
  error: auctionsError,
  deployed,
} = useMockAuctions()
const { lots, pending: lotsPending, error: lotsError } = useMockLots()

const activeAuctions = computed(() =>
  auctions.value
    .filter((auction) => auctionStatus(auction) === 'live')
    .sort((a, b) => a.endTimestamp - b.endTimestamp),
)

const sortedLots = computed(() =>
  [...lots.value].sort((a, b) => Number(b.id - a.id)),
)
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

.section-title {
  margin: 0;
  font-size: var(--font-2xl);
  font-weight: var(--font-weight-bolder);
  letter-spacing: 0;
  line-height: var(--line-height-tight);
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
