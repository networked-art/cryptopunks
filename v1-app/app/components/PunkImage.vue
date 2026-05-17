<template>
  <div
    class="punk-image"
    :class="{ 'is-glitching': glitching }"
    :style="rootStyle"
    :title="`Punk #${punkId}`"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <img
      class="punk-base"
      :src="dataUri"
      :alt="`CryptoPunk ${punkId}`"
      draggable="false"
    />
    <img
      v-if="glitching"
      class="punk-glitch punk-glitch-r"
      :src="dataUri"
      aria-hidden="true"
    />
    <img
      v-if="glitching"
      class="punk-glitch punk-glitch-g"
      :src="dataUri"
      aria-hidden="true"
    />
    <img
      v-if="glitching"
      class="punk-glitch punk-glitch-b"
      :src="dataUri"
      aria-hidden="true"
    />
    <span
      v-if="showId"
      class="punk-image-id"
      >{{ punkId }}</span
    >
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    punkId: number
    size?: number | string
    background?: 'classic' | 'transparent' | string
    glitch?: 'never' | 'hover' | 'always' | 'random'
    showId?: boolean
  }>(),
  {
    size: 96,
    background: 'classic',
    glitch: 'hover',
    showId: false,
  },
)

const offline = usePunksOffline()

const dataUri = computed(() =>
  offline.render.svgDataUri(props.punkId, {
    background: props.background as never,
  }),
)

const rootStyle = computed(() => ({
  width: typeof props.size === 'number' ? `${props.size}px` : props.size,
  height: typeof props.size === 'number' ? `${props.size}px` : props.size,
}))

const hovering = ref(false)
const burst = ref(false)
let burstTimer: ReturnType<typeof setTimeout> | undefined

const glitching = computed(() => {
  switch (props.glitch) {
    case 'never':
      return false
    case 'always':
      return true
    case 'random':
      return burst.value
    case 'hover':
    default:
      return hovering.value
  }
})

onMounted(() => {
  if (props.glitch === 'random') scheduleBurst()
})

function onEnter() {
  if (props.glitch === 'hover') hovering.value = true
}
function onLeave() {
  if (props.glitch === 'hover') hovering.value = false
}

onBeforeUnmount(() => clearTimeout(burstTimer))

function scheduleBurst() {
  const wait = 4000 + Math.random() * 9000
  burstTimer = setTimeout(() => {
    burst.value = true
    setTimeout(() => {
      burst.value = false
      scheduleBurst()
    }, 600)
  }, wait)
}
</script>

<style scoped>
.punk-image {
  position: relative;
  display: inline-block;
  background: var(--punk-bg);
  overflow: hidden;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.punk-image img {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  user-select: none;
}

.punk-base {
  position: relative;
  z-index: 1;
}

.punk-glitch {
  position: absolute;
  inset: 0;
  pointer-events: none;
  mix-blend-mode: screen;
  opacity: 0.7;
}

.punk-glitch-r {
  z-index: 2;
  filter: hue-rotate(0deg) drop-shadow(2px 0 0 #ff003c);
  animation: punk-glitch-r 0.35s steps(2) infinite;
}

.punk-glitch-g {
  z-index: 3;
  filter: drop-shadow(-2px 0 0 #00ff8c);
  animation: punk-glitch-g 0.45s steps(2) infinite;
}

.punk-glitch-b {
  z-index: 4;
  filter: drop-shadow(0 2px 0 #00b8ff);
  animation: punk-glitch-b 0.55s steps(2) infinite;
}

@keyframes punk-glitch-r {
  0% {
    transform: translate(0, 0) skewX(0deg);
    clip-path: inset(0 0 70% 0);
  }
  50% {
    transform: translate(2px, -1px) skewX(-2deg);
    clip-path: inset(30% 0 30% 0);
  }
  100% {
    transform: translate(-1px, 1px) skewX(2deg);
    clip-path: inset(70% 0 0 0);
  }
}

@keyframes punk-glitch-g {
  0% {
    transform: translate(-2px, 0);
    clip-path: inset(60% 0 10% 0);
  }
  50% {
    transform: translate(1px, 1px);
    clip-path: inset(10% 0 60% 0);
  }
  100% {
    transform: translate(0, -1px);
    clip-path: inset(35% 0 35% 0);
  }
}

@keyframes punk-glitch-b {
  0% {
    transform: translate(1px, 1px);
    clip-path: inset(0 0 40% 0);
  }
  50% {
    transform: translate(-1px, -2px);
    clip-path: inset(20% 0 50% 0);
  }
  100% {
    transform: translate(2px, 0);
    clip-path: inset(40% 0 20% 0);
  }
}

.is-glitching .punk-base {
  animation: punk-base-shake 0.2s steps(2) infinite;
}

@keyframes punk-base-shake {
  0% {
    transform: translate(0, 0);
  }
  25% {
    transform: translate(1px, -1px);
  }
  50% {
    transform: translate(-1px, 1px);
  }
  75% {
    transform: translate(1px, 1px);
  }
  100% {
    transform: translate(0, 0);
  }
}

.punk-image-id {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 5;
  font-size: 10px;
  color: var(--text);
  background: rgba(0, 0, 0, 0.55);
  text-align: center;
  line-height: 14px;
  pointer-events: none;
}
</style>
