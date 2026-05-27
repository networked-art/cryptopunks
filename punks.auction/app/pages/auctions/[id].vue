<template>
  <LotDetailShell
    v-if="validId && auction"
    :items="auction.items"
  >
    <header class="head">
      <span class="eyebrow">Auction #{{ auction.id }}</span>
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
        <dt>Status</dt>
        <dd>
          <LivenessIndicator
            v-if="status === 'live'"
            label="Live auction,"
          />
          {{ statusLabel }}
          <span
            v-if="status === 'live'"
            class="countdown"
          >
            {{ endCountdown.str }}
          </span>
        </dd>
      </div>

      <div class="fact">
        <dt>Ends</dt>
        <dd>{{ endLabel }}</dd>
      </div>

      <div class="fact">
        <dt>Current Bidder</dt>
        <dd>
          <NuxtLink :to="`/profile/${auction.latestBidder}`">
            <Account :address="auction.latestBidder" />
          </NuxtLink>
        </dd>
      </div>

      <div class="fact">
        <dt>Curent bid</dt>
        <dd>
          <EthAmount :wei="auction.latestBidWei" />
        </dd>
      </div>

      <div class="fact">
        <dt>Seller</dt>
        <dd>
          <NuxtLink :to="`/profile/${auction.seller}`">
            <Account :address="auction.seller" />
          </NuxtLink>
        </dd>
      </div>

      <div
        v-if="minimumBidWei"
        class="fact"
      >
        <dt>Next bid</dt>
        <dd>
          <EthAmount :wei="minimumBidWei" />
        </dd>
      </div>
    </dl>

    <AuctionActions
      v-if="minimumBidWei"
      :auction="auction"
      :minimum-bid-wei="minimumBidWei"
      @changed="onChanged"
    />

    <LotDetailItems :items="auction.items" />

    <section class="bid-history">
      <h2 class="section-title eyebrow">Bid history</h2>
      <div
        v-if="bidsPending && !bids.length"
        class="bids-loading"
      >
        <Spinner label="Loading bids" />
      </div>
      <div
        v-else-if="bidsError"
        class="bids-error"
      >
        Failed to load bids: {{ bidsError }}
      </div>
      <ul
        v-else-if="bids.length"
        class="event-list"
      >
        <ActivityRow
          v-for="event in bids"
          :key="event.id"
          :event="event"
          hide-thumb
        />
      </ul>
      <p
        v-else
        class="muted"
      >
        No bids placed yet.
      </p>
    </section>
  </LotDetailShell>

  <div
    v-else
    class="state muted"
  >
    <template v-if="!validId">
      Auction #{{ route.params.id }} does not exist. Auction ids start at 1.
    </template>
    <template v-else-if="pending">
      <Spinner label="Loading auction" />
    </template>
    <template v-else-if="error">Failed to load auction: {{ error }}</template>
    <template v-else>Auction #{{ id }} was not found.</template>
  </div>
</template>

<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import {
  auctionStatus,
  formatLotItemsLabel,
  punkHref,
  readAuction,
  TokenStandard,
  type AuctionStatus,
} from '~/utils/auction'

const COUNTDOWN_WINDOW_SECONDS = 12 * 60 * 60
const REFRESH_INTERVAL_MS = 12_000

const route = useRoute()
const id = computed(() => Number(route.params.id))
const validId = computed(() => Number.isInteger(id.value) && id.value >= 1)

const { auction, minimumBidWei, pending, error, refresh } = useAuction(() =>
  validId.value ? id.value : undefined,
)

const {
  bids,
  pending: bidsPending,
  error: bidsError,
  refresh: refreshBids,
} = useAuctionBids(() => (validId.value ? id.value : undefined))

const now = useSeconds()
const status = computed<AuctionStatus>(() => {
  const current = auction.value
  if (!current) return 'settled'
  return auctionStatus(current, now.value)
})
const secondsUntilEnd = computed(() => {
  const current = auction.value
  return current ? Math.max(0, current.endTimestamp - now.value) : 0
})
const endCountdown = useCountDown(secondsUntilEnd, COUNTDOWN_WINDOW_SECONDS + 1)
const statusLabel = computed(() => {
  if (status.value === 'live') return 'Live'
  if (status.value === 'ended') return 'Awaiting settlement'
  return 'Settled'
})

const itemCountLabel = computed(() =>
  auction.value ? formatLotItemsLabel(auction.value.items) : '',
)
const singleItem = computed(() =>
  auction.value?.items.length === 1 ? auction.value.items[0] : null,
)
const endLabel = computed(() => {
  const current = auction.value
  if (!current) return ''
  return formatDateTime(current.endTimestamp)
})

function onChanged() {
  void refresh()
  void refreshBids()
}

useIntervalFn(() => {
  const current = auction.value
  if (!current || current.settled) return
  void refresh()
  void refreshBids()
}, REFRESH_INTERVAL_MS)

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp * 1000))
}

useSeoMeta({
  title: () => `Auction #${id.value} · Punks Auction`,
  ogTitle: () => `Auction #${id.value} · Punks Auction`,
  twitterTitle: () => `Auction #${id.value} · Punks Auction`,
})

const ogReadClient = useReadClient()
const { data: ogAuction } = await useAsyncData(
  () => `og-auction-${id.value}`,
  async () => {
    if (!validId.value) return null
    const client = ogReadClient.value
    if (!client) return null
    const record = await readAuction(client, id.value)
    if (!record) return null
    return {
      items: record.items.map((item) => ({
        standard: item.standard,
        punkId: item.punkId,
      })),
      latestBidWei: record.latestBidWei.toString(),
      status: auctionStatus({
        endTimestamp: record.endTimestamp,
        settled: record.settled,
      }),
    }
  },
)

// defineOgImage('Lot', {
//   kind: 'auction',
//   id: id.value,
//   items: ogAuction.value?.items ?? [],
//   priceWei: ogAuction.value?.latestBidWei ?? '0',
//   priceLabel: 'Current bid',
//   status: ogAuction.value?.status ?? null,
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
  display: flex;
  align-items: center;
}

.fact a {
  border: 0;
}

.fact :deep(.liveness-indicator) {
  margin-inline-end: var(--size-1);
  vertical-align: 0.1em;
}

.countdown {
  margin-inline-start: var(--size-1);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.state {
  display: grid;
  place-items: center;
  min-height: 60vh;
  padding: var(--size-8);
  text-align: center;
}

.bid-history {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.section-title {
  margin: 0;
}

.event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: var(--border);
  border-bottom: 0;
  background: var(--bg-elevated);
}

.bids-loading {
  padding: var(--size-5);
  text-align: center;
}

.bids-error {
  color: var(--accent);
  font-size: var(--font-sm);
}

@media (max-width: 540px) {
  .title {
    font-size: var(--font-2xl);
  }
}
</style>
