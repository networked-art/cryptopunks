<template>
  <li
    class="activity-row"
    :class="{ 'no-thumb': hideThumb }"
  >
    <template v-if="!hideThumb">
      <PunkThumb
        v-if="event.punkId !== undefined"
        :punk-id="event.punkId"
        :size="44"
        :background="eventBackground"
      />
      <NuxtLink
        v-else-if="iconKind !== 'default' && detailHref"
        :to="detailHref"
        class="thumb-icon symbol-tile"
      >
        <ActivityRowMark :icon-kind="iconKind" />
      </NuxtLink>
      <span
        v-else-if="iconKind !== 'default'"
        class="thumb-icon symbol-tile"
      >
        <ActivityRowMark :icon-kind="iconKind" />
      </span>
      <span
        v-else
        class="thumb-icon"
      >
        <Icon name="lucide:gavel" />
      </span>
    </template>

    <div class="row-body">
      <div class="row-line">
        <NuxtLink
          v-if="detailHref"
          :to="detailHref"
          class="kind-link"
        >
          <ActivityKindLabel
            :kind="event.kind"
            :offer-kind="event.offerKind"
          />
        </NuxtLink>
        <ActivityKindLabel
          v-else
          :kind="event.kind"
          :offer-kind="event.offerKind"
        />
        <NuxtLink
          v-if="event.punkId !== undefined"
          :to="`/punks/${event.punkId}`"
          class="punk-id"
          >#{{ event.punkId
          }}<span v-if="event.wrapped"> (Wrapped)</span></NuxtLink
        >
      </div>
      <div class="row-line muted">
        <NuxtLink
          v-if="event.from"
          :to="`/profile/${event.from}`"
        >
          <Account :address="event.from" />
        </NuxtLink>
        <span
          v-if="event.to && !sameParties"
          class="arrow"
          >→</span
        >
        <NuxtLink
          v-if="event.to && !sameParties"
          :to="`/profile/${event.to}`"
        >
          <Account :address="event.to" />
        </NuxtLink>
      </div>
    </div>

    <div class="row-meta">
      <EthAmount
        v-if="event.amountWei !== undefined"
        :wei="event.amountWei"
        historical
        :historical-usd-cents="event.usdValueCents"
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
import type { ActivityRowMarkKind } from './ActivityRowMark.vue'

const props = defineProps<{
  event: ActivityEvent
  hideThumb?: boolean
}>()

const { backgroundForActivityEvent } = usePunkBackgrounds()
const eventBackground = computed(() => backgroundForActivityEvent(props.event))

/// `assign` and `wrap` rows carry the same address as `from` and `to`; collapse
/// them so the row shows a single party.
const sameParties = computed(
  () =>
    !!props.event.from &&
    !!props.event.to &&
    props.event.from.toLowerCase() === props.event.to.toLowerCase(),
)

type ThumbIconKind = ActivityRowMarkKind | 'default'

const OFFER_KINDS = new Set<ActivityEvent['kind']>([
  'offer_placed',
  'offer_cancelled',
  'offer_adjusted',
])

const LOT_KINDS = new Set<ActivityEvent['kind']>([
  'lot_created',
  'lot_cancelled',
  'lot_cleared',
  'lot_updated',
])

const AUCTION_KINDS = new Set<ActivityEvent['kind']>([
  'auction_started',
  'auction_settled',
])

const iconKind = computed<ThumbIconKind>(() => {
  const kind = props.event.kind
  if (kind === 'bid' || kind === 'bid_cancelled') return 'bid'
  if (OFFER_KINDS.has(kind)) {
    const offerKind = props.event.offerKind
    if (offerKind === 'collection') return 'collection-offer'
    if (offerKind === 'trait' || offerKind === 'selection') return 'trait-offer'
  }
  if (LOT_KINDS.has(kind)) return 'lot'
  if (AUCTION_KINDS.has(kind)) return 'auction'
  return 'default'
})

const detailHref = computed(() => {
  const e = props.event
  if (OFFER_KINDS.has(e.kind) && e.offerId !== undefined)
    return `/purchase-offers/${e.offerId}`
  if (LOT_KINDS.has(e.kind) && e.lotId !== undefined) return `/lots/${e.lotId}`
  if (AUCTION_KINDS.has(e.kind) && e.auctionId !== undefined)
    return `/auctions/${e.auctionId}`
  if (
    (e.kind === 'bid' || e.kind === 'bid_cancelled') &&
    e.auctionId !== undefined
  )
    return `/auctions/${e.auctionId}`
  return undefined
})

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

<style scoped>
.activity-row {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  gap: var(--size-3);
  align-items: center;
  padding: var(--size-3);
  border-bottom: var(--border);
  list-style: none;

  &:hover {
    background: var(--gray-z-1);
  }
}

.activity-row.no-thumb {
  grid-template-columns: 1fr auto;
}

.activity-row:hover {
  background: var(--bg-elevated);
}

.activity-row :deep(.punk-thumb) {
  border-radius: 0;
  transition: none;
}

.activity-row :deep(a.punk-thumb:hover),
.activity-row :deep(a.punk-thumb:focus-visible) {
  transform: none;
  outline: none;
}

.thumb-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border: 1px dashed var(--border-strong);
  color: var(--text-dim);
}

/* Sibling tile for the bid/collection/trait icons — same footprint as the
 * fallback gavel tile, but a flat fill so the pixel/badge marks read like
 * the ones in Offer/Target.vue rather than a "missing thumb" placeholder. */
.thumb-icon.symbol-tile {
  background: var(--gray-z-1);
  border: 0;
  color: var(--text-muted);
}

a.thumb-icon.symbol-tile {
  text-decoration: none;
  color: inherit;
}

a.thumb-icon.symbol-tile:hover,
a.thumb-icon.symbol-tile:focus-visible {
  background: var(--gray-z-2);
  outline: none;
}

.row-body {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  min-width: 0;
}

.row-line {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.row-line.muted {
  font-size: var(--font-sm);
  color: var(--text-muted);
}

.arrow {
  color: var(--text-dim);
}

.punk-id {
  border: 0;
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.kind-link {
  border: 0;
  color: inherit;
  text-decoration: none;
}

.kind-link:hover,
.kind-link:focus-visible {
  color: var(--accent);
  outline: none;
}

.row-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--size-2);

  .eth-amount {
    font-size: var(--font-sm);
  }
}

.tx {
  border: 0;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  gap: var(--size-2);
}

.tx:hover {
  color: var(--accent);
}

.time-ago {
  font-size: var(--font-xs);
  white-space: nowrap;
}
</style>
