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

        <Transition
          name="activity-search"
          appear
        >
          <div
            v-if="searchPanelOpen"
            class="activity-search-panel"
          >
            <PunkSearchBar
              v-model="searchText"
              :placeholder="searchPlaceholder"
              :counts="searchCounts"
              :suggestions="searchSuggestions"
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
              <template
                v-else-if="canAlertSearch"
                #action
              >
                <ActivitySearchAlert
                  :label="searchText"
                  :token-ids="searchPunkIds ?? []"
                />
              </template>
            </PunkSearchBar>
          </div>
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
import { isApiConfigured } from '~/utils/api'

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
  searchSuggestions,
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

// Offer a watchlist alert for a resolved trait/attribute search (not an owner
// search, which has no stable token set). Needs the networked.art API wired up.
const canAlertSearch = computed(
  () =>
    isApiConfigured() &&
    hasSearch.value &&
    !searchOwnerHandle.value &&
    (searchPunkIds.value?.length ?? 0) > 0,
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
  z-index: var(--z-index-overlay);
  padding-inline: var(--border-width);
  padding-block: var(--size-4);
  background: var(--background);
}

.activity-search-panel {
  position: absolute;
  /* padding-top: var(--size-2); */
  background: var(--background);
  top: 100%;
  z-index: 1;
  width: calc(100% - 2 * var(--border-width));
}

/* The search bar's root <header> is rendered by reka's AutocompleteRoot, which
   drops this page's scoped-style attribute — selectors that target the header
   directly never match. Anchor on .activity-controls (a real element here that
   keeps its scope id) and reach in with :deep() instead. */
.activity-controls :deep(.search-bar) {
  position: static;
  max-width: none;
  margin: 0;
  padding: 0;
  inset-inline: var(--border-width);
}

.activity-controls :deep(.search-group) {
  --search-control-height: var(--form-item-height);

  box-shadow: none;
}

.activity-controls :deep(.search-group:focus-within) {
  box-shadow: none;
}

.activity-controls :deep(.search-input) {
  min-height: var(--form-item-height);
  background: var(--input-background);
  box-shadow: var(--border-shadow);
  transition:
    padding-inline-start var(--speed),
    background var(--speed),
    box-shadow var(--speed),
    color var(--speed);
}

.activity-controls :deep(.search-input:is(:hover, :active, :focus, .active)),
.activity-controls :deep(.search-field:focus-within .search-input) {
  background: var(--input-background);
  box-shadow: var(--border-shadow);
}

.activity-controls :deep(.search-field::after) {
  display: none;
}

.activity-controls :deep(.search-group .search-bar-action) {
  box-shadow: var(--border-shadow);
}

.activity-controls
  :deep(.search-group .search-bar-action:is(:hover, :active, :focus, .active)) {
  box-shadow: var(--border-shadow);
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

<style>
.activity-search-enter-active,
.activity-search-leave-active {
  transition:
    opacity var(--speed-fast) ease,
    transform var(--speed-fast) ease;
  transform-origin: top center;
  will-change: opacity, transform;
}

.activity-search-enter-from,
.activity-search-leave-to {
  opacity: 0;
  transform: translateY(calc(-1 * var(--size-1)));
}

.activity-search-enter-to,
.activity-search-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
