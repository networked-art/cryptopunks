<template>
  <ClientOnly>
    <section class="block">
      <h2 class="block-title eyebrow">Auction House Status</h2>
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
          v-if="sortedPunkOffers.length"
          class="context"
        >
          <div class="context-group">
            <h3 class="context-title">Matching offers</h3>
            <ul class="offer-list">
              <li
                v-for="offer in sortedPunkOffers"
                :key="String(offer.id)"
              >
                <OfferRow :offer="offer" />
              </li>
            </ul>
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

          <template v-if="canCreateLot">
            <Button
              v-if="topOffer"
              class="primary"
              @click="actStartAuctionFromOffer(topOffer)"
            >
              Start auction
            </Button>
            <Button
              v-if="topOffer"
              @click="actSellNow(topOffer)"
            >
              Sell now <EthAmount :wei="topOffer.amountWei" />
            </Button>
            <Button
              :class="topOffer ? '' : 'primary'"
              @click="actListLot"
            >
              Create lot
            </Button>
          </template>
        </div>
      </div>

      <LazyDialogCreateLot
        v-if="canCreateLot"
        ref="createLotDialog"
        :punk-id="punkId"
        :standard="standard"
        @created="onChanged"
      />

      <LazyDialogSettle
        v-if="canCreateLot"
        ref="settleDialog"
        :lots="lots"
        @changed="onChanged"
      />
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import { useConnection } from '@wagmi/vue'
import type { Hash } from 'viem'
import type {
  LotRecord,
  OfferRecord,
  TokenStandardValue,
} from '~/utils/auction'
import type { SettleRequest } from '~/utils/settle'

const props = defineProps<{
  punkId: number
  standard: TokenStandardValue
}>()

const emit = defineEmits<{ changed: [tx: Hash] }>()

const detail = usePunkDetailDataContext()
const { punkAuctions, punkLots, punkOffers, settleLots: lots } = detail
const contextPending = computed(
  () => detail.pending.value || detail.auctionPending.value,
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

const sortedPunkOffers = computed(() =>
  [...punkOffers.value]
    .sort((a, b) =>
      a.amountWei < b.amountWei ? 1 : a.amountWei > b.amountWei ? -1 : 0,
    )
    .slice(0, 3),
)

const { address } = useConnection()
const { owner } = detail
const isOwner = computed(
  () =>
    !!address.value &&
    !!owner.value &&
    owner.value.toLowerCase() === address.value.toLowerCase(),
)
const canCreateLot = computed(
  () => isOwner.value && !punkAuctions.value.length && !punkLots.value.length,
)

const createLotDialog = ref<{ start: () => Promise<void> } | null>(null)
const settleDialog = ref<{
  start: (request: SettleRequest) => Promise<void>
} | null>(null)

const itemRef = computed(() => ({
  standard: props.standard,
  punkId: props.punkId,
}))

async function actListLot() {
  if (!(await detail.reconcileOwner())) return
  if (!canCreateLot.value) return
  const latestLots = await detail.ensureFullLots()
  if (hasCurrentSellerLot(latestLots)) return
  void createLotDialog.value?.start()
}

async function actStartAuctionFromOffer(offer: OfferRecord) {
  if (!(await detail.reconcileOwner())) return
  if (!canCreateLot.value) return
  const latestLots = await detail.ensureFullLots()
  await nextTick()
  void settleDialog.value?.start(buildOfferRequest('start', offer, latestLots))
}

async function actSellNow(offer: OfferRecord) {
  if (!(await detail.reconcileOwner())) return
  if (!canCreateLot.value) return
  const latestLots = await detail.ensureFullLots()
  await nextTick()
  void settleDialog.value?.start(buildOfferRequest('accept', offer, latestLots))
}

/// Single-slot offer + the page's punk: skip the inventory picker entirely.
/// Multi-slot: fall back to discovery so the user can fill the other slots.
function buildOfferRequest(
  mode: 'start' | 'accept',
  offer: OfferRecord,
  latestLots: readonly LotRecord[],
): SettleRequest {
  if (offer.slots.length === 1 && !hasCurrentSellerLot(latestLots)) {
    return { mode, offer, items: [itemRef.value] }
  }
  return { mode, offer }
}

function hasCurrentSellerLot(latestLots: readonly LotRecord[]) {
  return latestLots.some(
    (lot) =>
      sameAddress(lot.seller, address.value) &&
      lot.items.some(
        (item) =>
          item.standard === props.standard && item.punkId === props.punkId,
      ),
  )
}

function sameAddress(a?: string | null, b?: string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

function onChanged(tx: Hash) {
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

.offer-list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: white;
}

.offer-list > li + li {
  border-top: var(--border);
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.actions :deep(button .eth-amount) {
  margin-left: var(--size-1);
}

.actions :deep(button .eth-amount .unit) {
  color: inherit;
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
