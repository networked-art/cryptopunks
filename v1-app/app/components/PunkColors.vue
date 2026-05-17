<template>
  <div class="punk-colors">
    <NuxtLink
      v-for="c in colors"
      :key="c.id"
      class="swatch"
      :to="{ path: '/', query: { q: `#${c.bare}` } }"
      :style="{ background: c.css }"
      :title="c.label"
    />
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
/// SDK hex values are `0x…`-prefixed; CSS needs `#…`, and the search URL
/// uses the bare 6-hex form (`?color=a66e2c`).
const colors = computed(() =>
  [...(summary.value.colors ?? [])]
    .sort((a, b) => (a.supply ?? Infinity) - (b.supply ?? Infinity))
    .map((c) => {
      const bare = stripHexPrefix(c.rgb)
      return {
        ...c,
        bare,
        css: `#${stripHexPrefix(c.rgba)}`,
        label: `#${bare}${
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
