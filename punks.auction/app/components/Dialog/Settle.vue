<template>
  <ClientOnly>
    <Dialog
      v-model:open="decisionOpen"
      :title="decisionTitle"
      class="settle-dialog"
      compat
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
import {
  punksAuctionAbi,
  type ContractWritePlan,
} from '@networked-art/punks-sdk'
import { useConnection } from '@wagmi/vue'
import {
  decodeEventLog,
  type Address,
  type Hash,
  type TransactionReceipt,
} from 'viem'
import {
  MAX_INSTANT_ITEMS,
  TOTAL_WEIGHT_BPS,
  TokenStandard,
  ZERO_ADDRESS,
  equalLotWeights,
  lotMatchesOffer,
  type LotRecord,
  type OfferRecord,
  type TokenStandardValue,
} from '~/utils/auction'
import { offerSlotDisplay } from '~/composables/useOfferSlotDisplay'
import type {
  OfferFulfillmentCandidate,
  OfferFulfillmentSlot,
  SelectedFulfillmentItem,
  SettleRequest,
} from '~/utils/settle'

type DecisionStep =
  | 'idle'
  | 'lot-picker'
  | 'punk-selection'
  | 'hammer'
  | 'empty'

type DiscoverRequest = Extract<SettleRequest, { mode: 'start' | 'accept' }>

type ItemRef = { standard: TokenStandardValue; punkId: number }

const props = withDefaults(
  defineProps<{
    lots?: LotRecord[]
  }>(),
  {
    lots: () => [],
  },
)

const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { address } = useConnection()
const offline = usePunksOffline()
const renderV1 = useV1Rendering()
const { formatWeiAmount } = usePriceDisplayText()
const { matchesItem: slotMatchesItem, criteriaMatchesPunk } =
  useOfferSlotMatching()
