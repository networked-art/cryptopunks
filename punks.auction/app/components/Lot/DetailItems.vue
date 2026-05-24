<template>
  <section class="items-block">
    <h2 class="block-title eyebrow">Items</h2>
    <ul class="items">
      <li
        v-for="item in sortedItems"
        :key="`${item.standard}-${item.punkId}`"
        class="item"
        :class="{ 'item-with-weight': showWeights }"
      >
        <NuxtLink
          class="item-link"
          :to="punkHref(item.standard, item.punkId)"
        >
          <PunkThumb
            :punk-id="item.punkId"
            :standard="item.standard"
            :background="itemBackground(item)"
            :size="48"
            :link="false"
          />
          <span class="item-label">{{ formatLotItemLabel(item) }}</span>
        </NuxtLink>
        <span v-if="showWeights" class="weight">{{ formatWeight(item.weightBps) }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import {
  formatLotItemLabel,
  lotItemBackground,
  punkHref,
  type LotItem,
} from '~/utils/auction'

const props = defineProps<{
  items: LotItem[]
}>()

const showWeights = computed(() => {
  const weights = props.items.map((item) => item.weightBps)
  if (weights.length < 2) return false
  return Math.max(...weights) - Math.min(...weights) > 100
})

const sortedItems = computed(() =>
  [...props.items].sort((a, b) => b.weightBps - a.weightBps),
)

function formatWeight(weightBps: number) {
  const percent = weightBps / 100
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%`
}

function itemBackground(item: LotItem) {
  return lotItemBackground(item.standard)
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
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: var(--size-3);
  padding: var(--size-2);
  border: var(--border);
  background: var(--bg-elevated);
}

.item-with-weight {
  grid-template-columns: minmax(0, 1fr) max-content;
  padding-right: var(--size-3);
}

.item-link {
  display: flex;
  align-items: center;
  gap: var(--size-3);
  min-width: 0;
  border: 0;
}

.item-link :deep(.punk-thumb) {
  border-radius: 0;
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
