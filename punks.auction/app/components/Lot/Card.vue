<template>
  <LotCardShell>
    <LotPreview :items="lot.items" />

    <LotCardSummary
      label="reserve"
      :wei="lot.reserveWei"
    >
      {{ itemCountLabel }}
    </LotCardSummary>
  </LotCardShell>
</template>

<script setup lang="ts">
import { formatLotItemsLabel, type LotRecord } from '~/utils/auction'

defineOptions({ name: 'LotCard' })

const props = defineProps<{ lot: LotRecord }>()

const itemCountLabel = computed(() => {
  return formatLotItemsLabel(props.lot.items)
})
</script>
