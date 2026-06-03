<template>
  <div class="punk-select">
    <div
      v-if="ids.length === 0"
      class="empty"
    >
      {{ emptyMessage ?? 'No Punks to choose from.' }}
    </div>
    <div
      v-else
      ref="containerRef"
      class="scroll"
      :style="{ maxHeight: maxHeight + 'px' }"
      @scroll.passive="schedule"
    >
      <div
        class="grid"
        :style="{ height: totalHeight + 'px' }"
      >
        <button
          v-for="cell in visible"
          :key="cell.id"
          type="button"
          class="cell unstyled punk-selection-cell"
          :class="{ 'is-selected': selectedSet.has(cell.id) }"
          :style="cellStyle(cell)"
          :title="`Punk #${cell.id}`"
          :aria-pressed="selectedSet.has(cell.id)"
          @click="toggle(cell.id)"
        >
          <span
            class="punk-selection-indicator"
            aria-hidden="true"
          >
            <Icon name="lucide:check" />
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PUNK_SPRITE_URL } from '~/utils/punkSprites'

const props = withDefaults(
  defineProps<{
    ids: number[]
    multi?: boolean
    max?: number
    size?: number
    gap?: number
    overscan?: number
    maxHeight?: number
    emptyMessage?: string
  }>(),
  {
    multi: false,
    size: 64,
    gap: 2,
    overscan: 6,
    maxHeight: 480,
  },
)

const selected = defineModel<number[]>({ default: () => [] })

const SPRITE_COLS = 100
const PUNK_PIXEL_SIZE = 24

const containerRef = ref<HTMLElement | null>(null)
const { backgroundForPunkState } = usePunkBackgrounds()

const scrollTop = ref(0)
const clientHeight = ref(0)
const containerWidth = ref(0)

const cellSize = computed(
  () => Math.max(1, Math.ceil(props.size / PUNK_PIXEL_SIZE)) * PUNK_PIXEL_SIZE,
)
const cols = computed(() =>
  Math.max(
    1,
    Math.floor(
      (containerWidth.value + props.gap) / (cellSize.value + props.gap),
    ),
  ),
)
const resolvedGap = computed(() => {
  if (cols.value <= 1) return props.gap
  return Math.max(
    props.gap,
    (containerWidth.value - cols.value * cellSize.value) / (cols.value - 1),
  )
})
const colStep = computed(() => cellSize.value + resolvedGap.value)
const rowStep = computed(() => cellSize.value + resolvedGap.value)
const rows = computed(() => Math.ceil(props.ids.length / cols.value))
const totalHeight = computed(() =>
  rows.value === 0 ? 0 : (rows.value - 1) * rowStep.value + cellSize.value,
)

const overscanRows = computed(() =>
  Math.max(props.overscan, Math.ceil(clientHeight.value / rowStep.value)),
)

const start = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / rowStep.value) - overscanRows.value),
)
const end = computed(() =>
  Math.min(
    rows.value,
    Math.ceil((scrollTop.value + clientHeight.value) / rowStep.value) +
      overscanRows.value,
  ),
)

const visible = computed(() => {
  const out: { id: number; row: number; col: number }[] = []
  const colCount = cols.value
  for (let r = start.value; r < end.value; r++) {
    for (let c = 0; c < colCount; c++) {
      const i = r * colCount + c
      if (i >= props.ids.length) break
      out.push({ id: props.ids[i]!, row: r, col: c })
    }
  }
  return out
})

const selectedSet = computed(() => new Set(selected.value))

function toggle(id: number) {
  const set = new Set(selected.value)
  if (set.has(id)) {
    set.delete(id)
    selected.value = Array.from(set)
    return
  }
  if (!props.multi) {
    selected.value = [id]
    return
  }
  if (props.max && set.size >= props.max) return
  set.add(id)
  selected.value = Array.from(set)
}

function cellStyle(c: { id: number; row: number; col: number }) {
  const spriteRow = Math.floor(c.id / SPRITE_COLS)
  const spriteCol = c.id % SPRITE_COLS
  const px = cellSize.value
  return {
    top: `${c.row * rowStep.value}px`,
    left: `${c.col * colStep.value}px`,
    width: `${px}px`,
    height: `${px}px`,
    backgroundColor: backgroundForPunkState(c.id),
    backgroundImage: `url('${PUNK_SPRITE_URL}')`,
    backgroundSize: `${SPRITE_COLS * px}px ${SPRITE_COLS * px}px`,
    backgroundPosition: `-${spriteCol * px}px -${spriteRow * px}px`,
  }
}

let rafId = 0

function measure() {
  rafId = 0
  const el = containerRef.value
  if (!el) return
  containerWidth.value = el.clientWidth
  clientHeight.value = el.clientHeight
  scrollTop.value = el.scrollTop
}

function schedule() {
  if (rafId) return
  rafId = requestAnimationFrame(measure)
}

let resizeObserver: ResizeObserver | null = null

watch(
  containerRef,
  (el) => {
    if (!el) return
    measure()
    resizeObserver?.disconnect()
    resizeObserver = new ResizeObserver(() => schedule())
    resizeObserver.observe(el)
  },
  { immediate: true, flush: 'post' },
)

watch(
  () => props.ids,
  () => {
    const el = containerRef.value
    if (el) el.scrollTop = 0
    schedule()
  },
)

onMounted(() => {
  window.addEventListener('resize', schedule)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', schedule)
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<style scoped>
.punk-select {
  position: relative;
  width: 100%;
}

.scroll {
  position: relative;
  overflow-y: auto;
  overscroll-behavior: contain;
  width: 100%;
}

.grid {
  position: relative;
  isolation: isolate;
}

.cell {
  position: absolute;
  box-sizing: border-box;
  image-rendering: pixelated;
  padding: 0;
  border: 0;
  background-repeat: no-repeat;
  color: inherit;
  cursor: pointer;
  transition: box-shadow 0.08s ease;
}

.empty {
  padding: var(--size-6) var(--size-3);
  text-align: center;
  color: var(--text-dim);
  font-size: var(--font-sm);
}
</style>
