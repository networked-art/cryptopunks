<template>
  <section class="items-block">
    <h2 class="block-title eyebrow">Items</h2>
    <ul class="items">
      <li
        v-for="item in items"
        :key="`${item.standard}-${item.punkId}`"
        class="item"
      >
        <NuxtLink
          class="item-link"
          :to="punkHref(item.standard, item.punkId)"
        >
          <PunkThumb
            :punk-id="item.punkId"
            :standard="item.standard"
            :size="48"
            :link="false"
          />
          <span class="item-label">{{ formatLotItemLabel(item) }}</span>
        </NuxtLink>
        <span class="weight">{{ formatWeight(item.weightBps) }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import {
  formatLotItemLabel,
  punkHref,
  type LotItem,
} from '~/utils/auction'

defineProps<{
  items: LotItem[]
}>()

function formatWeight(weightBps: number) {
  const percent = weightBps / 100
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%`
}
</script>

<style scoped>
.items-block {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.block-title {
  margin: 0;
}

.items {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  margin: 0;
  padding: 0;
}

.item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center;
  gap: var(--size-3);
  padding: var(--size-2);
  border: var(--border);
  background: var(--bg-elevated);
}

.item-link {
  display: flex;
  align-items: center;
  gap: var(--size-3);
  min-width: 0;
  border: 0;
}

.item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
}

.weight {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-variant-numeric: tabular-nums;
}
</style>
