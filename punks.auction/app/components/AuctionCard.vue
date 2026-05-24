<template>
  <LotCardShell>
    <LotPreview :items="auction.items" />

    <LotCardSummary
      :wei="auction.latestBidWei"
      :detail="timeLabel"
    >
      {{ itemCountLabel }}
    </LotCardSummary>
  </LotCardShell>
</template>

<script setup lang="ts">
import { formatLotItemsLabel, type AuctionRecord } from '~/utils/auction'

const props = defineProps<{ auction: AuctionRecord }>()

const itemCountLabel = computed(() => {
  return formatLotItemsLabel(props.auction.items)
})

const endIso = computed(() =>
  new Date(props.auction.endTimestamp * 1000).toISOString(),
)
const endAgo = useTimeAgo(endIso)
const timeLabel = computed(() =>
  (endAgo.value ?? '').replace(/^in\s+/, '').replace(/\b(hr|min)\./g, '$1'),
)
</script>
