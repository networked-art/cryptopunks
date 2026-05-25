<template>
  <ClientOnly>
    <section class="place-form">
      <div class="form-head">
        <h2 class="block-title eyebrow">Place offer</h2>
        <Button
          class="small icon-button"
          type="button"
          @click="addSlot"
        >
          <Icon name="lucide:plus" />
          <span>Slot</span>
        </Button>
      </div>

      <label class="field">
        <span class="label">Offer amount</span>
        <input
          v-model="amountEth"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          spellcheck="false"
        />
      </label>

      <ul class="slot-list">
        <li
          v-for="(slot, index) in slots"
          :key="slot.key"
          class="slot-row"
        >
          <label class="field">
            <span class="label">Standard</span>
            <select v-model="slot.standard">
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
            <span class="label">Included ids</span>
            <input
              v-model="slot.includeIds"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <label class="field">
            <span class="label">Excluded ids</span>
            <input
              v-model="slot.excludeIds"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <label class="field">
            <span class="label">Criteria text</span>
            <input
              v-model="slot.queryText"
              type="text"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <Button
            class="small icon-button remove-button"
            type="button"
            :disabled="slots.length === 1"
            :aria-label="`Remove slot ${index + 1}`"
            @click="removeSlot(index)"
          >
            <Icon name="lucide:x" />
          </Button>
        </li>
      </ul>

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
        <span class="muted">Connect a wallet to place an offer.</span>
      </div>

      <Button
        v-else
        class="primary"
        :disabled="!canPlace"
        @click="actPlace"
      >
        Place offer <EthAmount :wei="amountWei || 0n" />
      </Button>

      <EvmTransactionFlowDialog
        ref="dialogRef"
        chain="mainnet"
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
  OfferSlotInput,
  PunkStandardRef,
} from '@networked-art/punks-sdk'
import { useConnection } from '@wagmi/vue'
import { parseEther, type Hash, type TransactionReceipt } from 'viem'

type SlotDraft = {
  key: number
  standard: StandardDraft
  includeIds: string
  queryText: string
  excludeIds: string
}
type StandardDraft = 'cryptopunks' | 'cryptopunks-v1'

const emit = defineEmits<{ placed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()
const renderV1 = useV1Rendering()

const amountEth = ref('')
const error = ref<string | null>(null)
let nextKey = 1
const slots = ref<SlotDraft[]>([createSlot()])

watch(renderV1, (enabled) => {
  if (enabled) return
  for (const slot of slots.value) {
    if (slot.standard === 'cryptopunks-v1') slot.standard = 'cryptopunks'
  }
})

const amountWei = computed(() => parsePositiveEth(amountEth.value))
const parsedSlots = computed<OfferSlotInput[]>(() =>
  slots.value.map((slot) => ({
    standard: slot.standard as PunkStandardRef,
    query: slot.queryText.trim() ? { text: slot.queryText.trim() } : undefined,
    includeIds: parseIds(slot.includeIds),
    excludeIds: parseIds(slot.excludeIds),
  })),
)
const canPlace = computed(
  () =>
    !!amountWei.value &&
    parsedSlots.value.length > 0 &&
    parsedSlots.value.every(
      (slot) =>
        [...(slot.includeIds ?? [])].length > 0 ||
        !!slot.query ||
        [...(slot.excludeIds ?? [])].length > 0,
    ) &&
    (renderV1.value ||
      parsedSlots.value.every((slot) => slot.standard !== 'cryptopunks-v1')),
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

function addSlot() {
  slots.value.push(createSlot())
}

function removeSlot(index: number) {
  if (slots.value.length === 1) return
  slots.value.splice(index, 1)
}

function actPlace() {
  error.value = null
  const wei = amountWei.value
  if (!wei) {
    error.value = 'Enter an offer amount greater than zero.'
    return
  }

  let plan: ContractWritePlan
  try {
    plan = sdk.value.offers.preparePlace({
      amountWei: wei,
      slots: parsedSlots.value,
    })
  } catch (e) {
    error.value = (e as Error).message
    return
  }

  dialogText.value = {
    title: { confirm: 'Place purchase offer', waiting: 'Place purchase offer' },
    lead: { confirm: plan.description },
    action: { confirm: 'Place offer' },
  }
  dialogRef.value?.initializeRequest(() => execute(plan))
}

function onComplete(receipt: TransactionReceipt) {
  amountEth.value = ''
  slots.value = [createSlot()]
  emit('placed', receipt.transactionHash as Hash)
}

function createSlot(): SlotDraft {
  return {
    key: nextKey++,
    standard: 'cryptopunks',
    includeIds: '',
    queryText: '',
    excludeIds: '',
  }
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
.place-form {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.form-head,
.connect-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-3);
  flex-wrap: wrap;
}

.block-title {
  margin: 0;
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

.slot-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  margin: 0;
  padding: 0;
}

.slot-row {
  display: grid;
  grid-template-columns:
    minmax(120px, 0.8fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)
    max-content;
  align-items: end;
  gap: var(--size-2);
  padding: var(--size-2);
  border: var(--border);
  background: var(--bg);
}

.remove-button {
  min-width: var(--size-7);
}

.error {
  margin: 0;
  color: var(--accent);
  font-size: var(--font-sm);
}

.place-form :deep(button .eth-amount) {
  margin-left: var(--size-1);
}

.place-form :deep(button .eth-amount .unit) {
  color: inherit;
}

@media (max-width: 760px) {
  .slot-row {
    grid-template-columns: 1fr;
  }
}
</style>
