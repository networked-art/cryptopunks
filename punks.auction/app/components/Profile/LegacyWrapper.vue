<template>
  <ClientOnly>
    <section class="card">
      <div class="card-head">
        <div>
          <h3>Legacy wrapper</h3>
          <a
            v-if="activeWrapperProxy"
            :href="addressUrl(activeWrapperProxy)"
            target="_blank"
            rel="noopener"
            class="addr-link"
          >
            <Account :address="activeWrapperProxy" />
          </a>
          <p class="hint muted">
            Mint and burn original `WrappedPunks` ERC-721 tokens via your
            personal wrapper proxy.
          </p>
        </div>
        <Tag
          small
          class="status-tag"
          :class="{ active: !!activeWrapperProxy }"
        >
          {{ activeWrapperProxy ? 'Registered' : 'Not registered' }}
        </Tag>
      </div>

      <p
        v-if="error"
        class="error"
      >
        {{ error }}
      </p>

      <div
        v-if="!activeWrapperProxy"
        class="setup"
      >
        <p class="hint muted">
          The proxy contract holds the underlying Punk while you hold the
          ERC-721. One-time setup per account.
        </p>
        <Button
          class="primary icon-button"
          :disabled="pending"
          @click="actRegister"
        >
          <Icon name="lucide:user-plus" />
          <span>Register Wrapper Proxy</span>
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
            :disabled="!canWrap"
            @click="actWrap"
          >
            <Icon name="lucide:package" />
            <span>Wrap (2 steps)</span>
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
          Wrapping deposits the Punk into your proxy then mints the ERC-721.
          Unwrap burns it and returns the Punk to your wallet.
        </p>
      </template>

      <DialogPunkPicker
        v-model:open="pickerOpen"
        :ids="pickerIds"
        :initial="selectedPunkId === null ? [] : [selectedPunkId]"
        title="Select a CryptoPunk"
        lead="Pick one of your CryptoPunks in the wallet (to wrap) or wrapped via WrappedPunks (to unwrap)."
        empty-message="No eligible CryptoPunks in your wallet or wrapper."
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
import {
  zeroAddress,
  type Address,
  type Hash,
  type TransactionReceipt,
} from 'viem'
import { TokenStandard } from '~/utils/auction'
import { addressUrl } from '~/utils/explorer'

const props = defineProps<{
  account: Address
  wrapperProxy: Address | null
}>()
const emit = defineEmits<{
  changed: [tx: Hash, wrapperProxy?: Address | null]
}>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { refreshMarketState } = usePunkMarketState()
const optimistic = useOptimisticMarketPatch()
const { items: inventoryItems, loading: inventoryLoading, refresh: refreshInventory } =
  useAccountPunkInventory(() => props.account)

const confirmedWrapperProxy = ref<Address | null>(props.wrapperProxy)
const selectedPunkId = ref<number | null>(null)
const pickerOpen = ref(false)
const pending = ref(false)
const error = ref<string | null>(null)

const activeWrapperProxy = computed(
  () => props.wrapperProxy ?? confirmedWrapperProxy.value,
)

const eligibleItems = computed(() =>
  inventoryItems.value.filter(
    (item) =>
      item.standard === TokenStandard.CryptoPunks &&
      (item.custody === 'wallet' ||
        (item.custody === 'wrapped-wallet' && item.wrapper === 'wrapped_punks')),
  ),
)

const pickerIds = computed(() => eligibleItems.value.map((item) => item.punkId))

const pickerHint = computed(() => {
  if (inventoryLoading.value) return 'Loading your Punks…'
  if (pickerIds.value.length === 0) return 'No eligible Punks found.'
  return 'Pick a Punk to wrap or unwrap.'
})

const selectedItem = computed(() => {
  if (selectedPunkId.value === null) return null
  return (
    eligibleItems.value.find((item) => item.punkId === selectedPunkId.value) ??
    null
  )
})

const canWrap = computed(
  () =>
    !!selectedItem.value &&
    selectedItem.value.custody === 'wallet' &&
    !!activeWrapperProxy.value &&
    !pending.value,
)

const canUnwrap = computed(
  () =>
    !!selectedItem.value &&
    selectedItem.value.custody === 'wrapped-wallet' &&
    !pending.value,
)

const custodyHint = computed(() => {
  switch (selectedItem.value?.custody) {
    case 'wallet':
      return 'In your wallet — ready to wrap'
    case 'wrapped-wallet':
      return 'Wrapped — ready to unwrap'
    default:
      return ''
  }
})

watch(
  () => [props.account, props.wrapperProxy] as const,
  ([, wrapperProxy]) => {
    confirmedWrapperProxy.value = wrapperProxy
  },
  { immediate: true },
)

// Clear the preview when the picked Punk leaves the eligible set (e.g. after a
// successful wrap/unwrap moves it to a different custody bucket).
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
const currentSingleAction = ref<'register' | null>(null)

async function run(
  planInput: ContractWritePlan | Promise<ContractWritePlan>,
  action: 'register' | null = null,
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
    currentSingleAction.value = null
    optimistic.discard()
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
      id: `legacy-step-${i}`,
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
    optimistic.discard()
    error.value = (e as Error).message
  } finally {
    pending.value = false
  }
}

function onFlowError(message: string) {
  optimistic.discard()
  error.value = message
}

async function onTransactionComplete(receipt: TransactionReceipt) {
  const tx = receipt.transactionHash as Hash
  if (currentSingleAction.value !== 'register') {
    optimistic.flush()
    selectedPunkId.value = null
    void refreshInventory()
    scheduleMarketRefresh()
    emit('changed', tx)
    return
  }

  currentSingleAction.value = null
  try {
    const proxy = await sdk.value.wrappers.legacy.proxyFor(props.account)
    const nextProxy =
      proxy.toLowerCase() === zeroAddress ? null : (proxy as Address)

    confirmedWrapperProxy.value = nextProxy
    emit('changed', tx, nextProxy)
  } catch (e) {
    error.value = (e as Error).message
    emit('changed', tx)
  }
}

function onFlowComplete() {
  optimistic.flush()
  selectedPunkId.value = null
  void refreshInventory()
  scheduleMarketRefresh()
}

// `refreshMarketState` reflects the latest indexer snapshot but the indexer
// itself can lag a few seconds behind a freshly mined wrap/unwrap. Fire one
// refresh immediately and a follow-up to catch the indexer once it's caught up.
function scheduleMarketRefresh() {
  void refreshMarketState()
  setTimeout(() => void refreshMarketState(), 15000)
}

function actRegister() {
  void run(sdk.value.wrappers.legacy.prepareRegisterProxy(), 'register')
}

function actWrap() {
  const punkId = selectedPunkId.value
  const proxy = activeWrapperProxy.value
  if (punkId === null || !proxy) return
  optimistic.stage(punkId, { legacy_wrapped: true })
  void runSteps(
    sdk.value.wrappers.legacy.prepareWrapFlow({
      owner: props.account,
      punkId,
      proxy,
    }),
    {
      title: 'Wrap complete',
      lead: 'Punk deposited and ERC-721 minted.',
    },
  )
}

function actUnwrap() {
  const punkId = selectedPunkId.value
  if (punkId === null) return
  optimistic.stage(punkId, { legacy_wrapped: false })
  void run(sdk.value.wrappers.legacy.prepareBurn(punkId))
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
