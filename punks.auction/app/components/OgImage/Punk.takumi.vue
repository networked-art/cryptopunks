<template>
  <div :style="root">
    <div :style="panel">
      <img
        :src="PUNK_SPRITE_URL"
        :width="scaledSprite"
        :height="scaledSprite"
        :style="spriteImg"
        alt=""
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { PUNK_SPRITE_URL } from '~/utils/punkSprites'
import { PUNK_BACKGROUNDS } from '~/utils/render'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

const props = withDefaults(
  defineProps<{
    punkId?: number
    standard?: TokenStandardValue
  }>(),
  {
    punkId: 0,
    standard: TokenStandard.CryptoPunks,
  },
)

const isV1 = computed(() => props.standard === TokenStandard.CryptoPunksV1)

const panelBg = computed(() =>
  isV1.value ? PUNK_BACKGROUNDS.legacyWrapped : PUNK_BACKGROUNDS.default,
)

const PUNK_SIZE = 390
const scaledSprite = PUNK_SIZE * 100

const col = computed(() => props.punkId % 100)
const row = computed(() => Math.floor(props.punkId / 100))

const root = {
  width: '1200px',
  height: '630px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f0f0f3',
  fontFamily: 'JetBrains Mono, monospace',
}

const panel = computed(() => ({
  width: `${PUNK_SIZE}px`,
  height: `${PUNK_SIZE}px`,
  display: 'flex',
  overflow: 'hidden',
  background: panelBg.value,
  boxShadow:
    '0 1px 2px rgba(10, 10, 18, 0.05), 0 24px 48px -28px rgba(10, 10, 18, 0.4)',
}))

const spriteImg = computed(() => ({
  width: `${scaledSprite}px`,
  height: `${scaledSprite}px`,
  marginLeft: `-${col.value * PUNK_SIZE}px`,
  marginTop: `-${row.value * PUNK_SIZE}px`,
  flexShrink: 0,
  flexGrow: 0,
  imageRendering: 'pixelated' as const,
}))
</script>
