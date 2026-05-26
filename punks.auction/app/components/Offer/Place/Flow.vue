<template>
  <ClientOnly>
    <OfferPlaceActionCard
      :title="stepTitle"
      :primary-label="primaryLabel"
      :primary-disabled="primaryDisabled"
      :show-footer="step !== 'type'"
      @primary="actPrimary"
    >
      <OfferPlaceTypeStep
        v-if="step === 'type'"
        v-model="kind"
        @select="selectKind"
      />

      <template v-else-if="step === 'target'">
        <OfferPlaceSingleTarget
          v-if="kind === 'single'"
          v-model:text="singleText"
          v-model:selected-id="singlePunkId"
          :size="size"
        />
        <OfferPlaceTraitTarget
          v-else-if="kind === 'trait'"
          v-model:text="traitSearchText"
          v-model:selected-text="traitText"
          v-model:selected-query="traitQuery"
          v-model:selected-match-ids="traitMatchIds"
          v-model:include-ids="traitIncludeIds"
          v-model:exclude-ids="traitExcludeIds"
          :size="size"
        />
        <OfferPlaceMultiTarget
          v-else-if="kind === 'multi'"
          v-model:text="multiText"
          v-model:selected-ids="multiPunkIds"
          :size="size"
        />
      </template>

      <OfferPlaceAmountStep
        v-else-if="step === 'amount'"
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
          v-if="step !== 'type'"
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
        v-if="step === 'amount' && !address"
        #primary
      >
        <EvmConnectDialog class-name="primary">Connect</EvmConnectDialog>
      </template>
    </OfferPlaceActionCard>

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
import type { ContractWritePlan, PunkQuery } from '@networked-art/punks-sdk'
import { useConnection } from '@wagmi/vue'
import { parseEther, type Hash, type TransactionReceipt } from 'viem'
import {
  PLACE_OFFER_KIND_TITLES,
  buildPlaceOfferDraft,
  type PlaceOfferKind,
} from '~/composables/usePlaceOfferDraft'

type Step = 'type' | 'target' | 'amount'

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

const kind = ref<PlaceOfferKind | null>(null)
const step = ref<Step>('type')
const amountEth = ref('')
const error = ref<string | null>(null)

const singleText = ref('')
const singlePunkId = ref<number | null>(null)
const traitSearchText = ref('')
const traitText = ref('')
const traitQuery = ref<PunkQuery | null>(null)
const traitMatchIds = ref<number[]>([])
const traitIncludeIds = ref<number[]>([])
const traitExcludeIds = ref<number[]>([])
const multiText = ref('')
const multiPunkIds = ref<number[]>([])

const transactionText = ref<{
  title?: Record<string, string>
  lead?: Record<string, string>
  action?: Record<string, string>
}>({})
type TransactionDialogRef = {
  initializeRequest: (request?: () => Promise<Hash>) => void
} | null
const transactionDialogRef = ref<TransactionDialogRef>(null)

const draft = computed(() =>
  buildPlaceOfferDraft({
    kind: kind.value,
    singlePunkId: singlePunkId.value,
    traitQuery: traitQuery.value ?? undefined,
    traitText: traitText.value,
    traitMatchIds: traitMatchIds.value,
    traitIncludeIds: traitIncludeIds.value,
    traitExcludeIds: traitExcludeIds.value,
    multiPunkIds: multiPunkIds.value,
  }),
)
const slotValidationError = computed(() => {
  if (!draft.value.canPlaceOffer) return draft.value.error ?? null
  try {
    for (const slot of draft.value.slots) sdk.value.offers.slot(slot)
    return null
  } catch (e) {
    return (e as Error).message
  }
})
const steps = computed<Step[]>(() =>
  kind.value === 'collection'
    ? ['type', 'amount']
    : ['type', 'target', 'amount'],
)
const stepTitle = computed(() => {
  switch (step.value) {
    case 'type':
      return 'Choose offer type'
    case 'target':
      return 'Choose target'
    case 'amount':
      return kind.value ? PLACE_OFFER_KIND_TITLES[kind.value] : 'Set amount'
  }
})
const amountWei = computed(() => parsePositiveEth(amountEth.value))
const primaryLabel = computed(() =>
  step.value === 'amount' ? 'Place offer' : 'Continue',
)
const primaryDisabled = computed(() => {
  if (step.value === 'type') return !kind.value
  if (step.value === 'target') return !canUseDraft.value
  if (step.value === 'amount') return !canUseDraft.value || !amountWei.value
  return false
})
const canUseDraft = computed(
  () => draft.value.canPlaceOffer && !slotValidationError.value,
)
const footerSelection = computed(() => {
  if (step.value !== 'target' || !draft.value.title) return ''
  if (draft.value.kind === 'trait') {
    const adjustments = [
      traitIncludeIds.value.length
        ? `${traitIncludeIds.value.length.toLocaleString()} included`
        : '',
      traitExcludeIds.value.length
        ? `${traitExcludeIds.value.length.toLocaleString()} excluded`
        : '',
    ].filter(Boolean)
    return [draft.value.title, ...adjustments].join(' · ')
  }
  return draft.value.title
})
const visibleError = computed(() => {
  if (error.value) return error.value
  if (step.value === 'type') return null
  if (step.value === 'target') return draft.value.error ?? slotValidationError.value
  if (!canUseDraft.value) return draft.value.error ?? slotValidationError.value
  return null
})

function selectKind(next: PlaceOfferKind) {
  kind.value = next
  error.value = null
  step.value = nextStepForKind(next)
}

function actPrimary() {
  error.value = null
  if (step.value === 'type') {
    if (!kind.value) return
    step.value = nextStepForKind(kind.value)
    return
  }
  if (step.value === 'target') {
    if (!canUseDraft.value) return
    step.value = 'amount'
    return
  }
  if (step.value === 'amount') {
    if (!canUseDraft.value || !amountWei.value) return
    actPlace()
    return
  }
}

function nextStepForKind(next: PlaceOfferKind): Step {
  return next === 'collection' ? 'amount' : 'target'
}

function goBack() {
  error.value = null
  const index = steps.value.indexOf(step.value)
  if (index <= 0) return
  step.value = steps.value[index - 1]!
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
  kind.value = null
  step.value = 'type'
  amountEth.value = ''
  error.value = null
  singleText.value = ''
  singlePunkId.value = null
  traitSearchText.value = ''
  traitText.value = ''
  traitQuery.value = null
  traitMatchIds.value = []
  traitIncludeIds.value = []
  traitExcludeIds.value = []
  multiText.value = ''
  multiPunkIds.value = []
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
