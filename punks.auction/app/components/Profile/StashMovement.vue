<template>
  <ClientOnly>
    <section class="card">
      <div class="card-head">
        <div>
          <h3>Stash movement</h3>
          <p class="hint muted">
            Move CryptoPunks into the Yuga Stash or pull them back out.
          </p>
        </div>
        <Tag
          small
          class="status-tag"
          :class="{ active: deployed }"
        >
          {{ deployed ? 'Deployed' : 'Not deployed' }}
        </Tag>
      </div>

      <p
        v-if="error"
        class="error"
      >
        {{ error }}
      </p>

      <div
        v-if="!deployed"
        class="setup"
      >
        <p class="hint muted">
          Deploy a Stash via `StashFactory` once and reuse it for every
          transfer.
        </p>
        <Button
          class="primary icon-button"
          :disabled="pending || statusLoading"
          @click="actDeploy"
        >
          <Icon name="lucide:shield-plus" />
          <span>Deploy Stash</span>
        </Button>
      </div>

      <template v-else>
        <div class="picker-row">
          <Button
            class="icon-button"
            :disabled="pending"
            @click="pickerOpen = true"
          >
            <Icon name="lucide:mouse-pointer-click" />
            <span>{{ selectedPunkId === null ? 'Select Punk' : 'Change Punk' }}</span>
          </Button>
          <div
            v-if="selectedPunkId !== null"
            class="picker-preview"
          >
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
          <span
            v-else
            class="hint muted"
          >
            {{ pickerHint }}
          </span>
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

        <p class="hint muted">
          Stash deposit and reclaim operate on canonical CryptoPunks.
        </p>
      </template>

      <DialogPunkPicker
        v-model:open="pickerOpen"
        :ids="pickerIds"
        :initial="selectedPunkId === null ? [] : [selectedPunkId]"
        title="Select a CryptoPunk"
        lead="Pick one of your CryptoPunks in the wallet (to deposit) or in the Stash (to reclaim)."
        empty-message="No eligible CryptoPunks in your wallet or Stash."
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
import type { TransactionFlowText } from '@1001-digital/components.evm'
import type { ContractWritePlan } from '@networked-art/punks-sdk'
import type { Address, Hash, TransactionReceipt } from 'viem'
import { TokenStandard } from '~/utils/auction'

const props = defineProps<{ account: Address }>()
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { items: inventoryItems, loading: inventoryLoading, refresh: refreshInventory } =
  useAccountPunkInventory(() => props.account)

// Stash address + deployment flag come straight from `StashFactory` so this
// card keeps working through indexer downtime — `stashAddressFor` is a pure
// CREATE2 view and `ownerHasDeployed` is a single onchain bool.
const stashAddress = ref<Address | null>(null)
const deployed = ref(false)
const statusLoading = ref(false)
let statusToken = 0

const selectedPunkId = ref<number | null>(null)
const pickerOpen = ref(false)
const pending = ref(false)
const error = ref<string | null>(null)

const eligibleItems = computed(() =>
  inventoryItems.value.filter(
    (item) =>
      item.standard === TokenStandard.CryptoPunks &&
      (item.custody === 'wallet' || item.custody === 'stash'),
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
    selectedItem.value.custody === 'stash' &&
    !!stashAddress.value &&
    !pending.value,
)

const custodyHint = computed(() => {
  switch (selectedItem.value?.custody) {
    case 'wallet':
      return 'In your wallet — ready to deposit'
    case 'stash':
      return 'In your Stash — ready to reclaim'
    default:
      return ''
  }
})

async function refreshStatus() {
  const t = ++statusToken
  statusLoading.value = true
  try {
    const status = await sdk.value.stash.statusForOwner(props.account)
    if (t !== statusToken) return
    stashAddress.value = status.address
    deployed.value = status.deployed
    error.value = null
  } catch (e) {
    if (t !== statusToken) return
    error.value = (e as Error).message
  } finally {
    if (t === statusToken) statusLoading.value = false
  }
}

// Watching `sdk` matters because `usePunksSdk` initializes its ref to an
// offline SDK (no publicClient) and only swaps in the wired SDK after a
// `watchEffect` tick. Without it, the immediate firing on mount calls the
// offline SDK, throws "publicClient is required" and never retries.
watch(
  [() => props.account, sdk],
  () => void refreshStatus(),
  { immediate: true },
)

// Clear the preview when the picked Punk leaves the eligible set (e.g. after
// a successful deposit/reclaim swaps its custody bucket).
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

function actDeploy() {
  void run(sdk.value.stash.prepareDeploy(props.account))
}

function onTransactionComplete(receipt: TransactionReceipt) {
  void refreshStatus()
  void refreshInventory()
  emit('changed', receipt.transactionHash as Hash)
}

function actDeposit() {
  const punkId = selectedPunkId.value
  if (punkId === null) return
  void run(
    sdk.value.wrappers.c721.prepareDepositToStash({
      owner: props.account,
      punkId,
      stash: stashAddress.value ?? undefined,
    }),
  )
}

function actReclaim() {
  const punkId = selectedPunkId.value
  if (punkId === null || !stashAddress.value) return
  void run(
    Promise.resolve(
      sdk.value.stash.at(stashAddress.value).prepareWithdrawPunks([punkId]),
    ),
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

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--size-3);
  flex-wrap: wrap;
}

.card-head h3 {
  margin: 0;
  font-size: var(--font-md);
}

.hint {
  margin: 0;
  margin-top: var(--size-1);
  font-size: var(--font-sm);
}

.setup {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  align-items: flex-start;
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

.status-tag {
  flex: 0 0 auto;
  cursor: default;
}

.error {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--accent);
}
</style>
