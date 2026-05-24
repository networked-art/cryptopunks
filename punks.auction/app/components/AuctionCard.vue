<template>
  <LotCardShell>
    <LotPreview :items="auction.items" />

    <LotCardSummary
      :label="endText"
      :wei="auction.latestBidWei"
      :label-status="statusLabel"
      :label-status-live="status === 'live'"
    >
      {{ itemCountLabel }}
    </LotCardSummary>
  </LotCardShell>
</template>

<script setup lang="ts">
import { auctionStatus, formatLotItemsLabel, type AuctionRecord } from '~/utils/auction'

const props = defineProps<{ auction: AuctionRecord }>()

const status = computed(() => auctionStatus(props.auction))
const statusLabel = computed(
  () =>
    ({ live: 'live', ended: 'ended', settled: 'settled' })[status.value],
)
const itemCountLabel = computed(() => {
  return formatLotItemsLabel(props.auction.items)
})

const endIso = computed(() =>
  new Date(props.auction.endTimestamp * 1000).toISOString(),
)
const endAgo = useTimeAgo(endIso)
const endText = computed(
  () => `${status.value === 'live' ? 'ends' : 'ended'} ${endAgo.value}`,
)
</script>
