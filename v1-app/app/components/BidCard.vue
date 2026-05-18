<template>
  <article class="bid-card">
    <header class="bid-head">
      <span class="bid-id">#{{ bid.id }}</span>
      <span class="muted bid-block">block {{ bid.placedAtBlock }}</span>
    </header>

    <div class="bid-amount">
      <EthAmount
        :wei="bid.bidWei"
        :precision="6"
      />
      <span
        v-if="bid.settlementWei > 0n"
        class="muted bid-settlement"
      >
        +<EthAmount
          :wei="bid.settlementWei"
          :precision="6"
        />
        settlement
      </span>
    </div>

    <div class="bid-bidder">
      <NuxtLink :to="`/profile/${bid.bidder}`">
        <AccountBadge :address="bid.bidder" />
      </NuxtLink>
    </div>

    <div
      v-if="matchCount !== null"
      class="bid-matches"
    >
      <NuxtLink
        v-if="matchesLink"
        class="muted matches-link"
        :to="matchesLink"
        >{{ matchCount.toLocaleString() }} matching punks</NuxtLink
      >
      <span
        v-else
        class="muted matches-link"
        >{{ matchCount.toLocaleString() }} matching punks</span
      >
    </div>
  </article>
</template>

<script setup lang="ts">
import { formatSearchText, type PunkQuery } from '@networked-art/punks-sdk'
import type { CollectionBid } from '~/composables/usePunksMarketBids'

const props = defineProps<{ bid: CollectionBid }>()

const offline = usePunksOffline()

const matchCount = computed(() => {
  try {
    return offline.count(bidToQuery(props.bid))
  } catch {
    return null
  }
})

function bidToQuery(bid: CollectionBid): PunkQuery {
  const c = bid.criteria
  const query: PunkQuery = {}
  if (
    c.requiredTraitMask !== 0n ||
    c.forbiddenTraitMask !== 0n ||
    c.anyOfTraitMask !== 0n
  ) {
    query.attributes = {
      requiredMask: c.requiredTraitMask,
      forbiddenMask: c.forbiddenTraitMask,
      anyOfMask: c.anyOfTraitMask,
    }
  }
  if (
    c.requiredColorMask !== 0n ||
    c.forbiddenColorMask !== 0n ||
    c.anyOfColorMask !== 0n
  ) {
    query.colors = {
      requiredMask: c.requiredColorMask,
      forbiddenMask: c.forbiddenColorMask,
      anyOfMask: c.anyOfColorMask,
    }
  }
  /// `max === 0` means "no constraint" in the on-chain `PunksFilter`.
  if (c.maxPixelCount > 0) {
    query.pixelCount = { min: c.minPixelCount, max: c.maxPixelCount }
  }
  if (c.maxColorCount > 0) {
    query.colorCount = { min: c.minColorCount, max: c.maxColorCount }
  }
  if (bid.includeIds.length) query.ids = bid.includeIds
  if (bid.excludeIds.length) query.excludeIds = bid.excludeIds
  return query
}

/// Rebuild the front-end search query string that selects the same punks
/// this bid covers. Filters with features the text grammar can't express
/// (forbidden masks, exotic any-of groups) leave the link unrendered.
const matchesLink = computed(() => {
  try {
    const q = formatSearchText(offline.dataset.source, {
      criteria: props.bid.criteria,
      includeIds: props.bid.includeIds,
      excludeIds: props.bid.excludeIds,
    })
    if (!q) return null
    return { path: '/', query: { q } }
  } catch {
    return null
  }
})
</script>

<style scoped>
.bid-card {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  padding: var(--size-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  transition: border-color 0.1s;
}

.bid-card:hover {
  border-color: var(--accent-soft);
}

.bid-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.bid-id {
  color: var(--text-muted);
}

.bid-amount {
  font-size: 18px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bid-settlement {
  font-size: 11px;
}

.matches-link {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 0;
}

.matches-link:hover {
  color: var(--accent);
}
</style>
