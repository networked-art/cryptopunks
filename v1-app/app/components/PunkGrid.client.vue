<template>
  <div
    ref="containerRef"
    class="punk-grid"
    @scroll.passive="onScroll"
  >
    <div
      v-if="ids.length === 0"
      class="empty"
    >
      No punks match.
    </div>
    <div
      v-else
      class="grid-scroll"
      :style="{ height: totalHeight + 'px' }"
    >
      <NuxtLink
        v-for="cell in visible"
        :key="cell.id"
        :to="`/punk/${cell.id}`"
        class="cell"
        :style="cellStyle(cell)"
        :title="`Punk #${cell.id}`"
      >
        <span class="cell-id">{{ cell.id }}</span>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    ids: number[]
    size?: number
    gap?: number
    overscan?: number
  }>(),
  { size: 56, gap: 2, overscan: 6 },
)

const SPRITE_COLS = 100
const cell = computed(() => props.size + props.gap)

const containerRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const width = ref(800)
const height = ref(600)

const cols = computed(() => Math.max(1, Math.floor(width.value / cell.value)))
const rows = computed(() => Math.ceil(props.ids.length / cols.value))
const totalHeight = computed(() => rows.value * cell.value)

const start = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / cell.value) - props.overscan),
)
const end = computed(() =>
  Math.min(
    rows.value,
    Math.ceil((scrollTop.value + height.value) / cell.value) + props.overscan,
  ),
)

const visible = computed(() => {
  const out: { id: number; row: number; col: number }[] = []
  for (let r = start.value; r < end.value; r++) {
    for (let c = 0; c < cols.value; c++) {
      const i = r * cols.value + c
      if (i >= props.ids.length) break
      out.push({ id: props.ids[i]!, row: r, col: c })
    }
  }
  return out
})

watch(
  () => props.ids,
  () => {
    scrollTop.value = 0
    if (containerRef.value) containerRef.value.scrollTop = 0
  },
)

function onScroll(e: Event) {
  scrollTop.value = (e.target as HTMLElement).scrollTop
}

function cellStyle(c: { id: number; row: number; col: number }) {
  const spriteRow = Math.floor(c.id / SPRITE_COLS)
  const spriteCol = c.id % SPRITE_COLS
  const px = props.size
  return {
    top: `${c.row * cell.value}px`,
    left: `${c.col * cell.value}px`,
    width: `${px}px`,
    height: `${px}px`,
    backgroundImage: "url('/punks-glitched.png')",
    backgroundSize: `${SPRITE_COLS * px}px ${SPRITE_COLS * px}px`,
    backgroundPosition: `-${spriteCol * px}px -${spriteRow * px}px`,
  }
}

let observer: ResizeObserver | null = null
/// Watch the ref instead of relying on onMounted: this component is wrapped in
/// Nuxt's ClientOnly, so the real template (with `ref="containerRef"`) renders
/// a tick after the wrapper's onMounted fires against the placeholder div.
watch(
  containerRef,
  (el) => {
    if (!el) return
    width.value = el.clientWidth
    height.value = el.clientHeight
    observer?.disconnect()
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        width.value = entry.contentRect.width
        height.value = entry.contentRect.height
      }
    })
    observer.observe(el)
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.punk-grid {
  flex: 1;
  overflow-y: auto;
  position: relative;
  min-height: 400px;
}

.grid-scroll {
  position: relative;
}

.cell {
  position: absolute;
  image-rendering: pixelated;
  border: 0;
  border-radius: 3px;
  background-repeat: no-repeat;
  transition:
    transform 0.08s ease,
    box-shadow 0.08s ease;
}

.cell:hover {
  transform: scale(1.18);
  z-index: 5;
  box-shadow: 0 0 12px rgba(233, 69, 96, 0.5);
}

.cell-id {
  position: absolute;
  inset: auto 0 0 0;
  z-index: 2;
  font-size: 9px;
  text-align: center;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.55);
  line-height: 11px;
  opacity: 0;
  transition: opacity 0.1s;
  pointer-events: none;
}

.cell:hover .cell-id {
  opacity: 1;
}

.empty {
  padding: var(--space-8);
  text-align: center;
  color: var(--text-dim);
}
</style>
