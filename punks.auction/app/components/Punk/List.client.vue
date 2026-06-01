<template>
  <div
    ref="containerRef"
    class="punk-list"
  >
    <div
      v-if="rowIds.length === 0"
      class="empty"
    >
      {{ marketStateLoaded ? 'No punks for sale match.' : 'Loading listings…' }}
    </div>
    <div
      v-else
      class="list-scroll"
      :style="{ height: totalHeight + 'px' }"
    >
      <NuxtLink
        v-for="row in visible"
        :key="row.id"
        :to="`/punks/${row.id}`"
        class="row"
        :style="{ top: row.top + 'px', height: rowHeight + 'px' }"
      >
        <PunkThumb
          :punk-id="row.id"
          :size="thumbSize"
          :link="false"
          class="row-thumb"
        />
        <div class="row-main">
          <span class="row-title">Punk #{{ row.id }}</span>
          <span class="row-owner">
            <Account
              v-if="row.info"
              :address="row.info.seller"
            />
            <span
              v-else
              class="muted"
              >…</span
            >
          </span>
        </div>
        <div class="row-price">
          <span class="row-eth">
            <EthAmount
              v-if="row.info"
              :wei="row.info.priceWei"
              :precision="2"
            />
            <span
              v-else
              class="muted"
              >…</span
            >
          </span>
          <span
            v-if="row.usd"
            class="row-usd muted"
            >${{ row.usd }}</span
          >
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PunkListingInfo } from '~/composables/usePunkListings'

const props = withDefaults(
  defineProps<{
    ids: number[]
    size?: number
    overscan?: number
  }>(),
  {
    size: 72,
    overscan: 4,
  },
)

const { marketStateSets, marketStateLoaded } = usePunkMarketState()
const { ethUSDRaw, weiToUSD, fetchPrice } = usePriceFeed()

/// The listed subset of the search result, kept in the search's price-asc
/// order. When the query already filters to "for sale" this is a no-op; when
/// only the toggle is on it drops the unlisted punks the toggle merely sorted
/// behind the listed ones.
const rowIds = computed(() => {
  const listed = marketStateSets.value.listed
  return props.ids.filter((id) => listed.has(id))
})

const { listings } = usePunkListings(rowIds)

const thumbSize = computed(() => props.size)
const ROW_PADDING_Y = 12
const rowHeight = computed(() => props.size + ROW_PADDING_Y * 2)

function usdFor(wei: bigint): string | null {
  if (!ethUSDRaw.value || wei <= 0n) return null
  return weiToUSD(wei)
}

/// Window-based virtualization: the page (not this element) owns the scrollbar,
/// so we intersect the container's box with the viewport and render only the
/// rows in view. Mirrors `PunkGrid`'s non-scrollable measurement.
const containerRef = ref<HTMLElement | null>(null)
const visibleTop = ref(0)
const visibleHeight = ref(0)

const totalHeight = computed(() => rowIds.value.length * rowHeight.value)
const overscanRows = computed(() =>
  Math.max(props.overscan, Math.ceil(visibleHeight.value / rowHeight.value)),
)
const start = computed(() =>
  Math.max(
    0,
    Math.floor(visibleTop.value / rowHeight.value) - overscanRows.value,
  ),
)
const end = computed(() =>
  Math.min(
    rowIds.value.length,
    Math.ceil((visibleTop.value + visibleHeight.value) / rowHeight.value) +
      overscanRows.value,
  ),
)

const visible = computed(() => {
  const out: {
    id: number
    top: number
    info: PunkListingInfo | undefined
    usd: string | null
  }[] = []
  const map = listings.value
  for (let i = start.value; i < end.value; i++) {
    const id = rowIds.value[i]!
    const info = map.get(id)
    out.push({
      id,
      top: i * rowHeight.value,
      info,
      usd: info ? usdFor(info.priceWei) : null,
    })
  }
  return out
})

let rafId = 0

function measure() {
  rafId = 0
  const el = containerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
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

watch(containerRef, (el) => el && measure(), { immediate: true, flush: 'post' })

/// New result set: scroll the viewport back up to the first (cheapest) row so
/// the freshest matches are in view, then re-measure.
watch(rowIds, () => {
  const el = containerRef.value
  if (el) {
    const rect = el.getBoundingClientRect()
    if (rect.top < 0) window.scrollBy({ top: rect.top, behavior: 'auto' })
  }
  schedule()
})

onMounted(() => {
  void fetchPrice()
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', schedule)
  window.removeEventListener('resize', schedule)
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<style scoped>
.punk-list {
  position: relative;
  width: 100%;
  max-width: 720px;
  margin-inline: auto;
}

.list-scroll {
  position: relative;
}

.row {
  position: absolute;
  inset-inline: 0;
  display: flex;
  align-items: center;
  gap: var(--size-4);
  box-sizing: border-box;
  padding-block: 12px;
  border-block-end: var(--border-width) solid var(--border);
  color: inherit;
  text-decoration: none;
}

.row:first-child {
  border-block-start: var(--border-width) solid var(--border);
}

.row:hover {
  background: var(--surface-muted, rgb(10 10 18 / 4%));
}

.row-thumb {
  flex: 0 0 auto;
  image-rendering: pixelated;
}

.row-main {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
  flex: 1 1 auto;
}

.row-title {
  font-weight: var(--font-weight-bold, 600);
  white-space: nowrap;
}

.row-owner {
  min-width: 0;
  font-size: var(--font-sm);
  color: var(--text-muted);
}

.row-price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--size-1);
  flex: 0 0 auto;
  text-align: end;
  white-space: nowrap;
}

.row-eth {
  font-variant-numeric: tabular-nums;
}

.row-usd {
  font-size: var(--font-sm);
  font-variant-numeric: tabular-nums;
}

.muted {
  color: var(--text-muted);
}

.empty {
  padding: var(--size-8);
  text-align: center;
  color: var(--text-dim);
}

@media (max-width: 640px) {
  .row {
    gap: var(--size-3);
  }
}
</style>
