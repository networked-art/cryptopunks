<template>
  <NuxtLink
    class="offer-row"
    :to="`/purchase-offers/${offer.id}`"
  >
    <EthAmount :wei="offer.amountWei" />
    <span class="dim"> by </span>
    <Account :address="offer.offerer" />
  </NuxtLink>
</template>

<script setup lang="ts">
import type { OfferRecord } from '~/utils/auction'

defineProps<{
  offer: OfferRecord
}>()
</script>

<style scoped>
.offer-row {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  padding: var(--size-2) var(--size-3);
  color: inherit;
  border: 0;
  text-decoration: none;
  font-size: var(--font-sm);
}

.offer-row:hover,
.offer-row:focus-visible {
  color: inherit;
  box-shadow: inset 2px 0 0 var(--accent);
}

.offer-row :deep(.avvatar) {
  height: 1em;
}
</style>
