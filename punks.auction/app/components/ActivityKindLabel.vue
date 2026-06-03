<template>
  <span
    class="label"
    :class="[`kind-${kind}`, offerKind ? `offer-kind-${offerKind}` : null]"
    >{{ label }}</span
  >
</template>

<script setup lang="ts">
import type { ActivityKind, OfferKind } from '~/composables/useActivityFeed'

const props = defineProps<{
  kind: ActivityKind
  offerKind?: OfferKind
}>()

const KIND_LABEL: Record<ActivityKind, string> = {
  assign: 'Claimed',
  transfer: 'Transferred',
  stashed: 'Stashed',
  unstashed: 'Unstashed',
  vaulted: 'Vaulted',
  unvaulted: 'Unvaulted',
  escrowed: 'Escrowed',
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

/// `offer_placed` etc. fold into the same verb on every kind of offer — only
/// the qualifier in front of "offer" changes. Re-use the `KIND_LABEL` text
/// after the leading "Offer " so we don't have to repeat 9 strings.
///
/// `specific` is intentionally omitted: those rows carry a `punk_id` and
/// render the PunkThumb + "Punk #N" link, so the kind label stays the plain
/// "Offer placed / cancelled / adjusted".
const OFFER_KIND_QUALIFIER: Partial<Record<OfferKind, string>> = {
  collection: 'Collection',
  trait: 'Trait',
  selection: 'Selection',
}

const OFFER_KINDS = new Set<ActivityKind>([
  'offer_placed',
  'offer_cancelled',
  'offer_adjusted',
])

const label = computed(() => {
  const base = KIND_LABEL[props.kind] ?? props.kind
  const qualifier = props.offerKind && OFFER_KIND_QUALIFIER[props.offerKind]
  if (qualifier && OFFER_KINDS.has(props.kind)) {
    return `${qualifier} ${base.toLowerCase()}`
  }
  return base
})
</script>

