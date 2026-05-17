<template>
  <section class="punk-search">
    <header class="search-bar">
      <input
        v-model="text"
        type="search"
        class="search-input"
        :placeholder="`Search ${counts.total.toLocaleString()} punks by id, type, or trait…`"
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
      <span class="muted result-count"
        >{{ counts.filtered.toLocaleString() }} /
        {{ counts.total.toLocaleString() }}</span
      >
    </header>

    <details
      v-if="!hideFilters"
      class="filters"
      :open="filtersOpen"
    >
      <summary>Filters · {{ activeFilterCount }} active</summary>
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
              v-for="h in headVariants"
              :key="h"
              type="button"
              class="chip"
              :class="{ active: selectedHeads.has(h) }"
              @click="toggle(selectedHeads, h)"
            >
              {{ h }}
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
    </details>

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
    filtersOpen?: boolean
    baseQuery?: PunkQuery
  }>(),
  { size: 56, hideFilters: false, filtersOpen: false },
)

const offline = usePunksOffline()
const router = useRouter()

const text = ref('')
const sort = ref<PunkQuerySort>('id')
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

function toggle(set: Set<string>, value: string) {
  if (set.has(value)) set.delete(value)
  else set.add(value)
}

const query = computed<PunkQuery>(() => {
  const required = parseList(requiredTraitsText.value)
  const forbidden = parseList(forbiddenTraitsText.value)
  return {
    ...props.baseQuery,
    text: text.value.trim() || undefined,
    type: selectedTypes.size ? [...selectedTypes] : undefined,
    head: selectedHeads.size ? [...selectedHeads] : undefined,
    attributes:
      required.length || forbidden.length ? { required, forbidden } : undefined,
    sort: sort.value,
    limit: 5000,
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
  flex: 1;
  gap: var(--space-3);
  min-height: 0;
}

.search-bar {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.search-input {
  flex: 1;
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

.filters {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-3);
  background: var(--bg-elevated);
}

.filters summary {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-3);
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
