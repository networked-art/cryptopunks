<template>
  <span
    class="spinner"
    :role="decorative ? undefined : 'status'"
    :aria-label="decorative ? undefined : label"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <span
      v-for="(on, i) in pattern"
      :key="i"
      :class="['spinner-pixel', { on }]"
      aria-hidden="true"
    />
  </span>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    label?: string
    interval?: number
    loop?: boolean
    playKey?: number | string
    idlePattern?: 'full' | 'first'
    decorative?: boolean
  }>(),
  {
    label: 'Loading',
    interval: 180,
    loop: true,
    playKey: 0,
    idlePattern: 'first',
    decorative: false,
  },
)

// `PUNKS.AUCTION` rendered one glyph per frame on a 3x3 pixel grid
// (row-major, top-left = 0). Decoded from the source bitmap.
const FRAMES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1, 1, 1, 0, 0], // P
  [1, 0, 1, 1, 0, 1, 1, 1, 1], // U
  [1, 0, 1, 1, 1, 1, 1, 0, 1], // N
  [1, 0, 1, 1, 1, 0, 1, 0, 1], // K
  [0, 1, 1, 0, 1, 0, 1, 1, 0], // S
  [0, 0, 0, 0, 1, 0, 0, 0, 0], // .
  [1, 1, 1, 1, 1, 1, 1, 0, 1], // A
  [1, 0, 1, 1, 0, 1, 1, 1, 1], // U
  [1, 1, 1, 1, 0, 0, 1, 1, 1], // C
  [1, 1, 1, 0, 1, 0, 0, 1, 0], // T
  [1, 0, 0, 1, 0, 0, 1, 0, 0], // I
  [1, 1, 1, 1, 0, 1, 1, 1, 1], // O
  [1, 0, 1, 1, 1, 1, 1, 0, 1], // N
]

const FULL_FRAME: readonly number[] = [1, 1, 1, 1, 1, 1, 1, 1, 1]

const frame = ref<number | null>(props.loop ? 0 : null)
const idleFrame = computed(() =>
  props.idlePattern === 'full' ? FULL_FRAME : FRAMES[0]!,
)
const pattern = computed(() =>
  frame.value === null ? idleFrame.value : FRAMES[frame.value]!,
)

let timer: ReturnType<typeof setInterval> | undefined

const stopTimer = () => {
  if (!timer) return
  clearInterval(timer)
  timer = undefined
}

const startLoop = () => {
  stopTimer()
  frame.value = 0
  timer = setInterval(() => {
    frame.value = ((frame.value ?? 0) + 1) % FRAMES.length
  }, props.interval)
}

const playOnce = () => {
  stopTimer()
  frame.value = 0
  timer = setInterval(() => {
    if (frame.value === null || frame.value >= FRAMES.length - 1) {
      stopTimer()
      frame.value = null
      return
    }
    frame.value += 1
  }, props.interval)
}

watch(
  () => props.playKey,
  () => {
    if (!props.loop) playOnce()
  },
)

watch(
  () => props.loop,
  (loop) => {
    if (loop) {
      startLoop()
    } else {
      stopTimer()
      frame.value = null
    }
  },
)

onMounted(() => {
  if (props.loop) startLoop()
})

onBeforeUnmount(() => {
  stopTimer()
})
</script>

<style scoped>
.spinner {
  --spinner-pixel: 6px;
  --spinner-gap: 3px;
  display: inline-grid;
  grid-template-columns: repeat(3, var(--spinner-pixel));
  grid-template-rows: repeat(3, var(--spinner-pixel));
  gap: var(--spinner-gap);
  width: 24px;
  height: 24px;
  vertical-align: middle;
}

.spinner-pixel {
  background: var(--accent);
  opacity: 0;
  transition: opacity 140ms ease-out;
}

.spinner-pixel.on {
  opacity: 1;
}
</style>
