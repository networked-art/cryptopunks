<template>
  <ClientOnly>
    <Dialog
      v-model:open="createDialogOpen"
      title="Create lot"
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

      <FormCheckbox
        v-if="pairV1"
        v-model="includeV1Pair"
        class="pair-toggle"
      >
        Add the matching V1 Punk to this lot
      </FormCheckbox>

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
          Create lot <EthAmount :wei="reserveWei || 0n" />
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
import type { AccountPunkInventoryItem } from '~/composables/useAccountPunkInventory'
import { resolveAddressInput } from '~/utils/addressInput'
import {
  TokenStandard,
  ZERO_ADDRESS,
  equalLotWeights,
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
// Pull V1 Punks on a CryptoPunk page so we can offer to bundle the matching V1.
const inventory = useAccountPunkInventory(() => address.value, {
  includeV1: () => props.standard === TokenStandard.CryptoPunks,
})
const custodyPlan = usePunkCustodyPlan()

const reserveEth = ref('')
const reserveWei = ref<bigint | null>(null)
const onlySellTo = ref('')
const showAdvanced = ref(false)
const createDialogOpen = ref(false)
const buildError = ref<string | null>(null)
const includeV1Pair = ref(false)

const ownerItem = computed(() =>
  inventory.items.value.find(
    (item) => item.standard === props.standard && item.punkId === props.punkId,
  ),
)

/// The matching V1 Punk for this CryptoPunk, when the seller owns one and it can
/// be bundled into the lot. V1 Punks live only in the wallet or the Punks Vault;
/// adding one unwraps it if needed, then deposits the native V1 into the vault.
const pairV1 = computed<AccountPunkInventoryItem | null>(() => {
  if (props.standard !== TokenStandard.CryptoPunks) return null
  return (
    inventory.items.value.find(
      (item) =>
        item.standard === TokenStandard.CryptoPunksV1 &&
        item.punkId === props.punkId &&
        item.custody !== 'unsupported',
    ) ?? null
  )
})

/// Every Punk that will end up in the lot — the page's CryptoPunk plus its V1
/// when the seller opts in.
const lotItems = computed<AccountPunkInventoryItem[]>(() => {
  const primary = ownerItem.value
  if (!primary) return []
  return includeV1Pair.value && pairV1.value
    ? [primary, pairV1.value]
    : [primary]
})

// Drop the pairing if the V1 stops being available (custody changed, account
// changed) so we never try to bundle a Punk we can no longer move.
watch(pairV1, (pair) => {
  if (!pair) includeV1Pair.value = false
})

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
    includeV1Pair.value = false
    void inventory.refresh()
    emit('created', tx)
  },
})

const canCreate = computed(
  () =>
    lotItems.value.length > 0 &&
    !!reserveWei.value &&
    buyerInputSubmittable.value &&
    !pending.value,
)

const errorMessage = computed(() => buildError.value ?? txError.value)

const custodySummary = computed(() => {
  const needsMove = lotItems.value.filter(
    (item) => item.custody !== 'vault',
  ).length
  if (needsMove === 0) return null
  const noun = needsMove === 1 ? 'Punk' : 'Punks'
  const vaultPart = inventory.vaultDeployed.value
    ? 'your Punks Vault'
    : 'a freshly deployed Punks Vault'
  return `${needsMove} ${noun} will be moved into ${vaultPart} before the lot is created.`
})

async function start() {
  await inventory.refresh()
  buildError.value = null
  includeV1Pair.value = false
  createDialogOpen.value = true
}

function onDialogClosed() {
  buildError.value = null
}

async function actCreate() {
  buildError.value = null
  const items = lotItems.value
  const owner = address.value
  const reserve = reserveWei.value
  if (!items.length || !owner || !reserve || !buyerInputSubmittable.value) return

  let plans: ContractWritePlan[]
  try {
    const onlyBuyer = await resolveOnlySellTo()
    const custodyPlans = await custodyPlan.buildCustodyPlans({
      owner,
      vault: inventory.vault.value,
      vaultDeployed: inventory.vaultDeployed.value,
      stash: inventory.stash.value,
      items,
    })
    const weights = equalLotWeights(items.length)
    const planItems = custodyPlan.lotItemsFor(
      items.map((item, index) => ({
        standard: item.standard,
        punkId: item.punkId,
        weightBps: weights[index] ?? 0,
      })),
    )
    const lotPlan = sdk.value.auctions.prepareCreateLot({
      items: planItems,
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
    dialogTitle: 'Create lot',
    single: {
      title: { complete: 'Lot created' },
      lead: { complete: 'Your auction lot has been created.' },
    },
    multi: {
      title: { complete: 'Lot created' },
      lead: { complete: 'Your auction lot has been created.' },
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

.pair-toggle {
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
