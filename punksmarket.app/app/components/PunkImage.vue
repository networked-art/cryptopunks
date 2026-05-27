<template>
  <div
    class="punk-image"
    :class="{ 'is-glitching': glitching, 'is-static': isStatic }"
    :style="rootStyle"
    :title="`Punk #${punkId}`"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @click="onClick"
  >
    <img
      class="punk-base"
      :src="dataUri"
      :alt="`CryptoPunk ${punkId}`"
      draggable="false"
    />
    <img
      v-if="showLayers"
      class="punk-glitch punk-glitch-r"
      :src="dataUri"
      aria-hidden="true"
    />
    <img
      v-if="showLayers"
      class="punk-glitch punk-glitch-g"
      :src="dataUri"
      aria-hidden="true"
    />
    <img
      v-if="showLayers"
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
import { WRAPPED_BG, UNWRAPPED_BG } from '~/composables/useWrappedPunks'

const props = withDefaults(
  defineProps<{
    punkId: number
    size?: number | string
    background?: 'classic' | 'transparent' | string
    glitch?: 'never' | 'hover' | 'always' | 'random' | 'static'
    showId?: boolean
    seed?: number
    speed?: number
    strength?: number
    /// Force the wrapped tint on or off. When omitted we consult the shared
    /// wrapped set so any punk known to be wrapped picks up the tint.
    wrapped?: boolean
  }>(),
  {
    size: 96,
    background: UNWRAPPED_BG,
    glitch: 'hover',
    showId: false,
    speed: 1,
    strength: 1,
  },
)

const offline = usePunksOffline()
const { isWrapped: isWrappedSet } = useWrappedPunks()

const wrappedTint = computed(() => props.wrapped ?? isWrappedSet(props.punkId))

const dataUri = computed(() =>
  offline.render.svgDataUri(props.punkId, {
    background: props.background as never,
  }),
)

function hash32(n: number) {
  let h = n | 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000
}

const runtimeSeed = ref<number>(props.seed ?? props.punkId)
watch(
  () => [props.seed, props.punkId] as const,
  () => {
    runtimeSeed.value = props.seed ?? props.punkId
  },
)

const personality = computed(() => {
  const s = runtimeSeed.value
  const r1 = hash32(s * 7 + 1)
  const r2 = hash32(s * 13 + 2)
  const r4 = hash32(s * 31 + 4)
  const r5 = hash32(s * 41 + 5)
  const r6 = hash32(s * 53 + 6)
  const r7 = hash32(s * 67 + 7)
  const speed = props.speed > 0 ? props.speed : 1
  const strength = props.strength > 0 ? props.strength : 1
  return {
    amp: (0.7 + r1 * 0.7) * strength,
    period: (0.75 + r2 * 0.6) / speed,
    burstMul: 0.7 + r4 * 0.7,
    freezeR: r5 * 2,
    freezeG: r6 * 2,
    freezeB: r7 * 2,
  }
})

const rootStyle = computed(() => {
  const p = personality.value
  const style: Record<string, string> = {
    width: typeof props.size === 'number' ? `${props.size}px` : props.size,
    height: typeof props.size === 'number' ? `${props.size}px` : props.size,
    '--g-amp': p.amp.toFixed(3),
    '--g-period': p.period.toFixed(3),
    '--g-r-freeze': `${p.freezeR.toFixed(3)}s`,
    '--g-g-freeze': `${p.freezeG.toFixed(3)}s`,
    '--g-b-freeze': `${p.freezeB.toFixed(3)}s`,
  }
  style.background = wrappedTint.value ? WRAPPED_BG : UNWRAPPED_BG
  return style
})

const hovering = ref(false)
const burst = ref(false)
let burstTimer: ReturnType<typeof setTimeout> | undefined

