<template>
  <div class="punk-mosaic">
    <div
      class="mosaic-grid"
      :class="`mosaic-${layoutCount}`"
    >
      <PunkThumb
        v-for="item in visibleItems"
        :key="`${item.standard}-${item.punkId}`"
        class="mosaic-punk"
        :punk-id="item.punkId"
        :standard="item.standard"
        :background="itemBackground(item)"
        :link="false"
        fluid
      />
    </div>
    <span
      v-if="extraCount > 0"
      class="mosaic-extra"
    >
      +{{ extraCount }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { lotItemBackground, type TokenStandardValue } from '~/utils/auction'

type PunkMosaicItem = {
  punkId: number
  standard: TokenStandardValue
}

const MAX_VISIBLE_ITEMS = 4

const props = defineProps<{
  items: readonly PunkMosaicItem[]
}>()

const visibleItems = computed(() => props.items.slice(0, MAX_VISIBLE_ITEMS))
const extraCount = computed(() =>
  Math.max(0, props.items.length - MAX_VISIBLE_ITEMS),
)
const layoutCount = computed(() =>
  Math.max(1, Math.min(visibleItems.value.length, MAX_VISIBLE_ITEMS)),
)

function itemBackground(item: PunkMosaicItem) {
  return lotItemBackground(item.standard)
}
</script>

<style scoped>
.punk-mosaic {
  position: relative;
  inline-size: 100%;
  aspect-ratio: 1;
  flex: 0 0 auto;
  min-inline-size: 0;
}

.mosaic-grid {
  box-sizing: border-box;
  display: grid;
  place-content: center;
  place-items: center;
  gap: var(--size-1);
  inline-size: 100%;
  padding: var(--punk-mosaic-inset, 0);
  aspect-ratio: 1;
}

.mosaic-1 {
  grid-template-columns: minmax(0, 1fr);
}

.mosaic-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mosaic-3 {
  grid-template-columns:
    minmax(0, calc((200% - var(--size-1)) / 3))
    minmax(0, calc((100% - (2 * var(--size-1))) / 3));
  grid-template-rows: repeat(
    2,
    minmax(0, calc((100% - (2 * var(--size-1))) / 3))
  );
}

.mosaic-3 .mosaic-punk:first-child {
  grid-row: 1 / -1;
}

.mosaic-4 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
}

.mosaic-punk {
  width: 100%;
}

.mosaic-extra {
  position: absolute;
  inset-inline-end: var(--size-0);
  inset-block-end: var(--size-0);
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  line-height: var(--line-height-tight);
  scale: 0.82;
  transform-origin: bottom right;
}

.punk-mosaic :deep(.punk-thumb) {
  border-radius: 0;
}
</style>
