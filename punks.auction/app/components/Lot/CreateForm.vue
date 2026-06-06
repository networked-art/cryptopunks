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
          <span class="muted"
            >({{ effectiveItems.length }} / {{ MAX_LOT_ITEMS }})</span
          >
        </span>

        <div class="picker-row">
          <template
            v-for="tile in formTiles"
            :key="`${tile.kind}-${tile.item.standard}-${tile.item.punkId}`"
          >
            <div
              v-if="tile.kind === 'primary'"
              class="picked"
            >
              <PunkThumb
                :punk-id="tile.item.punkId"
                :standard="tile.item.standard"
                :size="80"
                :link="false"
              />
              <button
                type="button"
                class="remove unstyled"
                :title="`Remove Punk #${tile.item.punkId}`"
                :aria-label="`Remove Punk #${tile.item.punkId}`"
                @click="removePunk(tile.item.punkId)"
              >
                <Icon name="lucide:x" />
              </button>
              <span class="picked-meta muted">{{
                custodyShort(tile.item.custody)
              }}</span>
              <FormCheckbox
                v-if="tile.pairable"
                class="pair-toggle"
                :class="{ disabled: !tile.paired && atItemLimit }"
                :model-value="tile.paired"
                :disabled="!tile.paired && atItemLimit"
                @update:model-value="togglePair(tile.item.punkId)"
              >
                + V1
              </FormCheckbox>
            </div>

            <div
              v-else
              class="picked paired-v1"
            >
              <PunkThumb
                :punk-id="tile.item.punkId"
                :standard="tile.item.standard"
                :background="lotItemBackground(tile.item.standard)"
                :size="80"
                :link="false"
              />
              <button
                type="button"
                class="remove unstyled"
                :title="`Remove V1 Punk #${tile.item.punkId}`"
                :aria-label="`Remove V1 Punk #${tile.item.punkId}`"
                @click="togglePair(tile.primaryId)"
              >
                <Icon name="lucide:x" />
              </button>
              <span class="picked-meta muted"
                >V1<br />{{ custodyShort(tile.item.custody) }}</span
              >
            </div>
          </template>

          <Button
            v-if="selectedItems.length < v2Budget"
            class="add-tile icon-button"
            :disabled="!address || inventoryLoading"
            @click="pickerOpen = true"
          >
            <Icon name="lucide:plus" />
            <span>{{
              selectedItems.length === 0 ? 'Select Punks' : 'Add Punk'
            }}</span>
          </Button>
        </div>

        <p class="hint muted">{{ pickerHint }}</p>
        <p
          v-if="showPairTip"
          class="hint muted"
        >
          {{ pairTip }}
        </p>
      </div>

      <div class="form-grid">
        <label class="field">
          <span class="label">Reserve ETH</span>
          <EvmEthInput
            v-model="reserveEth"
            v-model:wei="reserveWei"
          />
        </label>
      </div>

      <LotPrivateBuyerField
        v-model="onlySellTo"
        v-model:open="showAdvanced"
      />

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
        :max="v2Budget"
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
import { decodeEventLog, isAddress, type TransactionReceipt } from 'viem'
import type {
  AccountPunkInventoryItem,
  PunkInventoryCustody,
} from '~/composables/useAccountPunkInventory'
import { resolveAddressInput } from '~/utils/addressInput'
import {
  MAX_LOT_ITEMS,
  TokenStandard,
  ZERO_ADDRESS,
  lotItemBackground,
} from '~/utils/auction'

type StandardDraft = 'cryptopunks' | 'cryptopunks-v1'

const { sdk } = usePunksSdk()
const config = useConfig()
const { address } = useConnection()
const renderV1 = useV1Rendering()
// Always pull V1 Punks so we can offer to pair a CryptoPunk with its V1, even
// when the seller hasn't switched on V1 rendering.
const inventory = useAccountPunkInventory(() => address.value, {
  includeV1: true,
})
const custodyPlan = usePunkCustodyPlan()
const { resolveLotWeights } = useLotWeights()
const { lots, refresh: refreshLots } = useLots()

const standard = ref<StandardDraft>('cryptopunks')
const selectedPunkIds = ref<number[]>([])
/// Punk ids whose matching V1 Punk is bundled into the lot. Only meaningful
/// while `standard` is `cryptopunks` (see `pairingEnabled`).
const pairedV1Ids = ref<number[]>([])
const pickerOpen = ref(false)
const reserveEth = ref('')
const reserveWei = ref<bigint | null>(null)
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

const lockedLotKeys = computed(() => {
  const keys = new Set<string>()
  for (const lot of lots.value) {
    for (const item of lot.items) keys.add(`${item.standard}-${item.punkId}`)
  }
  return keys
})

