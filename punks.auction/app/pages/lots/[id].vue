<template>
  <LotDetailShell
    v-if="validId && displayLot"
    :items="displayLot.items"
  >
    <header class="head">
      <span class="eyebrow">Lot #{{ displayLot.id }}</span>
      <h1 class="title">{{ itemCountLabel }}</h1>
      <p
        v-if="isMock"
        class="block-note muted"
      >
        Preview data. Wallet actions appear for live lot records.
      </p>
    </header>

    <dl class="facts">
      <div class="fact">
        <dt>Reserve</dt>
        <dd>
          <EthAmount :wei="displayLot.reserveWei" />
        </dd>
      </div>

      <div class="fact">
        <dt>Seller</dt>
        <dd>
          <NuxtLink :to="`/profile/${displayLot.seller}`">
            <Account :address="displayLot.seller" />
          </NuxtLink>
        </dd>
      </div>
    </dl>

    <LotActions
      v-if="!isMock"
      :lot="displayLot"
      @changed="onChanged"
    />

    <LotDetailItems :items="displayLot.items" />
  </LotDetailShell>

  <div
    v-else
    class="state muted"
  >
    <template v-if="!validId">
      Lot #{{ route.params.id }} does not exist. Lot ids start at 1.
    </template>
    <template v-else-if="pending">Loading lot…</template>
    <template v-else-if="!deployed">
      Lots appear once <code>PunksAuction</code> is deployed.
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
import { mockLotById } from '~/composables/useAuctionData.mock'
import {
  auctionStatus,
  formatLotItemsLabel,
  readAuctionForLot,
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

const { lot, sourceAuction, pending, error, deployed, refresh } = useLot(() =>
  validId.value ? id.value : undefined,
)

const mockLot = computed(() => (validId.value ? mockLotById(id.value) : null))
const displayLot = computed(
  () => lot.value ?? (!pending.value ? mockLot.value : null),
)
const isMock = computed(() => !lot.value && !!displayLot.value)
const itemCountLabel = computed(() =>
  displayLot.value ? formatLotItemsLabel(displayLot.value.items) : '',
)

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
</script>

<style scoped>
.head {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.title {
  margin: 0;
  font-size: var(--font-3xl);
  font-weight: var(--font-weight-bolder);
  letter-spacing: 0;
  line-height: var(--line-height-tight);
}

.block-note {
  margin: 0;
  font-size: var(--font-sm);
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
