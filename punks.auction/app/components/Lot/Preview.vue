<template>
  <div class="lot-preview">
    <div
      v-if="activeItem"
      class="deck"
    >
      <PunkThumb
        v-if="backingItem"
        :key="`${activeIndex}-${backingItem.standard}-${backingItem.punkId}`"
        class="backing-punk"
        :punk-id="backingItem.punkId"
        :standard="backingItem.standard"
        :link="false"
        fluid
      />
      <PunkThumb
        class="main-punk"
        :punk-id="activeItem.punkId"
        :standard="activeItem.standard"
        :link="false"
        fluid
      />
    </div>
    <div
      v-else
      class="empty-preview muted"
    >
      No Punks
    </div>

    <div
      v-if="items.length > 1"
      class="preview-controls"
    >
      <button
        type="button"
        class="unstyled preview-button"
        aria-label="Previous Punk"
        @click="previous"
      >
        <Icon name="lucide:chevron-left" />
      </button>
      <span
        class="preview-count"
      >
        {{ activeIndex + 1 }} / {{ items.length }}
      </span>
      <button
        type="button"
        class="unstyled preview-button"
        aria-label="Next Punk"
        @click="next"
      >
        <Icon name="lucide:chevron-right" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LotItem } from '~/utils/auction'

const props = defineProps<{
  items: LotItem[]
}>()

const activeIndex = ref(0)

watch(
  () => props.items.length,
  (length) => {
    if (activeIndex.value >= length) activeIndex.value = 0
  },
)

const activeItem = computed(() => props.items[activeIndex.value])

const backingItem = computed(() => {
  if (props.items.length <= 1) return undefined
  return props.items[(activeIndex.value + 1) % props.items.length]
})

function previous() {
  const length = props.items.length
  if (length < 2) return
  activeIndex.value = (activeIndex.value - 1 + length) % length
}

function next() {
  const length = props.items.length
  if (length < 2) return
  activeIndex.value = (activeIndex.value + 1) % length
}
</script>

<style scoped>
.lot-preview {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  inline-size: 100%;
  aspect-ratio: 1 / 1.24;
  padding: 9%;
  background: white;
  border: var(--border);
  overflow: hidden;
}

.deck {
  position: relative;
  display: grid;
  place-items: center;
  inline-size: 100%;
  aspect-ratio: 1;
  flex: 0 0 auto;
}

.backing-punk,
.main-punk {
  grid-area: 1 / 1;
}

.backing-punk {
  position: relative;
  z-index: 1;
  opacity: 0.22;
  transform: translate(var(--size-2), 0) rotate(1deg);
}

.main-punk {
  position: relative;
  z-index: 5;
  box-shadow: 0 0 0 var(--border-width) var(--border-color);
}

.empty-preview {
  inline-size: 100%;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  font-size: var(--font-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.preview-controls {
  position: absolute;
  z-index: 10;
  inset-inline-start: 50%;
  inset-block-end: 9%;
  transform: translate(-50%, 50%);
  display: flex;
  align-items: center;
  gap: var(--size-1);
  inline-size: max-content;
  min-block-size: var(--font-lg);
  padding: var(--border-width);
  background: var(--bg-elevated);
  box-shadow: 0 0 0 var(--border-width) var(--border-color);
}

.preview-button {
  width: var(--font-lg);
  height: var(--font-lg);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: transparent;
  border: 0;
  cursor: pointer;
}

.preview-button:hover,
.preview-button:focus-visible {
  color: var(--text);
  background: var(--background);
}

.preview-button :deep(.icon) {
  width: var(--font-sm);
  height: var(--font-sm);
}

.lot-preview :deep(.punk-thumb) {
  border-radius: 0;
}

.preview-count {
  min-inline-size: calc(var(--font-lg) + var(--font-sm));
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-variant-numeric: tabular-nums;
  text-align: center;
}
</style>