const inventoryForStandard = computed(() =>
  inventory.items.value.filter(
    (item) =>
      item.standard === tokenStandard.value && item.custody !== 'unsupported',
  ),
)

const eligibleItems = computed(() =>
  inventoryForStandard.value.filter(
    (item) => !lockedLotKeys.value.has(`${item.standard}-${item.punkId}`),
  ),
)

const lockedInLotsCount = computed(
  () => inventoryForStandard.value.length - eligibleItems.value.length,
)

const pickerIds = computed(() => eligibleItems.value.map((item) => item.punkId))

const selectedItems = computed(() =>
  selectedPunkIds.value
    .map((id) => eligibleItems.value.find((item) => item.punkId === id) ?? null)
    .filter((item): item is NonNullable<typeof item> => !!item),
)

// ── V1 pairing ──────────────────────────────────────────────────────────────
// When the seller owns the matching V1 Punk for a selected CryptoPunk, they can
// bundle both into the same lot. Pairing is only offered for the canonical
// `cryptopunks` standard (the lot's primary picks); a pure-V1 lot has nothing to
// pair against.

/// Owned V1 Punks that can be bundled into a lot — held in the wallet (native or
/// wrapped on `PunksV1Wrapper`) or already in the Punks Vault. V1 Punks only ever
/// live in the wallet or the vault; they never touch the Stash. Adding one to a
/// lot unwraps it if needed, then deposits the native V1 into the Punks Vault.
/// Already-reserved V1s drop out too.
const eligibleV1ById = computed(() => {
  const map = new Map<number, AccountPunkInventoryItem>()
  for (const item of inventory.items.value) {
    if (item.standard !== TokenStandard.CryptoPunksV1) continue
    if (item.custody === 'unsupported') continue
    if (lockedLotKeys.value.has(`${item.standard}-${item.punkId}`)) continue
    map.set(item.punkId, item)
  }
  return map
})

const pairingEnabled = computed(() => standard.value === 'cryptopunks')

function pairableV1For(punkId: number): AccountPunkInventoryItem | null {
  return pairingEnabled.value
    ? (eligibleV1ById.value.get(punkId) ?? null)
    : null
}

const pairedV1Set = computed(() => new Set(pairedV1Ids.value))

type FormTile =
  | {
      kind: 'primary'
      item: AccountPunkInventoryItem
      pairable: AccountPunkInventoryItem | null
      paired: boolean
    }
  | { kind: 'paired-v1'; item: AccountPunkInventoryItem; primaryId: number }

/// The selected Punks rendered in order, each paired V1 inserted right after the
/// CryptoPunk it accompanies.
const formTiles = computed<FormTile[]>(() => {
  const tiles: FormTile[] = []
  for (const item of selectedItems.value) {
    const pairable = pairableV1For(item.punkId)
    const paired = pairedV1Set.value.has(item.punkId)
    tiles.push({ kind: 'primary', item, pairable, paired })
    if (paired && pairable) {
      tiles.push({ kind: 'paired-v1', item: pairable, primaryId: item.punkId })
    }
  }
  return tiles
})

/// Every Punk that will end up in the lot — selected CryptoPunks plus any paired
/// V1s. This, not `selectedItems`, drives counts, custody planning, and create.
const effectiveItems = computed(() => formTiles.value.map((tile) => tile.item))

/// How many more CryptoPunks can be picked while leaving room for current pairs.
const v2Budget = computed(() => MAX_LOT_ITEMS - pairedV1Ids.value.length)

const atItemLimit = computed(() => effectiveItems.value.length >= MAX_LOT_ITEMS)

const pairableCount = computed(() =>
  selectedItems.value.reduce(
    (count, item) => count + (pairableV1For(item.punkId) ? 1 : 0),
    0,
  ),
)

const showPairTip = computed(
  () => pairingEnabled.value && pairableCount.value > 0,
)

const pairTip = computed(() =>
  pairableCount.value === 1
    ? 'You also own the matching V1 for this Punk — check “+ V1” to add both the CryptoPunk and its V1 to the lot.'
    : 'You also own the matching V1 for some of these Punks — check “+ V1” to add both the CryptoPunk and its V1 to the lot.',
)

function togglePair(punkId: number) {
  if (pairedV1Set.value.has(punkId)) {
    pairedV1Ids.value = pairedV1Ids.value.filter((id) => id !== punkId)
    return
  }
  if (!pairableV1For(punkId) || atItemLimit.value) return
  pairedV1Ids.value = [...pairedV1Ids.value, punkId]
}

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
    pairedV1Ids.value = []
    reserveEth.value = ''
    onlySellTo.value = ''
    void inventory.refresh()
    void refreshLots()
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
    effectiveItems.value.length > 0 &&
    effectiveItems.value.length <= MAX_LOT_ITEMS &&
    !!reserveWei.value &&
    buyerInputSubmittable.value &&
    !pending.value &&
    (renderV1.value || standard.value !== 'cryptopunks-v1'),
)

