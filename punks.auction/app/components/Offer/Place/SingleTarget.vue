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
      :dim-unselected="selectedId !== null"
      :selected-ids="selectedId === null ? [] : [selectedId]"
      @toggle="toggleSelected"
    />
  </OfferPlaceTargetShell>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number
  }>(),
  { size: 72 },
)

const text = defineModel<string>('text', { required: true })
const selectedId = defineModel<number | null>('selectedId', { required: true })
const placeholder = 'Try #1234, hoodie, 2 colors'
const { searchText, ids } = useOfferPlaceTargetSearch(text, {
  enableOwnerSearch: true,
})

function toggleSelected(id: number) {
  selectedId.value = selectedId.value === id ? null : id
}
</script>
