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
        <div class="event-main">
          <div class="event-title-line">
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
          </div>

          <div
            v-if="row.isTransfer && (row.from || row.to)"
            class="event-indicators"
          >
            <span
              v-if="row.from"
              class="event-indicator"
            >
              <span class="indicator-label">From</span>
              <NuxtLink
                :to="`/profile/${row.from}`"
                class="event-account"
              >
                <AccountBadge :address="row.from" />
              </NuxtLink>
            </span>
            <span
              v-if="row.from && row.to"
              class="indicator-arrow"
              >→</span
            >
            <span
              v-if="row.to"
              class="event-indicator"
            >
              <span class="indicator-label">To</span>
              <NuxtLink
                :to="`/profile/${row.to}`"
                class="event-account"
              >
                <AccountBadge :address="row.to" />
              </NuxtLink>
            </span>
          </div>

          <div
            v-else-if="row.initiator"
            class="event-indicators"
          >
            <span class="event-indicator">
              <span class="indicator-label">{{ row.initiatorLabel }}</span>
              <NuxtLink
                :to="`/profile/${row.initiator}`"
                class="event-account"
              >
                <AccountBadge :address="row.initiator" />
              </NuxtLink>
            </span>
          </div>
        </div>

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
import {
  CRYPTOPUNKS_721_ADDRESS,
  WRAPPED_PUNKS_ADDRESS,
} from '@networked-art/punks-sdk'
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
const { owner: nativeOwner } = usePunkOwner(() => props.punkId)

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

/// Optional secondary account for non-transfer rows. Current-owner actions are
/// omitted because the owner is already the page context.
function pickInitiator(event: ActivityEvent): Address | undefined {
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

function pickInitiatorLabel(event: ActivityEvent): string {
  switch (event.kind) {
    case 'sale':
      return 'Buyer'
    case 'bid':
    case 'bid_cancelled':
      return 'Bidder'
    case 'listing':
    case 'listing_cancelled':
      return 'Seller'
    case 'assign':
      return 'To'
    default:
      return 'By'
  }
}

function normalize(address?: Address | null): string | undefined {
  return address?.toLowerCase()
}

function sameAddress(a?: Address | null, b?: Address | null): boolean {
  const left = normalize(a)
  const right = normalize(b)
  return !!left && !!right && left === right
}

function isWrapperAddress(address?: Address | null): boolean {
  return (
    sameAddress(address, WRAPPED_PUNKS_ADDRESS) ||
    sameAddress(address, CRYPTOPUNKS_721_ADDRESS)
  )
}

function inferCurrentOwner(events: ActivityEvent[]): Address | undefined {
  for (const event of events) {
    if (
      event.kind === 'assign' ||
      event.kind === 'transfer' ||
      event.kind === 'wrap' ||
      event.kind === 'unwrap' ||
      event.kind === 'sale'
    ) {
      if (event.to) return event.to
    }
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

const currentOwner = computed(() => {
  const inferred = inferCurrentOwner(events.value)
  if (isWrapperAddress(nativeOwner.value) && inferred) return inferred
  return nativeOwner.value ?? inferred
})

const rows = computed(() =>
  events.value.map((event) => {
    const initiator = pickInitiator(event)
    return {
      id: event.id,
      initiator: sameAddress(initiator, currentOwner.value)
        ? undefined
        : initiator,
      initiatorLabel: pickInitiatorLabel(event),
      isTransfer: event.kind === 'transfer',
      from: event.from,
      to: event.to,
      kind: KIND_LABEL[event.kind] ?? event.kind,
      wrapped: event.wrapped,
      amountWei:
        event.amountWei !== undefined && event.amountWei > 0n
          ? event.amountWei
          : undefined,
      txHash: event.txHash,
      relative: formatAgo(event.timestamp),
      absolute: new Date(event.timestamp * 1000).toLocaleString(),
    }
  }),
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
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--size-3);
  padding: var(--size-3);
  border-bottom: var(--border);
  font-size: 12px;
}

.event-row:last-child {
  border-bottom: 0;
}

.event-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--size-2);
}

.event-title-line {
  display: flex;
  align-items: baseline;
  gap: var(--size-2);
  min-width: 0;
  flex-wrap: wrap;
}

.event-indicators {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  min-width: 0;
  flex-wrap: wrap;
  color: var(--text-dim);
  font-size: 11px;
}

.event-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
  min-width: 0;
}

.indicator-label {
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 10px;
  white-space: nowrap;
}

.indicator-arrow {
  color: var(--text-dim);
}

.event-account {
  min-width: 0;
  border: 0;
  color: var(--text-muted);
}

.event-account :deep(.avvatar) {
  height: 1.2em;
  margin-right: var(--size-1);
}

.event-account :deep(.label) {
  max-width: 14ch;
}

.event-kind {
  color: var(--text);
  font-weight: 600;
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
    align-items: start;
  }

  .event-time {
    justify-content: flex-end;
  }
}
</style>
