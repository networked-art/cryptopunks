<template>
  <div
    class="punk-image"
    :style="rootStyle"
    :title="`Punk #${punkId}`"
  >
    <img
      class="punk-base"
      :src="dataUri"
      :alt="`CryptoPunk ${punkId}`"
      draggable="false"
    />
    <span
      v-if="showId"
      class="punk-image-id"
      >{{ punkId }}</span
    >
  </div>
</template>

<script setup lang="ts">
import { PUNK_BG } from '~/utils/render'

const props = withDefaults(
  defineProps<{
    punkId: number
    size?: number | string
    background?: string
    showId?: boolean
  }>(),
  {
    size: 96,
    background: PUNK_BG,
    showId: false,
  },
)

const offline = usePunksOffline()

const dataUri = computed(() =>
  offline.render.svgDataUri(props.punkId, {
    background: props.background as `#${string}`,
  }),
)

const rootStyle = computed(() => ({
  width: typeof props.size === 'number' ? `${props.size}px` : props.size,
  height: typeof props.size === 'number' ? `${props.size}px` : props.size,
  background: props.background,
}))
</script>

<style scoped>
.punk-image {
  position: relative;
  display: inline-block;
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
