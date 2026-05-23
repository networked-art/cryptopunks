<template>
  <div class="container activity-page">
    <header class="page-head">
      <h1>Activity</h1>
      <p class="muted">
        Every <code>CryptoPunks</code> market event — claims, transfers,
        listings, bids, sales, and wraps — newest first.
        <code>PunksAuction</code> activity joins here once it's live.
      </p>
    </header>

    <ClientOnly>
      <Tags class="filters">
        <Tag
          v-for="f in FILTERS"
          :key="f.key"
          :dismissable="activeFilters.has(f.key)"
          :class="{ active: activeFilters.has(f.key) }"
          @click="!activeFilters.has(f.key) && toggle(f.key)"
          @dismiss="toggle(f.key)"
        >
          {{ f.label }}
        </Tag>
        <Button
          v-if="activeFilters.size"
          class="small link muted"
          @click="clear"
        >
          Clear
        </Button>
      </Tags>

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
        Failed to load activity: {{ error }}
      </div>
      <template v-else-if="events.length">
        <ul class="event-list">
          <ActivityRow
            v-for="event in events"
            :key="event.id"
            :event="event"
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
        No activity yet.
      </div>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { ActivityKind } from '~/composables/useActivityFeed'

useSeoMeta({
  title: 'Activity · Punks Auction',
  ogTitle: 'Activity · Punks Auction',
  twitterTitle: 'Activity · Punks Auction',
})

type FilterKey =
  | 'sales'
  | 'listings'
  | 'transfers'
  | 'bids'
  | 'wraps'
  | 'unwraps'

const FILTERS: { key: FilterKey; label: string; kinds: ActivityKind[] }[] = [
  { key: 'sales', label: 'Sales', kinds: ['sale'] },
  {
    key: 'listings',
    label: 'Listings',
    kinds: ['listing', 'listing_cancelled'],
  },
  { key: 'transfers', label: 'Transfers', kinds: ['transfer'] },
  { key: 'bids', label: 'Bids', kinds: ['bid', 'bid_cancelled'] },
  { key: 'wraps', label: 'Wraps', kinds: ['wrap'] },
  { key: 'unwraps', label: 'Unwraps', kinds: ['unwrap'] },
]

const FILTER_KEYS = new Set<FilterKey>(FILTERS.map((f) => f.key))

const route = useRoute()
const router = useRouter()

function parseQuery(raw: unknown): FilterKey[] {
  const str = Array.isArray(raw) ? raw[0] : raw
  if (typeof str !== 'string' || !str) return []
  const seen = new Set<FilterKey>()
  for (const part of str.split(',')) {
    const k = part.trim() as FilterKey
    if (FILTER_KEYS.has(k)) seen.add(k)
  }
  return [...seen]
}

const activeFilters = computed(() => new Set(parseQuery(route.query.t)))

const selectedKinds = computed<ActivityKind[] | undefined>(() => {
  if (!activeFilters.value.size) return undefined
  const kinds = new Set<ActivityKind>()
  for (const f of FILTERS) {
    if (activeFilters.value.has(f.key)) {
      for (const k of f.kinds) kinds.add(k)
    }
  }
  return [...kinds]
})

function writeQuery(next: Set<FilterKey>) {
  const ordered = FILTERS.filter((f) => next.has(f.key)).map((f) => f.key)
  const t = ordered.join(',')
  router.replace({
    query: { ...route.query, t: t || undefined },
  })
}

function toggle(key: FilterKey) {
  const next = new Set(activeFilters.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  writeQuery(next)
}

function clear() {
  writeQuery(new Set())
}

const { events, pending, loadingMore, error, hasMore, loadMore } =
  useActivityFeed({
    kinds: selectedKinds,
  })
</script>

<style scoped>
.activity-page {
  padding: var(--size-6) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
}

.filters {
  align-items: center;
}

.filters :deep(button.link) {
  font-size: var(--font-sm);
}

.event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: var(--border);
  border-bottom: 0;
  background: var(--bg-elevated);
}

.empty {
  padding: var(--size-8);
  text-align: center;
  border: 1px dashed var(--border-color);
}

.load-more {
  display: flex;
  justify-content: center;
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
