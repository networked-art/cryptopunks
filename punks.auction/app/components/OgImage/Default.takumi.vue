<template>
  <div :style="root">
    <div :style="header">
      <span :style="dot" />
      <span :style="brand">Punks Auction</span>
    </div>

    <div :style="titleEl">{{ title }}</div>
    <div
      v-if="description"
      :style="descriptionEl"
    >
      {{ description }}
    </div>

    <div :style="spacer" />

    <div :style="strip">
      <img
        :src="PUNK_SPRITE_URL"
        :width="SCALED_SPRITE"
        :height="SCALED_SPRITE"
        :style="spriteImg"
        alt=""
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { PUNK_SPRITE_URL } from '~/utils/punkSprites'
import { PUNK_BACKGROUNDS } from '~/utils/render'

withDefaults(
  defineProps<{
    title?: string
    description?: string
  }>(),
  {
    title: 'Punks Auction',
    description: '',
  },
)

const STRIP_HEIGHT = 130
const SCALED_SPRITE = 100 * STRIP_HEIGHT
const STRIP_ROW = 47
const STRIP_START_COL = 12

const root = {
  width: '1200px',
  height: '630px',
  display: 'flex',
  flexDirection: 'column' as const,
  padding: '64px 64px 0 64px',
  background: '#0a0a12',
  color: '#f7f7f8',
  fontFamily: 'JetBrains Mono, monospace',
}

const header = {
  display: 'flex',
  flexDirection: 'row' as const,
  alignItems: 'center',
  marginBottom: '64px',
  flexShrink: 0,
}

const dot = {
  width: '14px',
  height: '14px',
  background: '#ff5fa8',
  marginRight: '14px',
}

const brand = {
  fontSize: '24px',
  fontWeight: 600,
  letterSpacing: '-0.02em',
}

const titleEl = {
  fontSize: '72px',
  fontWeight: 600,
  lineHeight: 1.05,
  letterSpacing: '-0.03em',
  color: '#f7f7f8',
  marginBottom: '20px',
  flexShrink: 0,
}

const descriptionEl = {
  fontSize: '24px',
  lineHeight: 1.35,
  color: '#9a9ab0',
  flexShrink: 0,
}

const spacer = {
  flexGrow: 1,
  flexShrink: 1,
}

const strip = {
  width: '1200px',
  height: `${STRIP_HEIGHT}px`,
  marginLeft: '-64px',
  flexShrink: 0,
  flexGrow: 0,
  overflow: 'hidden',
  display: 'flex',
  backgroundColor: PUNK_BACKGROUNDS.default,
  position: 'relative' as const,
}

const spriteImg = {
  width: `${SCALED_SPRITE}px`,
  height: `${SCALED_SPRITE}px`,
  marginLeft: `-${STRIP_START_COL * STRIP_HEIGHT}px`,
  marginTop: `-${STRIP_ROW * STRIP_HEIGHT}px`,
  flexShrink: 0,
  flexGrow: 0,
}
</script>
