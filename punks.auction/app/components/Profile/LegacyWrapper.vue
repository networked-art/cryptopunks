<template>
  <ClientOnly>
    <section class="card">
      <div class="card-head">
        <div>
          <h3>Legacy wrapper</h3>
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
        <label class="field">
          <span class="label">Punk id</span>
          <input
            v-model="punkIdInput"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            spellcheck="false"
          />
        </label>

        <div class="actions">
          <Button
            class="primary icon-button"
            :disabled="!parsedPunkId || pending"
            @click="actWrap"
          >
            <Icon name="lucide:package" />
            <span>Wrap (2 steps)</span>
          </Button>
          <Button
            class="icon-button"
            :disabled="!parsedPunkId || pending"
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

const props = defineProps<{
  account: Address
  wrapperProxy: Address | null
}>()
const emit = defineEmits<{
  changed: [tx: Hash, wrapperProxy?: Address | null]
}>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()

const confirmedWrapperProxy = ref<Address | null>(props.wrapperProxy)
const punkIdInput = ref('')
const pending = ref(false)
const error = ref<string | null>(null)

const activeWrapperProxy = computed(
  () => props.wrapperProxy ?? confirmedWrapperProxy.value,
)

const parsedPunkId = computed(() => {
  const id = Number(punkIdInput.value.trim())
  return Number.isInteger(id) && id >= 0 && id <= 9999 ? id : null
})

watch(
  () => [props.account, props.wrapperProxy] as const,
  ([, wrapperProxy]) => {
    confirmedWrapperProxy.value = wrapperProxy
  },
  { immediate: true },
)

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
    error.value = (e as Error).message
  } finally {
    pending.value = false
  }
}

function onFlowError(message: string) {
  error.value = message
}

async function onTransactionComplete(receipt: TransactionReceipt) {
  const tx = receipt.transactionHash as Hash
  if (currentSingleAction.value !== 'register') {
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

function actRegister() {
  void run(sdk.value.wrappers.legacy.prepareRegisterProxy(), 'register')
}

function actWrap() {
  const punkId = parsedPunkId.value
  const proxy = activeWrapperProxy.value
  if (punkId === null || !proxy) return
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
  const punkId = parsedPunkId.value
  if (punkId === null) return
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

.field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
}

.field input {
  width: 100%;
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
