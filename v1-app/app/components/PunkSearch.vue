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
      <select
        v-model="sort"
        class="sort"
      >
        <option value="id">Id ↑</option>
        <option value="id-desc">Id ↓</option>
        <option value="rarity">Rarest</option>
        <option value="rarity-desc">Most common</option>
        <option value="pixelCount-desc">Most pixels</option>
        <option value="colorCount-desc">Most colors</option>
      </select>
      <button
        v-if="!hideFilters"
        type="button"
        class="advanced-toggle"
        :class="{ active: showAdvanced }"
        :aria-expanded="showAdvanced"
        @click="showAdvanced = !showAdvanced"
      >
        Advanced{{ activeFilterCount ? ` · ${activeFilterCount}` : '' }}
      </button>
      <span class="muted result-count"
        >{{ counts.filtered.toLocaleString() }} /
        {{ counts.total.toLocaleString() }}</span
      >
    </header>

    <div
      v-if="!hideFilters && showAdvanced"
      class="filters"
    >
      <div class="filter-grid">
        <div>
          <label class="filter-label">Type</label>
          <div class="chips">
            <button
              v-for="t in punkTypes"
              :key="t"
              type="button"
              class="chip"
              :class="{ active: selectedTypes.has(t) }"
              @click="toggle(selectedTypes, t)"
            >
              {{ t }}
            </button>
          </div>
        </div>
        <div>
          <label class="filter-label">Head variant</label>
          <div class="chips">
            <button
              v-for="variant in headVariants"
              :key="variant"
              type="button"
              class="chip"
              :class="{ active: selectedHeads.has(variant) }"
              @click="toggle(selectedHeads, variant)"
            >
              {{ variant }}
            </button>
          </div>
        </div>
        <div class="full">
          <label class="filter-label">Required traits</label>
          <input
            v-model="requiredTraitsText"
            type="text"
            placeholder="hoodie, 3d glasses, …"
          />
        </div>
        <div class="full">
          <label class="filter-label">Forbidden traits</label>
          <input
            v-model="forbiddenTraitsText"
            type="text"
            placeholder="cigarette, …"
          />
        </div>
      </div>
    </div>

    <PunkGrid
      :ids="ids"
      :size="size"
    />
  </section>
</template>

<script setup lang="ts">
import { PunkType, HeadVariant } from '@networked-art/punks-sdk'
import type { PunkQuery, PunkQuerySort } from '@networked-art/punks-sdk'

const props = withDefaults(
  defineProps<{
    size?: number
    hideFilters?: boolean
    baseQuery?: PunkQuery
  }>(),
  { size: 56, hideFilters: false },
)

const offline = usePunksOffline()
const router = useRouter()

const text = ref('')
const sort = ref<PunkQuerySort>('id')
const showAdvanced = ref(false)
const punkTypes = Object.keys(PunkType).filter((k) =>
  isNaN(Number(k)),
) as string[]
const headVariants = Object.keys(HeadVariant).filter((k) =>
  isNaN(Number(k)),
) as string[]
const selectedTypes = reactive(new Set<string>())
const selectedHeads = reactive(new Set<string>())
const requiredTraitsText = ref('')
const forbiddenTraitsText = ref('')

/// Debounce text inputs so the input field stays responsive while the
/// search + grid re-render only run after the user pauses typing. Discrete
/// controls (chips, sort) stay immediate.
const debouncedText = useDebounced(text, 80)
const debouncedRequired = useDebounced(requiredTraitsText, 80)
const debouncedForbidden = useDebounced(forbiddenTraitsText, 80)

/// Search-text capabilities are surfaced in the placeholder so users discover
/// the shorthand without reading docs. See `@networked-art/punks-sdk`'s text
/// language: trait names, `<n> colors / attributes / pixels`, `<tone> skin`,
/// `#<id>`, and `-<id>` all compile into the same filter.
const placeholder = computed(
  () =>
    `Search ${counts.value.total.toLocaleString()} punks — try hoodie, 2 colors, albino skin, #1234, -1001`,
)

function toggle(set: Set<string>, value: string) {
  if (set.has(value)) set.delete(value)
  else set.add(value)
}

const query = computed<PunkQuery>(() => {
  const required = parseList(debouncedRequired.value)
  const forbidden = parseList(debouncedForbidden.value)
  return {
    ...props.baseQuery,
    text: debouncedText.value.trim() || undefined,
    type: selectedTypes.size ? [...selectedTypes] : undefined,
    head: selectedHeads.size ? [...selectedHeads] : undefined,
    attributes:
      required.length || forbidden.length ? { required, forbidden } : undefined,
    sort: sort.value,
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

const activeFilterCount = computed(() => {
  let n = 0
  if (selectedTypes.size) n++
  if (selectedHeads.size) n++
  if (requiredTraitsText.value.trim()) n++
  if (forbiddenTraitsText.value.trim()) n++
  return n
})

function parseList(input: string) {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function onEnter() {
  const id = Number(text.value.trim())
  if (Number.isInteger(id) && id >= 0 && id <= 9999) {
    router.push(`/punk/${id}`)
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

.sort {
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
}

.result-count {
  font-size: 12px;
  white-space: nowrap;
}

.advanced-toggle {
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
}

.advanced-toggle.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg);
}

.filters {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-3);
  background: var(--bg-elevated);
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
}

.filter-grid .full {
  grid-column: 1 / -1;
}

.filter-label {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  margin-bottom: var(--space-2);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chip {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 99px;
}

.chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg);
}
</style>
