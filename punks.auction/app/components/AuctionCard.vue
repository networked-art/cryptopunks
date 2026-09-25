<template>
  <LotCardShell
    :to="`/auctions/${auction.id}`"
    :aria-label="`View auction ${auction.id}`"
    :lift="lift"
  >
    <LotPreview :items="auction.items" />

    <LotCardSummary
      :wei="auction.latestBidWei"
      :detail="timeLabel"
      :live-indicator="isLive"
      :historical="!isLive"
      :historical-usd-cents="bidPrice?.events.items[0]?.usd_value_cents"
    >
      {{ itemCountLabel }}
    </LotCardSummary>
  </LotCardShell>
</template>

<script setup lang="ts">
import { useNow } from '@vueuse/core'
import { queryIndexer } from '~/utils/indexer'
import {
  auctionStatus,
  formatLotItemsLabel,
  type AuctionRecord,
} from '~/utils/auction'

const props = defineProps<{ auction: AuctionRecord; lift?: boolean }>()

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
const { data: bidPrice } = useAsyncData(
  () => `auction-bid-usd-${props.auction.id}-${props.auction.latestBidWei}`,
  () => {
    if (isLive.value) return Promise.resolve({ events: { items: [] } })
    return queryIndexer<{
      events: { items: { usd_value_cents: string | null }[] }
    }>(
      `query AuctionBidUsd($where: eventFilter!) {
        events(where: $where, limit: 1) {
          items { usd_value_cents }
        }
      }`,
      {
        where: {
          source: 'punks_auction',
          type: 'bid',
          auction_id: props.auction.id.toString(),
          wei_amount: props.auction.latestBidWei.toString(),
        },
      },
    )
  },
  { server: false, watch: [isLive] },
)
const timeLabel = computed(() =>
  (endAgo.value ?? '').replace(/^in\s+/, '').replace(/\b(hr|min)\./g, '$1'),
)
</script>
