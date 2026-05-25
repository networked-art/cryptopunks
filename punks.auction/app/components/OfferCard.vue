<template>
  <Card class="offer-card">
    <div class="card-head">
      <NuxtLink
        class="card-id"
        :to="detailHref"
      >
        Offer #{{ offer.id }}
      </NuxtLink>
      <EthAmount
        class="amount"
        :wei="offer.amountWei"
      />
    </div>

    <dl class="facts">
      <div class="fact">
        <dt class="eyebrow">Offerer</dt>
        <dd>
          <NuxtLink :to="`/profile/${offer.offerer}`">
            <Account :address="offer.offerer" />
          </NuxtLink>
        </dd>
      </div>
      <div class="fact">
        <dt class="eyebrow">Bundle</dt>
        <dd>
          {{ offer.slots.length }} slot{{ offer.slots.length === 1 ? '' : 's' }}
        </dd>
      </div>
    </dl>

    <ul class="slots">
      <li
        v-for="(slot, i) in slots"
        :key="i"
        class="slot"
      >
        <div class="slot-head">
          <Tag small>{{ slot.standardLabel }}</Tag>
          <span class="slot-summary">{{ slot.summary }}</span>
          <span class="muted slot-count">{{ slot.countLabel }}</span>
        </div>
        <div
          v-if="slot.thumbs.length"
          class="slot-thumbs"
        >
          <PunkThumb
            v-for="punkId in slot.thumbs"
            :key="punkId"
            :punk-id="punkId"
            :standard="slot.standard"
            :size="36"
          />
        </div>
      </li>
    </ul>

    <div class="card-footer">
      <NuxtLink
        class="details-link"
        :to="detailHref"
      >
        View offer
      </NuxtLink>
    </div>
  </Card>
</template>

<script setup lang="ts">
import {
  offerSlotSummary,
  offerSlotToQuery,
  standardLabel,
  type OfferRecord,
} from '~/utils/auction'

defineOptions({ name: 'OfferCard' })

const props = defineProps<{ offer: OfferRecord }>()

const offline = usePunksOffline()
const detailHref = computed(() => `/purchase-offers/${props.offer.id}`)

const slots = computed(() =>
  props.offer.slots.map((slot) => {
    let countLabel = ''
    try {
      const count = offline.count(offerSlotToQuery(slot))
      countLabel = `${count.toLocaleString()} match${count === 1 ? '' : 'es'}`
    } catch {
      countLabel = ''
    }
    return {
      standard: slot.standard,
      standardLabel: standardLabel(slot.standard),
      summary: offerSlotSummary(slot),
      countLabel,
      thumbs: slot.includeIds.slice(0, 8),
    }
  }),
)
</script>

<style scoped>
.offer-card {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--size-2);
}

.card-id {
  font-size: var(--font-md);
  font-weight: var(--font-weight-bold);
  border: 0;
}

.amount {
  font-size: var(--font-lg);
}

.facts {
  margin: 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: var(--size-4);
  row-gap: var(--size-1);
  font-size: var(--font-sm);
}

.fact {
  display: contents;
}

.fact dt {
  align-self: center;
}

.fact dd {
  margin: 0;
}

.fact a {
  border: 0;
}

.slots {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.slot {
  padding: var(--size-2);
  border: var(--border);
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.slot-head {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.slot-summary {
  font-size: var(--font-sm);
}

.slot-count {
  margin-left: auto;
  font-size: var(--font-xs);
}

.slot-thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-1);
}

.details-link {
  border: 0;
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
}
</style>
