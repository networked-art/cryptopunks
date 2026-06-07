<template>
  <div :style="root">
    <div :style="panel">
      <img
        :src="gridSrc"
        :width="GRID_SIZE"
        :height="GRID_SIZE"
        :style="gridImage"
        alt=""
      />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    gridSrc?: string
  }>(),
  {
    gridSrc: '/og.png',
  },
)

const GRID_SIZE = 630

const root = {
  width: '1200px',
  height: '630px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f0f0f3',
}

const panel = {
  width: `${GRID_SIZE}px`,
  height: `${GRID_SIZE}px`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f0f0f3',
}

const gridImage = computed(() => ({
  width: `${GRID_SIZE}px`,
  height: `${GRID_SIZE}px`,
  display: 'block',
  objectFit: 'contain' as const,
  imageRendering: 'pixelated' as const,
}))
</script>
