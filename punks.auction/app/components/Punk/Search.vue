<template>
  <section class="punk-search">
    <header class="search-bar">
      <FormInputGroup class="search-group">
        <div
          class="search-field"
          :class="{ 'with-profile-link': ownerHandle, 'has-text': text }"
          :style="{ '--search-underline-width': underlineWidth }"
        >
          <input
            ref="searchInput"
            v-model="text"
            type="search"
            class="search-input"
            :placeholder="placeholder"
            @keydown.enter="onEnter"
          />
          <span
            ref="underlineMeasure"
            class="search-underline-measure"
            aria-hidden="true"
            >{{ underlineText }}</span
          >
          <kbd
            class="search-shortcut"
            aria-hidden="true"
            title="Press / to focus search"
            >/</kbd
          >
          <span class="search-actions">
            <span class="muted result-count">
              <template v-if="counts.filtered === counts.total">
                {{ counts.total.toLocaleString() }}
              </template>
              <template v-else>
                {{ counts.filtered.toLocaleString()
                }}<span class="result-total">
                  / {{ counts.total.toLocaleString() }}</span
                >
              </template>
            </span>
            <FormCheckbox
              :model-value="listedActive"
              class="for-sale-toggle"
              aria-label="Sort by listed price"
              @update:model-value="toggleListed = !toggleListed"
            />
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
            class="profile-link"
            :to="`/profile/${ownerHandle}`"
          >
            View profile
          </Button>
        </ClientOnly>
      </FormInputGroup>
    </header>

    <LazyPunkGrid
      :ids="ids"
      :size="size"
    />
  </section>
</template>

<script setup lang="ts">
import { onKeyStroke, refDebounced, useMediaQuery } from '@vueuse/core'
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
const { marketStateLoaded, marketStateSets, listedPrices } =
  usePunkMarketState()

const LISTED_QUALIFIER =
  /(^|[\s,])(?:for\s+sale|on\s+sale|list(?:ed|ing|ings)?|sale)(?=$|[\s,])/gi
const BID_QUALIFIER =
  /(^|[\s,])(?:has\s+bids?|with\s+bids?|active\s+bids?|bids?)(?=$|[\s,])/gi
const LEGACY_WRAPPED_QUALIFIER =
  /(^|[\s,])(?:legacy\s+wrap(?:ped|per)?|wrap(?:ped|per)?\s+legacy)(?=$|[\s,])/gi
const MODERN_WRAPPED_QUALIFIER =
  /(^|[\s,])(?:modern\s+wrap(?:ped|per)?|wrap(?:ped|per)?\s+modern)(?=$|[\s,])/gi
const WRAPPED_QUALIFIER = /(^|[\s,])(?:wrap(?:ped|per)?)(?=$|[\s,])/gi

const text = ref(typeof route.query.q === 'string' ? route.query.q : '')
const toggleListed = ref(route.query.sale === '1')
const searchInput = useTemplateRef<HTMLInputElement>('searchInput')
const underlineMeasure = useTemplateRef<HTMLElement>('underlineMeasure')

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
const qualifiers = computed(() => extractQualifiers(debouncedText.value))
const listedActive = computed(
  () => qualifiers.value.listed || toggleListed.value,
)

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

let lastSyncedSale = route.query.sale === '1'

watch(toggleListed, (on) => {
  if (on === lastSyncedSale) return
  lastSyncedSale = on
  const { sale: _omit, ...rest } = route.query
  router.replace({ query: on ? { ...rest, sale: '1' } : rest })
})

watch(
  () => route.query.sale,
  (s) => {
    const next = s === '1'
    if (next === lastSyncedSale) return
    lastSyncedSale = next
    toggleListed.value = next
  },
)

const isMobileSearch = useMediaQuery('(max-width: 640px)')
const placeholder = computed(() =>
  isMobileSearch.value
    ? 'HOODIE, 2 COLORS, ...'
    : 'Try hoodie, 2 colors, vault.eth, #1234',
)
const underlineText = ref(text.value)
const underlineWidthPx = ref(0)
const underlineWidth = computed(() => `${underlineWidthPx.value}px`)

