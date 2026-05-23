<template>
  <div class="container auctions-page">
    <header class="page-head">
      <h1>Auctions</h1>
      <p class="muted">
        Live auctions on
        <a
          href="https://evm.now/address/0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb"
          >CryptoPunks</a
        >, settled through <code>PunksAuction</code>. Open lots below can be
        turned into an auction by anyone's first bid.
      </p>
    </header>

    <ClientOnly>
      <section class="section">
        <h2 class="section-title eyebrow">Running auctions</h2>
        <div
          v-if="auctionsPending && !runningAuctions.length"
          class="muted"
        >
          Loading auctions…
        </div>
        <div
          v-else-if="!deployed"
          class="empty muted"
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
          v-else-if="!runningAuctions.length"
          class="empty muted"
        >
          No running auctions.
        </div>
        <div
          v-else
          class="card-grid"
        >
          <AuctionCard
            v-for="auction in runningAuctions"
            :key="String(auction.id)"
            :auction="auction"
          />
        </div>
      </section>

      <section class="section">
        <h2 class="section-title eyebrow">Open lots</h2>
        <div
          v-if="lotsPending && !sortedLots.length"
          class="muted"
        >
          Loading lots…
        </div>
        <div
          v-else-if="!deployed"
          class="empty muted"
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
          class="empty muted"
        >
          No open lots.
        </div>
        <div
          v-else
          class="card-grid"
        >
          <LotCard
            v-for="lot in sortedLots"
            :key="String(lot.id)"
            :lot="lot"
          />
        </div>
      </section>
    </ClientOnly>
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

/// Running = not yet settled. Live auctions first, soonest-ending leading;
/// auctions past their end but awaiting settlement trail behind.
const runningAuctions = computed(() =>
  auctions.value
    .filter((a) => !a.settled)
    .sort((a, b) => {
      const aLive = auctionStatus(a) === 'live'
      const bLive = auctionStatus(b) === 'live'
      if (aLive !== bLive) return aLive ? -1 : 1
      return a.endTimestamp - b.endTimestamp
    }),
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
  gap: var(--size-6);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.section-title {
  margin: 0;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--size-3);
}

.empty {
  padding: var(--size-8);
  text-align: center;
  border: 1px dashed var(--border-color);
}

.error {
  color: var(--accent);
}

code {
  font-family: var(--font-mono);
  background: var(--bg-elevated);
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: var(--font-sm);
}
</style>
