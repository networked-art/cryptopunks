<template>
  <div :style="root">
    <div :style="panel">
      <div :style="punkBox">
        <img
          :src="PUNK_SPRITE_URL"
          :width="scaledSprite"
          :height="scaledSprite"
          :style="spriteImg"
          alt=""
        />
      </div>
    </div>

    <div :style="side">
      <div :style="brandRow">
        <span :style="dot" />
        <span :style="brand">Punks Auction</span>
      </div>

      <div :style="titleBlock">
        <div :style="eyebrow">CryptoPunk</div>
        <div :style="punkNumber">
          <span :style="hash">#</span>{{ punkId }}
        </div>
        <div
          v-if="isV1"
          :style="v1Tag"
        >
          V1
        </div>
      </div>

      <div :style="footer">cryptopunks · punks.auction</div>
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

const PUNK_SIZE = 500
const scaledSprite = PUNK_SIZE * 100

const col = computed(() => props.punkId % 100)
const row = computed(() => Math.floor(props.punkId / 100))

const punkBox = {
  width: `${PUNK_SIZE}px`,
  height: `${PUNK_SIZE}px`,
  display: 'flex',
  overflow: 'hidden',
  flexShrink: 0,
}

const spriteImg = computed(() => ({
  width: `${scaledSprite}px`,
  height: `${scaledSprite}px`,
  marginLeft: `-${col.value * PUNK_SIZE}px`,
  marginTop: `-${row.value * PUNK_SIZE}px`,
  flexShrink: 0,
  flexGrow: 0,
}))

const root = {
  width: '1200px',
  height: '630px',
  display: 'flex',
  flexDirection: 'row' as const,
  background: '#0a0a12',
  fontFamily: 'JetBrains Mono, monospace',
}

const panel = computed(() => ({
  width: '630px',
  height: '630px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: panelBg.value,
  flexShrink: 0,
  overflow: 'hidden',
}))

const side = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column' as const,
  justifyContent: 'space-between',
  padding: '64px',
  color: '#f7f7f8',
}

const brandRow = {
  display: 'flex',
  flexDirection: 'row' as const,
  alignItems: 'center',
}

const dot = {
  width: '14px',
  height: '14px',
  background: '#ff5fa8',
  marginRight: '14px',
}

const brand = {
  fontSize: '22px',
  fontWeight: 600,
  letterSpacing: '-0.02em',
}

const titleBlock = {
  display: 'flex',
  flexDirection: 'column' as const,
}

const eyebrow = {
  fontSize: '22px',
  fontWeight: 400,
  color: '#9a9ab0',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  marginBottom: '10px',
}

const punkNumber = {
  display: 'flex',
  flexDirection: 'row' as const,
  alignItems: 'baseline',
  fontSize: '120px',
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const hash = {
  color: '#9a9ab0',
  marginRight: '6px',
}

const v1Tag = {
  marginTop: '16px',
  alignSelf: 'flex-start',
  padding: '6px 14px',
  background: '#ff5fa8',
  color: '#0a0a12',
  fontSize: '22px',
  fontWeight: 600,
  letterSpacing: '0.08em',
}

const footer = {
  fontSize: '18px',
  color: '#9a9ab0',
  letterSpacing: '0.05em',
}
</script>
