<template>
  <div class="container activity-page">
    <header class="page-head">
      <h1>Activity</h1>
      <p class="muted">
        Every <code>PunksAuction</code> event — lots, auctions, bids, offers,
        and escrow movements — newest first.
      </p>
    </header>

    <ClientOnly>
      <div
        v-if="pending && !events.length"
        class="muted"
      >
        Loading activity…
      </div>
      <div
        v-else-if="!deployed"
        class="empty muted"
      >
        Activity appears here once <code>PunksAuction</code> is deployed.
      </div>
      <div
        v-else-if="error"
        class="error"
      >
        Failed to load activity: {{ error }}
      </div>
      <ul
        v-else-if="events.length"
        class="event-list"
      >
        <ActivityRow
          v-for="event in events"
          :key="event.id"
          :event="event"
        />
      </ul>
      <div
        v-else
        class="empty muted"
      >
        No activity yet.
      </div>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { isAuctionDeployed } from '~/utils/addresses'

useSeoMeta({
  title: 'Activity · Punks Auction',
  ogTitle: 'Activity · Punks Auction',
  twitterTitle: 'Activity · Punks Auction',
})

const deployed = isAuctionDeployed()
const { events, pending, error } = useActivityFeed()
</script>

<style scoped>
.activity-page {
  padding: var(--size-6) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
}

.event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
}

.empty {
  padding: var(--size-8);
  text-align: center;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius);
}

.error {
  color: var(--accent);
}

code {
  font-family: var(--font-mono);
  background: var(--bg-elevated);
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
}
</style>
