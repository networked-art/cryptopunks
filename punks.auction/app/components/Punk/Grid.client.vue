<template>
  <div
    ref="containerRef"
    class="punk-grid"
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
        :to="`/punks/${cell.id}`"
        class="cell"
        :style="cellStyle(cell)"
        :title="`Punk #${cell.id}`"
      />
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
  { size: 72, gap: 2, overscan: 6 },
)

const SPRITE_COLS = 100
const PUNK_PIXEL_SIZE = 24

const containerRef = ref<HTMLElement | null>(null)
const { backgroundForPunk } = usePunkBackgrounds()
/// Where the visible window starts/ends inside the grid, in content
/// coordinates. We compute these from the container's bounding rect against
/// the viewport, so the math is identical whether the window or some ancestor
/// owns the scrollbar.
const visibleTop = ref(0)
const visibleHeight = ref(0)
const containerWidth = ref(0)

/// Fit as many cells per row as possible given `gap` as the minimum spacing,
/// then redistribute leftover width into the resolved gap. The same resolved
/// gap is used on both axes so rows and columns keep equal spacing.
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

/// Scroll events are coalesced to one measure() per animation frame, so the
/// overscan buffer must be wide enough to cover whatever distance a fast
/// flick/wheel can travel in a single frame.
const overscanRows = computed(() =>
  Math.max(props.overscan, Math.ceil(visibleHeight.value / rowStep.value)),
)

const start = computed(() =>
  Math.max(
    0,
    Math.floor(visibleTop.value / rowStep.value) - overscanRows.value,
  ),
)
const end = computed(() =>
  Math.min(
    rows.value,
    Math.ceil((visibleTop.value + visibleHeight.value) / rowStep.value) +
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

function cellStyle(c: { id: number; row: number; col: number }) {
  const spriteRow = Math.floor(c.id / SPRITE_COLS)
  const spriteCol = c.id % SPRITE_COLS
  const px = cellSize.value
  return {
    top: `${c.row * rowStep.value}px`,
    left: `${c.col * colStep.value}px`,
    width: `${px}px`,
    height: `${px}px`,
    backgroundColor: backgroundForPunk(c.id),
    backgroundImage: "url('/punks.png')",
    backgroundSize: `${SPRITE_COLS * px}px ${SPRITE_COLS * px}px`,
    backgroundPosition: `-${spriteCol * px}px -${spriteRow * px}px`,
  }
}

let rafId = 0

function measure() {
  rafId = 0
  const el = containerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  /// `.punk-grid` carries padding, but the cells are laid out inside its
  /// content box (`.grid-scroll`). Measure the content box so the column math
  /// doesn't overshoot the padded width and spill cells off the page.
  const cs = getComputedStyle(el)
  const padLeft = parseFloat(cs.paddingLeft) || 0
  const padRight = parseFloat(cs.paddingRight) || 0
  const padTop = parseFloat(cs.paddingTop) || 0
  containerWidth.value = rect.width - padLeft - padRight
  /// Intersection of the content box with the viewport, expressed in the
  /// content box's own (scroll-content) coordinate space.
  const vh = window.innerHeight || document.documentElement.clientHeight
  const contentTop = rect.top + padTop
  const top = Math.max(0, -contentTop)
  const bottom = Math.max(0, Math.min(rect.height, vh - contentTop))
  visibleTop.value = top
  visibleHeight.value = Math.max(0, bottom - top)
}

function schedule() {
  if (rafId) return
  rafId = requestAnimationFrame(measure)
}

let resizeObserver: ResizeObserver | null = null

/// The component is wrapped in Nuxt's ClientOnly, so the real template renders
/// a tick after the wrapper's onMounted fires against the placeholder div.
/// Watch the ref so the observers attach to the real element once it exists.
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
    /// New result set: jump the page back to the top of the grid so the user
    /// sees the first matches, then re-measure.
    const el = containerRef.value
    if (el) {
      const rect = el.getBoundingClientRect()
      if (rect.top < 0) window.scrollBy({ top: rect.top, behavior: 'auto' })
    }
    schedule()
  },
)

onMounted(() => {
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('scroll', schedule)
  window.removeEventListener('resize', schedule)
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<style scoped>
.punk-grid {
  position: relative;
}

.grid-scroll {
  position: relative;
  /* Scope the hover/focus z-index below so it can't escape above the
     sticky search bar / site header. */
  isolation: isolate;
}

.cell {
  position: absolute;
  box-sizing: border-box;
  image-rendering: pixelated;
  border: 0;
  background-repeat: no-repeat;
  color: inherit;
  transition:
    transform 0.08s ease,
    box-shadow 0.08s ease;
}

.cell:hover,
.cell:focus-visible {
  transform: scale(1.18);
  z-index: 5;
  outline: none;
  box-shadow:
    0 0 0 6px #fff,
    0 0 0 7px var(--border-color),
    0 1px 2px rgba(10, 10, 18, 0.05),
    0 24px 48px -28px rgba(10, 10, 18, 0.4);
}

.empty {
  padding: var(--size-8);
  text-align: center;
  color: var(--text-dim);
}
</style>
