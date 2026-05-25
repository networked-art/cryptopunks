<template>
  <li class="slot-row">
    <NuxtLink
      v-if="row.href"
      class="slot-content slot-link"
      :to="row.href"
    >
      <OfferSlotsRowContent :row="row" />
    </NuxtLink>
    <span
      v-else
      class="slot-content"
    >
      <OfferSlotsRowContent :row="row" />
    </span>
  </li>
</template>

<script setup lang="ts">
import type { OfferSlotDisplay } from '~/composables/useOfferSlotDisplay'

defineProps<{
  row: OfferSlotDisplay
}>()
</script>

<style scoped>
.slot-row {
  list-style: none;
}

.slot-content {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) max-content;
  align-items: center;
  gap: var(--size-3);
  padding: var(--size-2);
  color: inherit;
  border: var(--border);
  background: var(--bg-elevated);
}

.slot-link:hover :deep(.slot-title),
.slot-link:focus-visible :deep(.slot-title) {
  color: var(--accent);
}
</style>
