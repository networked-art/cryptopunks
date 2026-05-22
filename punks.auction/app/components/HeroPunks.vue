<template>
  <div
    class="hero-punks"
    aria-label="Random CryptoPunks"
  >
    <span
      v-for="(cell, index) in cells"
      :key="index"
      class="hero-punk"
      :class="{ 'is-hidden': cell.hidden }"
    >
      <PunkThumb
        :punk-id="cell.punkId"
        :link="false"
        fluid
      />
    </span>
  </div>
</template>

<script setup lang="ts">
const PUNK_SUPPLY = 10_000
const PUNK_COUNT = 9
const FADE_MS = 900
const ENTER_HOLD_MS = 120
const INITIAL_SWAP_MIN_MS = 1_400
const INITIAL_SWAP_MAX_MS = 5_200
const SWAP_MIN_MS = 5_000
const SWAP_MAX_MS = 12_000

type HeroPunkCell = {
  punkId: number
  hidden: boolean
}

function randomPunkIds() {
  const ids = new Set<number>()

  while (ids.size < PUNK_COUNT) {
    ids.add(Math.floor(Math.random() * PUNK_SUPPLY))
  }

  return [...ids]
}

function randomDelay(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min))
}

function randomPunkIdExcluding(excluded: Set<number>) {
  let id = Math.floor(Math.random() * PUNK_SUPPLY)

  while (excluded.has(id)) {
    id = Math.floor(Math.random() * PUNK_SUPPLY)
  }

  return id
}

const storedPunkIds = useState<number[]>('home-hero-punks', randomPunkIds)
const cells = ref<HeroPunkCell[]>(
  storedPunkIds.value.map((punkId) => ({ punkId, hidden: false })),
)
const timers = new Set<ReturnType<typeof setTimeout>>()

function setTimer(callback: () => void, ms: number) {
  const timer = setTimeout(() => {
    timers.delete(timer)
    callback()
  }, ms)

  timers.add(timer)
}

function scheduleCellSwap(index: number, initial = false) {
  setTimer(
    () => swapCell(index),
    initial
      ? randomDelay(INITIAL_SWAP_MIN_MS, INITIAL_SWAP_MAX_MS)
      : randomDelay(SWAP_MIN_MS, SWAP_MAX_MS),
  )
}

function syncStoredPunkIds() {
  storedPunkIds.value = cells.value.map((cell) => cell.punkId)
}

function swapCell(index: number) {
  const cell = cells.value[index]
  if (!cell) return

  cells.value[index] = { ...cell, hidden: true }

  setTimer(() => {
    const excluded = new Set(cells.value.map(({ punkId }) => punkId))
    const next = cells.value[index]
    if (!next) return

    cells.value[index] = {
      punkId: randomPunkIdExcluding(excluded),
      hidden: true,
    }
    syncStoredPunkIds()

    setTimer(() => {
      const entered = cells.value[index]
      if (!entered) return

      cells.value[index] = { ...entered, hidden: false }
      setTimer(() => scheduleCellSwap(index), FADE_MS)
    }, ENTER_HOLD_MS)
  }, FADE_MS)
}

onMounted(() => {
  cells.value.forEach((_, index) => scheduleCellSwap(index, true))
})

onBeforeUnmount(() => {
  for (const timer of timers) clearTimeout(timer)
  timers.clear()
})
</script>

<style scoped>
.hero-punks {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--size-1);
  width: clamp(144px, 28vw, 216px);
}

.hero-punk {
  display: block;
  opacity: 1;
  transform: scale(1);
  transition:
    opacity 900ms ease,
    transform 900ms ease;
  will-change: opacity, transform;
}

.hero-punk.is-hidden {
  opacity: 0;
  transform: scale(0.88);
}

@media (prefers-reduced-motion: reduce) {
  .hero-punk {
    transition: none;
  }
}
</style>
