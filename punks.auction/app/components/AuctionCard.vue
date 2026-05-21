<template>
  <Card class="auction-card">
    <div class="card-head">
      <span class="card-id">Auction #{{ auction.id }}</span>
      <Tag
        small
        :class="status"
        >{{ statusLabel }}</Tag
      >
    </div>

    <LotItems
      :items="auction.items"
      :size="52"
    />

    <dl class="facts">
      <div class="fact">
        <dt>{{ status === 'settled' ? 'Final price' : 'Latest bid' }}</dt>
        <dd>
          <EthAmount :wei="auction.latestBidWei" />
        </dd>
      </div>
      <div
        v-if="status === 'live'"
        class="fact"
      >
        <dt>Min next bid</dt>
        <dd>
          <EthAmount :wei="minNext" />
        </dd>
      </div>
      <div class="fact">
        <dt>{{ status === 'settled' ? 'Winner' : 'High bidder' }}</dt>
        <dd>
          <NuxtLink :to="`/profile/${auction.latestBidder}`">
            <AccountBadge :address="auction.latestBidder" />
          </NuxtLink>
        </dd>
      </div>
      <div class="fact">
        <dt>Seller</dt>
        <dd>
          <NuxtLink :to="`/profile/${auction.seller}`">
            <AccountBadge :address="auction.seller" />
          </NuxtLink>
        </dd>
      </div>
      <div class="fact">
        <dt>{{ status === 'live' ? 'Ends' : 'Ended' }}</dt>
        <dd
          class="when"
          :title="absoluteEnd"
        >
          {{ endLabel }}
        </dd>
      </div>
    </dl>
  </Card>
</template>

<script setup lang="ts">
import {
  auctionStatus,
  minNextBidWei,
  type AuctionRecord,
} from '~/utils/auction'

const props = defineProps<{ auction: AuctionRecord }>()

const status = computed(() => auctionStatus(props.auction))
const statusLabel = computed(
  () =>
    ({ live: 'Live', ended: 'Awaiting settlement', settled: 'Settled' })[
      status.value
    ],
)

const minNext = computed(() => minNextBidWei(props.auction.latestBidWei))

const endIso = computed(() =>
  new Date(props.auction.endTimestamp * 1000).toISOString(),
)
const endLabel = useTimeAgo(endIso)
const absoluteEnd = computed(() =>
  new Date(props.auction.endTimestamp * 1000).toLocaleString(),
)
</script>

<style scoped>
.auction-card {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-2);
}

.card-id {
  font-size: 13px;
  font-weight: 500;
}

:deep(.tag.live) {
  color: var(--accent-strong);
}

:deep(.tag.ended) {
  color: var(--text-muted);
}

.facts {
  margin: 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: var(--size-4);
  row-gap: var(--size-1);
  font-size: 12px;
}

.fact {
  display: contents;
}

.fact dt {
  color: var(--text-dim);
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.05em;
  align-self: center;
}

.fact dd {
  margin: 0;
}

.when {
  font-variant-numeric: tabular-nums;
}
</style>
