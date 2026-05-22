<template>
  <Card class="auction-card">
    <LotGrid :items="auction.items" />

    <div class="info">
      <div class="line line-id">
        <span class="id">Auction #{{ auction.id }}</span>
        <span
          class="status"
          :class="status"
        >
          <span class="dot" />
          {{ statusLabel }}
        </span>
      </div>

      <div class="line line-price">
        <EthAmount
          class="price"
          :wei="auction.latestBidWei"
        />
        <time
          class="when"
          :datetime="endIso"
          :title="absoluteEnd"
          >{{ endText }}</time
        >
      </div>

      <div class="line line-bidder">
        <span class="by">{{ status === 'settled' ? 'Won by' : 'Bid by' }}</span>
        <NuxtLink
          class="bidder"
          :to="`/profile/${auction.latestBidder}`"
        >
          <AccountBadge :address="auction.latestBidder" />
        </NuxtLink>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { auctionStatus, type AuctionRecord } from '~/utils/auction'

const props = defineProps<{ auction: AuctionRecord }>()

const status = computed(() => auctionStatus(props.auction))

const statusLabel = computed(
  () =>
    ({ live: 'Live', ended: 'Awaiting settlement', settled: 'Settled' })[
      status.value
    ],
)

const endIso = computed(() =>
  new Date(props.auction.endTimestamp * 1000).toISOString(),
)
const endAgo = useTimeAgo(endIso)
const endText = computed(
  () => `${status.value === 'live' ? 'Ends' : 'Ended'} ${endAgo.value}`,
)
const absoluteEnd = computed(() =>
  new Date(props.auction.endTimestamp * 1000).toLocaleString(),
)
</script>

<style scoped>
.auction-card {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.info {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  padding-top: var(--size-3);
  border-top: var(--border);
}

.line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-2);
}

.id {
  font-size: var(--font-sm);
  font-weight: 600;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
  flex-shrink: 0;
  font-size: var(--font-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--text-muted);
}

.status .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status.live {
  color: var(--accent-strong);
}

.status.live .dot {
  animation: pulse 1.8s ease-in-out infinite;
}

.status.settled {
  color: var(--text-dim);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .status.live .dot {
    animation: none;
  }
}

.line-price {
  align-items: baseline;
}

.price {
  font-size: var(--font-lg);
  font-weight: 600;
}

.when {
  flex-shrink: 0;
  font-size: var(--font-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--text-muted);
}

.line-bidder {
  justify-content: flex-start;
}

.by {
  font-size: var(--font-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.bidder {
  min-width: 0;
}
</style>
