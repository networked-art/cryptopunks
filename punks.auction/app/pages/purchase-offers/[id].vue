<template>
  <LotDetailShell
    v-if="validId && offer"
    :items="previewItems"
  >
    <header class="head">
      <span class="eyebrow">Offer #{{ offer.id }}</span>
      <h1 class="title">
        <NuxtLink
          v-if="exactOfferItem"
          :to="punkHref(exactOfferItem.standard, exactOfferItem.punkId)"
        >
          Punk <span class="dim">#</span>{{ exactOfferItem.punkId }}
          <Tag
            v-if="exactOfferItem.standard === TokenStandard.CryptoPunksV1"
            small
            class="v1-tag"
            >V1</Tag
          >
        </NuxtLink>
        <template v-else>{{ offerHeading.title }}</template>
      </h1>
      <p
        v-if="offerHeading.subtitleParts.length"
        class="subtitle"
      >
        <template
          v-for="(part, index) in offerHeading.subtitleParts"
          :key="`${part.text}-${index}`"
        >
          <NuxtLink
            v-if="part.href"
            class="subtitle-link"
            :to="part.href"
          >
            {{ part.text }}
          </NuxtLink>
          <span v-else>{{ part.text }}</span>
          <span
            v-if="index < offerHeading.subtitleParts.length - 1"
            class="subtitle-separator"
            >·</span
          >
        </template>
      </p>
    </header>

    <dl class="facts">
      <div class="fact">
        <dt>Offer amount</dt>
        <dd>
          <EthAmount :wei="offer.amountWei" />
        </dd>
      </div>

      <div class="fact">
        <dt>Offerer</dt>
        <dd>
          <NuxtLink :to="`/profile/${offer.offerer}`">
            <Account :address="offer.offerer" />
          </NuxtLink>
        </dd>
      </div>
    </dl>

    <OfferActions
      :offer="offer"
      :lots="lots"
      :matching-lots="matchingLots"
      @changed="onChanged"
    />

    <OfferSlots
      v-if="showOfferSlots"
      :slots="offer.slots"
    />
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
    <template v-else-if="error">Failed to load offer: {{ error }}</template>
    <p v-else-if="acted || wasAssigned">
      Offer #{{ id }} is no longer active.
      <NuxtLink to="/purchase-offers">View all offers</NuxtLink>
    </p>
    <template v-else>Offer #{{ id }} was not found.</template>
  </div>
</template>

<script setup lang="ts">
import {
  equalLotWeights,
  filterIsEmpty,
  lotMatchesOffer,
  offerSlotCriteriaToQuery,
  offerSlotMatchingIds,
  punkHref,
  TokenStandard,
  type LotItem,
  type OfferSlot,
} from '~/utils/auction'
import {
  offerSlotExactItem,
  offerSlotHeading,
} from '~/composables/useOfferSlotDisplay'

const route = useRoute()
const id = computed(() => Number(route.params.id))
const validId = computed(() => Number.isInteger(id.value) && id.value >= 1)
const offline = usePunksOffline()

const { offer, lastOfferId, pending, error, refresh } = useOffer(() =>
  validId.value ? id.value : undefined,
)
const { lots, refresh: refreshLots } = useLots()
const { criteriaMatchesPunk, searchCriteriaMatches } = useOfferSlotMatching()
const acted = ref(false)
const wasAssigned = computed(
  () => lastOfferId.value !== null && BigInt(id.value) <= lastOfferId.value,
)

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
      const punkId = slotPreviewPunkId(slot)
      return punkId === undefined ? null : { standard: slot.standard, punkId }
    })
    .filter((item): item is Pick<LotItem, 'standard' | 'punkId'> => !!item)

  const weights = equalLotWeights(candidates.length)
  return candidates.map((item, index) => ({
    ...item,
    weightBps: weights[index] ?? 0,
  }))
})

const singleSlot = computed<OfferSlot | null>(() => {
  const current = offer.value
  return current && current.slots.length === 1 ? current.slots[0]! : null
})

const exactOfferItem = computed(() =>
  singleSlot.value ? offerSlotExactItem(singleSlot.value) : null,
)

const offerHeading = computed(() => {
  const slot = singleSlot.value
  return slot
    ? offerSlotHeading(slot, offline)
    : { title: 'Multi item offer', subtitleParts: [] }
})

const showOfferSlots = computed(() => !singleSlot.value)

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
  acted.value = true
  void refresh()
  void refreshLots()
}

function slotPreviewMatches(slot: OfferSlot) {
  return (
    slotMatchCache.value.get(slot)?.previewMatches ?? searchSlotMatches(slot)
  )
}

function slotPreviewPunkId(slot: OfferSlot) {
  if (filterIsEmpty(slot.criteria)) {
    return slot.includeIds[0] ?? slotPreviewMatches(slot)[0]
  }

  return slotCriteriaPreviewMatches(slot)[0] ?? slotPreviewMatches(slot)[0]
}

function slotCriteriaPreviewMatches(slot: OfferSlot) {
  const matches = slotMatchCache.value.get(slot)?.criteriaMatches
  const ids = matches ? [...matches] : searchCriteriaMatches(slot)
  const excluded = new Set(slot.excludeIds)
  return ids.filter((punkId) => !excluded.has(punkId))
}

function slotCriteriaMatchesPunk(slot: OfferSlot, punkId: number) {
  const cached = slotMatchCache.value.get(slot)
  if (cached?.criteriaMatches) return cached.criteriaMatches.has(punkId)
  return criteriaMatchesPunk(slot, punkId)
}

function searchSlotMatches(slot: OfferSlot) {
  try {
    return offerSlotMatchingIds(
      slot,
      offline.search(offerSlotCriteriaToQuery(slot)),
    )
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

.subtitle {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--size-1);
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.subtitle-link {
  color: inherit;
  border: 0;
}

.subtitle-link:hover,
.subtitle-link:focus-visible {
  color: var(--accent);
}

.subtitle-separator {
  color: var(--text-dim);
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  gap: var(--size-3);
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

.state p {
  margin: 0;
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