function measureUnderline() {
  underlineWidthPx.value =
    underlineMeasure.value?.getBoundingClientRect().width ?? 0
}

function syncUnderline() {
  underlineText.value = text.value
  nextTick(measureUnderline)
}

watch(text, () => nextTick(syncUnderline))
onMounted(() => nextTick(syncUnderline))

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
  const raw = qualifiers.value.text.trim()
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

  if (marketStateLoaded.value) {
    if (qualifiers.value.listed) {
      ids = intersectIds(ids, marketStateSets.value.listed)
    }
    if (qualifiers.value.activeBids) {
      ids = intersectIds(ids, marketStateSets.value.active_bids)
    }
    if (qualifiers.value.legacyWrapped) {
      ids = intersectIds(ids, marketStateSets.value.legacy_wrapped)
    }
    if (qualifiers.value.modernWrapped) {
      ids = intersectIds(ids, marketStateSets.value.wrapped)
    }
    if (qualifiers.value.wrapped) {
      ids = intersectIds(
        ids,
        unionIds(
          marketStateSets.value.wrapped,
          marketStateSets.value.legacy_wrapped,
        ),
      )
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
  let result: number[]
  try {
    result = offline.search(query.value)
  } catch {
    return []
  }
  if (!listedActive.value || !marketStateLoaded.value) return result
  const prices = listedPrices.value
  return [...result].sort(
    (a, b) =>
      (prices.get(a) ?? Number.POSITIVE_INFINITY) -
      (prices.get(b) ?? Number.POSITIVE_INFINITY),
  )
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

function extractQualifiers(input: string) {
  let listed = false
  let activeBids = false
  let wrapped = false
  let legacyWrapped = false
  let modernWrapped = false

  const cleaned = input
    .replace(LEGACY_WRAPPED_QUALIFIER, (_match, prefix: string) => {
      legacyWrapped = true
      return prefix || ''
    })
    .replace(MODERN_WRAPPED_QUALIFIER, (_match, prefix: string) => {
      modernWrapped = true
      return prefix || ''
    })
    .replace(LISTED_QUALIFIER, (_match, prefix: string) => {
      listed = true
      return prefix || ''
    })
    .replace(BID_QUALIFIER, (_match, prefix: string) => {
      activeBids = true
      return prefix || ''
    })
    .replace(WRAPPED_QUALIFIER, (_match, prefix: string) => {
      wrapped = true
      return prefix || ''
    })
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/(^[\s,]+|[\s,]+$)/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    text: cleaned,
    listed,
    activeBids,
    wrapped,
    legacyWrapped,
    modernWrapped,
  }
}

function intersectIds(
  baseIds: Iterable<number> | undefined,
  filterIds: Iterable<number>,
) {
  if (!baseIds) return Array.from(filterIds)
  const filter = new Set(filterIds)
  return Array.from(baseIds).filter((id) => filter.has(id))
}

function unionIds(...groups: Iterable<number>[]) {
  return new Set(groups.flatMap((group) => Array.from(group)))
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
  max-width: 720px;
  box-sizing: border-box;
  margin: 0 auto;
  margin-top: var(--size-2);
  padding: var(--size-4);
  font-size: var(--font-sm);
  text-transform: uppercase;
}

.search-group {
  --search-control-height: calc(var(--form-item-height) + var(--size-4));

  flex: 1 1 240px;
  min-width: 0;
  box-shadow: var(--shadow-2, 0 10px 24px rgb(10 10 18 / 12%));
  transition: box-shadow 180ms ease;
}

.search-group:focus-within {
  box-shadow: var(--shadow-3, 0 18px 42px rgb(10 10 18 / 28%));
}

.search-field {
  --search-actions-width: 176px;

  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  z-index: 1;
}

.search-field::after {
  content: '';
  position: absolute;
  inset-inline-start: var(--ui-padding-inline);
  top: calc(50% + 1em);
  z-index: 3;
  width: 0;
  height: 2px;
  background: var(--accent);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity var(--speed),
    width 80ms linear;
}

.search-underline-measure {
  position: absolute;
  display: inline-block;
  inset-inline-start: var(--ui-padding-inline);
  top: calc(50% + 1em);
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
  white-space: pre;
  font-family: var(--ui-font-family);
  font-size: var(--font-sm);
  font-weight: var(--ui-font-weight);
  letter-spacing: var(--ui-letter-spacing);
  line-height: var(--ui-line-height);
  text-transform: uppercase;
}

.search-field:hover,
.search-field:focus-within {
  z-index: 2;
}

.search-field.has-text:focus-within::after {
  width: min(
    var(--search-underline-width, 0ch),
    calc(100% - var(--ui-padding-inline) - var(--search-actions-width))
  );
  opacity: 1;
}

.search-input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  min-height: var(--search-control-height);
  padding-inline-start: calc(var(--ui-padding-inline) + 22px);
  padding-inline-end: 176px;
  border-radius: 0 !important;
  font-size: var(--font-sm);
  text-transform: uppercase;
  box-shadow: none;
}

