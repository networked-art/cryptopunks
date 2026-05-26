<template>
  <ClientOnly>
    <section class="create-form">
      <h2 class="block-title eyebrow">Create lot</h2>

      <label
        v-if="renderV1"
        class="field standard-field"
      >
        <span class="label">Standard</span>
        <select v-model="standard">
          <option value="cryptopunks">CryptoPunks</option>
          <option value="cryptopunks-v1">V1</option>
        </select>
      </label>

      <div class="punks">
        <span class="label">
          Punks
          <span class="muted">({{ selectedItems.length }} / {{ MAX_LOT_ITEMS }})</span>
        </span>

        <div class="picker-row">
          <div
            v-for="item in selectedItems"
            :key="`${item.standard}-${item.punkId}`"
            class="picked"
          >
            <PunkThumb
              :punk-id="item.punkId"
              :standard="item.standard"
              :size="56"
              :link="false"
            />
            <button
              type="button"
              class="remove"
              :title="`Remove Punk #${item.punkId}`"
              :aria-label="`Remove Punk #${item.punkId}`"
              @click="removePunk(item.punkId)"
            >
              <Icon name="lucide:x" />
            </button>
            <span class="picked-meta muted">{{ custodyShort(item.custody) }}</span>
          </div>

          <Button
            v-if="selectedItems.length < MAX_LOT_ITEMS"
            class="add-tile icon-button"
            :disabled="!address || inventoryLoading"
            @click="pickerOpen = true"
          >
            <Icon name="lucide:plus" />
            <span>{{ selectedItems.length === 0 ? 'Select Punks' : 'Add Punk' }}</span>
          </Button>
        </div>

        <p class="hint muted">{{ pickerHint }}</p>
      </div>

      <div class="form-grid">
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
        <label
          v-if="showAdvanced"
          class="field"
        >
          <span class="label">Initial buyer</span>
          <EvmAddressInput
            v-model="onlySellTo"
            placeholder="0x... or name.eth"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
      </div>

      <button
        type="button"
        class="advanced-toggle unstyled muted"
        :aria-expanded="showAdvanced"
        @click="showAdvanced = !showAdvanced"
      >
        <Icon :name="showAdvanced ? 'lucide:chevron-down' : 'lucide:chevron-right'" />
        <span>Private lot offer</span>
      </button>

      <p
        v-if="custodySummary"
        class="form-note muted"
      >
        {{ custodySummary }}
      </p>

      <p
        v-if="errorMessage"
        class="error"
      >
        {{ errorMessage }}
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

      <DialogPunkPicker
        v-model:open="pickerOpen"
        :ids="pickerIds"
        multi
        :max="MAX_LOT_ITEMS"
        :initial="selectedPunkIds"
        title="Add Punks to lot"
        :lead="pickerLead"
        confirm-label="Use selection"
        empty-message="No eligible CryptoPunks in your wallet, vault, or stash."
        @confirm="onPickerConfirm"
      />

      <EvmTransactionFlowDialog
        ref="transactionDialogRef"
        :request="transactionRequest"
        :text="transactionText"
        :auto-close-success="false"
        skip-confirmation
        @complete="onSingleTxComplete"
      >
        <template #actions="{ step, cancel }">
          <template v-if="step === 'complete'">
            <Button
              class="secondary"
              @click="onClickNewLot(cancel)"
            >
              New lot
            </Button>
            <Button
              class="primary"
              :disabled="lastLotId === null"
              @click="onClickViewLot(cancel)"
            >
              View Lot
            </Button>
          </template>
        </template>
      </EvmTransactionFlowDialog>

      <EvmMultiTransactionFlowDialog
        ref="multiDialogRef"
        :title="multiDialogTitle"
        :steps="flowSteps"
        :text="multiDialogText"
        :auto-close-success="false"
        skip-confirmation
        @complete="onMultiTxComplete"
        @error="onFlowError"
      >
        <template #actions="{ step, cancel }">
          <template v-if="step === 'complete'">
            <Button
              class="secondary"
              @click="onClickNewLot(cancel)"
            >
              New lot
            </Button>
            <Button
              class="primary"
              :disabled="lastLotId === null"
              @click="onClickViewLot(cancel)"
            >
              View Lot
            </Button>
          </template>
        </template>
      </EvmMultiTransactionFlowDialog>
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import {
  punksAuctionAbi,
  type ContractWritePlan,
} from '@networked-art/punks-sdk'
import { useConfig, useConnection } from '@wagmi/vue'
import { decodeEventLog, isAddress, parseEther, type TransactionReceipt } from 'viem'
import type { PunkInventoryCustody } from '~/composables/useAccountPunkInventory'
import { resolveAddressInput } from '~/utils/addressInput'
import {
  MAX_LOT_ITEMS,
  TokenStandard,
  ZERO_ADDRESS,
  equalLotWeights,
} from '~/utils/auction'

