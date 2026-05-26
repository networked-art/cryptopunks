<template>
  <section
    v-if="items.length > 1"
    class="items-block"
  >
    <h2 class="block-title eyebrow">Items</h2>
    <ul class="items">
      <DetailRow
        v-for="item in sortedItems"
        :key="`${item.standard}-${item.punkId}`"
      >
        <template #main>
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
            <span class="item-label">
              Punk #{{ item.punkId }}
              <span
                v-if="item.standard === TokenStandard.CryptoPunksV1"
                class="item-standard"
                >(V1)</span
              >
            </span>
          </NuxtLink>
        </template>
        <template
          v-if="showWeights"
          #aside
        >
          <span class="weight">{{ formatWeight(item.weightBps) }}</span>
        </template>
      </DetailRow>
    </ul>
  </section>
</template>

<script setup lang="ts">
import {
  lotItemBackground,
  punkHref,
  TokenStandard,
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

.item-standard {
  color: var(--text-muted);
}

.weight {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-variant-numeric: tabular-nums;
}
</style>
