<template>
  <div class="container activity-page">
    <header class="page-head">
      <div class="page-head-text">
        <h1>Activity</h1>
        <p class="muted">
          Every <code>CryptoPunks</code> and <code>PunksAuction</code> market
          event — claims, transfers, listings, bids, sales, wraps, lots, and
          purchase offers — newest first.
        </p>
      </div>
    </header>

    <ClientOnly>
      <div class="activity-controls">
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
          <Tag
            :dismissable="hasSearchInput"
            class="filter-toggle"
            :class="{ active: searchPanelOpen || hasSearchInput }"
            @click="toggleSearchPanel"
            @dismiss="dismissSearchFilter"
          >
            Filter
          </Tag>
          <Button
            v-if="hasActiveControls"
            class="small link muted"
            @click="clear"
          >
            Clear
          </Button>
        </Tags>

        <Transition name="activity-search">
          <PunkSearchBar
            v-if="searchPanelOpen"
            v-model="searchText"
            class="activity-search-bar"
            :placeholder="searchPlaceholder"
            :counts="searchCounts"
            actions-width="128px"
            @enter="onSearchEnter"
            @clear="clearSearch"
          >
            <template
              v-if="searchOwnerHandle"
              #action
            >
              <Button
                class="search-bar-action"
                :to="`/profile/${searchOwnerHandle}`"
              >
                View profile
              </Button>
            </template>
          </PunkSearchBar>
        </Transition>
      </div>

      <div
        v-if="pending"
        class="loading"
      >
        <Spinner label="Loading activity" />
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
        {{ emptyLabel }}
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
  | 'marketplace'
  | 'auctions'
  | 'offers'
  | 'wraps'

const FILTERS: { key: FilterKey; label: string; kinds: ActivityKind[] }[] = [
  { key: 'sales', label: 'Sales', kinds: ['sale'] },
  {
    key: 'marketplace',
    label: 'Marketplace',
    kinds: ['listing', 'listing_cancelled', 'bid', 'bid_cancelled'],
  },
  {
    key: 'auctions',
    label: 'Auctions',
    kinds: [
      'lot_created',
      'lot_cancelled',
      'lot_cleared',
      'lot_updated',
      'auction_started',
      'auction_settled',
    ],
  },
  {
    key: 'offers',
    label: 'Purchase Offers',
    kinds: ['offer_placed', 'offer_cancelled', 'offer_adjusted'],
  },
  { key: 'wraps', label: 'Wraps', kinds: ['wrap', 'unwrap'] },
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

const {
  text: searchText,
  debouncedText: debouncedSearchText,
  placeholder: searchPlaceholder,
  ownerHandle: searchOwnerHandle,
  ownerAddress: searchOwnerAddress,
  ids: searchIds,
  counts: searchCounts,
  onEnter: onSearchEnter,
  clearSearch,
} = usePunkSearch({
  syncRoute: true,
  enableListedFilter: false,
  enableEnterNavigation: false,
})

const hasSearchInput = computed(() => searchText.value.trim().length > 0)
const hasSearch = computed(() => debouncedSearchText.value.trim().length > 0)
const searchPanelOpen = ref(searchText.value.trim().length > 0)
const hasActiveControls = computed(
  () =>
    activeFilters.value.size > 0 ||
    hasSearchInput.value ||
    searchPanelOpen.value,
)
const isAddressSearch = computed(
  () => hasSearch.value && !!searchOwnerHandle.value,
)
const searchAddress = computed(() =>
  isAddressSearch.value ? searchOwnerAddress.value : undefined,
)
const searchPunkIds = computed(() => {
  if (!hasSearch.value) return undefined
  if (isAddressSearch.value) return searchAddress.value ? undefined : []
  return searchIds.value
})

watch(hasSearchInput, (active) => {
  if (active) searchPanelOpen.value = true
})

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
  clearSearch()
  searchPanelOpen.value = false
  writeQuery(new Set())
}

function toggleSearchPanel() {
  searchPanelOpen.value = !searchPanelOpen.value
}

function dismissSearchFilter() {
  clearSearch()
  searchPanelOpen.value = false
}

const emptyLabel = computed(() =>
  hasSearch.value || activeFilters.value.size
    ? 'No matching activity.'
    : 'No activity yet.',
)

const { events, pending, loadingMore, error, hasMore, loadMore } =
  useActivityFeed({
    punkIds: searchPunkIds,
    address: searchAddress,
    kinds: selectedKinds,
  })
</script>

<style scoped>
.activity-page {
  padding: var(--size-8) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-8);
}

.filters {
  align-items: center;
  position: relative;
  z-index: 2;
}

.filters :deep(button.link) {
  font-size: var(--font-sm);
}

.activity-controls {
  position: sticky;
  top: calc(56px + var(--border-width));
  z-index: var(--z-index-ui);
  padding-block: var(--size-2);
  background: color-mix(in srgb, var(--bg) 94%, transparent);
  backdrop-filter: blur(8px);
}

.activity-search-bar.search-bar {
  position: absolute;
  inset-inline: 0;
  top: calc(100% + var(--size-1));
  z-index: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0;
}

.activity-search-bar :deep(.search-group) {
  --search-control-height: var(--form-item-height);

  box-shadow: none;
}

.activity-search-bar :deep(.search-group:focus-within) {
  box-shadow: none;
}

.activity-search-bar :deep(.search-input) {
  min-height: var(--form-item-height);
}

.activity-search-enter-active,
.activity-search-leave-active {
  transition:
    opacity var(--speed),
    transform var(--speed);
}

.activity-search-enter-from,
.activity-search-leave-to {
  opacity: 0;
  transform: translateY(calc(-1 * var(--size-1)));
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

.loading {
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
