<template>
  <ClientOnly>
    <Dialog
      v-model:open="decisionOpen"
      :title="decisionTitle"
      class="offer-fulfillment-dialog"
      compat
      large
      @closed="resetDecision"
    >
      <p
        v-if="error"
        class="error"
      >
        {{ error }}
      </p>

      <DialogLotPickerStep
        v-if="decisionStep === 'lot-picker'"
        v-model="selectedLotId"
        :lots="lotOptions"
      />

      <DialogSelectionStep
        v-else-if="decisionStep === 'punk-selection'"
        v-model="selectedKeys"
        :slots="selectionSlots"
      />

      <DialogHammerAllocationStep
        v-else-if="decisionStep === 'hammer'"
        v-model="weightBps"
        :items="selectedItems"
      />

      <div
        v-else-if="decisionStep === 'empty'"
        class="empty-state muted"
      >
        {{ emptyMessage }}
      </div>

      <template #footer>
        <Button
          class="secondary"
          @click="closeDecision"
        >
          Cancel
        </Button>
        <Button
          v-if="decisionStep === 'lot-picker'"
          class="primary"
          :disabled="!selectedLot"
          @click="actUseSelectedLot"
        >
          Continue
        </Button>
        <Button
          v-else-if="decisionStep === 'punk-selection'"
          class="primary"
          :disabled="!canContinueSelection"
          @click="actContinueSelection"
        >
          Continue
        </Button>
        <Button
          v-else-if="decisionStep === 'hammer'"
          class="primary"
          :disabled="!hammerValid"
          @click="actCreateFromSelection"
        >
          Continue
        </Button>
      </template>
    </Dialog>

    <EvmTransactionFlowDialog
      ref="transactionDialogRef"
      :request="transactionRequest"
      :text="transactionText"
      keep-open
      @complete="onTransactionComplete"
    />

    <EvmMultiTransactionFlowDialog
      ref="multiDialogRef"
      :title="multiDialogTitle"
      :steps="flowSteps"
      :text="multiDialogText"
      @complete="onMultiTransactionComplete"
      @error="onFlowError"
    />
  </ClientOnly>
</template>

<script setup lang="ts">
import type { ContractWritePlan } from '@networked-art/punks-sdk'
import { useConnection } from '@wagmi/vue'
import { formatEther, type Address, type Hash } from 'viem'
import {
  MAX_INSTANT_ITEMS,
  TOTAL_WEIGHT_BPS,
  TokenStandard,
  ZERO_ADDRESS,
  equalLotWeights,
  lotMatchesOffer,
  type LotRecord,
  type OfferRecord,
} from '~/utils/auction'
import { offerSlotDisplay } from '~/composables/useOfferSlotDisplay'
import type {
  OfferFulfillmentCandidate,
  OfferFulfillmentMode,
  OfferFulfillmentSlot,
  SelectedFulfillmentItem,
} from '~/utils/offerFulfillment'

type DecisionStep =
  | 'idle'
  | 'lot-picker'
  | 'punk-selection'
  | 'hammer'
  | 'empty'

const props = defineProps<{
  offer: OfferRecord
  lots: LotRecord[]
  matchingLots: LotRecord[]
}>()

const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { address } = useConnection()
const offline = usePunksOffline()
const renderV1 = useV1Rendering()
const { matchesItem: slotMatchesItem, criteriaMatchesPunk } =
  useOfferSlotMatching()
const inventory = useAccountPunkInventory(() => address.value)
const custodyPlan = usePunkCustodyPlan()
const transactionFlow = useTransactionFlowRunner({
  onComplete: (tx) => emit('changed', tx),
  onError: (message, source) => {
    if (source === 'transaction') return

    if (decisionStep.value === 'idle') {
      showEmpty(message)
    } else {
      error.value = message
    }
  },
})

const {
  transactionDialogRef,
  transactionRequest,
  transactionText,
  multiDialogRef,
  flowSteps,
  multiDialogText,
  multiDialogTitle,
  runPlans,
  onTransactionComplete,
  onMultiTransactionComplete,
  onFlowError,
} = transactionFlow

const mode = ref<OfferFulfillmentMode>('accept')
const decisionStep = ref<DecisionStep>('idle')
const resolving = ref(false)
const error = ref<string | null>(null)
const emptyMessage = ref('')
const lotOptions = ref<LotRecord[]>([])
const selectedLotId = ref<bigint | null>(null)
const selectionSlots = ref<OfferFulfillmentSlot[]>([])
const selectedKeys = ref<string[]>([])
const weightBps = ref<number[]>([])

