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
}

const label = computed(() => KIND_LABEL[props.kind] ?? props.kind)
</script>