const inventory = useAccountPunkInventory(() => address.value)
const custodyPlan = usePunkCustodyPlan()
const router = useRouter()
const transactionFlow = useTransactionFlowRunner({
  onComplete: (tx, receipts) => {
    emit('changed', tx)
    void redirectAfterSettlement(receipts)
  },
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

const activeRequest = ref<SettleRequest | null>(null)
const decisionStep = ref<DecisionStep>('idle')
const resolving = ref(false)
const error = ref<string | null>(null)
const emptyMessage = ref('')
const lotOptions = ref<LotRecord[]>([])
const selectedLotId = ref<bigint | null>(null)
const selectionSlots = ref<OfferFulfillmentSlot[]>([])
const selectedKeys = ref<string[]>([])
const weightBps = ref<number[]>([])

const mode = computed(() => activeRequest.value?.mode ?? 'accept')
const offer = computed(() =>
  activeRequest.value && 'offer' in activeRequest.value
    ? activeRequest.value.offer
    : null,
)

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
  return mode.value === 'accept' ? 'Sell now' : 'Start auction'
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

const canContinueSelection = computed(() => {
  const slotCount = offer.value?.slots.length ?? 0
  return (
    selectedItems.value.length === slotCount &&
    uniqueKeys(selectedKeys.value).length === slotCount
  )
})

const hammerValid = computed(() => {
  const slotCount = offer.value?.slots.length ?? 0
  return (
    selectedItems.value.length === slotCount &&
    weightBps.value.length === selectedItems.value.length &&
    weightBps.value.every((weight) => weight > 0) &&
    weightBps.value.reduce((sum, weight) => sum + weight, 0) ===
      TOTAL_WEIGHT_BPS
  )
})

async function start(request: SettleRequest) {
  if (resolving.value) return
  activeRequest.value = request
  error.value = null
  emptyMessage.value = ''
  closeDecision()

  resolving.value = true
  try {
    if (!address.value) {
      showEmpty('Connect a wallet to continue.')
      return
    }

    if (request.mode === 'open') {
      if (!v1AllowedForLot(request.lot)) {
        showEmpty('Enable V1 rendering in settings to open this auction.')
        return
      }
      await runOpenAuction(request.lot)
      return
    }

    if (!v1AllowedForOffer(request.offer)) {
      showEmpty('Enable V1 rendering in settings to use V1 offers.')
      return
    }

    if ('lot' in request) {
      if (!v1AllowedForLot(request.lot)) {
        showEmpty('Enable V1 rendering in settings to use this lot.')
        return
      }
      if (
        request.mode === 'accept' &&
        request.lot.items.length > MAX_INSTANT_ITEMS
      ) {
        showEmpty(
          `Instant accept is limited to ${MAX_INSTANT_ITEMS} Punks. Start an auction from this offer instead.`,
        )
        return
      }
      await runExistingLot(request.lot, request.offer, request.mode)
      return
    }

    await inventory.refresh()

    if ('items' in request) {
      await runFromPreselectedItems(request)
      return
    }

    await runDiscover(request)
  } catch (e) {
    showEmpty((e as Error).message)
  } finally {
    resolving.value = false
  }
}

async function runDiscover(request: DiscoverRequest) {
  const lots = sellerMatchingLots(request.offer, request.mode)
  if (lots.length === 1) {
    await runExistingLot(lots[0]!, request.offer, request.mode)
    return
  }
  if (lots.length > 1) {
    lotOptions.value = lots
    selectedLotId.value = lots[0]?.id ?? null
    decisionStep.value = 'lot-picker'
    return
  }

  if (
    request.mode === 'accept' &&
    request.offer.slots.length > MAX_INSTANT_ITEMS
  ) {
    showEmpty(
      `Instant accept is limited to ${MAX_INSTANT_ITEMS} Punks. Start an auction from this offer instead.`,
    )
    return
  }

  const slots = buildSelectionSlots(request.offer)
  selectionSlots.value = slots

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
      slot.candidates.find((candidate) => !candidate.unavailableReason)?.key ??
      '',
  )
  decisionStep.value = 'punk-selection'
}

async function runFromPreselectedItems(
  request: DiscoverRequest & { items: readonly ItemRef[] },
) {
  const offerRecord = request.offer
  if (request.items.length !== offerRecord.slots.length) {
    showEmpty(
      'The selected Punks do not match the offer slots — refresh and try again.',
    )
    return
  }
  if (request.mode === 'accept' && request.items.length > MAX_INSTANT_ITEMS) {
    showEmpty(
      `Instant accept is limited to ${MAX_INSTANT_ITEMS} Punks. Start an auction from this offer instead.`,
    )
    return
  }

  const reservedKeys = activeLotItemKeys()
  const items: SelectedFulfillmentItem[] = []
  for (const [index, ref_] of request.items.entries()) {
    const key = `${ref_.standard}-${ref_.punkId}`
    const inventoryItem = inventory.items.value.find((item) => item.key === key)
    if (!inventoryItem) {
      showEmpty(`You do not own Punk #${ref_.punkId}.`)
      return
    }
    if (inventoryItem.custody === 'unsupported') {
      showEmpty(`Punk #${ref_.punkId} is in unsupported custody.`)
      return
    }
    if (reservedKeys.has(key)) {
      showEmpty(`Punk #${ref_.punkId} is already in one of your lots.`)
      return
    }
    const slot = offerRecord.slots[index]!
    if (!slotMatchesItem(slot, ref_)) {
      showEmpty(`Punk #${ref_.punkId} does not match offer slot ${index + 1}.`)
      return
    }
    items.push({
      ...inventoryItem,
      slotIndex: index,
      weightBps: 0,
    })
  }

  const weights =
    items.length === 1 ? [TOTAL_WEIGHT_BPS] : equalLotWeights(items.length)
  const weighted = items.map((item, index) => ({
    ...item,
    weightBps: weights[index] ?? 0,
  }))
  await executeNewLotPlans(weighted)
}

function actUseSelectedLot() {
  if (!activeRequest.value || activeRequest.value.mode === 'open') return
  if (!offer.value) return
  if (!selectedLot.value) return
  void runExistingLot(selectedLot.value, offer.value, activeRequest.value.mode)
}

function actContinueSelection() {
  if (!canContinueSelection.value) return
  prepareWeights()
  if ((offer.value?.slots.length ?? 0) > 1) {
    decisionStep.value = 'hammer'
  } else {
    void actCreateFromSelection()
  }
}

async function actCreateFromSelection() {
  if (!canContinueSelection.value) return
  if ((offer.value?.slots.length ?? 0) > 1 && !hammerValid.value) return
  await executeNewLotPlans(selectedItems.value)
}

async function executeNewLotPlans(items: readonly SelectedFulfillmentItem[]) {
  const owner = address.value
  const offerRecord = offer.value
  const request = activeRequest.value
  if (!owner || !offerRecord || !request || request.mode === 'open') return

  if (request.mode === 'accept' && items.length > MAX_INSTANT_ITEMS) {
    showEmpty(
      `Instant accept is limited to ${MAX_INSTANT_ITEMS} Punks. Start an auction from this offer instead.`,
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
    const finalPlan = finalNewLotPlan(items, request.mode, offerRecord)
    await runPlans(
      [...prepPlans, finalPlan],
      transactionTextForNewLot(request.mode),
    )
  } catch (e) {
    showEmpty((e as Error).message)
  }
}

async function runExistingLot(
  lot: LotRecord,
  offerRecord: OfferRecord,
  nextMode: 'start' | 'accept',
) {
  closeDecision()
  try {
    const plan =
      nextMode === 'accept'
        ? sdk.value.offers.prepareAcceptFromLot({
            offerId: offerRecord.id,
            lotId: lot.id,
            minAmountWei: lot.reserveWei,
          })
        : sdk.value.auctions.prepareStartAuctionFromOffer({
            offerId: offerRecord.id,
            lotId: lot.id,
            minAmountWei: lot.reserveWei,
          })
    await runPlans([plan], transactionTextForLot(lot, nextMode, offerRecord))
  } catch (e) {
    showEmpty((e as Error).message)
  }
}

async function runOpenAuction(lot: LotRecord) {
  closeDecision()
  try {
    const plan = sdk.value.auctions.prepareOpenAuction({
      lotId: lot.id,
      reserveWei: lot.reserveWei,
      bidWei: lot.reserveWei,
    })
    await runPlans([plan], transactionTextForOpenAuction(lot))
  } catch (e) {
    showEmpty((e as Error).message)
  }
}

function finalNewLotPlan(
  items: readonly SelectedFulfillmentItem[],
  nextMode: 'start' | 'accept',
  offerRecord: OfferRecord,
): ContractWritePlan {
  const lotItems = custodyPlan.lotItemsFor(items)
  return nextMode === 'accept'
    ? sdk.value.offers.prepareCreateLotAndAccept({
        offerId: offerRecord.id,
        items: lotItems,
        minAmountWei: offerRecord.amountWei,
      })
    : sdk.value.offers.prepareCreateLotAndStartAuction({
        offerId: offerRecord.id,
        items: lotItems,
        minAmountWei: offerRecord.amountWei,
      })
}

function buildSelectionSlots(offerRecord: OfferRecord): OfferFulfillmentSlot[] {
  const activeLotByItem = activeLotMap()
  return offerRecord.slots.map((slot, index) => {
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

function sellerMatchingLots(
  offerRecord: OfferRecord,
  nextMode: 'start' | 'accept',
) {
  return props.lots
    .filter((lot) => sameAddress(lot.seller, address.value))
    .filter((lot) => lotCanUseOffer(lot, offerRecord))
    .filter((lot) => v1AllowedForLot(lot))
    .filter((lot) =>
      nextMode === 'accept' ? lot.items.length <= MAX_INSTANT_ITEMS : true,
    )
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

function prepareWeights() {
  const slotCount = offer.value?.slots.length ?? 0
  weightBps.value =
    slotCount <= 1 ? [TOTAL_WEIGHT_BPS] : equalLotWeights(slotCount)
}

function resolvedWeight(index: number) {
  const slotCount = offer.value?.slots.length ?? 0
  if (slotCount <= 1) return TOTAL_WEIGHT_BPS
  return weightBps.value[index] ?? 0
}

function transactionTextForLot(
  lot: LotRecord,
  nextMode: 'start' | 'accept',
  offerRecord: OfferRecord,
) {
  const dialogTitle = nextMode === 'accept' ? 'Sell now' : 'Start auction'
  const action = nextMode === 'accept' ? 'Sell now' : 'Start auction'
  return {
    dialogTitle,
    single: {
      title: { confirm: dialogTitle, waiting: dialogTitle },
      lead: {
        confirm:
          nextMode === 'accept'
            ? `Settle lot #${lot.id} immediately to the offerer for ${formatWeiAmount(
                offerRecord.amountWei,
              )}.`
            : `Open lot #${lot.id} as a 24-hour auction seeded with this ${formatWeiAmount(
                offerRecord.amountWei,
              )} offer as the opening bid.`,
      },
      action: { confirm: action },
    },
  }
}

function transactionTextForNewLot(nextMode: 'start' | 'accept') {
  const dialogTitle = nextMode === 'accept' ? 'Sell now' : 'Start auction'
  const complete = nextMode === 'accept' ? 'Offer accepted' : 'Auction started'
  const offerRecord = offer.value
  const amount = offerRecord ? formatWeiAmount(offerRecord.amountWei) : ''
  return {
    dialogTitle,
    single: {
      title: { confirm: dialogTitle, waiting: dialogTitle, complete },
      lead: {
        confirm:
          nextMode === 'accept'
            ? `Create a matching lot and settle it instantly to the offerer for ${amount}.`
            : `Create a matching lot and start a 24-hour auction with this ${amount} offer as the opening bid.`,
      },
      action: { confirm: nextMode === 'accept' ? 'Sell now' : 'Start auction' },
    },
    multi: {
      title: { confirm: dialogTitle, complete },
      lead: {
        confirm: 'Review and execute the required setup transactions.',
        complete:
          nextMode === 'accept'
            ? 'The offer was accepted.'
            : 'The auction was started.',
      },
      action: { confirm: nextMode === 'accept' ? 'Sell now' : 'Start auction' },
    },
  }
}

function transactionTextForOpenAuction(lot: LotRecord) {
  const dialogTitle = 'Start auction'
  const reserve = formatWeiAmount(lot.reserveWei)
  return {
    dialogTitle,
    single: {
      title: {
        confirm: dialogTitle,
        waiting: dialogTitle,
        complete: 'Auction started',
      },
      lead: {
        confirm: `Open lot #${lot.id} as a 24-hour auction and place your own opening bid of ${reserve}. The bid is refunded if you are outbid; the auction settles to the highest bidder when the timer ends.`,
      },
      action: { confirm: `Start auction` },
    },
  }
}

function lotCanUseOffer(lot: LotRecord, offerRecord: OfferRecord) {
  return (
    lotMatchesOffer(offerRecord, lot, criteriaMatchesPunk) &&
    (sameAddress(lot.onlySellTo, ZERO_ADDRESS) ||
      sameAddress(lot.onlySellTo, offerRecord.offerer))
  )
}

function v1AllowedForLot(lot: LotRecord) {
  return (
    renderV1.value ||
    !lot.items.some((item) => item.standard === TokenStandard.CryptoPunksV1)
  )
}

function v1AllowedForOffer(offerRecord: OfferRecord) {
  return (
    renderV1.value ||
    !offerRecord.slots.some(
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

async function redirectAfterSettlement(
  receipts: readonly TransactionReceipt[],
) {
  const request = activeRequest.value
  if (!request) return

  if (request.mode === 'accept') {
    const recipient = 'offer' in request ? request.offer.offerer : address.value
    if (recipient) await router.replace(`/profile/${recipient}`)
    return
  }

  // 'start' or 'open' — both initialise an auction; jump to it.
  const auctionId = auctionIdFromReceipts(receipts)
  if (auctionId !== null) {
    await router.replace(`/auctions/${auctionId}`)
  }
}

function auctionIdFromReceipts(receipts: readonly TransactionReceipt[]) {
  for (const receipt of receipts) {
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: punksAuctionAbi,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === 'AuctionInitialised') {
          return (decoded.args as { auctionId: bigint }).auctionId
        }
      } catch {
        // log is not from PunksAuction
      }
    }
  }
  return null
}

defineExpose({ start })
</script>

<style scoped>
.settle-dialog :deep(section) {
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
