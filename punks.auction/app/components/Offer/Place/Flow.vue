<template>
  <ClientOnly>
    <div class="place-flow">
      <OfferPlaceIntentControls
        v-model:quantity-mode="quantityMode"
        v-model:slot-count="slotCount"
        :min-slots="PLACE_OFFER_MIN_MULTI_SLOTS"
        :max-slots="PLACE_OFFER_MAX_SLOTS"
      />

      <OfferPlaceActionCard
        v-if="hasActionCard"
        :title="stepTitle"
        :primary-label="primaryLabel"
        :primary-disabled="primaryDisabled"
        @primary="actPrimary"
      >
        <OfferPlaceSlotTargetStep
          v-if="actionStep === 'target'"
          v-model="currentSlot"
          :size="size"
        />

        <OfferPlaceAmountStep
          v-else-if="actionStep === 'amount'"
          v-model="amountEth"
          :draft="draft"
          :size="size"
        />

        <p
          v-if="visibleError"
          class="flow-error"
        >
          {{ visibleError }}
        </p>

        <template #secondary>
          <Button
            v-if="showBackButton"
            class="secondary"
            @click="goBack"
          >
            Back
          </Button>
        </template>

        <template #primary-prefix>
          <span
            v-if="footerSelection"
            class="footer-selection"
          >
            {{ footerSelection }}
          </span>
        </template>

        <template
          v-if="actionStep === 'amount' && !address"
          #primary
        >
          <EvmConnectDialog class-name="primary">Connect</EvmConnectDialog>
        </template>
      </OfferPlaceActionCard>
    </div>

    <EvmTransactionFlowDialog
      ref="transactionDialogRef"
      :text="transactionText"
      keep-open
      skip-confirmation
      @complete="onComplete"
    />
  </ClientOnly>
</template>

<script setup lang="ts">
import type { ContractWritePlan } from '@networked-art/punks-sdk'
import { useConnection } from '@wagmi/vue'
import { parseEther, type Hash, type TransactionReceipt } from 'viem'
import {
  PLACE_OFFER_MAX_SLOTS,
  PLACE_OFFER_MIN_MULTI_SLOTS,
  buildPlaceOfferDraft,
  createPlaceOfferSlotDraft,
  slotLabel,
  type PlaceOfferDraft,
  type PlaceOfferQuantityMode,
  type PlaceOfferSlotDraft,
} from '~/composables/usePlaceOfferDraft'

type ActionStep = 'target' | 'amount'

withDefaults(
  defineProps<{
    size?: number
  }>(),
  { size: 72 },
)
const emit = defineEmits<{
  placed: [tx: Hash]
}>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()

const quantityMode = ref<PlaceOfferQuantityMode | null>('one')
const actionStep = ref<ActionStep>('target')
const amountEth = ref('')
const error = ref<string | null>(null)
const slotCount = ref(PLACE_OFFER_MIN_MULTI_SLOTS)
const activeSlotIndex = ref(0)
const slotDrafts = ref<PlaceOfferSlotDraft[]>([createPlaceOfferSlotDraft()])

const transactionText = ref<{
  title?: Record<string, string>
  lead?: Record<string, string>
  action?: Record<string, string>
}>({})
type TransactionDialogRef = {
  initializeRequest: (request?: () => Promise<Hash>) => void
} | null
const transactionDialogRef = ref<TransactionDialogRef>(null)

const hasActionCard = computed(() => !!quantityMode.value)
const activeSlotCount = computed(() =>
  quantityMode.value === 'multiple' ? slotCount.value : 1,
)
const activeSlots = computed(() =>
  slotDrafts.value.slice(0, activeSlotCount.value),
)
const draft = computed(() =>
  buildPlaceOfferDraft({
    quantityMode: quantityMode.value,
    slots: activeSlots.value,
  }),
)
const currentSlot = computed({
  get: () =>
    slotDrafts.value[activeSlotIndex.value] ?? createPlaceOfferSlotDraft(),
  set: (slot: PlaceOfferSlotDraft) => {
    const next = [...slotDrafts.value]
    next[activeSlotIndex.value] = slot
    slotDrafts.value = next
  },
})
const currentSlotDraft = computed(() =>
  buildPlaceOfferDraft({
    quantityMode: 'one',
    slots: [currentSlot.value],
  }),
)
const amountWei = computed(() => parsePositiveEth(amountEth.value))
const slotValidationError = computed(() => validateDraftSlots(draft.value))
const currentSlotValidationError = computed(() =>
  validateDraftSlots(currentSlotDraft.value),
)
const canUseDraft = computed(
  () => draft.value.canPlaceOffer && !slotValidationError.value,
)
const canUseCurrentSlot = computed(
  () =>
    currentSlotDraft.value.canPlaceOffer && !currentSlotValidationError.value,
)
const stepTitle = computed(() => {
  if (actionStep.value === 'target') {
    return quantityMode.value === 'multiple'
      ? slotLabel(activeSlotIndex.value)
      : 'Target'
  }
  return amountStepTitle()
})
const primaryLabel = computed(() => {
  if (actionStep.value === 'amount') return 'Place offer'
  return activeSlotIndex.value >= activeSlotCount.value - 1
    ? 'Set amount'
    : 'Continue'
})
const isFinalTargetStep = computed(
  () =>
    actionStep.value === 'target' &&
    activeSlotIndex.value >= activeSlotCount.value - 1,
)
const primaryDisabled = computed(() => {
  if (actionStep.value === 'target') {
    return (
      !canUseCurrentSlot.value ||
      (isFinalTargetStep.value && !canUseDraft.value)
    )
  }
  if (actionStep.value === 'amount') {
    return !canUseDraft.value || !amountWei.value
  }
  return false
})
const showBackButton = computed(() => {
  return actionStep.value === 'amount' || activeSlotIndex.value > 0
})
const footerSelection = computed(() => {
  if (actionStep.value !== 'target') return ''
  return slotFooterSelection(currentSlotDraft.value)
})
const visibleError = computed(() => {
  if (error.value) return error.value
  if (!hasActionCard.value) return null
  if (actionStep.value === 'target') {
    if (!currentSlotDraft.value.canPlaceOffer) {
      return visibleSlotDraftError(currentSlotDraft.value.error)
    }
    if (currentSlotValidationError.value)
      return currentSlotValidationError.value
    if (isFinalTargetStep.value && !canUseDraft.value) {
      return draft.value.error ?? slotValidationError.value
    }
    return null
  }
  if (!canUseDraft.value) return draft.value.error ?? slotValidationError.value
  return null
})

