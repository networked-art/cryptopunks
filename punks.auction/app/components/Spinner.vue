<template>
  <span
    class="spinner"
    role="status"
    :aria-label="label"
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
  }>(),
  {
    label: 'Loading',
    interval: 180,
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
  [0, 0, 0, 0, 0, 0, 1, 0, 0], // .
  [1, 1, 1, 1, 1, 1, 1, 0, 1], // A
  [1, 0, 1, 1, 0, 1, 1, 1, 1], // U
  [1, 1, 1, 1, 0, 0, 1, 1, 1], // C
  [1, 1, 1, 0, 1, 0, 0, 1, 0], // T
  [1, 0, 0, 1, 0, 0, 1, 0, 0], // I
  [1, 1, 1, 1, 0, 1, 1, 1, 1], // O
  [1, 0, 1, 1, 1, 1, 1, 0, 1], // N
]

const frame = ref(0)
const pattern = computed(() => FRAMES[frame.value]!)

let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => {
    frame.value = (frame.value + 1) % FRAMES.length
  }, props.interval)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
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
  background: transparent;
  transition: background-color 80ms linear;
}

.spinner-pixel.on {
  background: var(--accent);
}
</style>
