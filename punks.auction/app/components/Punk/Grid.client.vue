<template>
  <div
    ref="containerRef"
    class="punk-grid"
    :class="{
      'is-scrollable': scrollable,
      'is-outline-hover': outlineHover,
      'is-static': !interactive,
      'is-no-hover': !canHover,
    }"
    :style="{ '--price-row-height': priceRowHeight + 'px' }"
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
      <template
        v-for="cell in visible"
        :key="cell.id"
      >
        <button
          v-if="selectable"
          type="button"
          class="cell punk-selection-cell"
          :class="cellClass(cell.id)"
          :style="cellStyle(cell)"
          :title="`Punk #${cell.id}`"
          :aria-pressed="selectedSet.has(cell.id) || excludedSet.has(cell.id)"
          :disabled="disabled"
          @pointerdown.prevent
          @click="emit('toggle', cell.id)"
        >
          <span
            class="punk-selection-indicator"
            aria-hidden="true"
          >
            <Icon name="lucide:check" />
          </span>
        </button>
        <NuxtLink
          v-else-if="interactive"
          :to="`/punks/${cell.id}`"
          class="cell"
          :class="cellClass(cell.id)"
          :style="cellStyle(cell)"
          :title="`Punk #${cell.id}`"
        >
          <span
            v-if="cell.priceWei != null"
            class="cell-price"
          >
            <EthAmount :wei="cell.priceWei" />
          </span>
        </NuxtLink>
        <span
          v-else
          class="cell"
          :class="cellClass(cell.id)"
          :style="cellStyle(cell)"
          :title="`Punk #${cell.id}`"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PUNK_SPRITE_URL } from '~/utils/punkSprites'

const props = withDefaults(
  defineProps<{
    ids: number[]
    /// Listed price in wei, keyed by punk id. Present only in "for sale" mode;
    /// reserves a row under each image and renders an `EthAmount` for every cell
    /// that has a price.
    prices?: ReadonlyMap<number, bigint>
    size?: number
    gap?: number
    overscan?: number
    selectable?: boolean
    selectedIds?: readonly number[]
    excludedIds?: readonly number[]
    dimUnselected?: boolean
    scrollable?: boolean
    disabled?: boolean
    outlineHover?: boolean
    interactive?: boolean
    showWrappedStateColors?: boolean
  }>(),
  {
    size: 72,
    gap: 2,
    overscan: 6,
    selectable: false,
    dimUnselected: false,
    scrollable: false,
    disabled: false,
    outlineHover: false,
    interactive: true,
    showWrappedStateColors: false,
  },
)
const emit = defineEmits<{
  toggle: [id: number]
}>()

const SPRITE_COLS = 100
const PUNK_PIXEL_SIZE = 24
/// Vertical room reserved beneath each image in price mode: the price line plus
/// enough breathing space that it reads as the image's caption, not the next
/// row's. Mirrored by the `--price-row-height` CSS var below.
const PRICE_ROW_HEIGHT = 22

const containerRef = ref<HTMLElement | null>(null)
const canHover = useCanHover()
const { backgroundForPunkState } = usePunkBackgrounds()
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
/// In price mode each row carries an extra caption strip under the image, so
/// rows step further apart and the grid breathes vertically.
const hasPrices = computed(() => !!props.prices)
const priceRowHeight = computed(() => (hasPrices.value ? PRICE_ROW_HEIGHT : 0))
const rowStep = computed(
  () => cellSize.value + resolvedGap.value + priceRowHeight.value,
)
const rows = computed(() => Math.ceil(props.ids.length / cols.value))
const totalHeight = computed(() =>
  rows.value === 0
    ? 0
    : (rows.value - 1) * rowStep.value + cellSize.value + priceRowHeight.value,
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
  const out: { id: number; row: number; col: number; priceWei?: bigint }[] = []
  const colCount = cols.value
  for (let r = start.value; r < end.value; r++) {
    for (let c = 0; c < colCount; c++) {
      const i = r * colCount + c
      if (i >= props.ids.length) break
      const id = props.ids[i]!
      out.push({ id, row: r, col: c, priceWei: props.prices?.get(id) })
    }
  }
  return out
})
const selectedSet = computed(() => new Set(props.selectedIds ?? []))
const excludedSet = computed(() => new Set(props.excludedIds ?? []))

