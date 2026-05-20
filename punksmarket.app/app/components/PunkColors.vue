<template>
  <div class="punk-colors">
    <Tooltip
      v-for="c in colors"
      :key="c.id"
    >
      <template #trigger>
        <NuxtLink
          class="swatch"
          :to="{ path: '/', query: { q: `#${c.hex}` } }"
          :style="{ background: c.css }"
        />
      </template>
      {{ c.label }}
    </Tooltip>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ punkId: number }>()

const offline = usePunksOffline()
const summary = computed(() =>
  offline.get(props.punkId, { includeColors: true }),
)

/// Rare-first: the lowest-supply color comes first so distinctive palette
/// entries are surfaced ahead of common ones like skin and background.
/// SDK hex values are `0x…`-prefixed; CSS needs `#…`. Fully-opaque entries
/// link/label with the 6-hex form; semi-transparent ones keep the alpha
/// byte so the search query resolves to the right palette color (a bare
/// 6-hex is treated as `…ff` by the SDK).
const colors = computed(() =>
  [...(summary.value.colors ?? [])]
    .sort((a, b) => (a.supply ?? Infinity) - (b.supply ?? Infinity))
    .map((c) => {
      const rgba = stripHexPrefix(c.rgba)
      const hex = rgba.endsWith('ff') ? rgba.slice(0, 6) : rgba
      return {
        ...c,
        hex,
        css: `#${rgba}`,
        label: `#${hex}${
          c.supply !== undefined
            ? ` · used by ${c.supply.toLocaleString()} punks`
            : ''
        }`,
      }
    }),
)

function stripHexPrefix(hex: string) {
  return hex.replace(/^0x/i, '')
}
</script>

<style scoped>
.punk-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: var(--border);
  border-radius: 2px;
}

.swatch:hover {
  border-color: var(--accent);
}
</style>
