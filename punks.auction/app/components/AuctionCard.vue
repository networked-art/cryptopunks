<template>
  <LotCardShell
    :to="`/auctions/${auction.id}`"
    :aria-label="`View auction ${auction.id}`"
  >
    <LotPreview :items="auction.items" />

    <LotCardSummary
      :wei="auction.latestBidWei"
      :detail="timeLabel"
      :live-indicator="isLive"
    >
      {{ itemCountLabel }}
    </LotCardSummary>
  </LotCardShell>
</template>

<script setup lang="ts">
import { useNow } from '@vueuse/core'
import {
  auctionStatus,
  formatLotItemsLabel,
  type AuctionRecord,
} from '~/utils/auction'

const props = defineProps<{ auction: AuctionRecord }>()

const itemCountLabel = computed(() => {
  return formatLotItemsLabel(props.auction.items)
})

const endIso = computed(() =>
  new Date(props.auction.endTimestamp * 1000).toISOString(),
)
const endAgo = useTimeAgo(endIso)
const now = useNow({ interval: 1000 })
const isLive = computed(
  () =>
    auctionStatus(props.auction, Math.floor(now.value.getTime() / 1000)) ===
    'live',
)
const timeLabel = computed(() =>
  (endAgo.value ?? '').replace(/^in\s+/, '').replace(/\b(hr|min)\./g, '$1'),
)
</script>
