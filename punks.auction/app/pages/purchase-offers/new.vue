<template>
  <div class="container new-offer-page">
    <header class="page-head">
      <NuxtLink
        class="back-link muted"
        to="/purchase-offers"
      >
        <Icon name="lucide:arrow-left" />
        <span>Purchase offers</span>
      </NuxtLink>
      <h1>Place offer</h1>
      <p class="muted">
        Lock native ETH against one or more Punk criteria slots.
      </p>
    </header>

    <LazyOfferPlaceForm @placed="onPlaced" />

    <p
      v-if="lastTx"
      class="success"
    >
      Offer submitted: <code>{{ lastTx }}</code>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { Hash } from 'viem'

const lastTx = ref<Hash | null>(null)

function onPlaced(tx: Hash) {
  lastTx.value = tx
}

useSeoMeta({
  title: 'Place offer · Punks Auction',
  ogTitle: 'Place offer · Punks Auction',
  twitterTitle: 'Place offer · Punks Auction',
})
</script>

<style scoped>
.new-offer-page {
  max-width: 760px;
  padding: var(--size-8) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-5);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
  align-self: flex-start;
  border: 0;
  font-size: var(--font-sm);
}

.success {
  margin: 0;
  color: var(--text);
  font-size: var(--font-sm);
}
</style>
