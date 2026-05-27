<template>
  <LotDetailShell
    v-if="validId && lot"
    :items="lot.items"
  >
    <header class="head">
      <span class="eyebrow">Lot #{{ lot.id }}</span>
      <h1 class="title">
        <NuxtLink
          v-if="singleItem"
          :to="punkHref(singleItem.standard, singleItem.punkId)"
        >
          Punk <span class="dim">#</span>{{ singleItem.punkId }}
          <Tag
            v-if="singleItem.standard === TokenStandard.CryptoPunksV1"
            small
            class="v1-tag"
            >V1</Tag
          >
        </NuxtLink>
        <template v-else>{{ itemCountLabel }}</template>
      </h1>
    </header>

    <dl class="facts">
      <div class="fact">
        <dt>Reserve</dt>
        <dd>
          <EthAmount :wei="lot.reserveWei" />
        </dd>
      </div>

      <div class="fact">
        <dt>Seller</dt>
        <dd>
          <NuxtLink :to="`/profile/${lot.seller}`">
            <Account :address="lot.seller" />
          </NuxtLink>
        </dd>
      </div>
    </dl>

    <section class="actions-block">
      <h2 class="block-title eyebrow">Actions</h2>

      <LotActions
        :lot="lot"
        :matching-offers="matchingOffers"
        @changed="onChanged"
      />
    </section>

    <LotDetailItems :items="lot.items" />
  </LotDetailShell>

  <div
    v-else
    class="state muted"
  >
    <template v-if="!validId">
      Lot #{{ route.params.id }} does not exist. Lot ids start at 1.
    </template>
    <template v-else-if="pending">
      <Spinner label="Loading lot" />
    </template>
    <template v-else-if="error">Failed to load lot: {{ error }}</template>
    <template v-else-if="sourceAuction">
      Lot #{{ id }} was opened as
      <NuxtLink :to="`/auctions/${sourceAuction.id}`">
        auction #{{ sourceAuction.id }}</NuxtLink
      >.
    </template>
    <template v-else>Lot #{{ id }} was not found.</template>
  </div>
</template>

<script setup lang="ts">
import {
  auctionStatus,
  formatLotItemsLabel,
  lotMatchesOffer,
  punkHref,
  readAuctionForLot,
  readLot,
  TokenStandard,
} from '~/utils/auction'

const route = useRoute()
const id = computed(() => Number(route.params.id))
const validId = computed(() => Number.isInteger(id.value) && id.value >= 1)
const readClient = useReadClient()

if (validId.value) {
  const activeAuction = await activeAuctionForLot(id.value)
  if (activeAuction) {
    await navigateTo(`/auctions/${activeAuction.id}`, { redirectCode: 302 })
  }
}

const { lot, sourceAuction, pending, error, refresh } = useLot(() =>
  validId.value ? id.value : undefined,
)
const { offers, refresh: refreshOffers } = useOffers()

const itemCountLabel = computed(() =>
  lot.value ? formatLotItemsLabel(lot.value.items) : '',
)
const singleItem = computed(() =>
  lot.value?.items.length === 1 ? lot.value.items[0] : null,
)
const { criteriaMatchesPunk } = useOfferSlotMatching()
const matchingOffers = computed(() => {
  const current = lot.value
  if (!current) return []
  return offers.value
    .filter((offer) => lotMatchesOffer(offer, current, criteriaMatchesPunk))
    .sort((a, b) =>
      a.amountWei === b.amountWei ? 0 : a.amountWei > b.amountWei ? -1 : 1,
    )
})

watch(
  sourceAuction,
  (auction) => {
    if (auction && auctionStatus(auction) === 'live') {
      void navigateTo(`/auctions/${auction.id}`, { redirectCode: 302 })
    }
  },
  { immediate: true },
)

function onChanged() {
  void refresh()
  void refreshOffers()
}

async function activeAuctionForLot(lotId: number) {
  const c = readClient.value
  if (!c) return null
  try {
    const auction = await readAuctionForLot(c, lotId)
    return auction && auctionStatus(auction) === 'live' ? auction : null
  } catch {
    return null
  }
}

useSeoMeta({
  title: () => `Lot #${id.value} · Punks Auction`,
  ogTitle: () => `Lot #${id.value} · Punks Auction`,
  twitterTitle: () => `Lot #${id.value} · Punks Auction`,
})

const { data: ogLot } = await useAsyncData(
  () => `og-lot-${id.value}`,
  async () => {
    if (!validId.value) return null
    const client = readClient.value
    if (!client) return null
    const record = await readLot(client, id.value)
    if (!record) return null
    return {
      items: record.items.map((item) => ({
        standard: item.standard,
        punkId: item.punkId,
      })),
      reserveWei: record.reserveWei.toString(),
    }
  },
)

// defineOgImage('Lot', {
//   kind: 'lot',
//   id: id.value,
//   items: ogLot.value?.items ?? [],
//   priceWei: ogLot.value?.reserveWei ?? '0',
//   priceLabel: 'Reserve',
//   status: null,
// })
</script>

<style scoped>
.head {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.title {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  margin: 0;
  font-size: var(--font-3xl);
  font-weight: var(--font-weight-bolder);
  letter-spacing: var(--letter-spacing-tighter);
}

.title a {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  color: inherit;
  border: 0;
}

.v1-tag {
  font-size: var(--font-xs);
}

.block-note {
  margin: 0;
  font-size: var(--font-sm);
}

.actions-block {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.block-title {
  margin: 0;
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--size-3);
  margin: 0;
}

.fact {
  min-width: 0;
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.fact dt {
  margin-bottom: var(--size-1);
  color: var(--text-dim);
  font-size: var(--font-xs);
  letter-spacing: var(--letter-spacing-md);
  text-transform: uppercase;
}

.fact dd {
  margin: 0;
  min-width: 0;
  font-size: var(--font-sm);
}

.fact a {
  border: 0;
}

.state {
  display: grid;
  place-items: center;
  min-height: 60vh;
  padding: var(--size-8);
  text-align: center;
}

.state a {
  border: 0;
}

@media (max-width: 540px) {
  .facts {
    grid-template-columns: 1fr;
  }

  .title {
    font-size: var(--font-2xl);
  }
}
</style>
