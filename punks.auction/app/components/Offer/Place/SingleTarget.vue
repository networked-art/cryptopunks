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
      @toggle="selectedId = $event"
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
const placeholder = 'Try #2623'
const { searchText, ids } = useOfferPlaceTargetSearch(text)
</script>
