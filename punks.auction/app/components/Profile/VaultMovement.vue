<template>
  <ClientOnly>
    <section class="card">
      <div class="card-head">
        <div>
          <h3>Vault movement</h3>
        </div>
      </div>

      <p
        v-if="error"
        class="error"
      >
        {{ error }}
      </p>

      <div class="card-body">
        <p class="hint muted">
          Deposit a Punk into your `PunksVault` when you want to create auction
          lots or accept offers through PunksAuction. Vault custody proves the
          Punk is reserved for that flow and lets the auction move it into
          escrow only when a sale starts. Reclaim returns an unused Punk to your
          wallet.
        </p>

        <label
          v-if="renderV1"
          class="field"
        >
          <span class="label">Standard</span>
          <select v-model="standard">
            <option value="cryptopunks">CryptoPunks</option>
            <option value="cryptopunks-v1">V1</option>
          </select>
        </label>

        <div class="picker-row">
          <template v-if="selectedPunkId !== null">
            <div class="picker-preview">
              <PunkThumb
                :punk-id="selectedPunkId"
                :size="48"
                :link="false"
              />
              <span class="picker-meta">
                <strong>Punk #{{ selectedPunkId }}</strong>
                <span class="muted">{{ custodyHint }}</span>
              </span>
            </div>
            <Button
              class="icon-button"
              :disabled="pending"
              @click="pickerOpen = true"
            >
              <Icon name="lucide:mouse-pointer-click" />
              <span>Change Punk</span>
            </Button>
          </template>
          <template v-else>
            <Button
              class="icon-button"
              :disabled="pending"
              @click="pickerOpen = true"
            >
              <Icon name="lucide:mouse-pointer-click" />
              <span>Select Punk</span>
            </Button>
            <span class="hint muted">{{ pickerHint }}</span>
          </template>
        </div>
      </div>

      <div class="actions">
        <Button
          class="primary icon-button"
          :disabled="!canDeposit"
          @click="actDeposit"
        >
          <Icon name="lucide:archive" />
          <span>Deposit</span>
        </Button>
        <Button
          class="icon-button"
          :disabled="!canReclaim"
          @click="actReclaim"
        >
          <Icon name="lucide:undo-2" />
          <span>Reclaim</span>
        </Button>
      </div>

      <DialogPunkPicker
        v-model:open="pickerOpen"
        :ids="pickerIds"
        :initial="selectedPunkId === null ? [] : [selectedPunkId]"
        title="Select a CryptoPunk"
        lead="Pick one of your CryptoPunks in the wallet (to deposit) or in the vault (to reclaim)."
        empty-message="No eligible CryptoPunks in your wallet or vault."
        @confirm="onPickerConfirm"
      />

      <EvmTransactionFlowDialog
        ref="dialogRef"
        :request="transactionRequest"
        :text="transactionText"
        skip-confirmation
        @complete="onTransactionComplete"
      />
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import type {
  ContractWritePlan,
  PunkStandardRef,
} from '@networked-art/punks-sdk'
import type { Address, Hash, TransactionReceipt } from 'viem'
import type { TransactionFlowText } from '~/types/transactionFlow'
import { TokenStandard } from '~/utils/auction'

const props = defineProps<{ account: Address }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const renderV1 = useV1Rendering()
const {
  items: inventoryItems,
  loading: inventoryLoading,
  refresh: refreshInventory,
} = useAccountPunkInventory(() => props.account)

const standard = ref<'cryptopunks' | 'cryptopunks-v1'>('cryptopunks')
const selectedPunkId = ref<number | null>(null)
const pickerOpen = ref(false)
const pending = ref(false)
const error = ref<string | null>(null)

watch(renderV1, (enabled) => {
  if (!enabled && standard.value === 'cryptopunks-v1') {
    standard.value = 'cryptopunks'
  }
})

const targetStandard = computed(() =>
  standard.value === 'cryptopunks-v1'
    ? TokenStandard.CryptoPunksV1
    : TokenStandard.CryptoPunks,
)

