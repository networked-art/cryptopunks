<template>
  <div class="offer-target">
    <div
      class="target-art"
      aria-hidden="true"
    >
      <template v-if="target.thumbs.length">
        <PunkMosaic :items="target.thumbs" />
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
  --punk-mosaic-inset: 19%;
  background: var(--bg-elevated);
  overflow: hidden;
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
</style>
