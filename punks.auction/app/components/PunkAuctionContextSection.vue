<template>
  <ClientOnly>
    <section class="block">
      <h2 class="block-title">On the auction house</h2>
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
        This Punk is not in any auction, lot, or offer.
      </p>
      <div
        v-else
        class="context"
      >
        <div
          v-if="punkAuctions.length"
          class="context-group"
        >
          <h3 class="context-title">In auction</h3>
          <div class="card-grid">
            <AuctionCard
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
          <h3 class="context-title">In a lot</h3>
          <div class="card-grid">
            <LotCard
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
            <OfferCard
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
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.block-note {
  margin: 0;
  font-size: 12px;
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
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--size-3);
}

code {
  font-family: var(--font-mono);
  background: var(--bg-elevated);
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.9em;
}
</style>
