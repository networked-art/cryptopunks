<template>
  <ClientOnly>
    <section class="card">
      <div class="card-head">
        <div>
          <h3>Vault movement</h3>
          <p class="hint muted">Deposit into your `PunksVault` or reclaim from it.</p>
        </div>
      </div>

      <p
        v-if="error"
        class="error"
      >
        {{ error }}
      </p>

      <div class="fields">
        <label class="field">
          <span class="label">Standard</span>
          <select v-model="standard">
            <option value="cryptopunks">CryptoPunks</option>
            <option
              v-if="renderV1"
              value="cryptopunks-v1"
            >
              V1
            </option>
          </select>
        </label>
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
      </div>

      <div class="actions">
        <Button
          class="primary icon-button"
          :disabled="!canMove || pending"
          @click="actDeposit"
        >
          <Icon name="lucide:archive" />
          <span>Deposit</span>
        </Button>
        <Button
          class="icon-button"
          :disabled="!canMove || pending"
          @click="actReclaim"
        >
          <Icon name="lucide:undo-2" />
          <span>Reclaim</span>
        </Button>
      </div>

      <EvmTransactionFlowDialog
        ref="dialogRef"
        :request="transactionRequest"
        :text="transactionText"
        skip-confirmation
      />
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import type { TransactionFlowText } from '@1001-digital/components.evm'
import type {
  ContractWritePlan,
  PunkStandardRef,
} from '@networked-art/punks-sdk'
import type { Address, Hash } from 'viem'

const props = defineProps<{ account: Address }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const renderV1 = useV1Rendering()

const standard = ref<'cryptopunks' | 'cryptopunks-v1'>('cryptopunks')
const punkIdInput = ref('')
const pending = ref(false)
const error = ref<string | null>(null)

watch(renderV1, (enabled) => {
  if (!enabled && standard.value === 'cryptopunks-v1') {
    standard.value = 'cryptopunks'
  }
})

const parsedPunkId = computed(() => {
  const id = Number(punkIdInput.value.trim())
  return Number.isInteger(id) && id >= 0 && id <= 9999 ? id : null
})

const canMove = computed(
  () =>
    parsedPunkId.value !== null &&
    (renderV1.value || standard.value !== 'cryptopunks-v1'),
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

function actDeposit() {
  const punkId = parsedPunkId.value
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
  const punkId = parsedPunkId.value
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

.hint {
  margin: 0;
  margin-top: var(--size-1);
  font-size: var(--font-sm);
}

.fields {
  display: grid;
  grid-template-columns: minmax(120px, 0.8fr) minmax(0, 1fr);
  gap: var(--size-2);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
}

.field input,
.field select {
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

.error {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--accent);
}

@media (max-width: 520px) {
  .fields {
    grid-template-columns: 1fr;
  }
}
</style>
