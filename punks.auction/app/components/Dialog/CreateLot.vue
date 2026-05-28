<template>
  <ClientOnly>
    <Dialog
      v-model:open="createDialogOpen"
      title="List lot"
      class="create-lot-dialog"
      compat
      @closed="onDialogClosed"
    >
      <p
        v-if="custodySummary"
        class="form-note muted"
      >
        {{ custodySummary }}
      </p>

      <p
        v-else
        class="form-note muted"
      >
        Set the reserve and optional initial buyer for this Punk lot.
      </p>

      <div class="form-grid">
        <label class="field">
          <span class="label">Reserve ETH</span>
          <EvmEthInput
            v-model="reserveEth"
            v-model:wei="reserveWei"
            :suffix="false"
          />
        </label>
      </div>

      <LotPrivateBuyerField
        v-model="onlySellTo"
        v-model:open="showAdvanced"
      />

      <p
        v-if="errorMessage"
        class="error"
      >
        {{ errorMessage }}
      </p>

      <template #footer>
        <Button
          class="secondary"
          @click="createDialogOpen = false"
        >
          Cancel
        </Button>
        <Button
          class="primary"
          :disabled="!canCreate"
          @click="actCreate"
        >
          List lot <EthAmount :wei="reserveWei || 0n" />
        </Button>
      </template>
    </Dialog>

    <EvmTransactionFlowDialog
      ref="transactionDialogRef"
      :request="transactionRequest"
      :text="transactionText"
      skip-confirmation
      @complete="onTransactionComplete"
    />

    <EvmMultiTransactionFlowDialog
      ref="multiDialogRef"
      :title="multiDialogTitle"
      :steps="flowSteps"
      :text="multiDialogText"
      skip-confirmation
      @complete="onMultiTransactionComplete"
      @error="onFlowError"
    />
  </ClientOnly>
</template>

<script setup lang="ts">
import type { ContractWritePlan } from '@networked-art/punks-sdk'
import { useConfig, useConnection } from '@wagmi/vue'
import { isAddress, type Hash } from 'viem'
import { resolveAddressInput } from '~/utils/addressInput'
import {
  TOTAL_WEIGHT_BPS,
  ZERO_ADDRESS,
  type TokenStandardValue,
} from '~/utils/auction'

const props = defineProps<{
  punkId: number
  standard: TokenStandardValue
}>()

const emit = defineEmits<{ created: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const config = useConfig()
const { address } = useConnection()
const inventory = useAccountPunkInventory(() => address.value)
const custodyPlan = usePunkCustodyPlan()

const reserveEth = ref('')
const reserveWei = ref<bigint | null>(null)
const onlySellTo = ref('')
const showAdvanced = ref(false)
const createDialogOpen = ref(false)
const buildError = ref<string | null>(null)

const ownerItem = computed(() =>
  inventory.items.value.find(
    (item) => item.standard === props.standard && item.punkId === props.punkId,
  ),
)

const buyerInputSubmittable = computed(() => {
  const trimmed = onlySellTo.value.trim()
  return !trimmed || isAddress(trimmed) || trimmed.includes('.')
})

const {
  pending,
  error: txError,
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
} = useTransactionFlowRunner({
  onComplete: (tx) => {
    reserveEth.value = ''
    onlySellTo.value = ''
    void inventory.refresh()
    emit('created', tx)
  },
})

const canCreate = computed(
  () =>
    !!ownerItem.value &&
    !!reserveWei.value &&
    buyerInputSubmittable.value &&
    !pending.value,
)

const errorMessage = computed(() => buildError.value ?? txError.value)

const custodySummary = computed(() => {
  const item = ownerItem.value
  if (!item || item.custody === 'vault') return null
  return inventory.vaultDeployed.value
    ? 'The Punk will be moved into your auction vault before the lot is created.'
    : 'Your auction vault will be deployed and the Punk moved into it before the lot is created.'
})

async function start() {
  await inventory.refresh()
  buildError.value = null
  createDialogOpen.value = true
}

function onDialogClosed() {
  buildError.value = null
}

async function actCreate() {
  buildError.value = null
  const item = ownerItem.value
  const owner = address.value
  const reserve = reserveWei.value
  if (!item || !owner || !reserve || !buyerInputSubmittable.value) return

  let plans: ContractWritePlan[]
  try {
    const onlyBuyer = await resolveOnlySellTo()
    const custodyPlans = await custodyPlan.buildCustodyPlans({
      owner,
      vault: inventory.vault.value,
      vaultDeployed: inventory.vaultDeployed.value,
      stash: inventory.stash.value,
      items: [item],
    })
    const lotItems = custodyPlan.lotItemsFor([
      {
        standard: item.standard,
        punkId: item.punkId,
        weightBps: TOTAL_WEIGHT_BPS,
      },
    ])
    const lotPlan = sdk.value.auctions.prepareCreateLot({
      items: lotItems,
      reserveWei: reserve,
      onlySellTo: onlyBuyer,
    })
    plans = [...custodyPlans, lotPlan]
  } catch (e) {
    buildError.value = (e as Error).message
    return
  }

  createDialogOpen.value = false
  await runPlans(plans, {
    dialogTitle: 'List lot',
    single: {
      title: { complete: 'Lot listed' },
      lead: { complete: 'Your auction lot has been listed.' },
    },
    multi: {
      title: { complete: 'Lot listed' },
      lead: { complete: 'Your auction lot has been listed.' },
    },
  })
}

async function resolveOnlySellTo() {
  const trimmed = onlySellTo.value.trim()
  if (!trimmed) return ZERO_ADDRESS
  return resolveAddressInput(config, trimmed, {
    invalidMessage: 'Enter a valid initial buyer address or ENS name.',
  })
}

defineExpose({ start })
</script>

<style scoped>
.create-lot-dialog :deep(section) {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(120px, 240px);
  gap: var(--size-2);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
}

.field input {
  width: 100%;
}

.label {
  margin-bottom: var(--size-1);
  text-transform: uppercase;
  font-size: var(--font-xs);
  letter-spacing: var(--letter-spacing-md);
  color: var(--text-dim);
}

.form-note {
  margin: 0;
  font-size: var(--font-sm);
}

.error {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--accent);
}

.create-lot-dialog :deep(button .eth-amount) {
  margin-left: var(--size-1);
}

.create-lot-dialog :deep(button .eth-amount .unit) {
  color: inherit;
}

@media (max-width: 760px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
