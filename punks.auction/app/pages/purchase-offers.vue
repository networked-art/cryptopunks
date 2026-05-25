<template>
  <div class="container offers-page">
    <header class="page-head">
      <div class="page-head-row">
        <h1>Purchase offers</h1>
        <Button
          class="primary icon-button"
          to="/purchase-offers/new"
        >
          <Icon name="lucide:plus" />
          <span>Place offer</span>
        </Button>
      </div>
      <p class="muted">
        Standing bids that can be immediately settled or resolved into an
        auction.
      </p>
    </header>

    <ClientOnly>
      <section class="section">
        <div
          v-if="pending && !displayOffers.length"
          class="loading"
        >
          <Spinner label="Loading offers" />
        </div>
        <div
          v-else-if="!deployed"
          class="state empty muted"
        >
          Offers appear here once <code>PunksAuction</code> is deployed.
        </div>
        <div
          v-else-if="error"
          class="error"
        >
          Failed to load offers: {{ error }}
        </div>
        <div
          v-else-if="!sortedOffers.length"
          class="state empty muted"
        >
          No open purchase offers.
        </div>
        <div
          v-else
          class="offer-stack"
        >
          <OfferList>
            <LazyOfferCard
              v-for="offer in sortedOffers"
              :key="String(offer.id)"
              :offer="offer"
            />
          </OfferList>
        </div>
      </section>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { useMockOffers } from '~/composables/useAuctionData.mock'

useSeoMeta({
  title: 'Purchase offers · Punks Auction',
  ogTitle: 'Purchase offers · Punks Auction',
  twitterTitle: 'Purchase offers · Punks Auction',
})

const { offers, pending, error, deployed: offersDeployed } = useOffers()
const { offers: mockOffers, deployed: mockOffersDeployed } = useMockOffers()

const displayOffers = computed(() =>
  offers.value.length || pending.value ? offers.value : mockOffers.value,
)
const deployed = computed(() => offersDeployed || mockOffersDeployed)

/// Highest offer first.
const sortedOffers = computed(() =>
  [...displayOffers.value].sort((a, b) =>
    a.amountWei === b.amountWei ? 0 : a.amountWei > b.amountWei ? -1 : 1,
  ),
)
</script>

<style scoped>
.offers-page {
  padding: var(--size-8) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-8);
}

.section,
.offer-stack {
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
  min-width: 0;
}

.page-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-4);
  flex-wrap: wrap;
}

.state {
  margin: 0;
}

.loading {
  padding: var(--size-8);
  text-align: center;
}

.empty {
  padding: var(--size-8);
  text-align: center;
  border: var(--border);
}

.error {
  color: var(--accent);
}
</style>
