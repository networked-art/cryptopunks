<template>
  <DetailRow>
    <template #main>
      <NuxtLink
        v-if="row.href"
        class="slot-main slot-link"
        :to="row.href"
      >
        <OfferSlotsRowContent :row="row" />
      </NuxtLink>
      <span
        v-else
        class="slot-main"
      >
        <OfferSlotsRowContent :row="row" />
      </span>
    </template>

    <template #aside>
      <span class="slot-label">{{ row.label }}</span>
    </template>
  </DetailRow>
</template>

<script setup lang="ts">
import type { OfferSlotDisplay } from '~/composables/useOfferSlotDisplay'

defineProps<{
  row: OfferSlotDisplay
}>()
</script>

<style scoped>
.slot-main {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: var(--size-3);
  min-width: 0;
  color: inherit;
  border: 0;
}

.slot-label {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-variant-numeric: tabular-nums;
}

.slot-link:hover :deep(.slot-title),
.slot-link:focus-visible :deep(.slot-title) {
  color: var(--accent);
}
</style>
