<template>
  <span
    class="label"
    :class="`kind-${kind}`"
    >{{ label }}</span
  >
</template>

<script setup lang="ts">
import type { ActivityKind } from '~/composables/useActivityFeed'

const props = defineProps<{
  kind: ActivityKind
}>()

const KIND_LABEL: Record<ActivityKind, string> = {
  assign: 'Claimed',
  transfer: 'Transferred',
  stashed: 'Stashed',
  unstashed: 'Unstashed',
  vaulted: 'Vaulted',
  unvaulted: 'Unvaulted',
  wrap: 'Wrapped',
  unwrap: 'Unwrapped',
  listing: 'Listed',
  listing_cancelled: 'Unlisted',
  bid: 'Bid placed',
  bid_cancelled: 'Bid cancelled',
  sale: 'Sold',
  lot_created: 'Lot created',
  lot_cancelled: 'Lot cancelled',
  lot_cleared: 'Lot cleared',
  lot_updated: 'Lot updated',
  auction_started: 'Auction started',
  auction_settled: 'Auction settled',
  offer_placed: 'Offer placed',
  offer_cancelled: 'Offer cancelled',
  offer_adjusted: 'Offer adjusted',
  escrow_credit: 'Escrow credited',
  escrow_withdrawal: 'Escrow withdrawn',
}

const label = computed(() => KIND_LABEL[props.kind] ?? props.kind)
</script>

