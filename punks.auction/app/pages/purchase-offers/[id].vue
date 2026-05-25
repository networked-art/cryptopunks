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

    <section class="slots-block">
      <h2 class="block-title eyebrow">Slots</h2>
      <ul class="slots">
        <li
          v-for="slot in slotDetails"
          :key="slot.key"
          class="slot"
        >
          <div class="slot-head">
            <Tag small>{{ slot.standardLabel }}</Tag>
            <span class="slot-title">Slot {{ slot.index + 1 }}</span>
            <span class="muted slot-count">{{ slot.countLabel }}</span>
          </div>

          <p class="slot-summary">{{ slot.summary }}</p>

          <div
            v-if="slot.previewIds.length"
            class="slot-thumbs"
          >
            <PunkThumb
              v-for="punkId in slot.previewIds"
              :key="punkId"
              :punk-id="punkId"
              :standard="slot.standard"
              :size="42"
            />
          </div>

          <dl
            v-if="slot.includeIds.length || slot.excludeIds.length"
            class="id-lists"
          >
            <div
              v-if="slot.includeIds.length"
              class="id-list"
            >
              <dt>Included</dt>
              <dd>
                <NuxtLink
                  v-for="punkId in slot.includeIds"
                  :key="punkId"
                  :to="punkHref(slot.standard, punkId)"
                >
                  #{{ punkId }}
                </NuxtLink>
              </dd>
            </div>
            <div
              v-if="slot.excludeIds.length"
              class="id-list"
            >
              <dt>Excluded</dt>
              <dd>
                <NuxtLink
                  v-for="punkId in slot.excludeIds"
                  :key="punkId"
                  :to="punkHref(slot.standard, punkId)"
                >
                  #{{ punkId }}
                </NuxtLink>
              </dd>
            </div>
          </dl>
        </li>
      </ul>
    </section>
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
  lotMatchesOffer,
  offerSlotSummary,
  offerSlotToQuery,
  punkHref,
  standardLabel,
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

const slotDetails = computed(() => {
  const offer = displayOffer.value
  if (!offer) return []
  return offer.slots.map((slot, index) => {
    const matches = slotMatches(slot)
    return {
      key: `${index}-${slot.standard}`,
      index,
      standard: slot.standard,
      standardLabel: standardLabel(slot.standard),
      summary: offerSlotSummary(slot),
      countLabel: `${matches.length.toLocaleString()} match${
        matches.length === 1 ? '' : 'es'
      }`,
      previewIds: previewIdsForSlot(slot, matches),
      includeIds: slot.includeIds,
      excludeIds: slot.excludeIds,
    }
  })
})

const previewItems = computed<LotItem[]>(() => {
  const offer = displayOffer.value
  if (!offer) return []
  const candidates = offer.slots
    .map((slot) => {
      const punkId = slot.includeIds[0] ?? slotMatches(slot)[0]
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
        slotMatches(slot).includes(punkId),
      ),
    )
    .sort((a, b) => compareBigint(b.reserveWei, a.reserveWei))
})

function onChanged() {
  void refresh()
  void refreshLots()
}

function slotMatches(slot: OfferSlot) {
  try {
    return offline.search(offerSlotToQuery(slot))
  } catch {
    return []
  }
}

function previewIdsForSlot(slot: OfferSlot, matches: number[]) {
  const ids = slot.includeIds.length ? slot.includeIds : matches
  return ids.slice(0, 12)
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

.slots-block {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.block-title {
  margin: 0;
}

.slots {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  margin: 0;
  padding: 0;
}

.slot {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.slot-head {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.slot-title {
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
}

.slot-count {
  margin-left: auto;
  font-size: var(--font-xs);
}

.slot-summary {
  margin: 0;
  font-size: var(--font-sm);
}

.slot-thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-1);
}

.id-lists {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  margin: 0;
  font-size: var(--font-xs);
}

.id-list {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--size-2);
}

.id-list dt {
  color: var(--text-dim);
  text-transform: uppercase;
}

.id-list dd {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-1);
  margin: 0;
}

.id-list a {
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
