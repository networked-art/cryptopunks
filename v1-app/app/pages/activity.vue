<template>
  <div class="container activity-page">
    <header class="page-head">
      <h1>Activity</h1>
      <p class="muted">
        Recent V1 listings, sales, and bids across the original market and
        PunksMarket.
      </p>
    </header>

    <ClientOnly>
      <div
        v-if="pending"
        class="muted"
      >
        Loading activity…
      </div>
      <div
        v-else-if="error"
        class="error"
      >
        Failed to load: {{ error }}
      </div>
      <template v-else-if="events.length">
        <ul class="event-list">
          <ActivityRow
            v-for="(e, i) in events"
            :key="`${e.txHash}-${i}`"
            :event="e"
          />
        </ul>
        <div
          v-if="hasMore"
          class="load-more"
        >
          <Button
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? 'Loading…' : 'Load more' }}
          </Button>
        </div>
      </template>
      <div
        v-else
        class="empty muted"
      >
        No recent activity.
      </div>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
useSeoMeta({
  title: 'Activity · punksmarket.xyz',
  ogTitle: 'Activity · punksmarket.xyz',
  twitterTitle: 'Activity · punksmarket.xyz',
})

const { events, pending, loadingMore, error, hasMore, loadMore } = useActivityFeed()
</script>

<style scoped>
.activity-page {
  padding: var(--size-6) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
}

.page-head h1 {
  margin: 0 0 var(--size-1);
  font-weight: 500;
  font-size: 22px;
  letter-spacing: -0.02em;
}

.event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
}

.empty {
  padding: var(--size-8);
  text-align: center;
}

.load-more {
  display: flex;
  justify-content: center;
}

.error {
  color: var(--accent);
}
</style>