const errorMessage = computed(() => buildError.value ?? txError.value)

const lockedNote = computed(() => {
  const n = lockedInLotsCount.value
  if (n === 0) return ''
  return ` ${n} ${n === 1 ? 'Punk is' : 'Punks are'} already in an active lot.`
})

const pickerHint = computed(() => {
  if (!address.value) return 'Connect a wallet to pick Punks.'
  if (inventoryLoading.value) return 'Loading your Punks…'
  if (pickerIds.value.length === 0) {
    if (lockedInLotsCount.value > 0) {
      return 'All your eligible Punks are already in active lots.'
    }
    return 'No eligible CryptoPunks in your wallet, vault, or stash.'
  }
  if (effectiveItems.value.length === 0) {
    return `Pick up to ${MAX_LOT_ITEMS} Punks for the lot.${lockedNote.value}`
  }
  if (atItemLimit.value) {
    return `Lot is full (${MAX_LOT_ITEMS} Punks).`
  }
  return `Add another Punk — up to ${MAX_LOT_ITEMS} per lot.${lockedNote.value}`
})

const pickerLead = computed(
  () =>
    `Pick the CryptoPunks for this lot. Anything outside your Punks Vault will be moved in before the lot is created. Up to ${MAX_LOT_ITEMS} per lot.`,
)

const custodySummary = computed(() => {
  const needsMove = effectiveItems.value.filter(
    (item) => item.custody !== 'vault',
  ).length
  if (needsMove === 0) return null
  const noun = needsMove === 1 ? 'Punk' : 'Punks'
  const vaultPart = inventory.vaultDeployed.value
    ? 'your Punks Vault'
    : 'a freshly deployed Punks Vault'
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
  pairedV1Ids.value = []
})

// Drop V1 pairings that no longer hold: the matching CryptoPunk left the
// selection, the V1 became ineligible, or the pair no longer fits MAX_LOT_ITEMS.
watch([selectedPunkIds, eligibleV1ById, standard], () => {
  if (standard.value !== 'cryptopunks') {
    if (pairedV1Ids.value.length) pairedV1Ids.value = []
    return
  }
  const selected = new Set(selectedPunkIds.value)
  const budget = Math.max(0, MAX_LOT_ITEMS - selectedPunkIds.value.length)
  const next = pairedV1Ids.value
    .filter((id) => selected.has(id) && eligibleV1ById.value.has(id))
    .slice(0, budget)
  if (next.length !== pairedV1Ids.value.length) pairedV1Ids.value = next
})

function onPickerConfirm(ids: number[]) {
  selectedPunkIds.value = ids.slice(0, v2Budget.value)
}

function removePunk(punkId: number) {
  selectedPunkIds.value = selectedPunkIds.value.filter((id) => id !== punkId)
  pairedV1Ids.value = pairedV1Ids.value.filter((id) => id !== punkId)
}

function custodyShort(custody: PunkInventoryCustody): string {
  switch (custody) {
    case 'vault':
      return 'Vaulted'
    case 'wallet':
      return 'In wallet'
    case 'stash':
      return 'In Stash'
    case 'wrapped-wallet':
      return 'Wrapped'
    case 'wrapped-stash':
      return 'Wrapped'
    default:
      return ''
  }
}

async function actCreate() {
  buildError.value = null
  const owner = address.value
  const reserve = reserveWei.value
  const items = effectiveItems.value
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
    const weights = await resolveLotWeights(items)
    const lotItems = custodyPlan.lotItemsFor(
      items.map((item, index) => ({
        standard: item.standard,
        punkId: item.punkId,
        weightBps: weights[index]!,
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
  padding: 3px;
  box-shadow: inset 0 0 0 3px var(--primary);
  background: var(--bg);
  width: calc(5rem + 3px * 2);
}

.picked :deep(.punk-thumb) {
  display: block;
}

.picked-meta {
  font-size: var(--font-xs);
  text-align: center;
  text-wrap: balance;
  text-transform: uppercase;
  overflow: hidden;
  white-space: nowrap;
  padding: var(--size-1);
}

.pair-toggle {
  padding-block-end: var(--size-1);
  font-size: var(--font-xs);
  text-transform: uppercase;
}

.pair-toggle.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.remove {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 18px;
  block-size: 18px;
  padding: 0;
  border: 0;
  outline: none;
  background: var(--primary);
  color: white;
  border-radius: 0;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.remove:hover,
.remove:focus-visible {
  background: var(--accent);
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
  grid-template-columns: minmax(120px, 240px);
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

.form-note {
  margin: 0;
  font-size: var(--font-sm);
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