const eligibleItems = computed(() =>
  inventoryItems.value.filter(
    (item) =>
      item.standard === targetStandard.value &&
      (item.custody === 'wallet' || item.custody === 'vault'),
  ),
)

const pickerIds = computed(() => eligibleItems.value.map((item) => item.punkId))

const pickerHint = computed(() => {
  if (inventoryLoading.value) return 'Loading your Punks…'
  if (pickerIds.value.length === 0) return 'No eligible Punks found.'
  return 'Pick a Punk to deposit or reclaim.'
})

const selectedItem = computed(() => {
  if (selectedPunkId.value === null) return null
  return (
    eligibleItems.value.find((item) => item.punkId === selectedPunkId.value) ??
    null
  )
})

const canDeposit = computed(
  () =>
    !!selectedItem.value &&
    selectedItem.value.custody === 'wallet' &&
    !pending.value,
)

const canReclaim = computed(
  () =>
    !!selectedItem.value &&
    selectedItem.value.custody === 'vault' &&
    !pending.value,
)

const custodyHint = computed(() => {
  switch (selectedItem.value?.custody) {
    case 'wallet':
      return 'In your wallet — ready to deposit'
    case 'vault':
      return 'In your vault — ready to reclaim'
    default:
      return ''
  }
})

// Clear the preview when the picked Punk leaves the eligible set (e.g. after a
// deposit/reclaim swaps its custody bucket, or after switching standards).
watch(eligibleItems, (items) => {
  if (selectedPunkId.value === null) return
  if (!items.some((item) => item.punkId === selectedPunkId.value)) {
    selectedPunkId.value = null
  }
})

function onPickerConfirm(ids: number[]) {
  selectedPunkId.value = ids[0] ?? null
}

type DialogRef = { initializeRequest: () => void } | null
const dialogRef = ref<DialogRef>(null)
const transactionRequest = ref<(() => Promise<Hash>) | undefined>()
const transactionText = ref<TransactionFlowText>({})

async function run(planInput: ContractWritePlan | Promise<ContractWritePlan>) {
  if (pending.value) return
  pending.value = true
  error.value = null
  try {
    const plan = await planInput
    transactionRequest.value = () => execute(plan)
    transactionText.value = {
      title: {
        confirm: plan.description,
        requesting: plan.description,
        waiting: plan.description,
        complete: 'Transaction complete',
      },
      lead: {
        confirm: plan.description,
        complete: 'Transaction confirmed.',
      },
    }
    await nextTick()
    dialogRef.value?.initializeRequest()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    pending.value = false
  }
}

function onTransactionComplete(_receipt: TransactionReceipt) {
  void refreshInventory()
}

function actDeposit() {
  const punkId = selectedPunkId.value
  if (punkId === null) return
  void run(
    sdk.value.auctions.prepareDeposit({
      owner: props.account,
      punkId,
      standard: standard.value as PunkStandardRef,
    }),
  )
}

function actReclaim() {
  const punkId = selectedPunkId.value
  if (punkId === null) return
  void run(
    sdk.value.auctions.prepareReclaim({
      punkId,
      standard: standard.value as PunkStandardRef,
    }),
  )
}
</script>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.card-head h3 {
  margin: 0;
  font-size: var(--font-md);
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.hint {
  margin: 0;
  font-size: var(--font-sm);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
  max-width: 200px;
}

.field select {
  width: 100%;
}

.picker-row {
  display: flex;
  align-items: center;
  gap: var(--size-3);
  flex-wrap: wrap;
}

.picker-preview {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  min-width: 0;
}

.picker-preview :deep(.punk-thumb) {
  border-radius: 0;
}

.picker-meta {
  display: flex;
  flex-direction: column;
  gap: var(--size-0);
  min-width: 0;
  font-size: var(--font-sm);
}

.picker-meta strong {
  text-transform: uppercase;
  font-size: var(--font-xs);
  letter-spacing: var(--letter-spacing-md);
}

.picker-meta .muted {
  font-size: var(--font-xs);
}

.actions {
  display: flex;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
}

.error {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--accent);
}
</style>
