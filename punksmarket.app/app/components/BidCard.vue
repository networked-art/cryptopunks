<template>
  <article
    class="bid-card"
    :class="{ 'bid-card-own': isOwnBid }"
  >
    <NuxtLink
      v-if="display.matchesLink"
      class="bid-link"
      :to="display.matchesLink"
      :aria-label="`See ${display.matchCount?.toLocaleString() ?? 'all'} punks matching bid ${bid.id}`"
    />

    <div class="bid-preview">
      <PunkMosaic
        v-if="display.previewIds.length"
        :ids="display.previewIds"
        :total="display.matchCount ?? undefined"
      />
      <div
        v-else
        class="bid-preview-fallback"
        aria-hidden="true"
      >
        <Icon name="lucide:hash" />
      </div>
    </div>

    <div class="bid-target">
      <span class="bid-title">{{ display.title }}</span>
      <span
        v-if="display.description"
        class="bid-description"
        >{{ display.description }}</span
      >
      <span
        v-if="matchCountLabel"
        class="bid-matches"
        >{{ matchCountLabel }}</span
      >
    </div>

    <div class="bid-meta">
      <EthAmount
        :wei="bid.bidWei"
        :precision="4"
      />
      <span
        v-if="bid.settlementWei > 0n"
        class="bid-settlement"
      >
        +<EthAmount
          :wei="bid.settlementWei"
          :precision="4"
        />
        settlement
      </span>
      <Actions
        v-if="isOwnBid"
        class="bid-actions"
      >
        <BidAdjustForm
          :bid="bid"
          @adjusted="onAdjusted"
        />
        <EvmTransactionFlowDialog
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
      <NuxtLink
        v-else
        class="bid-bidder"
        :to="`/profile/${bid.bidder}`"
      >
        <AccountBadge :address="bid.bidder" />
      </NuxtLink>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { Hash } from 'viem'
import { useConnection } from '@wagmi/vue'
import type { CollectionBid } from '~/composables/usePunksMarketBids'

const props = defineProps<{ bid: CollectionBid }>()
const emit = defineEmits<{
  withdrawn: [tx: Hash]
  adjusted: [tx: Hash]
}>()

const { address } = useConnection()
const { sdk } = usePunksSdk()
const { execute } = useWritePlan()

const display = useBidDisplay(() => props.bid)

const isOwnBid = computed(
  () =>
    !!address.value &&
    address.value.toLowerCase() === props.bid.bidder.toLowerCase(),
)

/// "N matching" reads as redundant when the title is "Punk #X" (count=1) or
/// "N specific punks" (count=N); in those cases the include-id list is the
/// matching set itself. Suppress the label whenever the bid pins specific
/// punks without extra criteria.
const matchCountLabel = computed(() => {
  const count = display.value.matchCount
  if (count === null || display.value.isExact) return null
  const pinned =
    props.bid.includeIds.length > 0 &&
    props.bid.includeIds.length === count
  if (pinned) return null
  return `${count.toLocaleString()} matching`
})

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
</script>

<style scoped>
.bid-card {
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: var(--preview-size) minmax(0, 1fr) max-content;
  grid-template-areas: 'preview target meta';
  align-items: center;
  gap: var(--size-2) var(--size-4);
  padding: var(--size-2) var(--size-3);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-color);
  --preview-size: 48px;
  transition: background 0.1s ease;
}

.bid-card:last-child {
  border-bottom-color: transparent;
}

.bid-card:hover {
  background: var(--bg);
}

.bid-card-own {
  box-shadow: inset 3px 0 0 var(--accent);
}

/* Full-bleed link covers the row so anywhere outside an interactive child is
 * a click-target for the matching-punks search. Actions, account badge, and
 * any other link sit above via z-index. */
.bid-link {
  position: absolute;
  inset: 0;
  z-index: 1;
  border: 0;
  cursor: pointer;
}

.bid-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.bid-preview {
  grid-area: preview;
  inline-size: var(--preview-size);
  pointer-events: none;
}

.bid-preview-fallback {
  inline-size: var(--preview-size);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  background: var(--bg);
  box-shadow: inset 0 0 0 1px var(--border-color);
  font-size: 22px;
}

.bid-target {
  grid-area: target;
  display: flex;
  flex-direction: column;
  gap: var(--size-0);
  min-width: 0;
  z-index: 2;
  pointer-events: none;
}

/* Mirrors `ActivityRow`'s `.kind` eyebrow so a bid row reads in the same
   rhythm as an activity row: small uppercase label, default-weight detail,
   muted meta. Keeps the punk preview and ETH amount as the dominant marks. */
.bid-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bid-description {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bid-matches {
  font-size: 11px;
  color: var(--text-muted);
}

.bid-meta {
  grid-area: meta;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--size-2);
  pointer-events: none;
}

.bid-settlement {
  font-size: 11px;
  color: var(--text-muted);
}

.bid-bidder {
  border: 0;
  position: relative;
  z-index: 3;
  pointer-events: auto;
}

.bid-bidder:hover {
  opacity: 0.85;
}

.bid-actions {
  justify-self: end;
  position: relative;
  z-index: 3;
  pointer-events: auto;
}

@media (max-width: 600px) {
  .bid-card {
    grid-template-columns: var(--preview-size) minmax(0, 1fr);
    grid-template-areas:
      'preview target'
      'preview meta';
    align-items: start;
  }

  .bid-meta {
    align-items: flex-start;
  }
}
</style>
