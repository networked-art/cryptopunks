<template>
  <div class="punk-history">
    <ul
      v-if="visibleRows.length"
      class="event-list"
    >
      <li
        v-for="row in visibleRows"
        :key="row.id"
        class="event-row"
      >
        <NuxtLink
          v-if="row.party"
          :to="`/profile/${row.party}`"
          class="event-party"
        >
          <AccountBadge :address="row.party!" />
        </NuxtLink>
        <span
          v-else
          class="event-party muted"
          >—</span
        >

        <span class="event-detail">
          <span class="event-kind">{{ row.kind }}</span>
          <span
            v-if="row.wrapped"
            class="wrapped"
            >wrapped</span
          >
          <EthAmount
            v-if="row.amountWei !== undefined"
            class="event-amount"
            :wei="row.amountWei"
          />
        </span>

        <a
          class="event-time"
          :href="txUrl(row.txHash)"
          target="_blank"
          rel="noopener"
          :title="row.absolute"
        >
          <span>{{ row.relative }}</span>
          <Icon name="lucide:arrow-up-right" />
        </a>
      </li>
    </ul>

    <Button
      v-if="rows.length > LIMIT"
      class="small link muted"
      @click="expanded = !expanded"
    >
      {{ expanded ? 'Show less' : `Show all ${rows.length}` }}
    </Button>

    <p
      v-if="!rows.length"
      class="state muted"
    >
      {{ stateLabel }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { Address } from 'viem'
import type { ActivityEvent, ActivityKind } from '~/composables/useActivityFeed'
import { txUrl } from '~/utils/explorer'

const props = defineProps<{
  punkId: number
}>()

const LIMIT = 6
const expanded = ref(false)

const { events, pending, error } = useActivityFeed({
  punkId: () => props.punkId,
  limit: 60,
})

const KIND_LABEL: Record<ActivityKind, string> = {
  assign: 'Claimed',
  transfer: 'Transferred',
  wrap: 'Wrapped',
  unwrap: 'Unwrapped',
  listing: 'Listed',
  listing_cancelled: 'Unlisted',
  bid: 'Bid placed',
  bid_cancelled: 'Bid withdrawn',
  sale: 'Sold',
}

/// The account a row is "about" — the buyer of a sale, the bidder of a bid,
/// the seller of a listing, otherwise whoever received the Punk.
function pickParty(event: ActivityEvent): Address | undefined {
  switch (event.kind) {
    case 'sale':
      return event.to ?? event.from
    case 'bid':
    case 'bid_cancelled':
    case 'listing':
    case 'listing_cancelled':
      return event.from
    default:
      return event.to ?? event.from
  }
}

function formatAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

const rows = computed(() =>
  events.value.map((event) => ({
    id: event.id,
    party: pickParty(event),
    kind: KIND_LABEL[event.kind] ?? event.kind,
    wrapped: event.wrapped,
    amountWei:
      event.amountWei !== undefined && event.amountWei > 0n
        ? event.amountWei
        : undefined,
    txHash: event.txHash,
    relative: formatAgo(event.timestamp),
    absolute: new Date(event.timestamp * 1000).toLocaleString(),
  })),
)

const visibleRows = computed(() =>
  expanded.value ? rows.value : rows.value.slice(0, LIMIT),
)

const stateLabel = computed(() => {
  if (pending.value) return 'Loading history…'
  if (error.value) return error.value
  return 'No recorded history for this Punk.'
})
</script>

<style scoped>
.punk-history {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.event-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--size-3);
  padding: var(--size-3);
  border-bottom: var(--border);
  font-size: 12px;
}

.event-row:last-child {
  border-bottom: 0;
}

.event-party {
  min-width: 0;
  border: 0;
}

.event-party :deep(.avvatar) {
  height: calc(1lh + var(--size-3) * 2);
  margin-block: calc(var(--size-3) * -1);
  margin-inline-start: calc(var(--size-3) * -1);
  margin-inline-end: var(--size-2);
}

.event-detail {
  display: inline-flex;
  align-items: baseline;
  gap: var(--size-2);
  white-space: nowrap;
}

.event-kind {
  color: var(--text);
}

.wrapped {
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.event-amount {
  font-weight: 600;
}

.event-time {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 0;
  color: var(--text-dim);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.event-time:hover {
  color: var(--accent);
}

.state {
  margin: 0;
  font-size: 12px;
}

@media (max-width: 460px) {
  .event-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .event-time {
    grid-column: 2;
    justify-content: flex-end;
  }
}
</style>
