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
        @mouseenter="reshuffleCell(cell.id)"
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

function hash32(n: number) {
  let h = n | 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000
}

const seedOverrides = reactive(new Map<number, number>())

function reshuffleCell(id: number) {
  seedOverrides.set(id, Math.floor(Math.random() * 1_000_000_000))
}

function cellStyle(c: { id: number; row: number; col: number }) {
  const spriteRow = Math.floor(c.id / SPRITE_COLS)
  const spriteCol = c.id % SPRITE_COLS
  const px = props.size
  const s = seedOverrides.get(c.id) ?? c.id
  const gx = (hash32(s * 7 + 1) - 0.5) * 6
  const gy = (hash32(s * 13 + 2) - 0.5) * 4
  const sy1 = 12 + hash32(s * 23 + 1) * 28
  const sy2 = 55 + hash32(s * 29 + 1) * 30
  const sh1 = 2 + hash32(s * 37 + 1) * 4
  const sh2 = 2 + hash32(s * 41 + 1) * 3
  return {
    top: `${c.row * cell.value}px`,
    left: `${c.col * cell.value}px`,
    width: `${px}px`,
    height: `${px}px`,
    backgroundImage: "url('/punks.png')",
    backgroundSize: `${SPRITE_COLS * px}px ${SPRITE_COLS * px}px`,
    backgroundPosition: `-${spriteCol * px}px -${spriteRow * px}px`,
    '--g-x': `${gx.toFixed(2)}px`,
    '--g-y': `${gy.toFixed(2)}px`,
    '--slice-1-y': `${sy1.toFixed(1)}%`,
    '--slice-1-h': `${sh1.toFixed(1)}%`,
    '--slice-2-y': `${sy2.toFixed(1)}%`,
    '--slice-2-h': `${sh2.toFixed(1)}%`,
  }
}

let observer: ResizeObserver | null = null
onMounted(() => {
  if (!containerRef.value) return
  width.value = containerRef.value.clientWidth
  height.value = containerRef.value.clientHeight
  observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      width.value = entry.contentRect.width
      height.value = entry.contentRect.height
    }
  })
  observer.observe(containerRef.value)
})

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
    filter 0.18s ease,
    box-shadow 0.08s ease;
  filter:
    drop-shadow(var(--g-x, 2px) 0 0 rgba(255, 0, 60, 0.6))
    drop-shadow(calc(-1 * var(--g-x, 2px)) 0 0 rgba(0, 255, 140, 0.5))
    drop-shadow(0 var(--g-y, 1px) 0 rgba(0, 184, 255, 0.5));
}

.cell::before,
.cell::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
  background: rgba(255, 255, 255, 0.55);
  mix-blend-mode: overlay;
  transition:
    top 0.18s ease,
    height 0.18s ease;
}

.cell::before {
  top: var(--slice-1-y, 25%);
  height: var(--slice-1-h, 4%);
}

.cell::after {
  top: var(--slice-2-y, 70%);
  height: var(--slice-2-h, 3%);
  background: rgba(255, 255, 255, 0.4);
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
