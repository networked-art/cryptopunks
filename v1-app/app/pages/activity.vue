<template>
  <div class="container activity-page">
    <header class="page-head">
      <h1>Activity</h1>
      <p class="muted">
        Recent listings and sales on
        <a
          href="https://evm.now/address/0x6ba6f2207e343923ba692e5cae646fb0f566db8d"
          >CryptoPunks.sol</a
        >, and bids on
        <a href="https://evm.now/address/punksmarket.eth/code"
          >PunksMarket.sol</a
        >.
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
import type { ActivityKind } from '~/composables/useActivityFeed'

useSeoMeta({
  title: 'Activity · punksmarket.app',
  ogTitle: 'Activity · punksmarket.app',
  twitterTitle: 'Activity · punksmarket.app',
})

type FilterKey =
  | 'sales'
  | 'listings'
  | 'bids'
  | 'transfers'
  | 'unwraps'
  | 'wraps'

const FILTERS: { key: FilterKey; label: string; kinds: ActivityKind[] }[] = [
  { key: 'sales', label: 'Sales', kinds: ['sale'] },
  {
    key: 'listings',
    label: 'Listings',
    kinds: ['listing', 'listing_cancelled'],
  },
  { key: 'transfers', label: 'Transfers', kinds: ['transfer'] },
  {
    key: 'bids',
    label: 'Bids',
    kinds: ['bid', 'bid_adjusted', 'bid_cancelled'],
  },
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

.page-head h1 {
  margin: 0 0 var(--size-1);
  font-weight: 500;
  font-size: 22px;
  letter-spacing: -0.02em;
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
