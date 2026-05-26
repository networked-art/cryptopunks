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
            @click="actDeposit"
          >
            <Icon name="lucide:archive" />
            <span>Deposit</span>
          </Button>
          <Button
            class="icon-button"
            :disabled="!parsedPunkId || pending"
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

const props = defineProps<{ account: Address }>()
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()

// Stash address + deployment flag come straight from `StashFactory` so this
// card keeps working through indexer downtime — `stashAddressFor` is a pure
// CREATE2 view and `ownerHasDeployed` is a single onchain bool.
const stashAddress = ref<Address | null>(null)
const deployed = ref(false)
const statusLoading = ref(false)
let statusToken = 0

const punkIdInput = ref('')
const pending = ref(false)
const error = ref<string | null>(null)

const parsedPunkId = computed(() => {
  const id = Number(punkIdInput.value.trim())
  return Number.isInteger(id) && id >= 0 && id <= 9999 ? id : null
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
  emit('changed', receipt.transactionHash as Hash)
}

function actDeposit() {
  const punkId = parsedPunkId.value
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
  const punkId = parsedPunkId.value
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
