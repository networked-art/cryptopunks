<template>
  <LotCardShell>
    <LotPreview :items="lot.items" />

    <LotCardSummary
      label="Reserve"
      :wei="lot.reserveWei"
    >
      {{ itemCountLabel }}
    </LotCardSummary>
  </LotCardShell>
</template>

<script setup lang="ts">
import type { LotRecord } from '~/utils/auction'

defineOptions({ name: 'LotCard' })

const props = defineProps<{ lot: LotRecord }>()

const itemCountLabel = computed(() => {
  const count = props.lot.items.length
  return `${count.toLocaleString()} Punk${count === 1 ? '' : 's'}`
})
</script>
