<template>
  <li
    class="activity-row"
    :class="{ 'is-market-sale': isMarketSale }"
  >
    <NuxtLink
      v-if="punkId !== undefined"
      :to="`/punk/${punkId}`"
      class="thumb thumb-sprite"
      :style="spriteStyle"
      :title="`Punk #${punkId}`"
    />

    <span
      v-else
      class="thumb thumb-bid"
      :title="event.bidId !== undefined ? `Bid #${event.bidId}` : undefined"
    >
      <Icon name="lucide:gavel" />
    </span>

    <div class="row-body">
      <div class="row-line">
        <span
          class="kind"
          :class="kindClass"
          >{{ kindLabel }}</span
        >
        <NuxtLink
          v-if="punkId !== undefined"
          :to="`/punk/${punkId}`"
          class="punk-id"
          >Punk #{{ punkId
          }}<span v-if="event.wrapped"> (Wrapped)</span></NuxtLink
        >
      </div>
      <div class="row-line muted">
        <span v-if="event.from">
          <NuxtLink :to="`/profile/${event.from}`">
            <AccountBadge :address="event.from" />
          </NuxtLink>
        </span>
        <span
          v-if="event.to"
          class="arrow"
          >→</span
        >
        <span v-if="event.to">
          <NuxtLink :to="`/profile/${event.to}`">
            <AccountBadge :address="event.to" />
          </NuxtLink>
        </span>
      </div>
    </div>

    <div class="row-meta">
      <EthAmount
        v-if="event.amountWei !== undefined"
        :wei="event.amountWei"
      />
      <a
        class="tx"
        :href="txUrl(event.txHash)"
        target="_blank"
        rel="noopener"
        :title="absoluteTime"
      >
        <span
          v-if="timeAgo"
          class="time-ago"
          >{{ timeAgo }}</span
        >
        <Icon name="lucide:arrow-up-right" />
      </a>
    </div>
  </li>
</template>

<script setup lang="ts">
import type { ActivityEvent } from '~/composables/useActivityFeed'
import { txUrl } from '~/utils/explorer'

const props = defineProps<{ event: ActivityEvent }>()

const punkId = computed(() => props.event.punkId)
const isMarketSale = computed(
  () => props.event.kind === 'sale' && props.event.source === 'punks_market',
)

const SPRITE_COLS = 100
const SPRITE_SIZE = 44

const spriteStyle = computed(() => {
  const id = punkId.value
  if (id === undefined) return undefined
  const spriteRow = Math.floor(id / SPRITE_COLS)
  const spriteCol = id % SPRITE_COLS
  const style: Record<string, string> = {
    width: `${SPRITE_SIZE}px`,
    height: `${SPRITE_SIZE}px`,
    backgroundImage: "url('/punks-glitched.png')",
    backgroundSize: `${SPRITE_COLS * SPRITE_SIZE}px ${SPRITE_COLS * SPRITE_SIZE}px`,
    backgroundPosition: `-${spriteCol * SPRITE_SIZE}px -${spriteRow * SPRITE_SIZE}px`,
  }
  /// `event.wrapped` reflects the punk's wrap state at the moment of the
  /// event (false for `wrap`/`unwrap` rows and any native-V1 event), so the
  /// tint only appears when the punk was wrapped at the time.
  if (props.event.wrapped) style.backgroundColor = '#a69aff'
  return style
})

const kindLabel = computed(() => {
  return KIND_LABEL[props.event.kind] ?? props.event.kind
})

const kindClass = computed(() => `kind-${props.event.kind}`)

const isoTime = computed(() =>
  props.event.timestamp
    ? new Date(props.event.timestamp * 1000).toISOString()
    : undefined,
)
const timeAgo = useTimeAgo(isoTime)
const absoluteTime = computed(() =>
  props.event.timestamp
    ? new Date(props.event.timestamp * 1000).toLocaleString()
    : '',
)
</script>

<script lang="ts">
const KIND_LABEL: Record<string, string> = {
  assign: 'Claimed',
  transfer: 'Transferred',
  wrap: 'Wrapped',
  unwrap: 'Unwrapped',
  listing: 'Listed',
  listing_cancelled: 'Unlisted',
  bid: 'Bid placed',
  bid_adjusted: 'Bid adjusted',
  bid_cancelled: 'Bid cancelled',
  sale: 'Sold',
  escrow_credit: 'Escrow credit',
  escrow_withdrawal: 'Escrow withdrawal',
}

</script>

<style scoped>
.activity-row {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  gap: var(--size-3);
  align-items: center;
  padding: var(--size-3) var(--size-3);
  border-bottom: 1px solid var(--border);
  list-style: none;
}

.activity-row:hover {
  background: var(--bg-elevated);
}

.activity-row.is-market-sale {
  box-shadow: inset 2px 0 0 var(--accent);
}

.thumb {
  border: 0;
  display: flex;
}

.thumb-sprite {
  image-rendering: pixelated;
  background-repeat: no-repeat;
  border-radius: 3px;
}

.thumb-bid {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text-dim);
}

.row-body {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.row-line {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.row-line.muted {
  font-size: 12px;
  color: var(--text-muted);
}

.arrow {
  color: var(--text-dim);
}

.kind {
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--text);
}

.punk-id {
  border: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.row-meta {
  display: flex;
  align-items: center;
  gap: var(--size-3);
}

.tx {
  border: 0;
  color: var(--text-dim);
  display: inline-flex;
  align-items: center;
  gap: var(--size-2);
}

.tx:hover {
  color: var(--accent);
}

.time-ago {
  font-size: 11px;
  white-space: nowrap;
}
</style>
