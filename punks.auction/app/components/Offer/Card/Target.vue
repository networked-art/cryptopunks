<template>
  <div class="offer-target">
    <div
      class="target-art"
      aria-hidden="true"
    >
      <template v-if="coverItems.length">
        <div
          class="target-mosaic"
          :class="`target-mosaic-${layoutCount}`"
        >
          <template
            v-for="(item, index) in visibleCoverItems"
            :key="coverItemKey(item, index)"
          >
            <PunkThumb
              v-if="item.kind === 'punk'"
              class="target-punk"
              :punk-id="item.punkId"
              :standard="item.standard"
              :background="lotItemBackground(item.standard)"
              :link="false"
              fluid
            />
            <span
              v-else
              class="target-symbol-tile"
            >
              <Icon
                class="target-symbol-icon"
                :name="item.icon"
              />
            </span>
          </template>
        </div>
        <span
          v-if="extraCount > 0"
          class="target-extra"
        >
          +{{ extraCount }}
        </span>
      </template>
      <Icon
        v-else
        class="target-icon"
        :name="target.icon ?? 'lucide:list-filter'"
      />
    </div>

    <span class="target-copy">
      <span class="target-title">{{ target.title }}</span>
      <span
        v-if="target.detail"
        class="target-detail"
      >
        {{ target.detail }}
      </span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { lotItemBackground } from '~/utils/auction'
import type {
  OfferCardCoverItem,
  OfferCardTarget,
} from '~/composables/useOfferCard'

const MAX_VISIBLE_ITEMS = 4

const props = defineProps<{
  target: OfferCardTarget
}>()

const coverItems = computed<OfferCardCoverItem[]>(() =>
  props.target.coverItems?.length
    ? props.target.coverItems
    : props.target.thumbs.map((item) => ({ kind: 'punk', ...item })),
)
const visibleCoverItems = computed(() =>
  coverItems.value.slice(0, MAX_VISIBLE_ITEMS),
)
const extraCount = computed(() =>
  Math.max(0, coverItems.value.length - MAX_VISIBLE_ITEMS),
)
const layoutCount = computed(() =>
  Math.max(1, Math.min(visibleCoverItems.value.length, MAX_VISIBLE_ITEMS)),
)

function coverItemKey(item: OfferCardCoverItem, index: number) {
  return item.kind === 'punk'
    ? `punk-${item.standard}-${item.punkId}`
    : `icon-${item.icon}-${index}`
}
</script>

<style scoped>
.offer-target {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: var(--size-3);
  min-width: 0;
  z-index: 0;
}

.target-art {
  position: relative;
  display: grid;
  place-items: center;
  inline-size: var(--size-9);
  block-size: var(--size-9);
  --punk-mosaic-inset: 19%;
  background: var(--bg-elevated);
  background: transparent;
  border-right: var(--border);
  border-color: var(--gray-z-0);
  overflow: hidden;
}

.target-icon {
  color: var(--text-muted);
  font-size: var(--font-lg);
}

.target-mosaic {
  box-sizing: border-box;
  display: grid;
  place-content: center;
  place-items: center;
  gap: var(--size-1);
  inline-size: 100%;
  padding: var(--punk-mosaic-inset, 19%);
  aspect-ratio: 1;
}

.target-mosaic-1 {
  grid-template-columns: minmax(0, 1fr);
}

.target-mosaic-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.target-mosaic-3 {
  grid-template-columns:
    minmax(0, calc((200% - var(--size-1)) / 3))
    minmax(0, calc((100% - (2 * var(--size-1))) / 3));
  grid-template-rows: repeat(
    2,
    minmax(0, calc((100% - (2 * var(--size-1))) / 3))
  );
}

.target-mosaic-3 > :first-child {
  grid-row: 1 / -1;
}

.target-mosaic-4 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
}

.target-punk,
.target-symbol-tile {
  inline-size: 100%;
}

.target-symbol-tile {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  color: var(--text-muted);
  background: var(--gray-z-2);
}

.target-symbol-icon {
  font-size: var(--font-sm);
}

.target-extra {
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

.target-art :deep(.punk-thumb) {
  border-radius: 0;
}

.target-copy {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
}

.target-title,
.target-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.target-title {
  color: var(--text);
  font-size: var(--font-xs);
  letter-spacing: var(--letter-spacing-md);
  text-transform: uppercase;
}

.target-detail {
  color: var(--text-muted);
  font-size: var(--font-sm);
  letter-spacing: 0;
  text-transform: none;
}
</style>
