<template>
  <div
    class="offer-target"
    :class="`is-${target.kind}`"
  >
    <div
      class="target-art"
      aria-hidden="true"
    >
      <template v-if="target.thumbs.length">
        <span
          v-for="thumb in target.thumbs"
          :key="`${thumb.standard}-${thumb.punkId}`"
          class="target-thumb"
        >
          <PunkThumb
            :punk-id="thumb.punkId"
            :standard="thumb.standard"
            :link="false"
            fluid
          />
        </span>
        <span
          v-if="target.extraCount"
          class="target-extra"
        >
          +{{ target.extraCount }}
        </span>
      </template>
      <Icon
        v-else
        class="target-icon"
        name="lucide:list-filter"
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
import type { OfferCardTarget } from '~/composables/useOfferCard'

defineProps<{
  target: OfferCardTarget
}>()
</script>

<style scoped>
.offer-target {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: var(--size-3);
  min-width: 0;
}

.target-art {
  position: relative;
  display: grid;
  place-items: center;
  inline-size: var(--size-8);
  block-size: var(--size-8);
  background: var(--bg-elevated);
  overflow: hidden;
}

.target-thumb {
  grid-area: 1 / 1;
  display: block;
  inline-size: 100%;
}

.is-bundle .target-thumb {
  inline-size: var(--size-6);
}

.is-bundle .target-thumb:nth-child(1) {
  transform: translate(calc(-1 * var(--size-2)), calc(-1 * var(--size-2)));
}

.is-bundle .target-thumb:nth-child(2) {
  transform: translate(var(--size-2), 0);
}

.is-bundle .target-thumb:nth-child(3) {
  transform: translate(0, var(--size-2));
}

.target-extra {
  position: absolute;
  inset-inline-end: var(--size-1);
  inset-block-end: var(--size-1);
  padding: 0 var(--size-1);
  color: var(--text-muted);
  background: var(--background);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}

.target-icon {
  color: var(--text-muted);
  font-size: var(--font-lg);
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

.target-art :deep(.punk-thumb) {
  border-radius: 0;
}
</style>
