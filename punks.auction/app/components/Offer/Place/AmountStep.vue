<template>
  <div class="amount-step">
    <OfferPlaceSummary
      :draft="draft"
      :size="size"
    />
    <OfferPlaceAmountRow v-model="model" />
  </div>
</template>

<script setup lang="ts">
import type { PlaceOfferDraft } from '~/composables/usePlaceOfferDraft'

withDefaults(
  defineProps<{
    draft: PlaceOfferDraft
    size?: number
  }>(),
  { size: 72 },
)

const model = defineModel<string>({ required: true })
</script>

<style scoped>
.amount-step {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  min-height: 0;
  overflow: auto;
}
</style>
