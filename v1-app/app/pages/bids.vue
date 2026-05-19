<template>
  <div class="container bids-page">
    <header class="page-head">
      <div class="page-head-row">
        <h1>Collection bids</h1>
        <ClientOnly>
          <CollectionBidForm @placed="refresh" />
        </ClientOnly>
      </div>
      <p class="muted">
        Open ETH bids on the PunksMarket bid book. Any holder of a matching V1
        punk can accept.
      </p>
    </header>

    <ClientOnly>
      <div
        v-if="pending"
        class="muted"
      >
        Loading bids…
      </div>
      <div
        v-else-if="error"
        class="error"
      >
        Failed to load bids: {{ error }}
      </div>
      <div
        v-else-if="!fillableBids.length"
        class="empty muted"
      >
        No active collection bids yet.
      </div>
      <div
        v-else
        class="bid-grid"
      >
        <BidCard
          v-for="bid in fillableBids"
          :key="String(bid.id)"
          :bid="bid"
          @withdrawn="refresh"
        />
      </div>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { bidToQuery } from '~/composables/usePunksMarketBids'

useSeoMeta({
  title: 'Bids · punksmarket.xyz',
  ogTitle: 'Bids · punksmarket.xyz',
  twitterTitle: 'Bids · punksmarket.xyz',
})

const { bids, pending, error, refresh } = usePunksMarketBids()

/// Hide unfillable bids — criteria that match zero punks, or criteria the
/// offline counter can't express (treated as invalid). The bidder still
/// sees them on their own profile so they can withdraw.
const offline = usePunksOffline()
const fillableBids = computed(() =>
  bids.value.filter((bid) => {
    try {
      return offline.count(bidToQuery(bid)) > 0
    } catch {
      return false
    }
  }),
)
</script>

<style scoped>
.bids-page {
  padding: var(--size-6) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
}

.page-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-3);
}

.page-head h1 {
  margin: 0 0 var(--size-1);
  font-weight: 500;
  font-size: 22px;
  letter-spacing: -0.02em;
}

.bid-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--size-3);
}

.empty {
  padding: var(--size-8);
  text-align: center;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius);
}

.error {
  color: var(--accent);
}
</style>
