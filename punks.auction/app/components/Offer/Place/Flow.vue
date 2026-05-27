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
        :title="cardState.title"
        :primary-label="cardState.primaryLabel"
        :primary-disabled="cardState.primaryDisabled"
        @primary="actPrimary"
      >
        <OfferPlaceSlotTargetStep
          v-if="actionStep === 'target'"
          v-model="currentSlot"
          :size="size"
        />

        <OfferPlaceAmountStep
          v-else-if="actionStep === 'amount'"
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
            v-if="cardState.showBackButton"
            class="secondary"
            @click="goBack"
          >
            Back
          </Button>
        </template>

        <template #primary-prefix>
          <span
            v-if="cardState.footerSelection"
            class="footer-selection"
          >
            {{ cardState.footerSelection }}
          </span>
        </template>

        <template
          v-if="showAmountAction"
          #primary
        >
          <FormInputGroup class="amount-action">
            <input
              v-model="amountEth"
              aria-label="Offer amount in ETH"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
              placeholder="0.5"
              @keyup.enter="submitAmount"
            />
            <Button
              v-if="address"
              class="primary"
              :disabled="cardState.primaryDisabled"
              @click="actPrimary"
            >
              Place offer
            </Button>
            <EvmConnectDialog
              v-else
              class-name="primary"
            >
              Connect
            </EvmConnectDialog>
          </FormInputGroup>
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
  itemLabel,
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

const quantityMode = ref<PlaceOfferQuantityMode>('one')
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
const isSingleCollectionTargetStep = computed(
  () =>
    actionStep.value === 'target' &&
    quantityMode.value === 'one' &&
    currentSlot.value.targetMode === 'any',
)
const showAmountAction = computed(
  () => actionStep.value === 'amount' || isSingleCollectionTargetStep.value,
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
const isFinalTargetStep = computed(
  () =>
    actionStep.value === 'target' &&
    activeSlotIndex.value >= activeSlotCount.value - 1,
)
const cardState = computed(() => {
  if (actionStep.value === 'target') {
    if (isSingleCollectionTargetStep.value) {
      return {
        title: targetStepTitle(),
        primaryLabel: 'Place offer',
        primaryDisabled: !canUseDraft.value || !amountWei.value,
        showBackButton: false,
        footerSelection: '',
      }
    }

    return {
      title: targetStepTitle(),
      primaryLabel: isFinalTargetStep.value ? 'Review' : 'Continue',
      primaryDisabled:
        !canUseCurrentSlot.value ||
        (isFinalTargetStep.value && !canUseDraft.value),
      showBackButton: activeSlotIndex.value > 0,
      footerSelection: slotFooterSelection(currentSlotDraft.value),
    }
  }

  return {
    title: amountStepTitle(),
    primaryLabel: 'Place offer',
    primaryDisabled: !canUseDraft.value || !amountWei.value,
    showBackButton: true,
    footerSelection: '',
  }
})
const visibleError = computed(() => {
  if (error.value) return error.value
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
    if (isSingleCollectionTargetStep.value) {
      if (!canUseDraft.value || !amountWei.value) return
      actPlace()
      return
    }

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

function submitAmount() {
  if (!address.value) return
  actPrimary()
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
  quantityMode.value = 'one'
  actionStep.value = 'target'
  amountEth.value = ''
  error.value = null
  slotCount.value = PLACE_OFFER_MIN_MULTI_SLOTS
  activeSlotIndex.value = 0
  slotDrafts.value = [createPlaceOfferSlotDraft()]
}

function targetStepTitle() {
  return quantityMode.value === 'multiple'
    ? itemLabel(activeSlotIndex.value)
    : 'Target'
}

function amountStepTitle() {
  const singleSlot =
    draft.value.slotSummaries.length === 1 ? draft.value.slotSummaries[0] : null
  if (singleSlot?.targetMode === 'traits' && singleSlot.title) {
    return `Trait offer: ${formatTraitTitle(singleSlot.title)}`
  }
  if (draft.value.title) return draft.value.title
  if (quantityMode.value === 'multiple') return 'Multiple Punks'
  return 'Set Amount'
}

function formatTraitTitle(title: string) {
  const text = title.trim()
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text
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

.amount-action {
  flex: 0 1 auto;
  inline-size: min(100%, calc(var(--form-item-height) * 6));
}

.amount-action :deep(input) {
  flex: 0 1 calc(var(--form-item-height) * 2.5);
  min-inline-size: 0;
}

.amount-action :deep(button) {
  flex: 0 0 auto;
  white-space: nowrap;
}
</style>