const glitching = computed(() => {
  switch (props.glitch) {
    case 'never':
    case 'static':
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

const isStatic = computed(() => props.glitch === 'static')
const showLayers = computed(() => glitching.value || isStatic.value)

onMounted(() => {
  if (props.glitch === 'random') scheduleBurst()
})

function reshuffle() {
  runtimeSeed.value = Math.floor(Math.random() * 1_000_000_000)
}

function onEnter() {
  if (props.glitch === 'hover') hovering.value = true
  else if (props.glitch === 'static') reshuffle()
}
function onLeave() {
  if (props.glitch === 'hover') hovering.value = false
}
function onClick() {
  if (props.glitch === 'static') reshuffle()
}

onBeforeUnmount(() => clearTimeout(burstTimer))

function scheduleBurst() {
  const mul = personality.value.burstMul
  const wait = (800 + Math.random() * 2200) * mul
  burstTimer = setTimeout(() => {
    burst.value = true
    setTimeout(
      () => {
        burst.value = false
        scheduleBurst()
      },
      (400 + Math.random() * 500) * mul,
    )
  }, wait)
}
</script>

<style scoped>
.punk-image {
  position: relative;
  display: inline-block;
  overflow: hidden;
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
  opacity: 0.95;
}

.punk-glitch-r {
  z-index: 2;
  filter: drop-shadow(5px 0 0 #ff003c) drop-shadow(-2px 0 0 #ff0066);
  animation: punk-glitch-r calc(var(--g-period, 1) * 0.7s) steps(2) infinite;
}

.punk-glitch-g {
  z-index: 3;
  filter: drop-shadow(-5px 0 0 #00ff8c) drop-shadow(2px 1px 0 #00ffa6);
  animation: punk-glitch-g calc(var(--g-period, 1) * 0.9s) steps(2) infinite;
}

.punk-glitch-b {
  z-index: 4;
  filter: drop-shadow(0 4px 0 #00b8ff) drop-shadow(3px -2px 0 #3366ff);
  animation: punk-glitch-b calc(var(--g-period, 1) * 1.1s) steps(2) infinite;
}

@keyframes punk-glitch-r {
  0% {
    transform: translate(
        calc(var(--g-amp, 1) * -3px),
        calc(var(--g-amp, 1) * 1px)
      )
      skewX(-4deg);
    clip-path: inset(0 0 78% 0);
  }
  25% {
    transform: translate(
        calc(var(--g-amp, 1) * 5px),
        calc(var(--g-amp, 1) * -3px)
      )
      skewX(6deg);
    clip-path: inset(12% 0 55% 0);
  }
  50% {
    transform: translate(
        calc(var(--g-amp, 1) * -4px),
        calc(var(--g-amp, 1) * 2px)
      )
      skewX(-3deg);
    clip-path: inset(40% 0 22% 0);
  }
  75% {
    transform: translate(
        calc(var(--g-amp, 1) * 6px),
        calc(var(--g-amp, 1) * -1px)
      )
      skewX(5deg);
    clip-path: inset(60% 0 8% 0);
  }
  100% {
    transform: translate(
        calc(var(--g-amp, 1) * -2px),
        calc(var(--g-amp, 1) * 3px)
      )
      skewX(-6deg);
    clip-path: inset(82% 0 0 0);
  }
}

@keyframes punk-glitch-g {
  0% {
    transform: translate(calc(var(--g-amp, 1) * -5px), 0) skewX(3deg);
    clip-path: inset(68% 0 4% 0);
  }
  25% {
    transform: translate(
        calc(var(--g-amp, 1) * 3px),
        calc(var(--g-amp, 1) * 2px)
      )
      skewX(-5deg);
    clip-path: inset(2% 0 70% 0);
  }
  50% {
    transform: translate(
        calc(var(--g-amp, 1) * -2px),
        calc(var(--g-amp, 1) * -3px)
      )
      skewX(4deg);
    clip-path: inset(35% 0 35% 0);
  }
  75% {
    transform: translate(
        calc(var(--g-amp, 1) * 4px),
        calc(var(--g-amp, 1) * 3px)
      )
      skewX(-2deg);
    clip-path: inset(20% 0 55% 0);
  }
  100% {
    transform: translate(
        calc(var(--g-amp, 1) * -4px),
        calc(var(--g-amp, 1) * -2px)
      )
      skewX(6deg);
    clip-path: inset(55% 0 20% 0);
  }
}

@keyframes punk-glitch-b {
  0% {
    transform: translate(
        calc(var(--g-amp, 1) * 4px),
        calc(var(--g-amp, 1) * 3px)
      )
      skewY(-2deg);
    clip-path: inset(0 0 48% 0);
  }
  25% {
    transform: translate(
        calc(var(--g-amp, 1) * -3px),
        calc(var(--g-amp, 1) * -4px)
      )
      skewY(3deg);
    clip-path: inset(45% 0 12% 0);
  }
  50% {
    transform: translate(
        calc(var(--g-amp, 1) * -5px),
        calc(var(--g-amp, 1) * -5px)
      )
      skewY(-3deg);
    clip-path: inset(25% 0 60% 0);
  }
  75% {
    transform: translate(
        calc(var(--g-amp, 1) * 3px),
        calc(var(--g-amp, 1) * 5px)
      )
      skewY(2deg);
    clip-path: inset(58% 0 5% 0);
  }
  100% {
    transform: translate(
        calc(var(--g-amp, 1) * 6px),
        calc(var(--g-amp, 1) * -1px)
      )
      skewY(-4deg);
    clip-path: inset(48% 0 25% 0);
  }
}

.is-glitching .punk-base {
  animation: punk-base-shake calc(var(--g-period, 1) * 0.4s) steps(2) infinite;
}

@keyframes punk-base-shake {
  0% {
    transform: translate(0, 0);
    filter: none;
  }
  20% {
    transform: translate(
      calc(var(--g-amp, 1) * 3px),
      calc(var(--g-amp, 1) * -2px)
    );
    filter: contrast(1.15);
  }
  40% {
    transform: translate(
      calc(var(--g-amp, 1) * -3px),
      calc(var(--g-amp, 1) * 2px)
    );
    filter: none;
  }
  60% {
    transform: translate(
      calc(var(--g-amp, 1) * 2px),
      calc(var(--g-amp, 1) * 3px)
    );
    filter: brightness(1.08);
  }
  80% {
    transform: translate(
      calc(var(--g-amp, 1) * -2px),
      calc(var(--g-amp, 1) * -3px)
    );
    filter: none;
  }
  100% {
    transform: translate(0, 0);
    filter: none;
  }
}

.is-glitching {
  animation: punk-glitch-slice calc(var(--g-period, 1) * 1.4s) steps(1) infinite;
}

.is-static .punk-glitch-r {
  animation-play-state: paused;
  animation-delay: calc(-1 * var(--g-r-freeze, 0s));
}
.is-static .punk-glitch-g {
  animation-play-state: paused;
  animation-delay: calc(-1 * var(--g-g-freeze, 0s));
}
.is-static .punk-glitch-b {
  animation-play-state: paused;
  animation-delay: calc(-1 * var(--g-b-freeze, 0s));
}

@keyframes punk-glitch-slice {
  0%,
  100% {
    clip-path: none;
  }
  10% {
    clip-path: polygon(
      0 12%,
      100% 12%,
      100% 18%,
      0 18%,
      0 0,
      100% 0,
      100% 100%,
      0 100%
    );
  }
  30% {
    clip-path: polygon(
      0 45%,
      100% 45%,
      100% 52%,
      0 52%,
      0 0,
      100% 0,
      100% 100%,
      0 100%
    );
  }
  55% {
    clip-path: polygon(
      0 70%,
      100% 70%,
      100% 76%,
      0 76%,
      0 0,
      100% 0,
      100% 100%,
      0 100%
    );
  }
  80% {
    clip-path: polygon(
      0 28%,
      100% 28%,
      100% 34%,
      0 34%,
      0 0,
      100% 0,
      100% 100%,
      0 100%
    );
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