.search-field:focus-within .search-input,
.search-field.has-text .search-input {
  padding-inline-start: var(--ui-padding-inline);
}

.search-input:hover,
.search-input:active,
.search-input:focus,
.search-input:focus-visible,
.search-input.active {
  outline: none;
  box-shadow: none;
}

.search-field:focus-within .search-input {
  background: white;
}

.search-field.with-profile-link .search-input {
  border-start-end-radius: 0 !important;
  border-end-end-radius: 0 !important;
}

.search-group :deep(.profile-link.button) {
  border-start-start-radius: 0 !important;
  border-end-start-radius: 0 !important;
  border-radius: 0 !important;
  block-size: var(--search-control-height);
  min-block-size: var(--search-control-height);
  box-sizing: border-box;
  font-size: var(--font-sm);
  box-shadow: none;
  white-space: nowrap;
}

.search-group :deep(.profile-link.button:is(:hover, :active, :focus, .active)) {
  outline: none;
  box-shadow: none;
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
  gap: var(--size-0);
  transform: translateY(-50%);
}

.result-count {
  font-size: var(--font-sm);
  line-height: var(--line-height);
  white-space: nowrap;
  pointer-events: none;
  padding-inline: var(--size-1);
}

.search-shortcut {
  position: absolute;
  top: 50%;
  inset-inline-start: var(--ui-padding-inline);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-inline-size: 18px;
  height: 18px;
  padding-inline: var(--size-1);
  border: var(--border-width) solid var(--border);
  border-radius: 3px;
  color: var(--text-muted);
  background: var(--surface-muted, transparent);
  font-family: var(--ui-font-family);
  font-size: 11px;
  line-height: 1;
  text-transform: none;
  pointer-events: none;
  transform: translateY(-50%);
  transition: opacity var(--speed);
}

.search-field.has-text .search-shortcut,
.search-field:focus-within .search-shortcut {
  display: none;
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

.for-sale-toggle.form-checkbox {
  /* Override the layer's checkbox tokens: square corners + listed-punk
     colourway, with the unchecked state shown at half opacity. */
  --border-radius: 0;
  --primary: var(--punk-bg-listed);

  gap: 0;
  margin-inline: var(--size-2);
}

.for-sale-toggle :deep(.form-checkbox-button) {
  inline-size: 16px;
  block-size: 16px;
  border: 0;
  background: var(--primary);
  opacity: 0.5;
  transition: opacity var(--speed);
}

.for-sale-toggle:hover :deep(.form-checkbox-button),
.for-sale-toggle:focus-within :deep(.form-checkbox-button) {
  opacity: 0.75;
}

.for-sale-toggle :deep(.form-checkbox-button[data-state='checked']),
.for-sale-toggle:hover :deep(.form-checkbox-button[data-state='checked']),
.for-sale-toggle:focus-within
  :deep(.form-checkbox-button[data-state='checked']) {
  opacity: 1;
}

.for-sale-toggle :deep(.form-checkbox-indicator .icon) {
  font-size: 12px;
}

@media (max-width: 640px) {
  .search-bar {
    padding-inline: 0;
  }

  .search-field {
    --search-actions-width: 104px;
  }

  .search-input {
    padding-inline-end: 104px;
  }

  .result-total {
    display: none;
  }
}
</style>
