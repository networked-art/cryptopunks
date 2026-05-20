<template>
  <article class="bid-card">
    <header class="bid-head">
      <span class="bid-id">#{{ bid.id }}</span>
      <span class="muted bid-block">block {{ bid.placedAtBlock }}</span>
    </header>

    <div class="bid-amount">
      <EthAmount
        :wei="bid.bidWei"
        :precision="6"
      />
      <span
        v-if="bid.settlementWei > 0n"
        class="muted bid-settlement"
      >
        +<EthAmount
          :wei="bid.settlementWei"
          :precision="6"
        />
        settlement
      </span>
    </div>

    <div class="bid-bidder">
      <NuxtLink :to="`/profile/${bid.bidder}`">
        <AccountBadge :address="bid.bidder" />
      </NuxtLink>
    </div>

    <div
      v-if="matchCount !== null"
      class="bid-matches"
    >
      <NuxtLink
        v-if="matchesLink"
        class="muted matches-link"
        :to="matchesLink"
        >{{ matchingPunksLabel }}</NuxtLink
      >
      <span
        v-else
        class="muted matches-link"
        >{{ matchingPunksLabel }}</span
      >
    </div>

    <Actions
      v-if="isOwnBid"
      class="left card-actions"
    >
      <BidAdjustForm
        :bid="bid"
        @adjusted="onAdjusted"
      />
      <EvmTransactionFlowDialog
        chain="mainnet"
        keep-open
        skip-confirmation
        :request="withdraw"
        :text="dialogText"
        @complete="onWithdrawn"
      >
        <template #start="{ start }">
          <Button
            class="small"
            @click="start"
          >
            Withdraw
          </Button>
        </template>
      </EvmTransactionFlowDialog>
    </Actions>
  </article>
</template>

<script setup lang="ts">
import type { Hash } from 'viem'
import { useConnection } from '@wagmi/vue'
import { formatSearchText } from '@networked-art/punks-sdk'
import {
  bidToQuery,
  type CollectionBid,
} from '~/composables/usePunksMarketBids'

const props = defineProps<{ bid: CollectionBid }>()
const emit = defineEmits<{
  withdrawn: [tx: Hash]
  adjusted: [tx: Hash]
}>()

const offline = usePunksOffline()
const { address } = useConnection()
const { sdk } = usePunksSdk()
const { execute } = useWritePlan()

const isOwnBid = computed(
  () =>
    !!address.value &&
    address.value.toLowerCase() === props.bid.bidder.toLowerCase(),
)

const dialogText = {
  title: { confirm: 'Withdraw bid', waiting: 'Withdrawing bid' },
  lead: { confirm: 'Cancel this collection bid and reclaim the escrowed ETH.' },
  action: { confirm: 'Withdraw' },
}

function withdraw(): Promise<Hash> {
  return execute(sdk.value.v1Market.prepareCancelBid(props.bid.id))
}

function onWithdrawn(receipt: { transactionHash: Hash }) {
  emit('withdrawn', receipt.transactionHash)
}

function onAdjusted(tx: Hash) {
  emit('adjusted', tx)
}

const matchCount = computed(() => {
  try {
    return offline.count(bidToQuery(props.bid))
  } catch {
    return null
  }
})

const matchingPunksLabel = computed(() => {
  const count = matchCount.value
  if (count === null) return ''
  return `${count.toLocaleString()} matching punk${count === 1 ? '' : 's'}`
})

/// Rebuild the front-end search query string that selects the same punks
/// this bid covers. An empty result means the bid imposes no filter — link
/// to the unfiltered grid instead of `/?q=`. Filters with features the
/// text grammar can't express (forbidden masks, exotic any-of groups)
/// throw and leave the link unrendered.
const matchesLink = computed(() => {
  try {
    const q = formatSearchText(offline.dataset.source, {
      criteria: props.bid.criteria,
      includeIds: props.bid.includeIds,
      excludeIds: props.bid.excludeIds,
    })
    return q ? { path: '/', query: { q } } : { path: '/' }
  } catch {
    return null
  }
})
</script>

<style scoped>
.bid-card {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  padding: var(--size-3);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  transition: border-color 0.1s;
}

.bid-card:hover {
  border-color: var(--accent-soft);
}

.bid-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.bid-id {
  color: var(--text-muted);
}

.bid-amount {
  font-size: 18px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bid-settlement {
  font-size: 11px;
}

.matches-link {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 0;
}

.matches-link:hover {
  color: var(--accent);
}

.card-actions {
  border-top: 1px solid var(--border-color);
  padding: var(--size-3);
  margin: var(--size-1) calc(-1 * var(--size-3)) calc(-1 * var(--size-3));
}
</style>
