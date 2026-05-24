<template>
  <div
    class="punk-image"
    :style="rootStyle"
    :title="`Punk #${punkId}`"
    role="img"
    :aria-label="`CryptoPunk ${punkId}`"
  >
    <span
      class="punk-base"
      :style="spriteStyle"
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
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

const props = withDefaults(
  defineProps<{
    punkId: number
    size?: number | string
    background?: string
    standard?: TokenStandardValue
    showId?: boolean
  }>(),
  {
    size: 96,
    standard: TokenStandard.CryptoPunks,
    showId: false,
  },
)

const { backgroundForPunk } = usePunkBackgrounds()
const SPRITE_COLS = 100
const SPRITE_SPAN = SPRITE_COLS - 1

const resolvedBackground = computed(
  () => props.background ?? backgroundForPunk(props.punkId, props.standard),
)

const rootStyle = computed(() => ({
  width: typeof props.size === 'number' ? `${props.size}px` : props.size,
  height: typeof props.size === 'number' ? `${props.size}px` : props.size,
  background: resolvedBackground.value,
}))

const spriteStyle = computed(() => {
  const row = Math.floor(props.punkId / SPRITE_COLS)
  const col = props.punkId % SPRITE_COLS
  return {
    backgroundImage: "url('/punks.png')",
    backgroundSize: `${SPRITE_COLS * 100}% ${SPRITE_COLS * 100}%`,
    backgroundPosition: `${(col / SPRITE_SPAN) * 100}% ${(row / SPRITE_SPAN) * 100}%`,
  }
})
</script>

<style scoped>
.punk-image {
  position: relative;
  display: inline-block;
  overflow: hidden;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.punk-base {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  user-select: none;
  background-repeat: no-repeat;
  z-index: 1;
}

.punk-image-id {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 5;
  font-size: var(--font-xs);
  color: var(--text);
  background: rgba(0, 0, 0, 0.55);
  text-align: center;
  line-height: 14px;
  pointer-events: none;
}
</style>
