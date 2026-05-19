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
import { WRAPPED_BG } from '~/composables/useWrappedPunks'

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

const { isWrapped } = useWrappedPunks()

const containerRef = ref<HTMLElement | null>(null)
/// Where the visible window starts/ends inside the grid, in content
/// coordinates. We compute these from the container's bounding rect against
/// the viewport, so the math is identical whether the window or some ancestor
/// owns the scrollbar.
const visibleTop = ref(0)
const visibleHeight = ref(0)
const containerWidth = ref(0)

/// Fit as many cells per row as possible given `gap` as the minimum spacing,
/// then redistribute leftover width as extra horizontal gap so the row spans
/// the full container (space-between). Vertical spacing stays at `gap`.
const cols = computed(() =>
  Math.max(
    1,
    Math.floor(
      (containerWidth.value + props.gap) / (props.size + props.gap),
    ),
  ),
)
const colStep = computed(() => {
  if (cols.value <= 1) return props.size
  return (containerWidth.value - props.size) / (cols.value - 1)
})
const rowStep = computed(() => props.size + props.gap)
const rows = computed(() => Math.ceil(props.ids.length / cols.value))
const totalHeight = computed(() => rows.value * rowStep.value)

/// Scroll events are coalesced to one measure() per animation frame, so the
/// overscan buffer must be wide enough to cover whatever distance a fast
/// flick/wheel can travel in a single frame. Six rows (~350px) is not enough:
/// extend by ~1 full viewport in each direction so cells are always already
/// rendered by the time they enter view.
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
  const px = props.size
  const style: Record<string, string> = {
    top: `${c.row * rowStep.value}px`,
    left: `${c.col * colStep.value}px`,
    width: `${px}px`,
    height: `${px}px`,
    backgroundImage: "url('/punks-glitched.png')",
    backgroundSize: `${SPRITE_COLS * px}px ${SPRITE_COLS * px}px`,
    backgroundPosition: `-${spriteCol * px}px -${spriteRow * px}px`,
  }
  if (isWrapped(c.id)) style.backgroundColor = WRAPPED_BG
  return style
}

let rafId = 0

function measure() {
  rafId = 0
  const el = containerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  containerWidth.value = rect.width
  /// Intersection of the container with the viewport, expressed in the
  /// container's own (scroll-content) coordinate space.
  const vh = window.innerHeight || document.documentElement.clientHeight
  const top = Math.max(0, -rect.top)
  const bottom = Math.max(0, Math.min(rect.height, vh - rect.top))
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
  width: 100%;
}

.grid-scroll {
  position: relative;
  /* Scope the hover/focus z-index below so it can't escape above the
     sticky search bar / site header. */
  isolation: isolate;
}

.cell {
  position: absolute;
  image-rendering: pixelated;
  border: 0;
  border-radius: 3px;
  background-repeat: no-repeat;
  transition: transform 0.08s ease;
}

.cell:hover,
.cell:focus-visible {
  transform: scale(1.18);
  z-index: 5;
  outline: 2px solid #000;
  background-color: var(--background);
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

.cell:hover .cell-id,
.cell:focus-visible .cell-id {
  opacity: 1;
}

.empty {
  padding: var(--size-8);
  text-align: center;
  color: var(--text-dim);
}
</style>
