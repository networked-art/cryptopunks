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
      <ul
        v-else-if="events.length"
        class="event-list"
      >
        <ActivityRow
          v-for="(e, i) in events"
          :key="`${e.txHash}-${i}`"
          :event="e"
        />
      </ul>
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
useHead({ title: 'Activity · punksmarket.xyz' })

const { events, pending, error } = useActivityFeed()
</script>

<style scoped>
.activity-page {
  padding: var(--space-6) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.page-head h1 {
  margin: 0 0 var(--space-1);
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
  padding: var(--space-8);
  text-align: center;
}

.error {
  color: var(--accent);
}
</style>
