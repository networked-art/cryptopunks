<template>
  <div class="lot-items">
    <PunkThumb
      v-for="item in shown"
      :key="`${item.standard}-${item.punkId}`"
      :punk-id="item.punkId"
      :standard="item.standard"
      :background="itemBackground(item)"
      :size="size"
    />
    <span
      v-if="remaining > 0"
      class="more"
      :style="{ width: `${size}px`, height: `${size}px` }"
      >+{{ remaining }}</span
    >
  </div>
</template>

<script setup lang="ts">
import { lotItemBackground, type LotItem } from '~/utils/auction'

const props = withDefaults(
  defineProps<{
    items: LotItem[]
    size?: number
    max?: number
  }>(),
  { size: 48, max: 12 },
)

const shown = computed(() => props.items.slice(0, props.max))
const remaining = computed(() => Math.max(0, props.items.length - props.max))

function itemBackground(item: LotItem) {
  return lotItemBackground(item.standard)
}
</script>

<style scoped>
.lot-items {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-2);
}

.more {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-sm);
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 1px dashed var(--border-strong);
}
</style>
