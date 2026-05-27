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
    </header>

    <OfferPlaceFlow @placed="onPlaced" />

    <p
      v-if="fallbackTx"
      class="success"
    >
      Offer submitted. <NuxtLink to="/purchase-offers">View offers</NuxtLink>
      <code>{{ fallbackTx }}</code>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { Hash } from 'viem'

type PlaceOfferResult = {
  tx: Hash
  offerId: bigint | null
}

const router = useRouter()
const fallbackTx = ref<Hash | null>(null)

function onPlaced(result: PlaceOfferResult) {
  if (result.offerId !== null) {
    void router.replace(`/purchase-offers/${result.offerId}`)
    return
  }
  fallbackTx.value = result.tx
}

useSeoMeta({
  title: 'Place offer · Punks Auction',
  ogTitle: 'Place offer · Punks Auction',
  twitterTitle: 'Place offer · Punks Auction',
})
</script>

<style scoped>
.new-offer-page {
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

.success a {
  margin-inline: var(--size-1);
}

.success code {
  color: var(--text-muted);
}
</style>
