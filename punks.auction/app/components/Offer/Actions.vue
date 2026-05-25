<template>
  <ClientOnly>
    <section
      v-if="showActionsPanel"
      class="actions-panel"
    >
      <h2 class="block-title eyebrow">Actions</h2>

      <template v-if="showSellerActions">
        <div class="button-row">
          <Button
            class="primary"
            @click="startFulfillment('accept')"
          >
            Accept <EthAmount :wei="offer.amountWei" />
          </Button>
          <Button @click="startFulfillment('start')"> Start auction </Button>
        </div>
      </template>

      <p
        v-if="transactionError"
        class="warn"
      >
        {{ transactionError }}
      </p>

      <div
        v-if="showSellerActions && isOfferer"
        class="action-divider"
        aria-hidden="true"
      />

      <template v-if="isOfferer">
        <label class="amount-field">
          <span class="label">Offer amount</span>
          <input
            v-model="amountEth"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <div class="button-row">
          <Button
            :disabled="!parsedAmountWei"
            @click="actAdjustAmount"
          >
            Adjust amount
          </Button>
          <Button @click="actCancel">Cancel offer</Button>
        </div>
      </template>

      <DialogOfferFulfillment
        ref="fulfillmentDialogRef"
        :offer="offer"
        :lots="lots"
        :matching-lots="matchingLots"
        @changed="onChanged"
      />

      <EvmTransactionFlowDialog
        ref="transactionDialogRef"
        chain="mainnet"
        :request="transactionRequest"
        :text="transactionText"
        keep-open
        @complete="onTransactionComplete"
      />

      <EvmMultiTransactionFlowDialog
        ref="multiDialogRef"
        chain="mainnet"
        :steps="flowSteps"
        :text="multiDialogText"
        @complete="onMultiTransactionComplete"
        @error="onFlowError"
      />
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import { useConnection } from '@wagmi/vue'
import { formatEther, parseEther, type Address, type Hash } from 'viem'
import {
  TokenStandard,
  ZERO_ADDRESS,
  type LotRecord,
  type OfferRecord,
} from '~/utils/auction'
import type { OfferFulfillmentMode } from '~/utils/offerFulfillment'

const props = withDefaults(
  defineProps<{
    offer: OfferRecord
    lots: LotRecord[]
    matchingLots: LotRecord[]
    preview?: boolean
  }>(),
  {
    preview: false,
  },
)

const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { address } = useConnection()
const renderV1 = useV1Rendering()
const { matchesItem: slotMatchesItem } = useOfferSlotMatching()
const inventory = useAccountPunkInventory(() => address.value)
const amountEth = ref('')

const fulfillmentDialogRef = ref<{
  start: (mode: OfferFulfillmentMode) => Promise<void>
} | null>(null)
const transactionFlow = useTransactionFlowRunner({
  onComplete: (tx) => emit('changed', tx),
})
const {
  error: transactionError,
  transactionDialogRef,
  transactionRequest,
  transactionText,
  multiDialogRef,
  flowSteps,
  multiDialogText,
  runPlan,
  onTransactionComplete,
  onMultiTransactionComplete,
  onFlowError,
} = transactionFlow

watch(
  () => props.offer,
  (offer) => {
    amountEth.value = formatEther(offer.amountWei)
  },
  { immediate: true },
)

