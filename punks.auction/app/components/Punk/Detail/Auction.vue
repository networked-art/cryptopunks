<template>
  <ClientOnly>
    <section class="block">
      <h2 class="block-title eyebrow">On the auction house</h2>
      <p
        v-if="!deployed"
        class="block-note muted"
      >
        <code>PunksAuction</code> is not deployed yet.
      </p>
      <p
        v-else-if="contextPending && isContextEmpty"
        class="block-note muted"
      >
        Loading…
      </p>
      <p
        v-else-if="isContextEmpty"
        class="block-note muted"
      >
        This Punk is not in any active auction, listed lot, or offer.
      </p>
      <div
        v-else
        class="context"
      >
        <div
          v-if="punkAuctions.length"
          class="context-group"
        >
          <h3 class="context-title">Active auction</h3>
          <div class="card-grid">
            <LazyAuctionCard
              v-for="auction in punkAuctions"
              :key="String(auction.id)"
              :auction="auction"
            />
          </div>
        </div>
        <div
          v-if="punkLots.length"
          class="context-group"
        >
          <h3 class="context-title">Listed in a lot</h3>
          <div class="card-grid">
            <LazyLotCard
              v-for="lot in punkLots"
              :key="String(lot.id)"
              :lot="lot"
            />
          </div>
        </div>
        <div
          v-if="punkOffers.length"
          class="context-group"
        >
          <h3 class="context-title">Matching offers</h3>
          <div class="card-grid">
            <LazyOfferCard
              v-for="offer in punkOffers"
              :key="String(offer.id)"
              :offer="offer"
            />
          </div>
        </div>
      </div>
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import type { TokenStandardValue } from '~/utils/auction'

const props = defineProps<{
  punkId: number
  standard: TokenStandardValue
}>()

const {
  punkAuctions,
  punkLots,
  punkOffers,
  pending: contextPending,
  deployed,
} = usePunkAuctionContext(
  () => props.punkId,
  () => props.standard,
)
const isContextEmpty = computed(
  () =>
    !punkAuctions.value.length &&
    !punkLots.value.length &&
    !punkOffers.value.length,
)
</script>

<style scoped>
.block {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.block-title {
  margin: 0;
}

.block-note {
  margin: 0;
  font-size: var(--font-sm);
}

.context {
  display: flex;
  flex-direction: column;
  gap: var(--size-5);
}

.context-group {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.context-title {
  margin: 0;
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
  color: var(--text-muted);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--size-7);
}
</style>
