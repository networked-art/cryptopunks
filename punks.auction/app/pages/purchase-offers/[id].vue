<template>
  <LotDetailShell
    v-if="validId && displayOffer"
    :items="previewItems"
  >
    <header class="head">
      <span class="eyebrow">Offer #{{ displayOffer.id }}</span>
      <h1 class="title">
        <EthAmount :wei="displayOffer.amountWei" />
      </h1>
      <p
        v-if="isMock"
        class="block-note muted"
      >
        Preview data. Wallet actions appear for live offer records.
      </p>
    </header>

    <dl class="facts">
      <div class="fact">
        <dt>Offerer</dt>
        <dd>
          <NuxtLink :to="`/profile/${displayOffer.offerer}`">
            <Account :address="displayOffer.offerer" />
          </NuxtLink>
        </dd>
      </div>

      <div class="fact">
        <dt>Slots</dt>
        <dd>{{ slotCountLabel }}</dd>
      </div>

      <div class="fact">
        <dt>Matching lots</dt>
        <dd>{{ matchingLots.length.toLocaleString() }}</dd>
      </div>
    </dl>

    <OfferActions
      :offer="displayOffer"
      :matching-lots="matchingLots"
      :preview="isMock"
      @changed="onChanged"
    />

    <OfferSlots :slots="displayOffer.slots" />
  </LotDetailShell>

  <div
    v-else
    class="state muted"
  >
    <template v-if="!validId">
      Offer #{{ route.params.id }} does not exist. Offer ids start at 1.
    </template>
    <template v-else-if="pending">Loading offer…</template>
    <template v-else-if="!deployed">
      Offers appear once <code>PunksAuction</code> is deployed.
    </template>
    <template v-else-if="error">Failed to load offer: {{ error }}</template>
    <template v-else>Offer #{{ id }} was not found.</template>
  </div>
</template>

<script setup lang="ts">
import { mockOfferById, useMockLots } from '~/composables/useAuctionData.mock'
import {
  equalLotWeights,
  filterIsEmpty,
  lotMatchesOffer,
  offerSlotToQuery,
  type LotItem,
  type OfferSlot,
} from '~/utils/auction'

const route = useRoute()
const id = computed(() => Number(route.params.id))
const validId = computed(() => Number.isInteger(id.value) && id.value >= 1)
const offline = usePunksOffline()

const {
  offer,
  pending,
  error,
  deployed: offerDeployed,
  refresh,
} = useOffer(() => (validId.value ? id.value : undefined))
const { lots, pending: lotsPending, refresh: refreshLots } = useLots()
const { lots: mockLots, deployed: mockLotsDeployed } = useMockLots()
const { criteriaMatchesPunk, searchCriteriaMatches } = useOfferSlotMatching()

const mockOffer = computed(() =>
  validId.value ? mockOfferById(id.value) : null,
)
const displayOffer = computed(
  () => offer.value ?? (!pending.value ? mockOffer.value : null),
)
const isMock = computed(() => !offer.value && !!displayOffer.value)
const displayLots = computed(() =>
  lots.value.length || lotsPending.value ? lots.value : mockLots.value,
)
const deployed = computed(() => offerDeployed || mockLotsDeployed)

const slotCountLabel = computed(() => {
  const count = displayOffer.value?.slots.length ?? 0
  return `${count.toLocaleString()} slot${count === 1 ? '' : 's'}`
})

type SlotMatchCache = {
  previewMatches: number[]
  criteriaMatches?: Set<number>
}

const slotMatchCache = computed(() => {
  const cache = new WeakMap<OfferSlot, SlotMatchCache>()
  const offer = displayOffer.value
  if (!offer) return cache

  for (const slot of offer.slots) {
    cache.set(slot, {
      previewMatches: searchSlotMatches(slot),
      criteriaMatches: filterIsEmpty(slot.criteria)
        ? undefined
        : new Set(searchCriteriaMatches(slot)),
    })
  }

  return cache
})

const previewItems = computed<LotItem[]>(() => {
  const offer = displayOffer.value
  if (!offer) return []
  const candidates = offer.slots
    .map((slot) => {
      const punkId = slot.includeIds[0] ?? slotPreviewMatches(slot)[0]
      return punkId === undefined ? null : { standard: slot.standard, punkId }
    })
    .filter((item): item is Pick<LotItem, 'standard' | 'punkId'> => !!item)

  const weights = equalLotWeights(candidates.length)
  return candidates.map((item, index) => ({
    ...item,
    weightBps: weights[index] ?? 0,
  }))
})

const matchingLots = computed(() => {
  const offer = displayOffer.value
  if (!offer) return []
  return displayLots.value
    .filter((lot) =>
      lotMatchesOffer(offer, lot, (slot, punkId) =>
        slotCriteriaMatchesPunk(slot, punkId),
      ),
    )
    .sort((a, b) => compareBigint(b.reserveWei, a.reserveWei))
})

function onChanged() {
  void refresh()
  void refreshLots()
}

function slotPreviewMatches(slot: OfferSlot) {
  return (
    slotMatchCache.value.get(slot)?.previewMatches ?? searchSlotMatches(slot)
  )
}

function slotCriteriaMatchesPunk(slot: OfferSlot, punkId: number) {
  const cached = slotMatchCache.value.get(slot)
  if (cached?.criteriaMatches) return cached.criteriaMatches.has(punkId)
  return criteriaMatchesPunk(slot, punkId)
}

function searchSlotMatches(slot: OfferSlot) {
  try {
    return offline.search(offerSlotToQuery(slot))
  } catch {
    return []
  }
}

function compareBigint(a: bigint, b: bigint): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

useSeoMeta({
  title: () => `Offer #${id.value} · Punks Auction`,
  ogTitle: () => `Offer #${id.value} · Punks Auction`,
  twitterTitle: () => `Offer #${id.value} · Punks Auction`,
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

.title :deep(.eth-amount) {
  gap: var(--size-2);
}

.block-note {
  margin: 0;
  font-size: var(--font-sm);
}

.facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

@media (max-width: 540px) {
  .facts {
    grid-template-columns: 1fr;
  }

  .title {
    font-size: var(--font-2xl);
  }
}
</style>
