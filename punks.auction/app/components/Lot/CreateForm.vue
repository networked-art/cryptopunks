<template>
  <ClientOnly>
    <section class="create-form">
      <h2 class="block-title eyebrow">Create lot</h2>

      <div class="form-grid">
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
          <span class="label">Punk ids</span>
          <input
            v-model="idsText"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <label class="field">
          <span class="label">Reserve ETH</span>
          <input
            v-model="reserveEth"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <label class="field">
          <span class="label">Initial buyer</span>
          <input
            v-model="onlySellTo"
            type="text"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
      </div>

      <p
        v-if="error"
        class="error"
      >
        {{ error }}
      </p>

      <div
        v-if="!address"
        class="connect-row"
      >
        <EvmConnectDialog class-name="primary">Connect</EvmConnectDialog>
        <span class="muted">Connect the seller wallet to create a lot.</span>
      </div>

      <Button
        v-else
        class="primary"
        :disabled="!canCreate"
        @click="actCreate"
      >
        Create lot <EthAmount :wei="reserveWei || 0n" />
      </Button>

      <EvmTransactionFlowDialog
        ref="dialogRef"
        :text="dialogText"
        keep-open
        skip-confirmation
        @complete="onComplete"
      />
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import type {
  ContractWritePlan,
  LotItemInput,
  PunkStandardRef,
} from '@networked-art/punks-sdk'
import { useConnection } from '@wagmi/vue'
import {
  isAddress,
  parseEther,
  type Address,
  type Hash,
  type TransactionReceipt,
} from 'viem'
import { MAX_LOT_ITEMS, ZERO_ADDRESS, equalLotWeights } from '~/utils/auction'

type StandardDraft = 'cryptopunks' | 'cryptopunks-v1'

const emit = defineEmits<{ created: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()
const renderV1 = useV1Rendering()

const standard = ref<StandardDraft>('cryptopunks')
const idsText = ref('')
const reserveEth = ref('')
const onlySellTo = ref('')
const error = ref<string | null>(null)

watch(renderV1, (enabled) => {
  if (!enabled && standard.value === 'cryptopunks-v1') {
    standard.value = 'cryptopunks'
  }
})

const ids = computed(() => parseIds(idsText.value))
const weights = computed(() => equalLotWeights(ids.value.length))
const items = computed<LotItemInput[]>(() =>
  ids.value.map((punkId, index) => ({
    punkId,
    standard: standard.value as PunkStandardRef,
    weightBps: weights.value[index] ?? 0,
  })),
)
const reserveWei = computed(() => parsePositiveEth(reserveEth.value))
const buyer = computed<Address | null>(() => {
  const trimmed = onlySellTo.value.trim()
  if (!trimmed) return ZERO_ADDRESS
  return isAddress(trimmed) ? (trimmed as Address) : null
})
const canCreate = computed(
  () =>
    items.value.length > 0 &&
    items.value.length <= MAX_LOT_ITEMS &&
    !!reserveWei.value &&
    !!buyer.value &&
    (renderV1.value || standard.value !== 'cryptopunks-v1'),
)

type DialogRef = {
  initializeRequest: (request?: () => Promise<Hash>) => void
} | null
const dialogRef = ref<DialogRef>(null)
const dialogText = ref<{
  title?: Record<string, string>
  lead?: Record<string, string>
  action?: Record<string, string>
}>({})

function actCreate() {
  error.value = null
  const reserve = reserveWei.value
  const onlyBuyer = buyer.value
  if (!reserve || !onlyBuyer) return

  let plan: ContractWritePlan
  try {
    plan = sdk.value.auctions.prepareCreateLot({
      items: items.value,
      reserveWei: reserve,
      onlySellTo: onlyBuyer,
    })
  } catch (e) {
    error.value = (e as Error).message
    return
  }

  dialogText.value = {
    title: { confirm: 'Create auction lot', waiting: 'Create auction lot' },
    lead: { confirm: plan.description },
    action: { confirm: 'Create lot' },
  }
  dialogRef.value?.initializeRequest(() => execute(plan))
}

function onComplete(receipt: TransactionReceipt) {
  idsText.value = ''
  reserveEth.value = ''
  onlySellTo.value = ''
  emit('created', receipt.transactionHash as Hash)
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

function parseIds(input: string): number[] {
  return input
    .split(/[,\s]+/)
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id >= 0 && id <= 9999)
}
</script>

<style scoped>
.create-form {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.block-title,
.error {
  margin: 0;
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(120px, 0.8fr) minmax(0, 1.2fr);
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

.connect-row {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
  font-size: var(--font-sm);
}

.error {
  color: var(--accent);
  font-size: var(--font-sm);
}

.create-form :deep(button .eth-amount) {
  margin-left: var(--size-1);
}

.create-form :deep(button .eth-amount .unit) {
  color: inherit;
}

@media (max-width: 760px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
