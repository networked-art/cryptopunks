<template>
  <div class="container offers-page">
    <header class="page-head">
      <h1>Purchase offers</h1>
      <p class="muted">
        Open native-ETH offers on <code>PunksAuction</code>. Each offer locks
        ETH against one or more slots of trait/colour criteria; a seller can
        accept it instantly or open it as an auction.
      </p>
    </header>

    <ClientOnly>
      <div
        v-if="pending && !sortedOffers.length"
        class="muted"
      >
        Loading offers…
      </div>
      <div
        v-else-if="!deployed"
        class="empty muted"
      >
        Offers appear here once <code>PunksAuction</code> is deployed.
      </div>
      <div
        v-else-if="error"
        class="error"
      >
        Failed to load offers: {{ error }}
      </div>
      <div
        v-else-if="!sortedOffers.length"
        class="empty muted"
      >
        No open purchase offers.
      </div>
      <div
        v-else
        class="card-grid"
      >
        <OfferCard
          v-for="offer in sortedOffers"
          :key="String(offer.id)"
          :offer="offer"
        />
      </div>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
useSeoMeta({
  title: 'Purchase offers · Punks Auction',
  ogTitle: 'Purchase offers · Punks Auction',
  twitterTitle: 'Purchase offers · Punks Auction',
})

const { offers, pending, error, deployed } = useOffers()

/// Highest offer first.
const sortedOffers = computed(() =>
  [...offers.value].sort((a, b) =>
    a.amountWei === b.amountWei ? 0 : a.amountWei > b.amountWei ? -1 : 1,
  ),
)
</script>

<style scoped>
.offers-page {
  padding: var(--size-6) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
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
</style>
