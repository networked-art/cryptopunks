<template>
  <div class="container new-offer-page">
    <header class="page-head">
      <div class="page-head-text">
        <NuxtLink
          class="back-link muted"
          to="/purchase-offers"
        >
          <Icon name="lucide:arrow-left" />
          <span>Purchase offers</span>
        </NuxtLink>
        <h1>Place offer</h1>
      </div>
    </header>

    <OfferPlaceFlow />
  </div>
</template>

<script setup lang="ts">
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

</style>
