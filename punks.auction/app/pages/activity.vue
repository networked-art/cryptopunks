<template>
  <div class="container activity-page">
    <header class="page-head">
      <div class="page-head-text">
        <h1>Activity</h1>
        <p class="muted">
          Every CryptoPunks and PunksAuction market event, newest first.
        </p>
      </div>
    </header>

    <ClientOnly>
      <div class="activity-controls">
        <Tags class="filters">
          <Tag
            v-for="f in activityFilters"
            :key="f.key"
            :dismissable="activeFilters.has(f.key)"
            :class="{ active: activeFilters.has(f.key) }"
            @click="!activeFilters.has(f.key) && toggleFilter(f.key)"
            @dismiss="toggleFilter(f.key)"
          >
            {{ f.label }}
          </Tag>
          <Tag
            :dismissable="hasSearchInput"
            class="filter-toggle"
            :class="{ active: searchPanelOpen || hasSearchInput }"
            @click="toggleSearchPanel"
            @dismiss="clearSearchPanel"
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
useSeoMeta({
  title: 'Activity · Punks Auction',
  ogTitle: 'Activity · Punks Auction',
  twitterTitle: 'Activity · Punks Auction',
})

const {
  filters: activityFilters,
  activeFilters,
  hasFilters,
  selectedKindFilters,
  toggleFilter,
  clearFilters,
} = useActivityFilters()

const {
  searchText,
  searchPlaceholder,
  searchOwnerHandle,
  searchAddress,
  searchPunkIds,
  searchCounts,
  clearSearch,
  hasSearchInput,
  hasSearch,
  searchPanelOpen,
  onSearchEnter,
  toggleSearchPanel,
  clearSearchPanel,
} = useActivitySearchScope()

const hasActiveControls = computed(
  () => hasFilters.value || hasSearchInput.value || searchPanelOpen.value,
)

function clear() {
  clearSearchPanel()
  clearFilters()
}

const emptyLabel = computed(() =>
  hasSearch.value || hasFilters.value
    ? 'No matching activity.'
    : 'No activity yet.',
)

const { events, pending, loadingMore, error, hasMore, loadMore } =
  useActivityFeed({
    punkIds: searchPunkIds,
    address: searchAddress,
    kindFilters: selectedKindFilters,
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
  background: var(--input-background);
  box-shadow: var(--border-shadow);
  transition:
    box-shadow var(--speed),
    color var(--speed);
}

.activity-search-bar :deep(.search-input:is(:hover, :active, :focus, .active)),
.activity-search-bar :deep(.search-field:focus-within .search-input) {
  background: var(--input-background);
  box-shadow: var(--border-shadow);
}

.activity-search-bar :deep(.search-field::after) {
  display: none;
}

.activity-search-bar :deep(.search-group .search-bar-action) {
  box-shadow: var(--border-shadow);
}

.activity-search-bar
  :deep(.search-group .search-bar-action:is(:hover, :active, :focus, .active)) {
  box-shadow: var(--border-shadow);
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
