<template>
  <component
    :is="component"
    :to="to"
    class="punk-thumb"
    :class="{ fluid }"
    :style="style"
    :title="`Punk #${punkId}`"
  />
</template>

<script setup lang="ts">
import {
  punkSpriteBackgroundStyle,
  punkSpriteFluidStyle,
} from '~/utils/punkSprites'
import { WRAPPED_BG, UNWRAPPED_BG } from '~/composables/useWrappedPunks'

const props = withDefaults(
  defineProps<{
    punkId: number
    size?: number
    /// When true, render at 100% of the parent box (CSS-grid sized) using
    /// percentage-based sprite positioning so the mosaic scales fluidly.
    fluid?: boolean
    link?: boolean
  }>(),
  { size: 48, fluid: false, link: true },
)

const { isWrapped } = useWrappedPunks()
const spriteLayers = usePunkSpriteLayers()

const to = computed(() => (props.link ? `/punk/${props.punkId}` : undefined))
const component = computed(() =>
  to.value ? (resolveComponent('NuxtLink') as never) : 'span',
)

const style = computed(() => {
  const background = isWrapped(props.punkId) ? WRAPPED_BG : UNWRAPPED_BG
  const layers = {
    stripes: spriteLayers.stripesLoaded.value,
    outline: spriteLayers.outlineLoaded.value,
  }

  if (props.fluid) {
    return {
      backgroundColor: background,
      ...punkSpriteFluidStyle(props.punkId, layers),
    }
  }

  return {
    backgroundColor: background,
    width: `${props.size}px`,
    height: `${props.size}px`,
    ...punkSpriteBackgroundStyle(props.punkId, props.size, layers),
  }
})
</script>

<style scoped>
.punk-thumb {
  display: block;
  image-rendering: pixelated;
  border: 0;
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
  z-index: 1;
}
</style>
