<template>
  <ClientOnly>
    <section class="block">
      <h2 class="block-title eyebrow">Auction House Status</h2>
      <p
        v-if="!deployed"
        class="block-note muted"
      >
        <code>PunksAuction</code> is not deployed yet.
      </p>
      <template v-else>
        <p
          v-if="contextPending && isContextEmpty"
          class="block-note muted"
        >
          Loading…
        </p>
        <p
          v-else-if="isContextEmpty && !isOwner"
          class="block-note muted"
        >
          This Punk is not in any active auction, listed lot, or offer.
        </p>
        <div
          v-else
          class="auction-panel"
        >
          <div
            v-if="!isContextEmpty"
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

          <div
            v-if="isOwner"
            class="actions"
          >
            <LazyPunkDetailAuctionCreateLot
              :punk-id="punkId"
              :standard="standard"
              @created="onCreated"
            />
          </div>
        </div>
      </template>
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import { useConnection } from '@wagmi/vue'
import type { Hash } from 'viem'
import type { TokenStandardValue } from '~/utils/auction'

const props = defineProps<{
  punkId: number
  standard: TokenStandardValue
}>()

const emit = defineEmits<{ changed: [tx: Hash] }>()

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

const { address } = useConnection()
const { owner } = usePunkOwner(
  () => props.punkId,
  () => props.standard,
)
const isOwner = computed(
  () =>
    !!address.value &&
    !!owner.value &&
    owner.value.toLowerCase() === address.value.toLowerCase(),
)

function onCreated(tx: Hash) {
  emit('changed', tx)
}
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

.auction-panel {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
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

.actions {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.auction-panel > .context + .actions {
  padding-top: var(--size-3);
  border-top: var(--border);
}
</style>
