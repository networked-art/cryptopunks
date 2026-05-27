<template>
  <div :style="root">
    <div :style="left">
      <img
        :src="avatarSrc"
        :width="AVATAR_SIZE"
        :height="AVATAR_SIZE"
        :style="avatarStyle"
        alt=""
      />
    </div>

    <div :style="side">
      <div :style="brandRow">
        <span :style="dot" />
        <span :style="brand">Punks Auction</span>
      </div>

      <div :style="titleBlock">
        <div :style="eyebrow">Profile</div>
        <div
          v-if="ens"
          :style="ensEl"
        >
          {{ ens }}
        </div>
        <div :style="ens ? addressDim : addressLarge">{{ shortAddr }}</div>
      </div>

      <div :style="footer">punks.auction</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Address } from 'viem'
import { shortAddress } from '@1001-digital/layers.evm/app/utils/addresses'
import { accountAvvatarDataUri } from '~/utils/avvatar'

const props = withDefaults(
  defineProps<{
    address?: string
    ens?: string | null
  }>(),
  {
    address: '0x0000000000000000000000000000000000000000',
    ens: null,
  },
)

const AVATAR_SIZE = 360

const avatarSrc = computed(() =>
  accountAvvatarDataUri(props.address, AVATAR_SIZE),
)
const shortAddr = computed(() => shortAddress(props.address as Address))

const root = {
  width: '1200px',
  height: '630px',
  display: 'flex',
  flexDirection: 'row' as const,
  background: '#0a0a12',
  fontFamily: 'JetBrains Mono, monospace',
}

const left = {
  width: '630px',
  height: '630px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#ff5fa8',
  flexShrink: 0,
}

const avatarStyle = {
  width: `${AVATAR_SIZE}px`,
  height: `${AVATAR_SIZE}px`,
  display: 'block',
}

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
  gap: '14px',
}

const dot = {
  width: '14px',
  height: '14px',
  background: '#ff5fa8',
}

const brand = {
  fontSize: '22px',
  fontWeight: 600,
  letterSpacing: '-0.02em',
}

const titleBlock = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '12px',
}

const eyebrow = {
  fontSize: '22px',
  color: '#9a9ab0',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
}

const ensEl = {
  fontSize: '64px',
  fontWeight: 600,
  lineHeight: 1.05,
  letterSpacing: '-0.03em',
  overflowWrap: 'anywhere' as const,
}

const addressLarge = {
  fontSize: '48px',
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: '#f7f7f8',
}

const addressDim = {
  fontSize: '26px',
  color: '#9a9ab0',
  letterSpacing: '0.02em',
}

const footer = {
  fontSize: '18px',
  color: '#9a9ab0',
  letterSpacing: '0.05em',
}
</script>