type StandardDraft = 'cryptopunks' | 'cryptopunks-v1'

const { sdk } = usePunksSdk()
const config = useConfig()
const { address } = useConnection()
const renderV1 = useV1Rendering()
const inventory = useAccountPunkInventory(() => address.value)
const custodyPlan = usePunkCustodyPlan()

const standard = ref<StandardDraft>('cryptopunks')
const selectedPunkIds = ref<number[]>([])
const pickerOpen = ref(false)
const reserveEth = ref('')
const onlySellTo = ref('')
const showAdvanced = ref(false)
const buildError = ref<string | null>(null)
const lastLotId = ref<bigint | null>(null)

const tokenStandard = computed(() =>
  standard.value === 'cryptopunks-v1'
    ? TokenStandard.CryptoPunksV1
    : TokenStandard.CryptoPunks,
)

const inventoryLoading = computed(() => inventory.loading.value)

const eligibleItems = computed(() =>
  inventory.items.value.filter(
    (item) =>
      item.standard === tokenStandard.value && item.custody !== 'unsupported',
  ),
)

const pickerIds = computed(() => eligibleItems.value.map((item) => item.punkId))

const selectedItems = computed(() =>
  selectedPunkIds.value
    .map((id) =>
      eligibleItems.value.find((item) => item.punkId === id) ?? null,
    )
    .filter((item): item is NonNullable<typeof item> => !!item),
)

const reserveWei = computed(() => parsePositiveEth(reserveEth.value))
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
  onComplete: () => {
    selectedPunkIds.value = []
    reserveEth.value = ''
    onlySellTo.value = ''
    void inventory.refresh()
  },
})

const router = useRouter()

function onSingleTxComplete(receipt: TransactionReceipt) {
  captureLotIdFromReceipt(receipt)
  onTransactionComplete(receipt)
}

function onMultiTxComplete(receipts: TransactionReceipt[]) {
  const last = receipts.at(-1)
  if (last) captureLotIdFromReceipt(last)
  onMultiTransactionComplete(receipts)
}

function captureLotIdFromReceipt(receipt: TransactionReceipt) {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: punksAuctionAbi,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName === 'LotCreated') {
        lastLotId.value = (decoded.args as { lotId: bigint }).lotId
        return
      }
    } catch {
      // log isn't from the auction contract — skip
    }
  }
}

function onClickNewLot(cancel: () => void) {
  lastLotId.value = null
  cancel()
}

function onClickViewLot(cancel: () => void) {
  const id = lastLotId.value
  if (id === null) return
  cancel()
  void router.push(`/lots/${id}`)
}

const canCreate = computed(
  () =>
    selectedItems.value.length > 0 &&
    selectedItems.value.length <= MAX_LOT_ITEMS &&
    !!reserveWei.value &&
    buyerInputSubmittable.value &&
    !pending.value &&
    (renderV1.value || standard.value !== 'cryptopunks-v1'),
)

const errorMessage = computed(() => buildError.value ?? txError.value)

const pickerHint = computed(() => {
  if (!address.value) return 'Connect a wallet to pick Punks.'
  if (inventoryLoading.value) return 'Loading your Punks…'
  if (pickerIds.value.length === 0) {
    return 'No eligible CryptoPunks in your wallet, vault, or stash.'
  }
  if (selectedItems.value.length === 0) {
    return `Pick up to ${MAX_LOT_ITEMS} Punks for the lot.`
  }
  if (selectedItems.value.length >= MAX_LOT_ITEMS) {
    return `Lot is full (${MAX_LOT_ITEMS} Punks).`
  }
  return `Add another Punk — up to ${MAX_LOT_ITEMS} per lot.`
})

