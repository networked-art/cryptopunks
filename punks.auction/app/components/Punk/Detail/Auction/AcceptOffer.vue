<template>
  <div class="accept-offer">
    <Button @click="choiceOpen = true">
      Accept highest offer
    </Button>

    <Dialog
      v-model:open="choiceOpen"
      title="Use highest offer"
      class="accept-offer-dialog"
      compat
    >
      <p class="form-note muted">
        Highest matching offer for this Punk is
        <EthAmount :wei="offer.amountWei" />
        from
        <NuxtLink :to="`/profile/${offer.offerer}`">
          <Account :address="offer.offerer" />
        </NuxtLink>.
      </p>

      <div class="choices">
        <button
          type="button"
          class="choice unstyled"
          @click="pickMode('start')"
        >
          <span class="choice-title">Start auction</span>
          <span class="choice-description">
            Open a 24-hour public auction with this offer as the opening bid.
            Anyone can outbid; you keep the final hammer price.
          </span>
        </button>

        <button
          type="button"
          class="choice unstyled"
          @click="pickMode('accept')"
        >
          <span class="choice-title">
            Accept offer
            <EthAmount :wei="offer.amountWei" />
          </span>
          <span class="choice-description">
            Settle this Punk instantly to {{ offererLabel }} at the offered
            price. No chance for higher bids.
          </span>
        </button>
      </div>

      <template #footer>
        <Button
          class="secondary"
          @click="choiceOpen = false"
        >
          Cancel
        </Button>
      </template>
    </Dialog>

    <DialogOfferFulfillment
      ref="fulfillmentDialogRef"
      :offer="offer"
      :lots="lots"
      :matching-lots="matchingLots"
      @changed="onChanged"
    />
  </div>
</template>

<script setup lang="ts">
import type { Hash } from 'viem'
import {
  lotMatchesOffer,
  type OfferRecord,
  type TokenStandardValue,
} from '~/utils/auction'
import type { OfferFulfillmentMode } from '~/utils/offerFulfillment'

const props = defineProps<{
  punkId: number
  standard: TokenStandardValue
  offer: OfferRecord
}>()

const emit = defineEmits<{ changed: [tx: Hash] }>()

const { lots } = useLots()
const { criteriaMatchesPunk } = useOfferSlotMatching()

const matchingLots = computed(() =>
  lots.value.filter((lot) =>
    lotMatchesOffer(props.offer, lot, criteriaMatchesPunk),
  ),
)

const choiceOpen = ref(false)
const fulfillmentDialogRef = ref<{
  start: (mode: OfferFulfillmentMode) => Promise<void>
} | null>(null)

const offererLabel = computed(
  () => `${props.offer.offerer.slice(0, 6)}…${props.offer.offerer.slice(-4)}`,
)

function pickMode(mode: OfferFulfillmentMode) {
  choiceOpen.value = false
  void fulfillmentDialogRef.value?.start(mode)
}

function onChanged(tx: Hash) {
  emit('changed', tx)
}
</script>

<style scoped>
.accept-offer {
  display: contents;
}

.form-note {
  margin: 0;
  font-size: var(--font-sm);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--size-1);
}

.form-note :deep(a) {
  border: 0;
}

.choices {
  display: grid;
  gap: var(--size-2);
}

.choice {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--size-1);
  width: 100%;
  min-width: 0;
  padding: var(--size-3) var(--size-4);
  background: white;
  border: var(--border);
  color: inherit;
  font: inherit;
  text-align: left;
  white-space: normal;
  cursor: pointer;
  transition: box-shadow 120ms ease;
}

.choice:hover,
.choice:focus-visible {
  box-shadow: inset 2px 0 0 var(--accent);
}

.choice:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: var(--size-1);
}

.choice-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--size-2);
  font-size: var(--font-md);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight, 1.2);
}

.choice-description {
  font-size: var(--font-sm);
  color: var(--text-muted);
  line-height: var(--line-height-md, 1.4);
}

.accept-offer-dialog :deep(section) {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.accept-offer-dialog :deep(.eth-amount .unit) {
  color: inherit;
}
</style>
