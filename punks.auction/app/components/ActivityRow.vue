<template>
  <li class="activity-row">
    <PunkThumb
      v-if="event.punkId !== undefined"
      :punk-id="event.punkId"
      :size="44"
    />
    <span
      v-else
      class="thumb-icon"
    >
      <Icon name="lucide:gavel" />
    </span>

    <div class="row-body">
      <div class="row-line">
        <span
          class="kind"
          :class="`kind-${event.kind}`"
          >{{ kindLabel }}</span
        >
        <NuxtLink
          v-if="event.punkId !== undefined"
          :to="`/punk/${event.punkId}`"
          class="punk-id"
          >Punk #{{ event.punkId
          }}<span v-if="event.wrapped"> (Wrapped)</span></NuxtLink
        >
      </div>
      <div class="row-line muted">
        <NuxtLink
          v-if="event.from"
          :to="`/profile/${event.from}`"
        >
          <AccountBadge :address="event.from" />
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
          <AccountBadge :address="event.to" />
        </NuxtLink>
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

const kindLabel = computed(
  () => KIND_LABEL[props.event.kind] ?? props.event.kind,
)

/// `assign` and `wrap` rows carry the same address as `from` and `to`; collapse
/// them so the row shows a single party.
const sameParties = computed(
  () =>
    !!props.event.from &&
    !!props.event.to &&
    props.event.from.toLowerCase() === props.event.to.toLowerCase(),
)

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
  bid_cancelled: 'Bid cancelled',
  sale: 'Sold',
}
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
}

.activity-row:hover {
  background: var(--bg-elevated);
}

.thumb-icon {
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
  min-width: 0;
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

@media (max-width: 640px) {
  .row-meta {
    flex-direction: column;
    align-items: flex-end;
    gap: var(--size-1);
  }
}
</style>
