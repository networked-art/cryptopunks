<template>
  <section class="punk-search">
    <header class="search-bar">
      <input
        v-model="text"
        type="search"
        class="search-input"
        :placeholder="placeholder"
        @keydown.enter="onEnter"
      />
      <span class="muted result-count"
        >{{ counts.filtered.toLocaleString() }} /
        {{ counts.total.toLocaleString() }}</span
      >
    </header>

    <PunkGrid
      :ids="ids"
      :size="size"
    />
  </section>
</template>

<script setup lang="ts">
import type { PunkQuery } from '@networked-art/punks-sdk'

const props = withDefaults(
  defineProps<{
    size?: number
    baseQuery?: PunkQuery
  }>(),
  { size: 56 },
)

const offline = usePunksOffline()
const route = useRoute()
const router = useRouter()

const text = ref(typeof route.query.q === 'string' ? route.query.q : '')

/// Debounce text inputs so the input field stays responsive while the
/// search + grid re-render only run after the user pauses typing.
const debouncedText = useDebounced(text, 80)

/// The input is the single source of truth — URL is a derived persistence
/// layer. We remember the last value we wrote to (or saw in) the URL so the
/// inbound URL watcher can distinguish echoes of our own writes from genuine
/// external navigations. Without this, a debounced write that lands a tick
/// late would clobber whatever the user has typed in the meantime.
let lastSyncedQ = typeof route.query.q === 'string' ? route.query.q : ''

/// Persist the debounced query into `?q=…` so the search survives reloads,
/// is shareable, and back/forward navigation works. `router.replace` so we
/// don't litter history with one entry per keystroke.
watch(debouncedText, (next) => {
  const q = next.trim()
  if (q === lastSyncedQ) return
  lastSyncedQ = q
  const { q: _omit, ...rest } = route.query
  router.replace({ query: q ? { ...rest, q } : rest })
})

/// Pick up external query changes (back/forward, `/?q=hoodie` link from
/// another page) and reflect them in the input. Echoes of our own debounced
/// writes match `lastSyncedQ` and are ignored.
watch(
  () => route.query.q,
  (q) => {
    const next = typeof q === 'string' ? q : ''
    if (next === lastSyncedQ) return
    lastSyncedQ = next
    text.value = next
  },
)

/// Search-text capabilities are surfaced in the placeholder so users discover
/// the shorthand without reading docs. See `@networked-art/punks-sdk`'s text
/// language: trait names, `<n> colors / attributes / pixels`, `<tone> skin`,
/// `#<id>`, and `-<id>` all compile into the same filter.
const placeholder = computed(
  () =>
    `Search ${counts.value.total.toLocaleString()} punks — try hoodie, 2 colors, albino skin, #1234, -1001`,
)

const query = computed<PunkQuery>(() => ({
  ...props.baseQuery,
  text: debouncedText.value.trim() || undefined,
  sort: 'id',
}))

const ids = computed(() => {
  try {
    return offline.search(query.value)
  } catch {
    return []
  }
})

const counts = computed(() => ({
  total: offline.dataset.count(props.baseQuery),
  filtered: ids.value.length,
}))

function onEnter() {
  const id = Number(text.value.trim())
  if (Number.isInteger(id) && id >= 0 && id <= 9999) {
    router.push(`/punk/${id}`)
    return
  }
  if (ids.value.length === 1) {
    router.push(`/punk/${ids.value[0]}`)
  }
}
</script>

<style scoped>
.punk-search {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* Keep the search bar visible below the (also-sticky) site header while
   the window scrolls through the virtualized grid below. */
.search-bar {
  position: sticky;
  top: 56px;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  width: 100%;
  padding: var(--space-3) 0;
  background: var(--bg);
}

.search-input {
  flex: 1 1 240px;
  min-width: 0;
  width: 100%;
}

.result-count {
  font-size: 12px;
  white-space: nowrap;
}
</style>
