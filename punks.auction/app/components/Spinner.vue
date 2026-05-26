<template>
  <span
    :class="['spinner', { 'spinner-loop': loop }]"
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

const frame = ref<number | null>(null)
const idleFrame = computed(() =>
  props.idlePattern === 'full' ? FULL_FRAME : FRAMES[0]!,
)
// When looping, CSS drives the animation directly off `.spinner-loop`, so
// `pattern` holds the idle frame and the .on classes are a no-op. The JS
// timer only runs for one-shot playback (loop=false + playKey changes).
const pattern = computed(() =>
  frame.value === null ? idleFrame.value : FRAMES[frame.value]!,
)

let timer: ReturnType<typeof setInterval> | undefined

const stopTimer = () => {
  if (!timer) return
  clearInterval(timer)
  timer = undefined
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

/* Looping cycle: CSS-driven so the animation runs even on SSR'd HTML before
 * hydration, and isn't cut short when JS mounts after a fast data load. */
.spinner-loop .spinner-pixel {
  opacity: 0;
  transition: none;
  animation: 2340ms step-end infinite;
}

.spinner-loop .spinner-pixel:nth-child(1) {
  animation-name: spinner-pixel-1;
}
.spinner-loop .spinner-pixel:nth-child(2) {
  animation-name: spinner-pixel-2;
}
.spinner-loop .spinner-pixel:nth-child(3) {
  animation-name: spinner-pixel-3;
}
.spinner-loop .spinner-pixel:nth-child(4) {
  animation-name: spinner-pixel-4;
}
.spinner-loop .spinner-pixel:nth-child(5) {
  animation-name: spinner-pixel-5;
}
.spinner-loop .spinner-pixel:nth-child(6) {
  animation-name: spinner-pixel-6;
}
.spinner-loop .spinner-pixel:nth-child(7) {
  animation-name: spinner-pixel-7;
}
.spinner-loop .spinner-pixel:nth-child(8) {
  animation-name: spinner-pixel-8;
}
.spinner-loop .spinner-pixel:nth-child(9) {
  animation-name: spinner-pixel-9;
}

/* Per-pixel opacity tracks across the 13-frame PUNKS.AUCTION cycle.
 * Each keyframe marks a transition; step-end holds the value until the next. */

@keyframes spinner-pixel-1 {
  0% {
    opacity: 1;
  }
  30.77% {
    opacity: 0;
  }
  46.15% {
    opacity: 1;
  }
}

@keyframes spinner-pixel-2 {
  0% {
    opacity: 1;
  }
  7.69% {
    opacity: 0;
  }
  30.77% {
    opacity: 1;
  }
  38.46% {
    opacity: 0;
  }
  46.15% {
    opacity: 1;
  }
  53.85% {
    opacity: 0;
  }
  61.54% {
    opacity: 1;
  }
  76.92% {
    opacity: 0;
  }
  84.62% {
    opacity: 1;
  }
  92.31% {
    opacity: 0;
  }
}

@keyframes spinner-pixel-3 {
  0% {
    opacity: 1;
  }
  38.46% {
    opacity: 0;
  }
  46.15% {
    opacity: 1;
  }
  76.92% {
    opacity: 0;
  }
  84.62% {
    opacity: 1;
  }
}

@keyframes spinner-pixel-4 {
  0% {
    opacity: 1;
  }
  30.77% {
    opacity: 0;
  }
  46.15% {
    opacity: 1;
  }
  69.23% {
    opacity: 0;
  }
  76.92% {
    opacity: 1;
  }
}

@keyframes spinner-pixel-5 {
  0% {
    opacity: 1;
  }
  7.69% {
    opacity: 0;
  }
  15.38% {
    opacity: 1;
  }
  53.85% {
    opacity: 0;
  }
  69.23% {
    opacity: 1;
  }
  76.92% {
    opacity: 0;
  }
  92.31% {
    opacity: 1;
  }
}

@keyframes spinner-pixel-6 {
  0% {
    opacity: 1;
  }
  23.08% {
    opacity: 0;
  }
  46.15% {
    opacity: 1;
  }
  61.54% {
    opacity: 0;
  }
  84.62% {
    opacity: 1;
  }
}

@keyframes spinner-pixel-7 {
  0% {
    opacity: 1;
  }
  38.46% {
    opacity: 0;
  }
  46.15% {
    opacity: 1;
  }
  69.23% {
    opacity: 0;
  }
  76.92% {
    opacity: 1;
  }
}

@keyframes spinner-pixel-8 {
  0% {
    opacity: 0;
  }
  7.69% {
    opacity: 1;
  }
  15.38% {
    opacity: 0;
  }
  30.77% {
    opacity: 1;
  }
  38.46% {
    opacity: 0;
  }
  53.85% {
    opacity: 1;
  }
  76.92% {
    opacity: 0;
  }
  84.62% {
    opacity: 1;
  }
  92.31% {
    opacity: 0;
  }
}

@keyframes spinner-pixel-9 {
  0% {
    opacity: 0;
  }
  7.69% {
    opacity: 1;
  }
  30.77% {
    opacity: 0;
  }
  46.15% {
    opacity: 1;
  }
  69.23% {
    opacity: 0;
  }
  84.62% {
    opacity: 1;
  }
}
</style>
