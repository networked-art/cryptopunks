<template>
  <div
    class="punk-mosaic"
    :class="`punk-mosaic-${layoutCount}`"
  >
    <PunkThumb
      v-for="id in visibleIds"
      :key="id"
      class="mosaic-punk"
      :punk-id="id"
      :link="false"
      fluid
    />
    <span
      v-if="extraCount > 0"
      class="mosaic-extra"
    >
      +{{ extraCount.toLocaleString() }}
    </span>
  </div>
</template>

<script setup lang="ts">
const MAX_VISIBLE = 4

const props = defineProps<{
  ids: readonly number[]
  /// Total matches behind the mosaic. Used for the "+N" overflow chip when
  /// the bid covers more punks than `ids` actually contains.
  total?: number
}>()

const visibleIds = computed(() => props.ids.slice(0, MAX_VISIBLE))
const layoutCount = computed(() =>
  Math.max(1, Math.min(visibleIds.value.length, MAX_VISIBLE)),
)
/// Prefer the explicit `total` over the local list length so we surface the
/// true matching-set size even when the caller only fed us a handful of ids.
const extraCount = computed(() => {
  const total = props.total ?? props.ids.length
  return Math.max(0, total - visibleIds.value.length)
})
</script>

<style scoped>
.punk-mosaic {
  position: relative;
  display: grid;
  gap: var(--size-1);
  inline-size: 100%;
  aspect-ratio: 1;
  min-inline-size: 0;
}

.punk-mosaic-1 {
  grid-template-columns: minmax(0, 1fr);
}

.punk-mosaic-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.punk-mosaic-3 {
  grid-template-columns:
    minmax(0, calc((200% - var(--size-1)) / 3))
    minmax(0, calc((100% - (2 * var(--size-1))) / 3));
  grid-template-rows: repeat(
    2,
    minmax(0, calc((100% - (2 * var(--size-1))) / 3))
  );
}

.punk-mosaic-3 .mosaic-punk:first-child {
  grid-row: 1 / -1;
}

.punk-mosaic-4 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
}

.mosaic-punk {
  inline-size: 100%;
}

.mosaic-extra {
  position: absolute;
  inset-inline-end: 0;
  inset-block-end: 0;
  padding: 1px 4px;
  color: var(--text);
  background: var(--bg);
  box-shadow: 0 0 0 1px var(--border-color);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  pointer-events: none;
}
</style>
