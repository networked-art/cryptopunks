<template>
  <div class="container offers-page">
    <header class="page-head">
      <div class="page-head-text">
        <h1>Purchase Offers</h1>
        <p class="muted">
          Standing bids that can be immediately accepted or begin a 24 hour
          auction.
        </p>
      </div>
      <Button
        class="primary icon-button page-head-action"
        to="/purchase-offers/new"
      >
        <Icon name="lucide:plus" />
        <span class="label-full">Place offer</span>
        <span class="label-short">New</span>
      </Button>
    </header>

    <ClientOnly>
      <section class="section">
        <div
          v-if="pending && !offers.length"
          class="loading"
        >
          <Spinner label="Loading offers" />
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
useSeoMeta({
  title: 'Purchase offers · Punks Auction',
  ogTitle: 'Purchase offers · Punks Auction',
  twitterTitle: 'Purchase offers · Punks Auction',
})
defineOgImage('Default', {
  title: 'Purchase offers',
  description: 'Standing bids that settle instantly or open an auction.',
})

const { offers, pending, error } = useOffers()

/// Highest offer first.
const sortedOffers = computed(() =>
  [...offers.value].sort((a, b) =>
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

.page-head-text {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  min-width: 0;
}

.page-head-text > h1 {
  margin: 0;
}

.page-head-text > .muted {
  margin: 0;
}

.page-head-action {
  overflow: hidden;
}

.label-short {
  display: none;
}

@media (max-width: 860px) {
  .page-head {
    align-items: center;
  }

  .page-head-text > .muted {
    display: none;
  }

  .label-full {
    display: none;
  }

  .label-short {
    display: inline;
  }
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
