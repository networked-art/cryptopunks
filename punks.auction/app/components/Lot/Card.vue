<template>
  <LotCardShell
    :to="`/lots/${lot.id}`"
    :aria-label="`View lot ${lot.id}`"
    :lift="lift"
  >
    <LotPreview :items="lot.items" />

    <LotCardSummary :wei="lot.reserveWei">
      {{ itemCountLabel }}
    </LotCardSummary>
  </LotCardShell>
</template>

<script setup lang="ts">
import { formatLotItemsLabel, type LotRecord } from '~/utils/auction'

defineOptions({ name: 'LotCard' })

const props = defineProps<{ lot: LotRecord; lift?: boolean }>()

const itemCountLabel = computed(() => {
  return formatLotItemsLabel(props.lot.items)
})
</script>