const pickerLead = computed(
  () =>
    `Pick the CryptoPunks for this lot. Anything outside the auction vault will be moved in before the lot is created. Up to ${MAX_LOT_ITEMS} per lot.`,
)

const custodySummary = computed(() => {
  const needsMove = selectedItems.value.filter(
    (item) => item.custody !== 'vault',
  ).length
  if (needsMove === 0) return null
  const noun = needsMove === 1 ? 'Punk' : 'Punks'
  const vaultPart = inventory.vaultDeployed.value
    ? 'your auction vault'
    : 'a freshly deployed auction vault'
  return `${needsMove} ${noun} will be moved into ${vaultPart} before the lot is created.`
})

// Clear selections that leave the eligible set (custody changed, standard
// switched, account changed). Mirrors VaultMovement's behavior so the picked
// preview doesn't get stuck on a stale id.
watch(eligibleItems, (items) => {
  if (!selectedPunkIds.value.length) return
  const eligibleIds = new Set(items.map((item) => item.punkId))
  selectedPunkIds.value = selectedPunkIds.value.filter((id) =>
    eligibleIds.has(id),
  )
})

watch(renderV1, (enabled) => {
  if (!enabled && standard.value === 'cryptopunks-v1') {
    standard.value = 'cryptopunks'
  }
})

watch(standard, () => {
  selectedPunkIds.value = []
})

// Reset the hidden field on collapse so a stale buyer can't silently apply.
watch(showAdvanced, (open) => {
  if (!open) onlySellTo.value = ''
})

function onPickerConfirm(ids: number[]) {
  selectedPunkIds.value = ids.slice(0, MAX_LOT_ITEMS)
}

function removePunk(punkId: number) {
  selectedPunkIds.value = selectedPunkIds.value.filter((id) => id !== punkId)
}

function custodyShort(custody: PunkInventoryCustody): string {
  switch (custody) {
    case 'vault':
      return 'Vaulted'
    case 'wallet':
      return 'In wallet'
    case 'stash':
      return 'In stash'
    case 'wrapped-wallet':
      return 'Wrapped'
    case 'wrapped-stash':
      return 'Wrapped · stash'
    default:
      return ''
  }
}

async function actCreate() {
  buildError.value = null
  const owner = address.value
  const reserve = reserveWei.value
  const items = selectedItems.value
  if (!owner || !reserve || !buyerInputSubmittable.value || items.length === 0)
    return

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
    const lotItems = custodyPlan.lotItemsFor(
      items.map((item, index) => ({
        standard: item.standard,
        punkId: item.punkId,
        weightBps: weights[index] ?? 0,
      })),
    )
    const lotPlan = sdk.value.auctions.prepareCreateLot({
      items: lotItems,
      reserveWei: reserve,
      onlySellTo: onlyBuyer,
    })
    plans = [...custodyPlans, lotPlan]
  } catch (e) {
    buildError.value = (e as Error).message
    return
  }

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

.standard-field {
  max-width: 200px;
}

.punks {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.punks > .label {
  display: inline-flex;
  align-items: baseline;
  gap: var(--size-1);
}

.punks .muted {
  font-size: var(--font-xs);
}

.picker-row {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: var(--size-2);
}

.picked {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--size-1);
  padding: var(--size-1);
  border: var(--border);
  background: var(--bg);
}

.picked :deep(.punk-thumb) {
  border-radius: 0;
}

.picked-meta {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-md);
}

.remove {
  position: absolute;
  top: -8px;
  right: -8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 18px;
  block-size: 18px;
  padding: 0;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.remove:hover,
.remove:focus-visible {
  background: var(--accent);
  color: var(--bg);
  outline: none;
}

.add-tile {
  align-self: stretch;
  min-width: 90px;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
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

.field :deep(.evm-address-input) {
  min-width: 0;
}

.field :deep(.evm-address-input > small) {
  font-size: 10px;
  overflow-wrap: anywhere;
  word-break: break-all;
}

.form-note {
  margin: 0;
  font-size: var(--font-sm);
}

.advanced-toggle {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
  padding: 0;
  font-size: var(--font-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-md);
  cursor: pointer;
}

.advanced-toggle:hover,
.advanced-toggle:focus-visible {
  color: var(--text);
  outline: none;
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

.hint {
  margin: 0;
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
