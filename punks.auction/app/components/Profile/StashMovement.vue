<template>
  <ClientOnly>
    <section class="card">
      <div class="card-head">
        <div>
          <h3>Stash</h3>
          <a
            v-if="stashAddress"
            :href="addressUrl(stashAddress)"
            target="_blank"
            rel="noopener"
            class="addr-link"
          >
            <Account :address="stashAddress" />
          </a>
          <p class="hint muted">
            Move CryptoPunks in and out of your Yuga Stash, or wrap them as
            `CryptoPunks721` ERC-721 tokens.
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
          transfer or wrap.
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
          <Button
            class="icon-button"
            :disabled="!canWrap"
            @click="actWrap"
          >
            <Icon name="lucide:package" />
            <span>{{ wrapLabel }}</span>
          </Button>
          <Button
            class="icon-button"
            :disabled="!canUnwrap"
            @click="actUnwrap"
          >
            <Icon name="lucide:package-open" />
            <span>Unwrap</span>
          </Button>
        </div>

        <p class="hint muted">
          Wrap mints an ERC-721 from a Punk held in your Stash; unwrap burns
          it and leaves the Punk in the Stash.
        </p>
      </template>

      <DialogPunkPicker
        v-model:open="pickerOpen"
        :ids="pickerIds"
        :initial="selectedPunkId === null ? [] : [selectedPunkId]"
        title="Select a CryptoPunk"
        lead="Pick one of your CryptoPunks in the wallet, the Stash, or wrapped as ERC-721."
        empty-message="No eligible CryptoPunks in your wallet, Stash, or wrapper."
        @confirm="onPickerConfirm"
      />

      <EvmTransactionFlowDialog
        ref="dialogRef"
        :request="transactionRequest"
        :text="transactionText"
        skip-confirmation
        @complete="onTransactionComplete"
      />

      <EvmMultiTransactionFlowDialog
        ref="multiDialogRef"
        :steps="flowSteps"
        :text="multiDialogText"
        skip-confirmation
        @complete="onFlowComplete"
        @error="onFlowError"
      />
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import type {
  MultiTransactionFlowStep,
  MultiTransactionFlowText,
  TransactionFlowText,
} from '@1001-digital/components.evm'
import type { ContractWritePlan } from '@networked-art/punks-sdk'
import type { Address, Hash, TransactionReceipt } from 'viem'
import { TokenStandard } from '~/utils/auction'
import { addressUrl } from '~/utils/explorer'

const props = defineProps<{ account: Address }>()
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { refreshMarketState } = usePunkMarketState()
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
      (item.custody === 'wallet' ||
        item.custody === 'stash' ||
        (item.custody === 'wrapped-wallet' &&
          item.wrapper === 'cryptopunks_721')),
  ),
)

const pickerIds = computed(() => eligibleItems.value.map((item) => item.punkId))

const pickerHint = computed(() => {
  if (inventoryLoading.value) return 'Loading your Punks…'
  if (pickerIds.value.length === 0) return 'No eligible Punks found.'
  return 'Pick a Punk to deposit, reclaim, wrap, or unwrap.'
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

const canWrap = computed(
  () =>
    !!selectedItem.value &&
    (selectedItem.value.custody === 'wallet' ||
      selectedItem.value.custody === 'stash') &&
    !pending.value,
)

const canUnwrap = computed(
  () =>
    !!selectedItem.value &&
    selectedItem.value.custody === 'wrapped-wallet' &&
    !pending.value,
)

const wrapLabel = computed(() =>
  selectedItem.value?.custody === 'wallet' ? 'Wrap (2 steps)' : 'Wrap',
)

const custodyHint = computed(() => {
  switch (selectedItem.value?.custody) {
    case 'wallet':
      return 'In your wallet — ready to deposit or wrap'
    case 'stash':
      return 'In your Stash — ready to reclaim or wrap'
    case 'wrapped-wallet':
      return 'Wrapped as ERC-721 — ready to unwrap'
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
// a successful deposit/reclaim/wrap/unwrap swaps its custody bucket).
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
type MultiDialogRef = { start: () => void } | null
const dialogRef = ref<DialogRef>(null)
const multiDialogRef = ref<MultiDialogRef>(null)
const transactionRequest = ref<(() => Promise<Hash>) | undefined>()
const transactionText = ref<TransactionFlowText>({})
const flowSteps = ref<MultiTransactionFlowStep[]>([])
const multiDialogText = ref<MultiTransactionFlowText>({})
const currentSingleAction = ref<'deploy' | null>(null)

async function run(
  planInput: ContractWritePlan | Promise<ContractWritePlan>,
  action: 'deploy' | null = null,
) {
  if (pending.value) return
  pending.value = true
  error.value = null
  try {
    const plan = await planInput
    currentSingleAction.value = action
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

async function runSteps(
  plansInput: Promise<ContractWritePlan[]>,
  completeText: { title: string; lead: string },
) {
  if (pending.value) return
  pending.value = true
  error.value = null
  try {
    const plans = await plansInput
    flowSteps.value = plans.map((plan, i) => ({
      id: `stash-step-${i}`,
      title: plan.description,
      lead: plan.description,
      request: () => execute(plan),
    }))
    multiDialogText.value = {
      title: { complete: completeText.title },
      lead: { complete: completeText.lead },
    }
    await nextTick()
    multiDialogRef.value?.start()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    pending.value = false
  }
}

function actDeploy() {
  void run(sdk.value.stash.prepareDeploy(props.account), 'deploy')
}

function onTransactionComplete(receipt: TransactionReceipt) {
  const wasDeploy = currentSingleAction.value === 'deploy'
  currentSingleAction.value = null
  void refreshStatus()
  void refreshInventory()
  if (!wasDeploy) scheduleMarketRefresh()
  emit('changed', receipt.transactionHash as Hash)
}

function onFlowComplete() {
  selectedPunkId.value = null
  void refreshStatus()
  void refreshInventory()
  scheduleMarketRefresh()
}

function onFlowError(message: string) {
  error.value = message
}

// `refreshMarketState` reflects the latest indexer snapshot but the indexer
// itself can lag a few seconds behind a freshly mined wrap/unwrap. Fire one
// refresh immediately and a follow-up to catch the indexer once it's caught up.
function scheduleMarketRefresh() {
  void refreshMarketState()
  setTimeout(() => void refreshMarketState(), 15000)
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

function actWrap() {
  const punkId = selectedPunkId.value
  const item = selectedItem.value
  if (punkId === null || !item) return
  if (item.custody === 'wallet') {
    void runSteps(
      sdk.value.wrappers.c721.prepareWrapFlow({
        owner: props.account,
        punkId,
        stash: stashAddress.value ?? undefined,
      }),
      {
        title: 'Wrap complete',
        lead: 'Punk deposited and ERC-721 minted.',
      },
    )
  } else if (item.custody === 'stash') {
    void run(Promise.resolve(sdk.value.wrappers.c721.prepareWrapPunk(punkId)))
  }
}

function actUnwrap() {
  const punkId = selectedPunkId.value
  if (punkId === null) return
  void run(Promise.resolve(sdk.value.wrappers.c721.prepareUnwrapPunk(punkId)))
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

.addr-link {
  display: inline-block;
  margin-top: var(--size-1);
  border: 0;
  font-size: var(--font-xs);
  color: var(--text-dim);
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
