<template>
  <div class="container bids-page">
    <header class="page-head">
      <h1>Collection bids</h1>
      <p class="muted">
        Open ETH bids on the PunksMarket bid book. Any holder of a matching V1
        punk can accept.
      </p>
    </header>

    <div
      v-if="!marketAddress"
      class="empty"
    >
      <p class="muted">No PunksMarket contract configured.</p>
      <p class="dim">
        Set <code>NUXT_PUBLIC_PUNKS_MARKET_ADDRESS</code> in the environment.
      </p>
    </div>

    <ClientOnly>
      <CollectionBidForm @placed="refresh" />

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
        v-else-if="!bids.length && marketAddress"
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
useHead({ title: 'Bids · punksmarket.xyz' })

const marketAddress = usePunksMarketAddress()
const { bids, pending, error, refresh } = usePunksMarketBids()
</script>

<style scoped>
.bids-page {
  padding: var(--space-6) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.page-head h1 {
  margin: 0 0 var(--space-1);
  font-weight: 500;
  font-size: 22px;
  letter-spacing: -0.02em;
}

.bid-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-3);
}

.empty {
  padding: var(--space-8);
  text-align: center;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}

.error {
  color: var(--accent);
}

code {
  font-family: var(--font-mono);
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}
</style>
