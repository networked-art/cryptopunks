<template>
  <section class="slots-block">
    <h2 class="block-title eyebrow">Items</h2>
    <OfferList>
      <OfferSlotsRow
        v-for="row in rows"
        :key="row.key"
        :row="row"
      />
    </OfferList>
  </section>
</template>

<script setup lang="ts">
import {
  offerSlotDisplay,
  type OfferSlotDisplay,
} from '~/composables/useOfferSlotDisplay'
import {
  offerSlotDisplayTarget,
  type OfferTargetDisplay,
} from '~/composables/useOfferTarget'
import type { OfferSlot } from '~/utils/auction'

type OfferSlotRow = OfferSlotDisplay & {
  key: string
  target: OfferTargetDisplay
}

const props = defineProps<{
  slots: OfferSlot[]
}>()

const offline = usePunksOffline()

const rows = computed<OfferSlotRow[]>(() =>
  props.slots.map((slot, index) => {
    const display = offerSlotDisplay(slot, offline, index)
    return {
      key: `${index}-${slot.standard}`,
      ...display,
      target: offerSlotDisplayTarget(slot, display),
    }
  }),
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
</style>