const decisionOpen = computed({
  get: () => decisionStep.value !== 'idle',
  set: (open) => {
    if (!open) closeDecision()
  },
})

const decisionTitle = computed(() => {
  if (decisionStep.value === 'lot-picker') return 'Choose lot'
  if (decisionStep.value === 'punk-selection') return 'Choose Punks'
  if (decisionStep.value === 'hammer') return 'Hammer allocation'
  return 'Offer fulfillment'
})

const selectedLot = computed(
  () => lotOptions.value.find((lot) => lot.id === selectedLotId.value) ?? null,
)

const selectedItems = computed<SelectedFulfillmentItem[]>(() => {
  return selectedKeys.value
    .map((key, index) => {
      const candidate = selectionSlots.value[index]?.candidates.find(
        (item) => item.key === key,
      )
      if (!candidate || candidate.unavailableReason) return null
      return {
        ...candidate,
        slotIndex: index,
        weightBps: resolvedWeight(index),
      }
    })
    .filter((item): item is SelectedFulfillmentItem => !!item)
})

const canContinueSelection = computed(
  () =>
    selectedItems.value.length === props.offer.slots.length &&
    uniqueKeys(selectedKeys.value).length === props.offer.slots.length,
)

const hammerValid = computed(
  () =>
    selectedItems.value.length === props.offer.slots.length &&
    weightBps.value.length === selectedItems.value.length &&
    weightBps.value.every((weight) => weight > 0) &&
    weightBps.value.reduce((sum, weight) => sum + weight, 0) ===
      TOTAL_WEIGHT_BPS,
)

const sellerMatchingLots = computed(() =>
  props.matchingLots
    .filter((lot) => sameAddress(lot.seller, address.value))
    .filter((lot) => lotCanUseOffer(lot))
    .filter((lot) => lotV1Allowed(lot))
    .filter((lot) =>
      mode.value === 'accept' ? lot.items.length <= MAX_INSTANT_ITEMS : true,
    ),
)

async function start(nextMode: OfferFulfillmentMode) {
  if (resolving.value) return
  mode.value = nextMode
  error.value = null
  emptyMessage.value = ''

  if (!address.value) {
    showEmpty('Connect the seller wallet to use this offer.')
    return
  }
  if (!v1ActionsAllowed()) {
    showEmpty('Enable V1 rendering in settings to use V1 offers.')
    return
  }

  resolving.value = true
  try {
    await inventory.refresh()

    const lots = sellerMatchingLots.value
    if (lots.length === 1) {
      await runExistingLot(lots[0]!)
      return
    }
    if (lots.length > 1) {
      lotOptions.value = lots
      selectedLotId.value = lots[0]?.id ?? null
      decisionStep.value = 'lot-picker'
      return
    }

    if (
      mode.value === 'accept' &&
      props.offer.slots.length > MAX_INSTANT_ITEMS
    ) {
      showEmpty(
        `Instant accept is limited to ${MAX_INSTANT_ITEMS} Punks. Use Start auction for this offer.`,
      )
      return
    }

    const slots = buildSelectionSlots()
    selectionSlots.value = slots
    const deterministic = deterministicKeys(slots)
    if (deterministic.length === props.offer.slots.length) {
      selectedKeys.value = deterministic
      prepareWeights()
      if (props.offer.slots.length > 1) {
        decisionStep.value = 'hammer'
      } else {
        await actCreateFromSelection()
      }
      return
    }

    if (
      !slots.every((slot) =>
        slot.candidates.some((candidate) => !candidate.unavailableReason),
      )
    ) {
      showEmpty(emptyCandidateMessage(slots))
      return
    }

    selectedKeys.value = slots.map(
      (slot) =>
        slot.candidates.find((candidate) => !candidate.unavailableReason)
          ?.key ?? '',
    )
    decisionStep.value = 'punk-selection'
  } catch (e) {
    showEmpty((e as Error).message)
  } finally {
    resolving.value = false
  }
}

function actUseSelectedLot() {
  if (!selectedLot.value) return
  void runExistingLot(selectedLot.value)
}

function actContinueSelection() {
  if (!canContinueSelection.value) return
  prepareWeights()
  if (props.offer.slots.length > 1) {
    decisionStep.value = 'hammer'
  } else {
    void actCreateFromSelection()
  }
}

