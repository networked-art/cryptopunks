<template>
  <div class="container listings-page">
    <header class="page-head">
      <h1>Listings</h1>
      <p class="muted">
        Active asks on
        <a
          href="https://evm.now/address/0x6ba6f2207e343923ba692e5cae646fb0f566db8d"
          >CryptoPunks.sol</a
        >, routed through
        <a href="https://evm.now/address/punksmarket.eth/code"
          >PunksMarket.sol</a
        >
        so the seller receives sale proceeds correctly. Sorted by price.
      </p>
    </header>

    <ClientOnly>
      <div
        v-if="pending && !ids.length"
        class="muted"
      >
        Loading listings…
      </div>
      <div
        v-else-if="error"
        class="error"
      >
        Failed to load listings: {{ error }}
      </div>
      <div
        v-else-if="!ids.length"
        class="empty muted"
      >
        No active listings.
      </div>
      <PunkGrid
        v-else
        :ids="ids"
        :prices-by-id="priceById"
        :size="56"
      />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
useSeoMeta({
  title: 'Listings · punksmarket.app',
  ogTitle: 'Listings · punksmarket.app',
  twitterTitle: 'Listings · punksmarket.app',
})

const { ids, priceById, pending, error } = useListedPunks()
</script>

<style scoped>
.listings-page {
  padding: var(--size-6) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
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
