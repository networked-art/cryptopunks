<template>
  <NuxtLink
    v-if="to"
    :to="to"
    class="punk-thumb"
    :style="style"
    :title="title"
  />
  <span
    v-else
    class="punk-thumb"
    :style="style"
    :title="title"
  />
</template>

<script setup lang="ts">
import { PUNK_BG } from '~/utils/render'
import { TokenStandard, punkHref, type TokenStandardValue } from '~/utils/auction'

const props = withDefaults(
  defineProps<{
    punkId: number
    size?: number
    standard?: TokenStandardValue
    link?: boolean
  }>(),
  { size: 44, standard: TokenStandard.CryptoPunks, link: true },
)

const SPRITE_COLS = 100

const to = computed(() =>
  props.link ? punkHref(props.standard, props.punkId) : undefined,
)

const title = computed(
  () =>
    `Punk #${props.punkId}` +
    (props.standard === TokenStandard.CryptoPunksV1 ? ' (V1)' : ''),
)

const style = computed(() => {
  const px = props.size
  const row = Math.floor(props.punkId / SPRITE_COLS)
  const col = props.punkId % SPRITE_COLS
  return {
    width: `${px}px`,
    height: `${px}px`,
    backgroundColor: PUNK_BG,
    backgroundImage: "url('/punks.png')",
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
  border-radius: 3px;
  background-repeat: no-repeat;
  flex-shrink: 0;
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