const parsedAmountWei = computed(() => parsePositiveEth(amountEth.value))
const isOfferer = computed(() =>
  sameAddress(address.value, props.offer.offerer),
)
const hasSellerLot = computed(() =>
  props.matchingLots.some(
    (lot) =>
      sameAddress(lot.seller, address.value) &&
      (sameAddress(lot.onlySellTo, ZERO_ADDRESS) ||
        sameAddress(lot.onlySellTo, props.offer.offerer)) &&
      (renderV1.value ||
        !lot.items.some(
          (item) => item.standard === TokenStandard.CryptoPunksV1,
        )),
  ),
)
const canFillOfferFromInventory = computed(() => {
  if (!address.value || props.preview) return false
  if (
    !renderV1.value &&
    props.offer.slots.some(
      (slot) => slot.standard === TokenStandard.CryptoPunksV1,
    )
  ) {
    return false
  }

  const reservedKeys = activeLotItemKeys()
  const candidateKeysBySlot = props.offer.slots.map((slot) =>
    inventory.items.value
      .filter((item) => item.custody !== 'unsupported')
      .filter((item) => !reservedKeys.has(item.key))
      .filter((item) =>
        slotMatchesItem(slot, {
          standard: item.standard,
          punkId: item.punkId,
        }),
      )
      .map((item) => item.key),
  )

  return hasUniqueCandidateAssignment(candidateKeysBySlot)
})
const showSellerActions = computed(
  () =>
    !!address.value &&
    !props.preview &&
    (hasSellerLot.value || canFillOfferFromInventory.value),
)
const showActionsPanel = computed(
  () =>
    !!address.value &&
    !props.preview &&
    (isOfferer.value || showSellerActions.value),
)

function startFulfillment(mode: OfferFulfillmentMode) {
  void fulfillmentDialogRef.value?.start(mode)
}

function actCancel() {
  void runPlan(sdk.value.offers.prepareCancel(props.offer.id), {
    title: {
      confirm: `Cancel offer #${props.offer.id}`,
      waiting: `Cancel offer #${props.offer.id}`,
    },
    lead: {
      confirm: 'Cancel this offer and refund the locked ETH to the offerer.',
    },
    action: { confirm: 'Cancel' },
  })
}

function actAdjustAmount() {
  const newAmountWei = parsedAmountWei.value
  if (!newAmountWei) return
  void runPlan(
    sdk.value.offers.prepareAdjustAmount({
      offerId: props.offer.id,
      newAmountWei,
    }),
    {
      title: {
        confirm: `Adjust offer #${props.offer.id}`,
        waiting: `Adjust offer #${props.offer.id}`,
      },
      lead: {
        confirm: `Set this offer to ${amountEth.value.trim()} ETH.`,
      },
      action: { confirm: 'Adjust' },
    },
  )
}

function onChanged(tx: Hash) {
  emit('changed', tx)
}

function parsePositiveEth(input: unknown): bigint | null {
  const trimmed = String(input ?? '').trim()
  if (!trimmed) return null
  try {
    const wei = parseEther(trimmed)
    return wei > 0n ? wei : null
  } catch {
    return null
  }
}

function sameAddress(a?: Address | string | null, b?: Address | string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

function activeLotItemKeys() {
  const keys = new Set<string>()
  for (const lot of props.lots) {
    if (!sameAddress(lot.seller, address.value)) continue
    for (const item of lot.items) {
      keys.add(`${item.standard}-${item.punkId}`)
    }
  }
  return keys
}

function hasUniqueCandidateAssignment(
  candidateKeysBySlot: readonly string[][],
) {
  if (!candidateKeysBySlot.length) return false
  if (candidateKeysBySlot.some((keys) => keys.length === 0)) return false

  const slots = [...candidateKeysBySlot].sort((a, b) => a.length - b.length)
  const used = new Set<string>()

  function visit(index: number): boolean {
    if (index >= slots.length) return true
    for (const key of slots[index]!) {
      if (used.has(key)) continue
      used.add(key)
      if (visit(index + 1)) return true
      used.delete(key)
    }
    return false
  }

  return visit(0)
}
</script>

<style scoped>
.actions-panel {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.block-title,
.warn {
  margin: 0;
}

.connect-row,
.warn {
  font-size: var(--font-sm);
}

.action-divider {
  height: 1px;
  background: var(--border-color, currentColor);
  opacity: 0.15;
}

.amount-field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.amount-field input {
  width: 100%;
}

.button-row,
.connect-row {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.warn {
  color: var(--accent-strong);
}

.actions-panel :deep(button .eth-amount) {
  margin-left: var(--size-1);
}

.actions-panel :deep(button .eth-amount .unit) {
  color: inherit;
}
</style>
