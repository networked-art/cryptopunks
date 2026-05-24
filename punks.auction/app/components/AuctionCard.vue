<template>
  <LotCardShell>
    <LotPreview :items="auction.items" />

    <LotCardSummary
      label="Current bid"
      :wei="auction.latestBidWei"
      :live="status === 'live'"
    >
      <time
        class="timer"
        :datetime="endIso"
        :title="absoluteEnd"
      >
        {{ status === 'live' ? 'Ends' : 'Ended' }} {{ endAgo }}
      </time>
    </LotCardSummary>
  </LotCardShell>
</template>

<script setup lang="ts">
import { auctionStatus, type AuctionRecord } from '~/utils/auction'

const props = defineProps<{ auction: AuctionRecord }>()

const status = computed(() => auctionStatus(props.auction))

const endIso = computed(() =>
  new Date(props.auction.endTimestamp * 1000).toISOString(),
)
const endAgo = useTimeAgo(endIso)
const absoluteEnd = computed(() =>
  new Date(props.auction.endTimestamp * 1000).toLocaleString(),
)
</script>

<style scoped>
.timer {
  color: inherit;
}
</style>
