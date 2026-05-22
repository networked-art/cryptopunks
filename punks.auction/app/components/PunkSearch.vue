<template>
  <section class="punk-search">
    <header class="search-bar">
      <FormInputGroup class="search-group">
        <div class="search-field">
          <input
            ref="searchInput"
            v-model="text"
            type="search"
            class="search-input"
            :placeholder="placeholder"
            @keydown.enter="onEnter"
          />
          <span class="search-actions">
            <span class="muted result-count">
              {{ counts.filtered.toLocaleString()
              }}<span class="result-total">
                / {{ counts.total.toLocaleString() }}</span
              >
            </span>
            <button
              v-if="text"
              type="button"
              class="unstyled clear-search"
              aria-label="Clear search"
              @click="clearSearch"
            >
              <Icon name="lucide:x" />
            </button>
          </span>
        </div>
        <ClientOnly>
          <Button
            v-if="ownerHandle"
            :to="`/profile/${ownerHandle}`"
          >
            View profile
          </Button>
        </ClientOnly>
      </FormInputGroup>
    </header>

    <PunkGrid
      :ids="ids"
      :size="size"
    />
  </section>
</template>

<script setup lang="ts">
import { onKeyStroke, refDebounced } from '@vueuse/core'
import { isAddress, type Address } from 'viem'
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
const searchInput = useTemplateRef<HTMLInputElement>('searchInput')

/// `/` is a global shortcut for "focus the search". Skip when the user is
/// already typing into an editable element so the slash lands as a character.
onKeyStroke('/', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const target = e.target as HTMLElement | null
  if (
    target?.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
    return
  e.preventDefault()
  searchInput.value?.focus()
  searchInput.value?.select()
})

/// Debounce text inputs so the input field stays responsive while the
/// search + grid re-render only run after the user pauses typing.
const debouncedText = refDebounced(text, 80)

/// The input is the single source of truth — URL is a derived persistence
/// layer. We remember the last value we wrote so the inbound URL watcher can
/// distinguish echoes of our own writes from genuine external navigations.
let lastSyncedQ = typeof route.query.q === 'string' ? route.query.q : ''

watch(debouncedText, (next) => {
  const q = next.trim()
  if (q === lastSyncedQ) return
  lastSyncedQ = q
  const { q: _omit, ...rest } = route.query
  router.replace({ query: q ? { ...rest, q } : rest })
})

watch(
  () => route.query.q,
  (q) => {
    const next = typeof q === 'string' ? q : ''
    if (next === lastSyncedQ) return
    lastSyncedQ = next
    text.value = next
  },
)

const placeholder = computed(
  () => `Try hoodie, 2 colors, vault.eth, #1234`,
)

/// Owner-search mode: when the *entire* trimmed input parses as an address or
/// an ENS-like name, we treat it as "show this owner's punks" instead of
/// running a trait-text search.
const ENS_HANDLE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i
function detectOwnerHandle(input: string): string | null {
  const v = input.trim()
  if (!v) return null
  if (isAddress(v)) return v
  if (ENS_HANDLE.test(v) && /\.eth$/i.test(v)) return v
  return null
}

const ownerHandle = computed(() => detectOwnerHandle(debouncedText.value))

const ensIdentifier = computed(() => {
  const h = ownerHandle.value
  if (!h || isAddress(h)) return undefined
  return h
})
const { data: ensData } = useEns(ensIdentifier)

const ownerAddress = computed<Address | undefined>(() => {
  const h = ownerHandle.value
  if (!h) return undefined
  if (isAddress(h)) return h as Address
  const resolved = ensData.value?.address
  return resolved && isAddress(resolved) ? (resolved as Address) : undefined
})

const { ids: ownedIds, loading: ownedLoading } = useOwnedPunks(
  () => ownerAddress.value,
)

/// `#rrggbb` (or `#rrggbbaa`) tokens translate into a `colors.required`
/// filter. The remaining free text is handed to the search.
const HEX_COLOR_TOKEN = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/g
const parsedText = computed(() => {
  const raw = debouncedText.value.trim()
  if (!raw) return { text: undefined, colors: undefined }
  const colors = raw.match(HEX_COLOR_TOKEN)
  const remaining = raw
    .replace(HEX_COLOR_TOKEN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    text: remaining || undefined,
    colors: colors?.length ? colors : undefined,
  }
})

const query = computed<PunkQuery>(() => {
  const ownerMode = !!ownerHandle.value

  let ids: Iterable<number> | undefined = props.baseQuery?.ids
  if (ownerMode) {
    /// Hold the grid empty while the handle is still resolving or the owned
    /// list is in flight.
    if (!ownerAddress.value || ownedLoading.value) {
      ids = []
    } else {
      ids = intersectIds(ids, ownedIds.value)
    }
  }

  return {
    ...props.baseQuery,
    ids,
    /// In owner mode the input is a handle, not a trait term.
    text: ownerMode ? undefined : parsedText.value.text,
    colors:
      ownerMode || !parsedText.value.colors
        ? undefined
        : { required: parsedText.value.colors },
    sort: 'id',
  }
})

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
  const handle = detectOwnerHandle(text.value)
  if (handle) {
    router.push(`/profile/${handle}`)
    return
  }
  const id = Number(text.value.trim())
  if (Number.isInteger(id) && id >= 0 && id <= 9999) {
    router.push(`/punks/${id}`)
    return
  }
  if (ids.value.length === 1) {
    router.push(`/punks/${ids.value[0]}`)
  }
}

function clearSearch() {
  text.value = ''
  searchInput.value?.focus()
}

function intersectIds(
  baseIds: Iterable<number> | undefined,
  ownedIds: readonly number[],
) {
  if (!baseIds) return ownedIds
  const owned = new Set(ownedIds)
  return Array.from(baseIds).filter((id) => owned.has(id))
}
</script>

<style scoped>
.punk-search {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  width: 100%;
}

/* Keep the search bar visible below the (also-sticky) site header while
   the window scrolls through the virtualized grid below. Matches the
   header's `.container` bounds so the two stay vertically aligned. */
.search-bar {
  position: sticky;
  top: calc(56px + var(--border-width));
  z-index: var(--z-index-ui);
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-2);
  align-items: center;
  width: 100%;
  max-width: 1200px;
  box-sizing: border-box;
  margin: 0 auto;
  padding: var(--size-4);
  font-size: 16px;
}

.search-group {
  flex: 1 1 240px;
  min-width: 0;
}

.search-field {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}

.search-input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  min-height: 48px;
  padding-inline-end: 176px;
  font-size: 16px;
}

.search-input::-webkit-search-cancel-button {
  display: none;
  -webkit-appearance: none;
  appearance: none;
}

.search-actions {
  position: absolute;
  top: 50%;
  inset-inline-end: var(--size-3);
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--size-2);
  transform: translateY(-50%);
}

.result-count {
  font-size: 14px;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
}

.clear-search {
  width: 24px;
  height: 24px;
  min-inline-size: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
}

.clear-search:hover,
.clear-search:focus-visible {
  color: var(--text);
}

.clear-search :deep(.icon) {
  width: 16px;
  height: 16px;
}

@media (max-width: 640px) {
  .search-input {
    padding-inline-end: 104px;
  }

  .result-total {
    display: none;
  }
}
</style>