watch(
  quantityMode,
  (quantity) => {
    error.value = null
    if (!quantity) return
    ensureSlotDrafts(activeSlotCount.value, { trim: quantity === 'one' })
    activeSlotIndex.value = 0
    actionStep.value = 'target'
  },
  { flush: 'sync' },
)

watch(slotCount, (count) => {
  if (quantityMode.value !== 'multiple') return
  ensureSlotDrafts(count)
  if (activeSlotIndex.value >= count) {
    activeSlotIndex.value = Math.max(0, count - 1)
  }
})

function actPrimary() {
  error.value = null

  if (actionStep.value === 'target') {
    if (!canUseCurrentSlot.value) return
    if (activeSlotIndex.value < activeSlotCount.value - 1) {
      activeSlotIndex.value += 1
      return
    }
    if (!canUseDraft.value) return
    actionStep.value = 'amount'
    return
  }

  if (actionStep.value === 'amount') {
    if (!canUseDraft.value || !amountWei.value) return
    actPlace()
  }
}

function goBack() {
  error.value = null

  if (actionStep.value === 'amount') {
    activeSlotIndex.value = Math.max(0, activeSlotCount.value - 1)
    actionStep.value = 'target'
    return
  }

  if (actionStep.value === 'target' && activeSlotIndex.value > 0) {
    activeSlotIndex.value -= 1
  }
}

function actPlace() {
  error.value = null
  const wei = amountWei.value
  if (!wei) {
    error.value = 'Enter an offer amount greater than zero.'
    return
  }
  if (!canUseDraft.value) {
    error.value =
      draft.value.error ?? slotValidationError.value ?? 'Choose a valid offer.'
    return
  }

  let plan: ContractWritePlan
  try {
    plan = sdk.value.offers.preparePlace({
      amountWei: wei,
      slots: draft.value.slots,
    })
  } catch (e) {
    error.value = (e as Error).message
    return
  }

  transactionText.value = {
    title: {
      confirm: 'Place purchase offer',
      waiting: 'Place purchase offer',
    },
    lead: { confirm: plan.description },
    action: { confirm: 'Place offer' },
  }
  transactionDialogRef.value?.initializeRequest(() => execute(plan))
}

function onComplete(receipt: TransactionReceipt) {
  resetFlow()
  emit('placed', receipt.transactionHash as Hash)
}

function resetFlow() {
  quantityMode.value = null
  actionStep.value = 'target'
  amountEth.value = ''
  error.value = null
  slotCount.value = PLACE_OFFER_MIN_MULTI_SLOTS
  activeSlotIndex.value = 0
  slotDrafts.value = [createPlaceOfferSlotDraft()]
}

function amountStepTitle() {
  if (draft.value.title) return draft.value.title
  if (quantityMode.value === 'multiple') return 'Multiple Punks'
  return 'Set Amount'
}

function slotFooterSelection(value: PlaceOfferDraft) {
  if (!value.title) return ''
  const slot = value.slotSummaries[0]
  return [value.title, slot?.detail ?? ''].filter(Boolean).join(' · ')
}

function visibleSlotDraftError(message: string | undefined) {
  if (
    !message ||
    message.startsWith('Choose ') ||
    message === 'Select trait criteria.'
  ) {
    return null
  }
  return message
}

function validateDraftSlots(value: PlaceOfferDraft) {
  if (!value.canPlaceOffer) return value.error ?? null
  try {
    for (const slot of value.slots) sdk.value.offers.slot(slot)
    return null
  } catch (e) {
    return (e as Error).message
  }
}

function ensureSlotDrafts(count: number, options: { trim?: boolean } = {}) {
  const nextCount = Math.min(
    PLACE_OFFER_MAX_SLOTS,
    Math.max(1, Math.trunc(count)),
  )
  if (!options.trim && slotDrafts.value.length >= nextCount) return
  if (slotDrafts.value.length === nextCount) return
  slotDrafts.value = Array.from(
    { length: nextCount },
    (_, index) => slotDrafts.value[index] ?? createPlaceOfferSlotDraft(),
  )
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
</script>

<style scoped>
.place-flow {
  display: flex;
  flex-direction: column;
}

.flow-error {
  margin: var(--size-3) 0 0;
  color: var(--accent);
  font-size: var(--font-sm);
}

.footer-selection {
  min-width: 0;
  color: var(--text-muted);
  font-size: var(--font-xs);
  overflow-wrap: anywhere;
  text-align: right;
  text-transform: uppercase;
  white-space: normal;
}
</style>
