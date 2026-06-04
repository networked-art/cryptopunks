<template>
  <ClientOnly>
    <div
      v-if="ownAccount"
      class="watchlist-tab"
    >
      <section class="watchlist-section">
        <h2 class="section-title eyebrow">Watchlist</h2>

        <template v-if="apiConfigured && isAuthenticated">
          <p class="muted setting-status">
            Email alerts for the Punks and searches you follow on networked.art.
          </p>

          <p
            v-if="watchPending && !watchItems.length"
            class="muted"
          >
            Loading…
          </p>
          <p
            v-else-if="!watchItems.length"
            class="muted empty"
          >
            You're not watching anything yet. Use the star on a Punk, or “Alert
            me” on a search, to start.
          </p>
          <ul
            v-else
            class="watch-items"
          >
            <li
              v-for="item in watchItems"
              :key="item.id"
              class="watch-item"
            >
              <div class="watch-item-text">
                <p class="watch-item-title">
                  {{ item.label || item.description }}
                </p>
                <p class="watch-item-events muted">
                  {{ eventSummary(item.events) }}
                </p>
              </div>
              <Button
                class="icon-button"
                title="Remove alert"
                @click="confirmRemove(item)"
              >
                <Icon name="lucide:x" />
              </Button>
            </li>
          </ul>

          <p
            v-if="watchError"
            class="error"
          >
            {{ watchError }}
          </p>
        </template>

        <p
          v-else
          class="muted setting-status"
        >
          <template v-if="apiConfigured">
            Sync your account on the
            <NuxtLink :to="`/profile/${handle}/settings`">Settings</NuxtLink>
            tab to manage your watchlist here.
          </template>
          <template v-else> Watchlists aren't available right now. </template>
        </p>
      </section>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { isApiConfigured } from '~/utils/api'
import type { WatchItem } from '~/composables/useWatchlist'

useOwnProfileGuard()

const route = useRoute()
const handle = computed(() => String(route.params.handle))

const { ownAccount } = useProfileContext()

const apiConfigured = isApiConfigured()

const na = useNetworkedArt()
const { isAuthenticated } = na

const {
  items: watchItems,
  pending: watchPending,
  error: watchError,
  load: loadWatchlist,
  remove: removeWatch,
  clear: clearWatchlist,
} = useWatchlist()

const { confirm } = useConfirm()

// Same event vocabulary the watch flows write (WatchStar / SearchAlert).
const EVENT_LABELS: Record<string, string> = {
  listed: 'Listed for sale',
  new_lot: 'Listed for auction',
  auction_start: 'Auction starts',
  sold: 'Sold',
}
const eventSummary = (events: string[]) =>
  events.map((event) => EVENT_LABELS[event] ?? event).join(' · ')

// Confirm before dropping an alert — removal is a one-click, irreversible call.
const confirmRemove = async (item: WatchItem) => {
  const confirmed = await confirm({
    title: 'Remove this alert?',
    description: `Stop watching “${item.label || item.description}”. You can add it again any time.`,
    okText: 'Remove',
    cancelText: 'Cancel',
  })
  if (confirmed) await removeWatch(item.id)
}

// Resolve the link on mount, then keep the watchlist in step with auth state:
// load on sign-in, clear on sign-out (or a token the API rejected).
onMounted(() => {
  if (apiConfigured && !na.ready.value && !na.pending.value) void na.refresh()
})
watch(
  isAuthenticated,
  (authed) => {
    if (authed) loadWatchlist()
    else clearWatchlist()
  },
  { immediate: true },
)
</script>

<style scoped>
.watchlist-tab {
  display: flex;
  flex-direction: column;
  gap: var(--size-6);
  max-width: 560px;
}

.watchlist-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.section-title {
  margin: 0;
}

.setting-status {
  margin: 0;
  font-size: var(--font-md);
}

.empty {
  padding: var(--size-4);
  border: var(--border);
  text-align: center;
  font-size: var(--font-sm);
}

.watch-items {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.watch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-3);
  padding: var(--size-2) var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.watch-item-text {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
}

.watch-item-title {
  margin: 0;
  font-size: var(--font-sm);
}

.watch-item-events {
  margin: 0;
  font-size: var(--font-xs);
}

.error {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--accent);
}
</style>
