<template>
  <OfferPlaceTargetShell>
    <OfferPlaceSearchToolbar
      v-model="searchText"
      :placeholder="placeholder"
    />

    <LazyPunkGrid
      :ids="ids"
      :size="size"
      selectable
      scrollable
      outline-hover
      :dim-unselected="selectedIds.length > 0"
      :selected-ids="selectedIds"
      @toggle="toggleSelected"
    />
  </OfferPlaceTargetShell>
</template>

<script setup lang="ts">
import { uniqueSortedIds } from '~/composables/usePlaceOfferDraft'

withDefaults(
  defineProps<{
    size?: number
  }>(),
  { size: 72 },
)

const text = defineModel<string>('text', { required: true })
const selectedIds = defineModel<number[]>('selectedIds', { required: true })
const placeholder = 'Try #7804, hoodie smile, ape'
const { searchText, ids } = useOfferPlaceTargetSearch(text)

function toggleSelected(id: number) {
  selectedIds.value = toggleId(selectedIds.value, id)
}

function toggleId(ids: readonly number[], id: number) {
  const next = new Set(ids)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return uniqueSortedIds([...next])
}
</script>
