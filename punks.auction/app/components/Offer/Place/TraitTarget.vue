<template>
  <OfferPlaceTargetShell>
    <OfferPlaceSearchToolbar
      v-model="searchText"
      :placeholder="placeholder"
      @submit="selectCurrentCriteria"
    >
      <template #actions>
        <button
          type="button"
          class="unstyled criteria-toggle"
          :class="{ ready: canToggleCriteria }"
          :disabled="!canToggleCriteria"
          @click="selectCurrentCriteria"
        >
          Set
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
      :dim-unselected="!!selectedQuery"
      :selected-ids="activeSelectedIds"
      :excluded-ids="excludeIds"
      :disabled="!selectedQuery"
      @toggle="toggleGridId"
    />
  </OfferPlaceTargetShell>
</template>

<script setup lang="ts">
import type { PunkQuery } from '@networked-art/punks-sdk'
import { uniqueSortedIds } from '~/composables/usePlaceOfferDraft'

withDefaults(
  defineProps<{
    size?: number
  }>(),
  { size: 72 },
)

const text = defineModel<string>('text', { required: true })
const selectedText = defineModel<string>('selectedText', { required: true })
const selectedQuery = defineModel<PunkQuery | null>('selectedQuery', {
  required: true,
})
const selectedMatchIds = defineModel<number[]>('selectedMatchIds', {
  required: true,
})
const includeIds = defineModel<number[]>('includeIds', { required: true })
const excludeIds = defineModel<number[]>('excludeIds', { required: true })
const placeholder = 'Try beanie smile, hoodie pipe'
const { searchText, debouncedText, ids, offerQuery } =
  useOfferPlaceTargetSearch(text)
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
const canToggleCriteria = computed(
  () =>
    !!settledCriteriaText.value &&
    liveCriteriaText.value === settledCriteriaText.value &&
    ids.value.length > 0,
)

function selectCurrentCriteria() {
  if (!canToggleCriteria.value) return

  const label = settledCriteriaText.value

  selectedText.value = label
  selectedQuery.value = offerQuery.value
  selectedMatchIds.value = ids.value
  includeIds.value = []
  excludeIds.value = []
}

function toggleGridId(id: number) {
  if (!selectedQuery.value) return

  if (selectedMatchSet.value.has(id)) toggleExcluded(id)
  else toggleIncluded(id)
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
</script>

<style scoped>
.criteria-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  box-sizing: border-box;
  height: var(--form-item-height);
  margin-inline-end: calc(-1 * var(--size-3));
  padding-inline: var(--size-3);
  border-inline-start: var(--border);
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-xs);
  text-transform: uppercase;
}

.criteria-toggle:hover,
.criteria-toggle:focus-visible {
  color: var(--text);
}

.criteria-toggle.ready {
  background: var(--button-primary-background);
  border-color: var(--button-primary-border-color);
  color: var(--button-primary-color);
}

.criteria-toggle.ready:hover,
.criteria-toggle.ready:focus-visible {
  background: var(--button-primary-background-highlight);
  border-color: var(--button-primary-border-color-highlight);
  color: var(--button-primary-color-highlight);
}

.criteria-toggle:disabled {
  color: var(--text-dim);
  cursor: default;
}
</style>
