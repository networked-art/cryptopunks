<template>
  <section class="slots-block">
    <h2 class="block-title eyebrow">Items</h2>
    <ul class="slots">
      <OfferSlotsRow
        v-for="row in rows"
        :key="row.key"
        :row="row"
      />
    </ul>
  </section>
</template>

<script setup lang="ts">
import {
  offerSlotDisplay,
  type OfferSlotDisplay,
} from '~/composables/useOfferSlotDisplay'
import type { OfferSlot } from '~/utils/auction'

type OfferSlotRow = OfferSlotDisplay & {
  key: string
}

const props = defineProps<{
  slots: OfferSlot[]
}>()

const offline = usePunksOffline()

const rows = computed<OfferSlotRow[]>(() =>
  props.slots.map((slot, index) => ({
    key: `${index}-${slot.standard}`,
    ...offerSlotDisplay(slot, offline, index),
  })),
)
</script>

<style scoped>
.slots-block {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.block-title {
  margin: 0;
}

.slots {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  margin: 0;
  padding: 0;
}
</style>
