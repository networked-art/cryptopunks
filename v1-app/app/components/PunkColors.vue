<template>
  <div class="punk-colors">
    <Tooltip
      v-for="c in colors"
      :key="c.id"
    >
      <template #trigger>
        <NuxtLink
          class="swatch"
          :to="{ path: '/', query: { q: `#${c.rgba}` } }"
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
/// SDK hex values are `0x…`-prefixed; CSS needs `#…`. The search URL uses
/// the full `rrggbbaa` form so semi-transparent palette entries survive
/// the round-trip — a 6-hex query is treated as `…ff` by the SDK and
/// would resolve to the wrong (opaque) color.
const colors = computed(() =>
  [...(summary.value.colors ?? [])]
    .sort((a, b) => (a.supply ?? Infinity) - (b.supply ?? Infinity))
    .map((c) => {
      const rgba = stripHexPrefix(c.rgba)
      const display = rgba.endsWith('ff') ? rgba.slice(0, 6) : rgba
      return {
        ...c,
        rgba,
        css: `#${rgba}`,
        label: `#${display}${
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
  border: 1px solid var(--border);
  border-radius: 2px;
}

.swatch:hover {
  border-color: var(--accent);
}
</style>
