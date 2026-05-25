<template>
  <NuxtLink
    v-if="to"
    :to="to"
    class="punk-thumb"
    :class="{ fluid }"
    :style="style"
    :title="title"
  />
  <span
    v-else
    class="punk-thumb"
    :class="{ fluid }"
    :style="style"
    :title="title"
  />
</template>

<script setup lang="ts">
import {
  TokenStandard,
  punkHref,
  type TokenStandardValue,
} from '~/utils/auction'
import { PUNK_SPRITE_URL } from '~/utils/punkSprites'

const props = withDefaults(
  defineProps<{
    punkId: number
    size?: number
    standard?: TokenStandardValue
    background?: string
    link?: boolean
    /// Scale to the container (let a CSS grid size the tile) instead of a
    /// fixed pixel `size` — see `LotGrid`.
    fluid?: boolean
  }>(),
  {
    size: 44,
    standard: TokenStandard.CryptoPunks,
    link: true,
    fluid: false,
  },
)

const SPRITE_COLS = 100
const SPRITE_SPAN = SPRITE_COLS - 1
const { backgroundForPunk } = usePunkBackgrounds()

const to = computed(() =>
  props.link ? punkHref(props.standard, props.punkId) : undefined,
)

const title = computed(
  () =>
    `Punk #${props.punkId}` +
    (props.standard === TokenStandard.CryptoPunksV1 ? ' (V1)' : ''),
)

const style = computed(() => {
  const row = Math.floor(props.punkId / SPRITE_COLS)
  const col = props.punkId % SPRITE_COLS
  const sheet = {
    backgroundColor:
      props.background ?? backgroundForPunk(props.punkId, props.standard),
    backgroundImage: `url('${PUNK_SPRITE_URL}')`,
  }

  // Fluid tiles place the sprite in percentages so they scale to whatever
  // box a grid hands them; fixed tiles use pixel math against `size`.
  if (props.fluid) {
    return {
      ...sheet,
      backgroundSize: `${SPRITE_COLS * 100}% ${SPRITE_COLS * 100}%`,
      backgroundPosition: `${(col / SPRITE_SPAN) * 100}% ${(row / SPRITE_SPAN) * 100}%`,
    }
  }

  const px = props.size
  return {
    ...sheet,
    width: `${px}px`,
    height: `${px}px`,
    backgroundSize: `${SPRITE_COLS * px}px ${SPRITE_COLS * px}px`,
    backgroundPosition: `-${col * px}px -${row * px}px`,
  }
})
</script>

<style scoped>
.punk-thumb {
  display: block;
  image-rendering: pixelated;
  border: 0;
  border-radius: var(--radius-sm);
  background-repeat: no-repeat;
  flex-shrink: 0;
}

.punk-thumb.fluid {
  width: 100%;
  height: auto;
  aspect-ratio: 1;
}

a.punk-thumb {
  transition: transform 0.08s ease;
}

a.punk-thumb:hover,
a.punk-thumb:focus-visible {
  transform: scale(1.12);
  outline: 2px solid var(--text);
}
</style>