async function actCreateFromSelection() {
  if (!canContinueSelection.value) return
  if (props.offer.slots.length > 1 && !hammerValid.value) return

  const owner = address.value
  if (!owner) return

  const items = selectedItems.value
  if (mode.value === 'accept' && items.length > MAX_INSTANT_ITEMS) {
    showEmpty(
      `Instant accept is limited to ${MAX_INSTANT_ITEMS} Punks. Use Start auction for this offer.`,
    )
    return
  }

  closeDecision()
  try {
    const prepPlans = await custodyPlan.buildCustodyPlans({
      owner,
      vault: inventory.vault.value,
      vaultDeployed: inventory.vaultDeployed.value,
      stash: inventory.stash.value,
      items,
    })
    const finalPlan = finalNewLotPlan(items)
    await runPlans([...prepPlans, finalPlan], transactionTextForNewLot())
  } catch (e) {
    showEmpty((e as Error).message)
  }
}

async function runExistingLot(lot: LotRecord) {
  closeDecision()
  try {
    const plan =
      mode.value === 'accept'
        ? sdk.value.offers.prepareAcceptFromLot({
            offerId: props.offer.id,
            lotId: lot.id,
            minAmountWei: lot.reserveWei,
          })
        : sdk.value.auctions.prepareStartAuctionFromOffer({
            offerId: props.offer.id,
            lotId: lot.id,
            minAmountWei: lot.reserveWei,
          })
    await runPlans([plan], transactionTextForLot(lot))
  } catch (e) {
    showEmpty((e as Error).message)
  }
}

function finalNewLotPlan(
  items: readonly SelectedFulfillmentItem[],
): ContractWritePlan {
  const lotItems = custodyPlan.lotItemsFor(items)
  return mode.value === 'accept'
    ? sdk.value.offers.prepareCreateLotAndAccept({
        offerId: props.offer.id,
        items: lotItems,
        minAmountWei: props.offer.amountWei,
      })
    : sdk.value.offers.prepareCreateLotAndStartAuction({
        offerId: props.offer.id,
        items: lotItems,
        minAmountWei: props.offer.amountWei,
      })
}

function buildSelectionSlots(): OfferFulfillmentSlot[] {
  const activeLotByItem = activeLotMap()
  return props.offer.slots.map((slot, index) => {
    const display = offerSlotDisplay(slot, offline, index)
    const candidates = inventory.items.value
      .filter((item) =>
        slotMatchesItem(slot, {
          standard: item.standard,
          punkId: item.punkId,
        }),
      )
      .map<OfferFulfillmentCandidate>((item) => {
        const activeLotId = activeLotByItem.get(item.key)
        return {
          ...item,
          activeLotId,
          unavailableReason: unavailableReason(item, activeLotId),
        }
      })
      .sort(compareCandidates)

    return {
      index,
      slot,
      title: display.title,
      detail: display.detail,
      candidates,
    }
  })
}

function activeLotMap() {
  const map = new Map<string, bigint>()
  for (const lot of props.lots) {
    if (!sameAddress(lot.seller, address.value)) continue
    for (const item of lot.items) {
      map.set(`${item.standard}-${item.punkId}`, lot.id)
    }
  }
  return map
}

function unavailableReason(
  item: OfferFulfillmentCandidate,
  activeLotId?: bigint,
) {
  if (activeLotId !== undefined) {
    return `Already in lot #${activeLotId.toString()}`
  }
  if (item.custody === 'unsupported') return 'Unsupported custody'
  return undefined
}

function deterministicKeys(slots: OfferFulfillmentSlot[]) {
  const keys = slots.map((slot) => {
    const available = slot.candidates.filter(
      (candidate) => !candidate.unavailableReason,
    )
    return available.length === 1 ? available[0]!.key : ''
  })
  return keys.every(Boolean) && uniqueKeys(keys).length === keys.length
    ? keys
    : []
}

function prepareWeights() {
  weightBps.value =
    props.offer.slots.length === 1
      ? [TOTAL_WEIGHT_BPS]
      : equalLotWeights(props.offer.slots.length)
}

function resolvedWeight(index: number) {
  if (props.offer.slots.length === 1) return TOTAL_WEIGHT_BPS
  return weightBps.value[index] ?? 0
}

