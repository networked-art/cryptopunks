<template>
  <OfferPlaceTargetShell>
    <OfferPlaceSearchToolbar
      v-model="searchText"
      disabled
      placeholder="Any Punk"
    />

    <LazyPunkGrid
      class="any-grid"
      :ids="ALL_PUNK_IDS"
      :size="size"
      scrollable
      :interactive="false"
    />
  </OfferPlaceTargetShell>
</template>

<script setup lang="ts">
import { ALL_PUNK_IDS } from '~/utils/punkIds'

withDefaults(
  defineProps<{
    size?: number
  }>(),
  { size: 72 },
)

const searchText = ref('')
</script>

<style scoped>
.any-grid {
  min-height: 0;
}
</style>
