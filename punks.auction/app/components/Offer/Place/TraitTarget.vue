<template>
  <OfferPlaceTargetShell>
    <OfferPlaceSearchToolbar
      v-model="searchText"
      :placeholder="placeholder"
      @submit="selectCurrentSearch"
    >
      <template #actions>
        <button
          type="button"
          class="unstyled search-select"
          :class="{ ready: canSelectSearch }"
          :disabled="!canSelectSearch"
          @click="selectCurrentSearch"
        >
          Select all
        </button>
      </template>
    </OfferPlaceSearchToolbar>

    <LazyPunkGrid
      class="target-grid"
      :ids="ids"
      :size="size"
      selectable
      scrollable
      outline-hover
      :dim-unselected="!!selectedQuery || includeIds.length > 0"
      :selected-ids="activeSelectedIds"
      :excluded-ids="excludeIds"
      @toggle="toggleGridId"
    />
  </OfferPlaceTargetShell>
</template>

<script setup lang="ts">
import {
  isPunksFilterEmpty,
  type CompiledOfferSlot,
  type PunkQuery,
} from '@networked-art/punks-sdk'
import {
  PLACE_OFFER_MAX_SLOT_IDS,
  type PlaceOfferCriteriaKind,
  uniqueSortedIds,
} from '~/composables/usePlaceOfferDraft'
import { offerSlotCriteriaDisplay } from '~/utils/offerCriteriaText'

withDefaults(
  defineProps<{
    size?: number
  }>(),
  { size: 72 },
)

const text = defineModel<string>('text', { required: true })
const selectedText = defineModel<string>('selectedText', { required: true })
const selectedKind = defineModel<PlaceOfferCriteriaKind>('selectedKind', {
  required: true,
})
const selectedQuery = defineModel<PunkQuery | null>('selectedQuery', {
  required: true,
})
const selectedMatchIds = defineModel<number[]>('selectedMatchIds', {
  required: true,
})
const includeIds = defineModel<number[]>('includeIds', { required: true })
const excludeIds = defineModel<number[]>('excludeIds', { required: true })
const { sdk } = usePunksSdk()
const { searchText, debouncedText, ids, offerQuery, placeholder } =
  useOfferPlaceTargetSearch(text, { enableOwnerSearch: true })
const liveCriteriaText = computed(() => searchText.value.trim())
const settledCriteriaText = computed(() => debouncedText.value.trim())
const selectedMatchSet = computed(() => new Set(selectedMatchIds.value))
const activeSelectedIds = computed(() =>
  uniqueSortedIds(
    [...selectedMatchIds.value, ...includeIds.value].filter(
      (id) => !excludeIds.value.includes(id),
    ),
  ),
)
const canSelectSearch = computed(
  () =>
    !!settledCriteriaText.value &&
    liveCriteriaText.value === settledCriteriaText.value &&
    ids.value.length > 0,
)
const compiledSearchSlot = computed(() => compileSearchSlot())

function toggleGridId(id: number) {
  if (selectedQuery.value && selectedMatchSet.value.has(id)) {
    toggleExcluded(id)
    return
  }

  toggleIncluded(id)
}

function toggleIncluded(id: number) {
  if (includeIds.value.includes(id)) {
    includeIds.value = includeIds.value.filter((current) => current !== id)
    return
  }
  includeIds.value = uniqueSortedIds([...includeIds.value, id])
  excludeIds.value = excludeIds.value.filter((current) => current !== id)
}

function toggleExcluded(id: number) {
  if (excludeIds.value.includes(id)) {
    excludeIds.value = excludeIds.value.filter((current) => current !== id)
    return
  }
  excludeIds.value = uniqueSortedIds([...excludeIds.value, id])
  includeIds.value = includeIds.value.filter((current) => current !== id)
}

function selectCurrentSearch() {
  if (!canSelectSearch.value) return

  const slot = compiledSearchSlot.value
  if (slot && isOfferableCompiledSearchSlot(slot)) {
    selectCompiledSearch(slot)
    return
  }

  selectIdSelection(ids.value)
}

function selectCompiledSearch(slot: CompiledOfferSlot) {
  const display = offerSlotCriteriaDisplay(sdk.value, slot)
  selectedText.value = display.label
  selectedKind.value = display.kind
  selectedQuery.value = offerQuery.value
  selectedMatchIds.value = ids.value
  includeIds.value = []
  excludeIds.value = []
}

function selectIdSelection(nextIds: number[]) {
  selectedText.value = ''
  selectedKind.value = 'single'
  selectedQuery.value = null
  selectedMatchIds.value = []
  includeIds.value = nextIds
  excludeIds.value = []
}

function compileSearchSlot(): CompiledOfferSlot | null {
  try {
    return sdk.value.offers.slot({ query: offerQuery.value })
  } catch {
    return null
  }
}

function isOfferableCompiledSearchSlot(slot: CompiledOfferSlot | null) {
  if (!slot) return false
  if (
    slot.includeIds.length > PLACE_OFFER_MAX_SLOT_IDS ||
    slot.excludeIds.length > PLACE_OFFER_MAX_SLOT_IDS
  ) {
    return false
  }
  return !isPunksFilterEmpty(slot.criteria) || slot.excludeIds.length > 0
}
</script>

<style scoped>
.search-select {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  box-sizing: border-box;
  height: 100%;
  min-height: var(--form-item-height);
  padding-inline: var(--size-3);
  border: 0;
  border-inline-start: var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-xs);
  line-height: 1;
  text-transform: uppercase;
}

.search-select:hover,
.search-select:focus-visible {
  color: var(--text);
}

.search-select.ready {
  background: var(--button-primary-background);
  border-color: var(--button-primary-border-color);
  color: var(--button-primary-color);
}

.search-select.ready:hover,
.search-select.ready:focus-visible {
  background: var(--button-primary-background-highlight);
  border-color: var(--button-primary-border-color-highlight);
  color: var(--button-primary-color-highlight);
}

.search-select:disabled {
  color: var(--text-dim);
  cursor: default;
}
</style>
