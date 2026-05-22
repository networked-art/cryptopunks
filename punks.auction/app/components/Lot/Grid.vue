<template>
  <div
    class="lot-grid"
    :style="{ '--cols': columns }"
  >
    <PunkThumb
      v-for="item in shown"
      :key="`${item.standard}-${item.punkId}`"
      :punk-id="item.punkId"
      :standard="item.standard"
      fluid
    />
    <span
      v-if="overflow > 0"
      class="more"
      >+{{ overflow }}</span
    >
  </div>
</template>

<script setup lang="ts">
import type { LotItem } from '~/utils/auction'

const props = withDefaults(
  defineProps<{
    items: LotItem[]
    /// Widest the grid grows. Small lots use fewer columns so a single-Punk
    /// lot reads as one bold tile rather than a lonely corner thumbnail.
    maxColumns?: number
  }>(),
  { maxColumns: 4 },
)

/// The grid never spills past two rows: it fills `maxColumns × 2` cells, the
/// last turning into a `+N` chip when the lot holds more Punks than fit.
const capacity = computed(() => props.maxColumns * 2)

const shown = computed(() =>
  props.items.length > capacity.value
    ? props.items.slice(0, capacity.value - 1)
    : props.items,
)

const overflow = computed(() => props.items.length - shown.value.length)

const columns = computed(() => {
  const cells = shown.value.length + (overflow.value > 0 ? 1 : 0)
  return Math.min(props.maxColumns, Math.max(1, cells))
})
</script>

<style scoped>
.lot-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  gap: var(--size-1);
}

.more {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  font-size: var(--font-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 1px dashed var(--border-strong);
  border-radius: 3px;
}
</style>