function transactionTextForLot(lot: LotRecord) {
  const dialogTitle = mode.value === 'accept' ? 'Accept Offer' : 'Start Auction'
  const action = mode.value === 'accept' ? 'Accept' : 'Start auction'
  return {
    dialogTitle,
    single: {
      title: { confirm: dialogTitle, waiting: dialogTitle },
      lead: {
        confirm:
          mode.value === 'accept'
            ? `Settle lot #${lot.id} instantly at ${formatEther(
                props.offer.amountWei,
              )} ETH.`
            : `Open lot #${lot.id} as a 24-hour auction with this offer as the opening bid.`,
      },
      action: { confirm: action },
    },
  }
}

function transactionTextForNewLot() {
  const dialogTitle = mode.value === 'accept' ? 'Accept Offer' : 'Start Auction'
  const complete =
    mode.value === 'accept' ? 'Offer accepted' : 'Auction started'
  return {
    dialogTitle,
    single: {
      title: { confirm: dialogTitle, waiting: dialogTitle, complete },
      lead: {
        confirm:
          mode.value === 'accept'
            ? `Create a matching lot and settle it instantly at ${formatEther(
                props.offer.amountWei,
              )} ETH.`
            : 'Create a matching lot and start a 24-hour auction with this offer as the opening bid.',
      },
      action: {
        confirm: mode.value === 'accept' ? 'Accept' : 'Start auction',
      },
    },
    multi: {
      title: { confirm: dialogTitle, complete },
      lead: {
        confirm: 'Review and execute the required setup transactions.',
        complete:
          mode.value === 'accept'
            ? 'The offer was accepted.'
            : 'The auction was started.',
      },
      action: {
        confirm: mode.value === 'accept' ? 'Accept' : 'Start auction',
      },
    },
  }
}

function lotCanUseOffer(lot: LotRecord) {
  return (
    lotMatchesOffer(props.offer, lot, criteriaMatchesPunk) &&
    (sameAddress(lot.onlySellTo, ZERO_ADDRESS) ||
      sameAddress(lot.onlySellTo, props.offer.offerer))
  )
}

function lotV1Allowed(lot: LotRecord) {
  return (
    renderV1.value ||
    !lot.items.some((item) => item.standard === TokenStandard.CryptoPunksV1)
  )
}

function v1ActionsAllowed() {
  return (
    renderV1.value ||
    !props.offer.slots.some(
      (slot) => slot.standard === TokenStandard.CryptoPunksV1,
    )
  )
}

function compareCandidates(
  a: OfferFulfillmentCandidate,
  b: OfferFulfillmentCandidate,
) {
  const unavailable =
    Number(!!a.unavailableReason) - Number(!!b.unavailableReason)
  if (unavailable) return unavailable
  return custodyRank(a.custody) - custodyRank(b.custody) || a.punkId - b.punkId
}

function custodyRank(custody: OfferFulfillmentCandidate['custody']) {
  switch (custody) {
    case 'vault':
      return 0
    case 'wallet':
      return 1
    case 'wrapped-wallet':
      return 2
    case 'stash':
      return 3
    case 'wrapped-stash':
      return 4
    default:
      return 5
  }
}

function emptyCandidateMessage(slots: OfferFulfillmentSlot[]) {
  const missing = slots.find(
    (slot) =>
      !slot.candidates.some((candidate) => !candidate.unavailableReason),
  )
  return missing
    ? `No owned Punks are available for slot ${missing.index + 1}.`
    : 'No owned Punks can fulfill this offer.'
}

function uniqueKeys(keys: readonly string[]) {
  return Array.from(new Set(keys.filter(Boolean)))
}

function closeDecision() {
  decisionStep.value = 'idle'
}

function resetDecision() {
  if (decisionStep.value !== 'idle') return
  lotOptions.value = []
  selectedLotId.value = null
  selectionSlots.value = []
  selectedKeys.value = []
  weightBps.value = []
}

function showEmpty(message: string) {
  error.value = null
  emptyMessage.value = message
  decisionStep.value = 'empty'
}

function sameAddress(a?: Address | string | null, b?: Address | string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

defineExpose({ start })
</script>

<style scoped>
.offer-fulfillment-dialog :deep(section) {
  gap: var(--size-3);
}

.error,
.empty-state {
  margin: 0;
  font-size: var(--font-sm);
}

.error {
  color: var(--accent-strong);
}

.empty-state {
  min-height: 8rem;
  display: grid;
  place-items: center;
  text-align: center;
}
</style>
