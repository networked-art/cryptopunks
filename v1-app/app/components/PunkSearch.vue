<template>
  <section class="punk-search">
    <header class="search-bar">
      <FormInputGroup class="search-group">
        <input
          v-model="text"
          type="search"
          class="search-input"
          :placeholder="placeholder"
          @keydown.enter="onEnter"
        />
        <ClientOnly>
          <CollectionBidForm
            v-if="address"
            :query="query"
          />
        </ClientOnly>
      </FormInputGroup>
      <span class="muted result-count">
        {{ counts.filtered.toLocaleString()
        }}<span class="result-total">
          / {{ counts.total.toLocaleString() }}</span>
      </span>
    </header>

    <PunkGrid
      :ids="ids"
      :size="size"
    />
  </section>
</template>

<script setup lang="ts">
import { useConnection } from '@wagmi/vue'
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
const { address } = useConnection()
const LISTING_QUALIFIER =
  /(^|[\s,])(?:listings?|listed|for\s+sale|on\s+sale)(?=$|[\s,])/gi

const text = ref(typeof route.query.q === 'string' ? route.query.q : '')

/// Debounce text inputs so the input field stays responsive while the
/// search + grid re-render only run after the user pauses typing.
const debouncedText = useDebounced(text, 80)
const listingQualifier = computed(() =>
  extractListingQualifier(debouncedText.value),
)
const listingsOnly = computed(() => listingQualifier.value.listingsOnly)
const { ids: listingIds } = useListedPunks(() => listingsOnly.value)

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
/// `#<id>`, `-<id>`, and the app-level `listings` qualifier.
const placeholder = computed(
  () => `Try hoodie, listings, 2 colors, albino skin, #1234`,
)

/// `#rrggbb` (or `#rrggbbaa`) tokens in the search text translate into a
/// `colors.required` filter. The SDK's text grammar doesn't recognize hex
/// colors yet, so we strip them here before handing the remaining free
/// text to the search. Anything that doesn't lex as a valid hex falls
/// through unchanged and gets treated as a normal text term.
const HEX_COLOR_TOKEN = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/g
const parsedText = computed(() => {
  const raw = listingQualifier.value.text.trim()
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

const query = computed<PunkQuery>(() => ({
  ...props.baseQuery,
  ids: listingsOnly.value
    ? intersectIds(props.baseQuery?.ids, listingIds.value)
    : props.baseQuery?.ids,
  text: parsedText.value.text,
  colors: parsedText.value.colors
    ? { required: parsedText.value.colors }
    : undefined,
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

function extractListingQualifier(input: string) {
  let listingsOnly = false
  const text = input
    .replace(LISTING_QUALIFIER, (match, prefix: string) => {
      listingsOnly = true
      return prefix ? prefix : ''
    })
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/(^[\s,]+|[\s,]+$)/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return { text, listingsOnly }
}

function intersectIds(
  baseIds: Iterable<number> | undefined,
  listingIds: readonly number[],
) {
  if (!baseIds) return listingIds

  const listed = new Set(listingIds)
  return Array.from(baseIds).filter((id) => listed.has(id))
}
</script>

<style scoped>
.punk-search {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

/* Keep the search bar visible below the (also-sticky) site header while
   the window scrolls through the virtualized grid below. */
.search-bar {
  position: sticky;
  top: 56px;
  z-index: var(--z-index-ui);
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-2);
  align-items: center;
  width: 100%;
  padding: var(--size-3) 0;
  background: var(--bg);
}

.search-group {
  flex: 1 1 240px;
  min-width: 0;
}

.search-input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
}

.result-count {
  font-size: 12px;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .result-total {
    display: none;
  }
}
</style>
