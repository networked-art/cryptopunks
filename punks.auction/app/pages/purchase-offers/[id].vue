<template>
  <LotDetailShell
    v-if="validId && offer"
    :items="previewItems"
  >
    <header class="head">
      <span class="eyebrow">Offer #{{ offer.id }}</span>
      <h1 class="title">
        <EthAmount :wei="offer.amountWei" />
      </h1>
      <p class="byline muted">
        <NuxtLink :to="`/profile/${offer.offerer}`">
          <Account :address="offer.offerer" />
        </NuxtLink>
      </p>
    </header>

    <OfferActions
      :offer="offer"
      :lots="lots"
      :matching-lots="matchingLots"
      @changed="onChanged"
    />

    <OfferSlots :slots="offer.slots" />
  </LotDetailShell>

  <div
    v-else
    class="state muted"
  >
    <template v-if="!validId">
      Offer #{{ route.params.id }} does not exist. Offer ids start at 1.
    </template>
    <template v-else-if="pending">
      <Spinner label="Loading offer" />
    </template>
    <template v-else-if="!deployed">
      Offers appear once <code>PunksAuction</code> is deployed.
    </template>
    <template v-else-if="error">Failed to load offer: {{ error }}</template>
    <template v-else>Offer #{{ id }} was not found.</template>
  </div>
</template>

<script setup lang="ts">
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

const { offer, pending, error, deployed, refresh } = useOffer(() =>
  validId.value ? id.value : undefined,
)
const { lots, refresh: refreshLots } = useLots()
const { criteriaMatchesPunk, searchCriteriaMatches } = useOfferSlotMatching()

type SlotMatchCache = {
  previewMatches: number[]
  criteriaMatches?: Set<number>
}

const slotMatchCache = computed(() => {
  const cache = new WeakMap<OfferSlot, SlotMatchCache>()
  const current = offer.value
  if (!current) return cache

  for (const slot of current.slots) {
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
  const current = offer.value
  if (!current) return []
  const candidates = current.slots
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
  const current = offer.value
  if (!current) return []
  return lots.value
    .filter((lot) =>
      lotMatchesOffer(current, lot, (slot, punkId) =>
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

.byline {
  display: flex;
  align-items: center;
  gap: var(--size-1);
  margin: 0;
  font-size: var(--font-sm);
}

.byline a {
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
  .title {
    font-size: var(--font-2xl);
  }
}
</style>
