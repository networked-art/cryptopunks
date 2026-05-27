<template>
  <OfferItemShell :to="row.href">
    <OfferTarget :target="row.target" />
    <span class="slot-label">{{ row.label }}</span>
  </OfferItemShell>
</template>

<script setup lang="ts">
import type { OfferSlotDisplay } from '~/composables/useOfferSlotDisplay'
import type { OfferTargetDisplay } from '~/composables/useOfferTarget'

defineProps<{
  row: OfferSlotDisplay & { target: OfferTargetDisplay }
}>()
</script>

<style scoped>
.slot-label {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-variant-numeric: tabular-nums;
}
</style>
