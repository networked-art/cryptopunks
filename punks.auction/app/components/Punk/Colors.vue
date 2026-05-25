<template>
  <div class="punk-colors">
    <Tooltip
      v-for="c in colors"
      :key="c.id"
    >
      <template #trigger>
        <NuxtLink
          class="swatch"
          :to="{ path: '/punks', query: { q: `#${c.hex}` } }"
          :style="{ background: c.css }"
          @pointerenter="highlightColor(c.css)"
          @pointerleave="highlightColor(null)"
          @focus="highlightColor(c.css)"
          @blur="highlightColor(null)"
        />
      </template>
      {{ c.label }}
    </Tooltip>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ punkId: number }>()
const emit = defineEmits<{
  highlightColor: [color: string | null]
}>()

const offline = usePunksOffline()
const summary = computed(() =>
  offline.get(props.punkId, { includeColors: true }),
)

/// Rare-first: the color used by the fewest punks comes first so distinctive
/// palette entries are surfaced ahead of common ones like skin and background.
/// SDK hex values are `0x…`-prefixed; CSS needs `#…`. Fully-opaque entries
/// link/label with the 6-hex form; semi-transparent ones keep the alpha
/// byte so the search query resolves to the right palette color (a bare
/// 6-hex is treated as `…ff` by the SDK).
const colors = computed(() =>
  (summary.value.colors ?? [])
    .map((c) => ({
      ...c,
      punkCount: offline.count({ colors: { required: [c.id] } }),
    }))
    .sort((a, b) => a.punkCount - b.punkCount)
    .map((c) => {
      const rgba = stripHexPrefix(c.rgba)
      const hex = rgba.endsWith('ff') ? rgba.slice(0, 6) : rgba
      return {
        ...c,
        hex,
        css: `#${rgba}`,
        label: `#${hex} · used by ${c.punkCount.toLocaleString()} punks`,
      }
    }),
)

function stripHexPrefix(hex: string) {
  return hex.replace(/^0x/i, '')
}

function highlightColor(color: string | null) {
  emit('highlightColor', color)
}
</script>

<style scoped>
.punk-colors {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-1);
}

.swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
}
</style>
