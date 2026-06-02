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

/// Group the palette as a color wheel: near-grey swatches form a leading band
/// ramped dark to light, then chromatic swatches follow by hue, each hue ramped
/// by brightness. SDK hex values are `0x…`-prefixed; CSS needs `#…`. Fully-
/// opaque entries link/label with the 6-hex form; semi-transparent ones keep
/// the alpha byte so the search query resolves to the right palette color (a
/// bare 6-hex is treated as `…ff` by the SDK).
const colors = computed(() =>
  (summary.value.colors ?? [])
    .map((c) => {
      const rgba = stripHexPrefix(c.rgba)
      const hex = rgba.endsWith('ff') ? rgba.slice(0, 6) : rgba
      const punkCount = offline.count({ colors: { required: [c.id] } })
      return {
        ...c,
        hex,
        css: `#${rgba}`,
        ...paletteOrder(rgba),
        label: `#${hex} · used by ${punkCount.toLocaleString()} punks`,
      }
    })
    .sort((a, b) => a.hue - b.hue || a.brightness - b.brightness),
)

function stripHexPrefix(hex: string) {
  return hex.replace(/^0x/i, '')
}

/// Perceptual brightness plus hue for palette ordering. Near-grey swatches have
/// no meaningful hue, so they collapse into a single leading band (hue -1)
/// sorted by brightness; chromatic swatches keep their 0–360 hue.
function paletteOrder(rgba: string) {
  const r = parseInt(rgba.slice(0, 2), 16) / 255
  const g = parseInt(rgba.slice(2, 4), 16) / 255
  const b = parseInt(rgba.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const brightness = 0.299 * r + 0.587 * g + 0.114 * b
  const saturation = max === 0 ? 0 : delta / max
  let hue = -1
  if (saturation > 0.15) {
    if (max === r) hue = ((g - b) / delta + 6) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    hue *= 60
  }
  return { hue, brightness }
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