function cellStyle(c: { id: number; row: number; col: number }) {
  const spriteRow = Math.floor(c.id / SPRITE_COLS)
  const spriteCol = c.id % SPRITE_COLS
  const px = cellSize.value
  return {
    top: `${c.row * rowStep.value}px`,
    left: `${c.col * colStep.value}px`,
    width: `${px}px`,
    height: `${px}px`,
    backgroundColor: backgroundForPunkState(c.id, undefined, {
      showWrappedStateColors: props.showWrappedStateColors,
    }),
    backgroundImage: `url('${PUNK_SPRITE_URL}')`,
    backgroundSize: `${SPRITE_COLS * px}px ${SPRITE_COLS * px}px`,
    backgroundPosition: `-${spriteCol * px}px -${spriteRow * px}px`,
  }
}

function cellClass(id: number) {
  return {
    'is-selected': selectedSet.value.has(id),
    'is-excluded': excludedSet.value.has(id),
    'is-dimmed':
      props.dimUnselected &&
      selectedSet.value.size > 0 &&
      !selectedSet.value.has(id),
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
  /// `clientWidth` (not `rect.width`) excludes the vertical scrollbar in
  /// scrollable mode, so the rightmost column doesn't slip under it.
  const cs = getComputedStyle(el)
  const padLeft = parseFloat(cs.paddingLeft) || 0
  const padRight = parseFloat(cs.paddingRight) || 0
  const padTop = parseFloat(cs.paddingTop) || 0
  containerWidth.value = el.clientWidth - padLeft - padRight

  if (props.scrollable) {
    visibleTop.value = el.scrollTop
    visibleHeight.value = el.clientHeight - padTop
    return
  }

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
let scrollEl: HTMLElement | null = null

/// The component is wrapped in Nuxt's ClientOnly, so the real template renders
/// a tick after the wrapper's onMounted fires against the placeholder div.
/// Watch the ref so the observers attach to the real element once it exists.
watch(
  containerRef,
  (el) => {
    if (!el) return
    scrollEl?.removeEventListener('scroll', schedule)
    scrollEl = el
    measure()
    resizeObserver?.disconnect()
    resizeObserver = new ResizeObserver(() => schedule())
    resizeObserver.observe(el)
    el.addEventListener('scroll', schedule, { passive: true })
  },
  { immediate: true, flush: 'post' },
)

watch(
  () => props.ids,
  () => {
    /// New result set: jump back to the top of whichever element owns
    /// scrolling so the first matches are visible, then re-measure.
    const el = containerRef.value
    if (el) {
      if (props.scrollable) {
        el.scrollTo({ top: 0, behavior: 'auto' })
      } else {
        const rect = el.getBoundingClientRect()
        if (rect.top < 0) window.scrollBy({ top: rect.top, behavior: 'auto' })
      }
    }
    schedule()
  },
)

onMounted(() => {
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
})

onBeforeUnmount(() => {
  scrollEl?.removeEventListener('scroll', schedule)
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

.punk-grid.is-scrollable {
  overflow-x: hidden;
  overflow-y: auto;
  min-height: 0;
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
  padding: 0;
  background-repeat: no-repeat;
  color: inherit;
  transition:
    transform 0.08s ease,
    box-shadow 0.08s ease,
    opacity 0.08s ease;
}

button.cell {
  appearance: none;
  cursor: pointer;
}

button.cell:disabled {
  cursor: default;
}

.punk-grid:not(.is-outline-hover):not(.is-static):not(.is-no-hover) .cell:hover,
.punk-grid:not(.is-outline-hover):not(.is-static) .cell:focus-visible {
  transform: scale(1.18);
  z-index: 5;
  outline: none;
  box-shadow:
    0 0 0 6px #fff,
    0 16px 0 6px #fff,
    0 0 0 7px var(--border-color),
    0 16px 0 7px var(--border-color),
    0 1px 2px rgba(10, 10, 18, 0.05),
    0 24px 48px -28px rgba(10, 10, 18, 0.4);
}

button.cell:disabled:hover,
button.cell:disabled:focus-visible {
  transform: none;
  z-index: auto;
  box-shadow: none;
  outline-color: transparent;
}

.punk-grid.is-outline-hover .punk-selection-cell {
  transition:
    box-shadow 0.08s ease,
    opacity 0.08s ease;
}

.punk-grid.is-static .cell {
  pointer-events: none;
}

.cell.is-dimmed,
.cell.is-excluded {
  opacity: 0.45;
}

/* Price caption in the reserved strip under a listed image; centers the
   EthAmount, which renders the value + Ξ unit (tabular figures keep the price
   column from jittering as the eye scans the price-sorted grid). */
.cell-price {
  position: absolute;
  top: 100%;
  inset-inline: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--price-row-height);
  font-size: 11px;
  line-height: 1;
  color: var(--text-muted);
  overflow: hidden;
  pointer-events: none;
}

.empty {
  padding: var(--size-8);
  text-align: center;
  color: var(--text-dim);
}
</style>
