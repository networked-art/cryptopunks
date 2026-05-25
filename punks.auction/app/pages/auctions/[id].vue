<template>
  <LotDetailShell
    v-if="validId && displayAuction"
    :items="displayAuction.items"
  >
    <header class="head">
      <span class="eyebrow">Auction #{{ displayAuction.id }}</span>
      <h1 class="title">{{ itemCountLabel }}</h1>
      <p
        v-if="isMock"
        class="block-note muted"
      >
        Preview data. Wallet actions appear for live auction records.
      </p>
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
          <NuxtLink :to="`/profile/${displayAuction.latestBidder}`">
            <Account :address="displayAuction.latestBidder" />
          </NuxtLink>
        </dd>
      </div>

      <div class="fact">
        <dt>Curent bid</dt>
        <dd>
          <EthAmount :wei="displayAuction.latestBidWei" />
        </dd>
      </div>

      <div class="fact">
        <dt>Seller</dt>
        <dd>
          <NuxtLink :to="`/profile/${displayAuction.seller}`">
            <Account :address="displayAuction.seller" />
          </NuxtLink>
        </dd>
      </div>

      <div
        v-if="displayMinimumBidWei"
        class="fact"
      >
        <dt>Next bid</dt>
        <dd>
          <EthAmount :wei="displayMinimumBidWei" />
        </dd>
      </div>
    </dl>

    <AuctionActions
      v-if="displayMinimumBidWei"
      :auction="displayAuction"
      :minimum-bid-wei="displayMinimumBidWei"
      :preview="isMock"
      @changed="onChanged"
    />

    <LotDetailItems :items="displayAuction.items" />
  </LotDetailShell>

  <div
    v-else
    class="state muted"
  >
    <template v-if="!validId">
      Auction #{{ route.params.id }} does not exist. Auction ids start at 1.
    </template>
    <template v-else-if="pending">Loading auction…</template>
    <template v-else-if="!deployed">
      Auctions appear once <code>PunksAuction</code> is deployed.
    </template>
    <template v-else-if="error">Failed to load auction: {{ error }}</template>
    <template v-else>Auction #{{ id }} was not found.</template>
  </div>
</template>

<script setup lang="ts">
import { mockAuctionById } from '~/composables/useAuctionData.mock'
import {
  auctionStatus,
  formatLotItemsLabel,
  minNextBidWei,
  type AuctionStatus,
} from '~/utils/auction'

const COUNTDOWN_WINDOW_SECONDS = 12 * 60 * 60

const route = useRoute()
const id = computed(() => Number(route.params.id))
const validId = computed(() => Number.isInteger(id.value) && id.value >= 1)

const { auction, minimumBidWei, pending, error, deployed, refresh } =
  useAuction(() => (validId.value ? id.value : undefined))

const mockAuction = computed(() =>
  validId.value ? mockAuctionById(id.value) : null,
)
const displayAuction = computed(
  () => auction.value ?? (!pending.value ? mockAuction.value : null),
)
const isMock = computed(() => !auction.value && !!displayAuction.value)

const now = useSeconds()
const status = computed<AuctionStatus>(() => {
  const current = displayAuction.value
  if (!current) return 'settled'
  return auctionStatus(current, now.value)
})
const secondsUntilEnd = computed(() => {
  const current = displayAuction.value
  return current ? Math.max(0, current.endTimestamp - now.value) : 0
})
const endCountdown = useCountDown(secondsUntilEnd, COUNTDOWN_WINDOW_SECONDS + 1)
const statusLabel = computed(() => {
  if (status.value === 'live') return 'Live'
  if (status.value === 'ended') return 'Awaiting settlement'
  return 'Settled'
})

const itemCountLabel = computed(() =>
  displayAuction.value ? formatLotItemsLabel(displayAuction.value.items) : '',
)
const endLabel = computed(() => {
  const current = displayAuction.value
  if (!current) return ''
  return formatDateTime(current.endTimestamp)
})
const actionMinimumBidWei = computed(() => {
  const current = displayAuction.value
  return current ? minNextBidWei(current.latestBidWei) : null
})
const displayMinimumBidWei = computed(
  () => minimumBidWei.value ?? actionMinimumBidWei.value,
)

function onChanged() {
  void refresh()
}

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

@media (max-width: 540px) {
  .title {
    font-size: var(--font-2xl);
  }
}
</style>
