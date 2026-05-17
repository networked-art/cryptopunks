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
        class="muted matches-link"
        :to="matchesLink"
        >{{ matchCount.toLocaleString() }} matching punks</NuxtLink
      >
    </div>
  </article>
</template>

<script setup lang="ts">
import type { CollectionBid } from '~/composables/usePunksMarketBids'

const props = defineProps<{ bid: CollectionBid }>()

const offline = usePunksOffline()

const matchCount = computed(() => {
  try {
    return offline.count({
      ids: props.bid.includeIds.length ? props.bid.includeIds : undefined,
      excludeIds: props.bid.excludeIds.length
        ? props.bid.excludeIds
        : undefined,
    })
  } catch {
    return null
  }
})

const matchesLink = computed(() => `/?bid=${props.bid.id}`)
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
