<template>
  <LotCardShell>
    <LotPreview :items="auction.items" />

    <LotCardSummary
      :label="endText"
      :wei="auction.latestBidWei"
      :amount-label="statusLabel"
      :amount-live="status === 'live'"
    >
      {{ itemCountLabel }}
    </LotCardSummary>
  </LotCardShell>
</template>

<script setup lang="ts">
import { auctionStatus, type AuctionRecord } from '~/utils/auction'

const props = defineProps<{ auction: AuctionRecord }>()

const status = computed(() => auctionStatus(props.auction))
const statusLabel = computed(
  () =>
    ({ live: 'live', ended: 'ended', settled: 'settled' })[status.value],
)
const itemCountLabel = computed(() => {
  const count = props.auction.items.length
  return `${count.toLocaleString()} Punk${count === 1 ? '' : 's'}`
})

const endIso = computed(() =>
  new Date(props.auction.endTimestamp * 1000).toISOString(),
)
const endAgo = useTimeAgo(endIso)
const endText = computed(
  () => `${status.value === 'live' ? 'ends' : 'ended'} ${endAgo.value}`,
)
</script>
