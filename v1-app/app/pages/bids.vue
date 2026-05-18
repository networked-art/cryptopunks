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
        v-else-if="!bids.length"
        class="empty muted"
      >
        No active collection bids yet.
      </div>
      <div
        v-else
        class="bid-grid"
      >
        <BidCard
          v-for="bid in bids"
          :key="String(bid.id)"
          :bid="bid"
        />
      </div>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
useSeoMeta({
  title: 'Bids · punksmarket.xyz',
  ogTitle: 'Bids · punksmarket.xyz',
  twitterTitle: 'Bids · punksmarket.xyz',
})

const { bids, pending, error, refresh } = usePunksMarketBids()
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
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}

.error {
  color: var(--accent);
}
</style>
