<template>
  <div :style="root">
    <div :style="grid">
      <div
        v-for="(item, i) in visibleItems"
        :key="`${item.standard}-${item.punkId}-${i}`"
        :style="cell(item)"
      >
        <img
          :src="PUNK_SPRITE_URL"
          :width="100 * cellSize"
          :height="100 * cellSize"
          :style="spriteImgFor(item)"
          alt=""
        />
        <span
          v-if="overflow && i === visibleItems.length - 1"
          :style="overflowBadge"
          >+{{ items.length - VISIBLE_LIMIT + 1 }}</span
        >
      </div>
    </div>

    <div :style="side">
      <div :style="brandRow">
        <span :style="dot" />
        <span :style="brand">Punks Auction</span>
      </div>

      <div :style="titleBlock">
        <div :style="eyebrow">{{ kindLabel }}</div>
        <div :style="idEl">
          <span :style="hash">#</span>{{ id }}
        </div>
        <div :style="itemsLine">{{ itemsLine }}</div>
      </div>

      <div :style="priceBlock">
        <div
          v-if="status"
          :style="statusChip"
        >
          {{ statusLabel }}
        </div>
        <div :style="priceLabelEl">{{ priceLabel }}</div>
        <div :style="priceValue">
          {{ formattedPrice }} <span :style="ethSymbol">ETH</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatEther } from 'viem'
import { PUNK_SPRITE_URL } from '~/utils/punkSprites'
import { PUNK_BACKGROUNDS } from '~/utils/render'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

type OgLotItem = { standard: TokenStandardValue; punkId: number }

const props = withDefaults(
  defineProps<{
    kind?: 'auction' | 'lot'
    id?: number
    items?: OgLotItem[]
    priceWei?: string | number
    priceLabel?: string
    status?: 'live' | 'ended' | 'settled' | null
  }>(),
  {
    kind: 'lot',
    id: 0,
    items: () => [],
    priceWei: '0',
    priceLabel: 'Reserve',
    status: null,
  },
)

const VISIBLE_LIMIT = 4

const kindLabel = computed(() =>
  props.kind === 'auction' ? 'Auction' : 'Lot',
)

const visibleItems = computed(() => {
  if (props.items.length <= VISIBLE_LIMIT) return props.items
  return props.items.slice(0, VISIBLE_LIMIT)
})

const overflow = computed(() => props.items.length > VISIBLE_LIMIT)

const itemsLine = computed(() => {
  const n = props.items.length
  if (n === 1) {
    const first = props.items[0]!
    return first.standard === TokenStandard.CryptoPunksV1
      ? `Punk #${first.punkId} (V1)`
      : `Punk #${first.punkId}`
  }
  return `${n} Punks`
})

const formattedPrice = computed(() => {
  try {
    const eth = Number(formatEther(BigInt(props.priceWei)))
    if (!Number.isFinite(eth)) return '0'
    if (eth === 0) return '0'
    if (eth >= 1000) return Math.round(eth).toLocaleString()
    if (eth >= 1) return eth.toFixed(2)
    return eth.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  } catch {
    return '0'
  }
})

const statusLabel = computed(() => {
  if (props.status === 'live') return 'Live'
  if (props.status === 'ended') return 'Ended'
  if (props.status === 'settled') return 'Settled'
  return ''
})

const statusColor = computed(() => {
  if (props.status === 'live') return '#f14eba'
  if (props.status === 'ended') return '#6a6a82'
  return '#6a6a82'
})

const root = {
  width: '1200px',
  height: '630px',
  display: 'flex',
  flexDirection: 'row' as const,
  background: '#f0f0f3',
  fontFamily: 'JetBrains Mono, monospace',
}

const PUNK_PANEL = 630

const grid = computed(() => {
  const n = visibleItems.value.length
  return {
    width: `${PUNK_PANEL}px`,
    height: `${PUNK_PANEL}px`,
    display: 'flex',
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    background: PUNK_BACKGROUNDS.default,
    flexShrink: 0,
    alignContent: n === 1 ? ('center' as const) : ('flex-start' as const),
    justifyContent: n === 1 ? ('center' as const) : ('flex-start' as const),
  }
})

const cellSize = computed(() => {
  const n = visibleItems.value.length
  return n === 1 ? 500 : PUNK_PANEL / 2
})

function cell(item: OgLotItem) {
  return {
    width: `${cellSize.value}px`,
    height: `${cellSize.value}px`,
    display: 'flex',
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor:
      item.standard === TokenStandard.CryptoPunksV1
        ? PUNK_BACKGROUNDS.legacyWrapped
        : PUNK_BACKGROUNDS.default,
    position: 'relative' as const,
  }
}

function spriteImgFor(item: OgLotItem) {
  const col = item.punkId % 100
  const row = Math.floor(item.punkId / 100)
  const size = cellSize.value
  return {
    width: `${100 * size}px`,
    height: `${100 * size}px`,
    marginLeft: `-${col * size}px`,
    marginTop: `-${row * size}px`,
    flexShrink: 0,
    flexGrow: 0,
    imageRendering: 'pixelated' as const,
  }
}

const overflowBadge = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  background: 'rgba(10, 10, 18, 0.72)',
  color: '#f0f0f3',
  fontSize: '60px',
  fontWeight: 600,
  letterSpacing: '-0.02em',
}

const side = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column' as const,
  justifyContent: 'space-between',
  padding: '56px',
  color: '#0a0a12',
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
  background: '#f14eba',
}

const brand = {
  fontSize: '22px',
  fontWeight: 600,
  letterSpacing: '-0.02em',
}

const titleBlock = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '8px',
}

const eyebrow = {
  fontSize: '22px',
  color: '#6a6a82',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
}

const idEl = {
  display: 'flex',
  alignItems: 'baseline',
  fontSize: '92px',
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const hash = {
  color: '#6a6a82',
  marginRight: '6px',
}

const priceBlock = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '6px',
}

const statusChip = computed(() => ({
  alignSelf: 'flex-start',
  padding: '4px 12px',
  background: statusColor.value,
  color: '#f0f0f3',
  fontSize: '18px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  marginBottom: '8px',
}))

const priceLabelEl = {
  fontSize: '20px',
  color: '#6a6a82',
  letterSpacing: '0.05em',
}

const priceValue = {
  display: 'flex',
  flexDirection: 'row' as const,
  alignItems: 'baseline',
  fontSize: '72px',
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const ethSymbol = {
  color: '#6a6a82',
  marginLeft: '12px',
  fontSize: '34px',
  letterSpacing: '0.05em',
}
</script>
