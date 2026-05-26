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
        <div
          v-else
          class="auction-panel"
        >
          <dl class="state-grid">
            <template v-if="topAuction">
              <div class="state-cell">
                <dt class="label">Top bid</dt>
                <dd>
                  <EthAmount :wei="topAuction.latestBidWei" />
                </dd>
              </div>

              <div class="state-cell">
                <dt class="label">Top bidder</dt>
                <dd>
                  <NuxtLink :to="`/profile/${topAuction.latestBidder}`">
                    <Account :address="topAuction.latestBidder" />
                  </NuxtLink>
                </dd>
              </div>
            </template>

            <template v-else>
              <div class="state-cell">
                <dt class="label">Lot</dt>
                <dd v-if="topLot">
                  <EthAmount :wei="topLot.reserveWei" />
                </dd>
                <dd
                  v-else
                  class="muted"
                >
                  Not listed
                </dd>
              </div>

              <div class="state-cell">
                <dt class="label">Top offer</dt>
                <dd v-if="topOffer">
                  <EthAmount :wei="topOffer.amountWei" />
                  <span class="dim"> by </span>
                  <NuxtLink :to="`/profile/${topOffer.offerer}`">
                    <Account :address="topOffer.offerer" />
                  </NuxtLink>
                </dd>
                <dd
                  v-else
                  class="muted"
                >
                  None
                </dd>
              </div>
            </template>
          </dl>

          <div
            v-if="punkOffers.length"
            class="context"
          >
            <div class="context-group">
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
            v-if="punkAuctions.length || punkLots.length || canCreateLot"
            class="actions"
          >
            <Button
              v-for="auction in punkAuctions"
              :key="`auction-${auction.id}`"
              :to="`/auctions/${auction.id}`"
              class="primary"
            >
              View auction
            </Button>
            <Button
              v-for="lot in punkLots"
              :key="`lot-${lot.id}`"
              :to="`/lots/${lot.id}`"
            >
              View lot
            </Button>
            <LazyPunkDetailAuctionCreateLot
              v-if="canCreateLot"
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

const topLot = computed(() => {
  if (!punkLots.value.length) return null
  return punkLots.value.reduce((min, lot) =>
    lot.reserveWei < min.reserveWei ? lot : min,
  )
})

const topAuction = computed(() => {
  if (!punkAuctions.value.length) return null
  return punkAuctions.value.reduce((top, auction) =>
    auction.latestBidWei > top.latestBidWei ? auction : top,
  )
})

const topOffer = computed(() => {
  if (!punkOffers.value.length) return null
  return punkOffers.value.reduce((top, offer) =>
    offer.amountWei > top.amountWei ? offer : top,
  )
})

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
const canCreateLot = computed(
  () =>
    isOwner.value && !punkAuctions.value.length && !punkLots.value.length,
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

.state-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--size-3);
}

.state-cell {
  min-width: 0;
}

.state-cell dd {
  margin: 0;
  min-width: 0;
  font-size: var(--font-sm);
}

.state-cell a {
  border: 0;
}

.label {
  margin-bottom: var(--size-1);
  text-transform: uppercase;
  font-size: var(--font-xs);
  letter-spacing: var(--letter-spacing-md);
  color: var(--text-dim);
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

.auction-panel > * + * {
  padding-top: var(--size-3);
  border-top: var(--border);
}

@media (max-width: 540px) {
  .state-grid {
    grid-template-columns: 1fr;
  }
}
</style>
