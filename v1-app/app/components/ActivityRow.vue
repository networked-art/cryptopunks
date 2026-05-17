<template>
  <li class="activity-row">
    <NuxtLink v-if="punkId !== undefined" :to="`/punk/${punkId}`" class="thumb">
      <PunkImage :punk-id="punkId" :size="44" glitch="never" />
    </NuxtLink>
    <span v-else class="thumb thumb-bid">#{{ event.bidId }}</span>

    <div class="row-body">
      <div class="row-line">
        <span class="kind" :class="kindClass">{{ kindLabel }}</span>
        <NuxtLink v-if="punkId !== undefined" :to="`/punk/${punkId}`" class="punk-id">Punk #{{ punkId }}</NuxtLink>
      </div>
      <div class="row-line muted">
        <span v-if="event.from">
          <NuxtLink :to="`/profile/${event.from}`">
            <AccountBadge :address="event.from" />
          </NuxtLink>
        </span>
        <span v-if="event.to" class="arrow">→</span>
        <span v-if="event.to">
          <NuxtLink :to="`/profile/${event.to}`">
            <AccountBadge :address="event.to" />
          </NuxtLink>
        </span>
      </div>
    </div>

    <div class="row-meta">
      <EthAmount v-if="event.amountWei !== undefined" :wei="event.amountWei" />
      <a class="tx" :href="`https://etherscan.io/tx/${event.txHash}`" target="_blank" rel="noopener">↗</a>
    </div>
  </li>
</template>

<script setup lang="ts">
import type { ActivityEvent } from '~/composables/useActivityFeed'

const props = defineProps<{ event: ActivityEvent }>()

const punkId = computed(() => props.event.punkId)

const kindLabel = computed(() => KIND_LABEL[props.event.kind])
const kindClass = computed(() => `kind-${props.event.kind.split('-')[0]}-${props.event.kind.split('-').slice(1).join('-')}`)
</script>

<script lang="ts">
const KIND_LABEL: Record<string, string> = {
  'v1-listed': 'Listed',
  'v1-unlisted': 'Unlisted',
  'v1-sold': 'Sold',
  'v1-bid-placed': 'Bid placed',
  'v1-bid-withdrawn': 'Bid withdrawn',
  'pm-purchased': 'Bought (PM)',
  'pm-bid-placed': 'Collection bid',
  'pm-bid-cancelled': 'Bid cancelled',
  'pm-bid-adjusted': 'Bid adjusted',
  'pm-bid-accepted': 'Bid accepted',
}
</script>

<style scoped>
.activity-row {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) var(--space-3);
  border-bottom: 1px solid var(--border);
  list-style: none;
}

.activity-row:hover {
  background: var(--bg-elevated);
}

.thumb {
  border: 0;
  display: flex;
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
  font-size: 11px;
}

.row-line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
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
  gap: var(--space-3);
}

.tx {
  border: 0;
  color: var(--text-dim);
}

.tx:hover {
  color: var(--accent);
}
</style>
