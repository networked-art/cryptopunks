<template>
  <div class="container bids-page">
    <header class="page-head">
      <div class="page-head-row">
        <div class="page-head-titles">
          <h1>Collection bids</h1>
          <p class="page-lead muted">
            Open ETH bids on the PunksMarket bid book. Any holder of a matching
            V1 punk can accept.
          </p>
        </div>
        <ClientOnly>
          <CollectionBidForm @placed="refresh" />
        </ClientOnly>
      </div>
    </header>

    <ClientOnly>
      <div
        v-if="pending && !bids.length"
        class="state muted"
      >
        Loading bids…
      </div>
      <div
        v-else-if="error"
        class="state error"
      >
        Failed to load bids: {{ error }}
      </div>
      <div
        v-else-if="!ownBids.length && !openBids.length"
        class="state empty muted"
      >
        No active collection bids yet.
      </div>
      <div
        v-else
        class="bids-stack"
      >
        <section
          v-if="ownBids.length"
          class="bid-section"
        >
          <header class="bid-section-head">
            <h2 class="bid-section-title">Your bids</h2>
            <span class="bid-section-count muted"
              >{{ ownBids.length.toLocaleString() }} active</span
            >
          </header>
          <div class="bid-list">
            <BidCard
              v-for="bid in ownBids"
              :key="String(bid.id)"
              :bid="bid"
              @withdrawn="refresh"
              @adjusted="refresh"
            />
          </div>
        </section>

        <section
          v-if="openBids.length"
          class="bid-section"
        >
          <header class="bid-section-head">
            <h2 class="bid-section-title">
              {{ ownBids.length ? 'Other bids' : 'Open bids' }}
            </h2>
            <span class="bid-section-count muted"
              >{{ openBids.length.toLocaleString() }} active</span
            >
          </header>
          <div class="bid-list">
            <BidCard
              v-for="bid in openBids"
              :key="String(bid.id)"
              :bid="bid"
              @withdrawn="refresh"
              @adjusted="refresh"
            />
          </div>
        </section>
      </div>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { useConnection } from '@wagmi/vue'
import {
  bidToQuery,
  type CollectionBid,
} from '~/composables/usePunksMarketBids'

useSeoMeta({
  title: 'Bids · punksmarket.app',
  ogTitle: 'Bids · punksmarket.app',
  twitterTitle: 'Bids · punksmarket.app',
})

const { bids, pending, error, refresh } = usePunksMarketBids()
const { address } = useConnection()
const offline = usePunksOffline()

const ownAddress = computed(() => address.value?.toLowerCase() ?? null)

/// Sort by bid amount descending — the most expensive bid is the most
/// interesting one to surface to a punk holder browsing the book.
const sortedBids = computed<CollectionBid[]>(() =>
  [...bids.value].sort((a, b) =>
    a.bidWei === b.bidWei ? 0 : a.bidWei > b.bidWei ? -1 : 1,
  ),
)

/// Hide bids whose criteria can't match any punk from the open list; the
/// bidder still sees them in their own section so they can withdraw. Filters
/// that throw (forbidden masks, etc.) count as unfillable here.
function bidFillable(bid: CollectionBid): boolean {
  try {
    return offline.count(bidToQuery(bid)) > 0
  } catch {
    return false
  }
}

const ownBids = computed<CollectionBid[]>(() =>
  ownAddress.value
    ? sortedBids.value.filter(
        (b) => b.bidder.toLowerCase() === ownAddress.value,
      )
    : [],
)

const openBids = computed<CollectionBid[]>(() =>
  sortedBids.value.filter(
    (b) => b.bidder.toLowerCase() !== ownAddress.value && bidFillable(b),
  ),
)
</script>

<style scoped>
.bids-page {
  padding: var(--size-6) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-5);
}

.page-head {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.page-head-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--size-3);
  flex-wrap: wrap;
}

.page-head-titles {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.page-head-titles h1 {
  margin: 0;
}

.page-lead {
  margin: 0;
  max-width: 60ch;
}

.bids-stack {
  display: flex;
  flex-direction: column;
  gap: var(--size-5);
}

.bid-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.bid-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--size-2);
}

.bid-section-title {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.bid-section-count {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.bid-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-elevated);
}

.state {
  padding: var(--size-8);
  text-align: center;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius);
}

.error {
  color: var(--accent);
}
</style>
