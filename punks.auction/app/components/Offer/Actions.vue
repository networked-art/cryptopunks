<template>
  <ClientOnly>
    <section class="actions-panel">
      <h2 class="block-title eyebrow">Actions</h2>

      <p
        v-if="preview"
        class="block-note muted"
      >
        Wallet actions appear for live offer records.
      </p>

      <div class="action-block">
        <h3 class="action-title">Offer management</h3>
        <p class="block-note muted">
          The offerer can adjust the locked ETH amount or cancel the offer.
        </p>

        <template v-if="preview">
          <div class="button-row">
            <Button disabled>Adjust amount</Button>
            <Button disabled>Cancel offer</Button>
          </div>
        </template>

        <div
          v-else-if="!address"
          class="connect-row"
        >
          <EvmConnectDialog class-name="primary">Connect</EvmConnectDialog>
          <span class="muted">Connect the offerer wallet to manage it.</span>
        </div>

        <p
          v-else-if="!isOfferer"
          class="block-note muted"
        >
          Only the offerer can manage this offer.
        </p>

        <template v-else>
          <label class="amount-field">
            <span class="label">Offer amount</span>
            <input
              v-model="amountEth"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <div class="button-row">
            <Button
              :disabled="!parsedAmountWei"
              @click="actAdjustAmount"
            >
              Adjust amount
            </Button>
            <Button @click="actCancel">Cancel offer</Button>
          </div>
        </template>
      </div>

      <div
        class="action-divider"
        aria-hidden="true"
      />

      <div class="action-block">
        <h3 class="action-title">Matching lots</h3>
        <p class="block-note muted">
          Use a compatible stored lot to settle instantly or seed a 24-hour
          auction with this offer.
        </p>

        <p
          v-if="!matchingLots.length"
          class="block-note muted"
        >
          No active lots match this offer.
        </p>

        <ul
          v-else
          class="lot-list"
        >
          <li
            v-for="lot in matchingLots"
            :key="String(lot.id)"
            class="lot-action"
          >
            <div class="lot-head">
              <NuxtLink
                class="lot-link"
                :to="`/lots/${lot.id}`"
              >
                Lot #{{ lot.id }}
              </NuxtLink>
              <span class="muted">
                Reserve <EthAmount :wei="lot.reserveWei" />
              </span>
            </div>

            <p
              v-if="!lotCanUseOffer(lot)"
              class="warn"
            >
              This lot is reserved for another initial buyer.
            </p>
            <p
              v-else-if="!lotV1Allowed(lot)"
              class="hint muted"
            >
              Enable V1 rendering in settings to use V1 lots.
            </p>
            <p
              v-else-if="!isLotSeller(lot)"
              class="hint muted"
            >
              Only the seller can instantly accept; any connected wallet can
              start the auction.
            </p>

            <template v-if="preview">
              <div class="button-row">
                <Button disabled>
                  Accept offer <EthAmount :wei="offer.amountWei" />
                </Button>
                <Button disabled>Start auction</Button>
              </div>
            </template>

            <div
              v-else-if="!address"
              class="connect-row"
            >
              <EvmConnectDialog class-name="primary">Connect</EvmConnectDialog>
              <span class="muted">Connect a wallet to use the offer.</span>
            </div>

            <div
              v-else
              class="button-row"
            >
              <Button
                class="primary"
                :disabled="
                  !isLotSeller(lot) ||
                  !lotCanUseOffer(lot) ||
                  !lotV1Allowed(lot)
                "
                @click="actAcceptFromLot(lot)"
              >
                Accept offer <EthAmount :wei="offer.amountWei" />
              </Button>
              <Button
                :disabled="!lotCanUseOffer(lot) || !lotV1Allowed(lot)"
                @click="actStartAuctionFromOffer(lot)"
              >
                Start auction
              </Button>
            </div>
          </li>
        </ul>
      </div>

      <template v-if="singleSlot">
        <div
          class="action-divider"
          aria-hidden="true"
        />

        <div class="action-block">
          <h3 class="action-title">Listed Punk</h3>
          <p class="block-note muted">
            Accept this single-slot offer against a currently listed matching
            Punk.
          </p>

          <div class="listed-fields">
            <label class="amount-field">
              <span class="label">Punk id</span>
              <input
                v-model="listedPunkId"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                spellcheck="false"
              />
            </label>
            <label class="amount-field">
              <span class="label">Expected listing ETH</span>
              <input
                v-model="expectedListingEth"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                spellcheck="false"
              />
            </label>
          </div>

          <p
            v-if="listedPunkId && !listedPunkMatches"
            class="warn"
          >
            That Punk does not match this offer slot.
          </p>
          <p
            v-else-if="!v1ActionsAllowed"
            class="hint muted"
          >
            Enable V1 rendering in settings to use V1 offers.
          </p>

          <template v-if="preview">
            <Button disabled>
              Accept listed Punk <EthAmount :wei="offer.amountWei" />
            </Button>
          </template>
          <div
            v-else-if="!address"
            class="connect-row"
          >
            <EvmConnectDialog class-name="primary">Connect</EvmConnectDialog>
            <span class="muted">Connect a wallet to accept a listing.</span>
          </div>
          <Button
            v-else
            class="primary"
            :disabled="!canAcceptListed"
            @click="actAcceptListed"
          >
            Accept listed Punk <EthAmount :wei="offer.amountWei" />
          </Button>
        </div>
      </template>

      <div
        class="action-divider"
        aria-hidden="true"
      />

      <div class="action-block">
        <h3 class="action-title">Create matching lot</h3>
        <p class="block-note muted">
          Create a lot from matching vault Punks and immediately use this offer.
        </p>

        <div class="slot-inputs">
          <div
            v-for="(slot, index) in offer.slots"
            :key="index"
            class="slot-input-row"
            :class="{ 'without-weight': !showHammerAllocations }"
          >
            <span class="slot-info">
              <span class="slot-name">{{ slotLabel(slot) }}</span>
              <span class="field-note muted">Slot {{ index + 1 }}</span>
            </span>

            <label
              v-if="fixedSlotPunkId(slot) === null"
              class="amount-field"
            >
              <span class="label">Matching Punk</span>
              <input
                v-model="newLotPunkIds[index]"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                spellcheck="false"
              />
            </label>
            <span v-else />

            <label
              v-if="showHammerAllocations"
              class="amount-field slot-weight-field"
            >
              <span class="label">Hammer %</span>
              <input
                v-model="newLotWeightPercents[index]"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                spellcheck="false"
              />
            </label>
          </div>
        </div>

        <p
          v-if="newLotPunkIds.some(Boolean) && !newLotPunksMatch"
          class="warn"
        >
          One or more Punks do not match their offer slots.
        </p>
        <p
          v-else-if="
            showHammerAllocations &&
            newLotWeightPercents.some(Boolean) &&
            !newLotWeightsValid
          "
          class="warn"
        >
          Hammer allocations must total 100%; currently
          {{ newLotWeightTotalLabel }}%.
        </p>
        <p
          v-else-if="!v1ActionsAllowed"
          class="hint muted"
        >
          Enable V1 rendering in settings to add V1 Punks.
        </p>
        <p
          v-else-if="newLotItems.length > MAX_INSTANT_ITEMS"
          class="hint muted"
        >
          This lot is too large for instant settlement; start an auction from
          the offer instead.
        </p>

        <template v-if="preview">
          <div class="button-row">
            <Button disabled>
              Create and accept <EthAmount :wei="offer.amountWei" />
            </Button>
            <Button disabled>Create and start auction</Button>
          </div>
        </template>

        <div
          v-else-if="!address"
          class="connect-row"
        >
          <EvmConnectDialog class-name="primary">Connect</EvmConnectDialog>
          <span class="muted">Connect the seller wallet to use this path.</span>
        </div>

        <div
          v-else
          class="button-row"
        >
          <Button
            class="primary"
            :disabled="!canCreateLotAndAccept"
            @click="actCreateLotAndAccept"
          >
            Create and accept <EthAmount :wei="offer.amountWei" />
          </Button>
          <Button
            :disabled="!canCreateLotFromOffer"
            @click="actCreateLotAndStartAuction"
          >
            Create and start auction
          </Button>
        </div>
      </div>

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
import {
  ZERO_ADDRESS,
  type ContractWritePlan,
  type LotItemInput,
} from '@networked-art/punks-sdk'
import { useConnection } from '@wagmi/vue'
import {
  formatEther,
  parseEther,
  type Address,
  type Hash,
  type TransactionReceipt,
} from 'viem'
import {
  MAX_INSTANT_ITEMS,
  equalLotWeights,
  filterIsEmpty,
  offerSlotMatchesPunk,
  offerSlotToQuery,
  TokenStandard,
  type LotItem,
  type LotRecord,
  type OfferRecord,
  type OfferSlot,
} from '~/utils/auction'
import { offerSlotTitle } from '~/composables/useOfferSlotDisplay'

const props = withDefaults(
  defineProps<{
    offer: OfferRecord
    matchingLots: LotRecord[]
    preview?: boolean
  }>(),
  {
    preview: false,
  },
)
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()
const offline = usePunksOffline()
const renderV1 = useV1Rendering()

const amountEth = ref('')
const listedPunkId = ref('')
const expectedListingEth = ref('')
const newLotPunkIds = ref<string[]>([])
const newLotWeightPercents = ref<string[]>([])

watch(
  () => props.offer,
  (offer) => {
    amountEth.value = formatEther(offer.amountWei)
    const firstPinned = offer.slots[0]?.includeIds[0]
    listedPunkId.value = firstPinned === undefined ? '' : String(firstPinned)
    expectedListingEth.value = formatEther(offer.amountWei)
    newLotPunkIds.value = offer.slots.map((slot) =>
      slot.includeIds[0] === undefined ? '' : String(slot.includeIds[0]),
    )
    newLotWeightPercents.value = equalLotWeights(offer.slots.length).map(
      formatWeightPercent,
    )
  },
  { immediate: true },
)

const parsedAmountWei = computed(() => parsePositiveEth(amountEth.value))
const expectedListingWei = computed(() =>
  parsePositiveEth(expectedListingEth.value),
)
const listedPunk = computed(() => {
  const id = Number(listedPunkId.value.trim())
  return Number.isInteger(id) && id >= 0 && id <= 9999 ? id : null
})
const singleSlot = computed(() => props.offer.slots.length === 1)
const showHammerAllocations = computed(() => props.offer.slots.length > 1)
const offerUsesV1 = computed(() =>
  props.offer.slots.some(
    (slot) => slot.standard === TokenStandard.CryptoPunksV1,
  ),
)
const v1ActionsAllowed = computed(() => renderV1.value || !offerUsesV1.value)
const listedPunkMatches = computed(() => {
  const slot = props.offer.slots[0]
  const punkId = listedPunk.value
  if (!slot || punkId === null) return false
  try {
    return offline.search(offerSlotToQuery(slot)).includes(punkId)
  } catch {
    return false
  }
})
const canAcceptListed = computed(
  () =>
    !!address.value &&
    singleSlot.value &&
    listedPunk.value !== null &&
    !!expectedListingWei.value &&
    listedPunkMatches.value &&
    v1ActionsAllowed.value,
)
const isOfferer = computed(() =>
  sameAddress(address.value, props.offer.offerer),
)
const newLotWeightBps = computed<(number | null)[]>(() =>
  props.offer.slots.map((_slot, index) =>
    parseWeightPercent(newLotWeightPercents.value[index]),
  ),
)
const newLotWeightTotalBps = computed<number>(() =>
  newLotWeightBps.value.reduce<number>(
    (sum, weight) => sum + (weight ?? 0),
    0,
  ),
)
const newLotWeightsValid = computed(
  () =>
    newLotWeightBps.value.length === props.offer.slots.length &&
    newLotWeightBps.value.every((weight) => weight !== null) &&
    newLotWeightTotalBps.value === 10_000,
)
const newLotWeightTotalLabel = computed(() =>
  formatWeightPercent(newLotWeightTotalBps.value),
)
const newLotItems = computed<LotItem[]>(() => {
  return props.offer.slots
    .map((slot, index) => {
      const punkId = parsePunkId(newLotPunkIds.value[index])
      const weightBps = newLotWeightBps.value[index]
      if (punkId === null || weightBps === null || weightBps === undefined) {
        return null
      }
      return { standard: slot.standard, punkId, weightBps }
    })
    .filter((item): item is LotItem => !!item)
})
const newLotWriteItems = computed<LotItemInput[]>(() =>
  newLotItems.value.map((item) => ({
    punkId: item.punkId,
    standard:
      item.standard === TokenStandard.CryptoPunksV1
        ? 'cryptopunks-v1'
        : 'cryptopunks',
    weightBps: item.weightBps,
  })),
)
const newLotItemsComplete = computed(
  () =>
    props.offer.slots.length > 0 &&
    newLotItems.value.length === props.offer.slots.length,
)
const newLotPunksComplete = computed(
  () =>
    props.offer.slots.length > 0 &&
    props.offer.slots.every(
      (_slot, index) => parsePunkId(newLotPunkIds.value[index]) !== null,
    ),
)
const newLotPunksMatch = computed(() => {
  if (!newLotPunksComplete.value) return false
  return props.offer.slots.every((slot, index) => {
    const punkId = parsePunkId(newLotPunkIds.value[index])
    if (punkId === null) return false
    return slotMatchesItem(slot, {
      standard: slot.standard,
      punkId,
      weightBps: 1,
    })
  })
})
const canCreateLotFromOffer = computed(
  () =>
    !!address.value &&
    newLotItemsComplete.value &&
    newLotPunksMatch.value &&
    newLotWeightsValid.value &&
    v1ActionsAllowed.value,
)
const canCreateLotAndAccept = computed(
  () =>
    canCreateLotFromOffer.value &&
    newLotItems.value.length <= MAX_INSTANT_ITEMS,
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

function isLotSeller(lot: LotRecord) {
  return sameAddress(address.value, lot.seller)
}

function lotCanUseOffer(lot: LotRecord) {
  return (
    sameAddress(lot.onlySellTo, ZERO_ADDRESS) ||
    sameAddress(lot.onlySellTo, props.offer.offerer)
  )
}

function lotV1Allowed(lot: LotRecord) {
  return (
    renderV1.value ||
    !lot.items.some((item) => item.standard === TokenStandard.CryptoPunksV1)
  )
}

function actCancel() {
  runPlan(
    sdk.value.offers.prepareCancel(props.offer.id),
    `Cancel offer #${props.offer.id}`,
    'Cancel this offer and refund the locked ETH to the offerer.',
  )
}

function actAdjustAmount() {
  runRequest(
    adjustAmount,
    `Adjust offer #${props.offer.id}`,
    `Set this offer to ${amountEth.value.trim()} ETH.`,
    'Adjust',
  )
}

function actAcceptFromLot(lot: LotRecord) {
  if (!isLotSeller(lot) || !lotCanUseOffer(lot) || !lotV1Allowed(lot)) return
  runPlan(
    sdk.value.offers.prepareAcceptFromLot({
      offerId: props.offer.id,
      lotId: lot.id,
      minAmountWei: lot.reserveWei,
    }),
    `Accept offer #${props.offer.id}`,
    `Settle lot #${lot.id} instantly at ${formatEther(props.offer.amountWei)} ETH.`,
    'Accept',
  )
}

function actStartAuctionFromOffer(lot: LotRecord) {
  if (!lotCanUseOffer(lot) || !lotV1Allowed(lot)) return
  runPlan(
    sdk.value.auctions.prepareStartAuctionFromOffer({
      offerId: props.offer.id,
      lotId: lot.id,
      minAmountWei: lot.reserveWei,
    }),
    `Start auction from offer #${props.offer.id}`,
    `Open lot #${lot.id} as a 24-hour auction with this offer as the opening bid.`,
    'Start auction',
  )
}

function actAcceptListed() {
  runRequest(
    acceptListed,
    `Accept listed Punk for offer #${props.offer.id}`,
    'Buy the matching listed Punk and deliver it to the offerer.',
    'Accept',
  )
}

function actCreateLotAndAccept() {
  if (!canCreateLotAndAccept.value) return
  runPlan(
    sdk.value.offers.prepareCreateLotAndAccept({
      items: newLotWriteItems.value,
      offerId: props.offer.id,
      minAmountWei: props.offer.amountWei,
    }),
    `Create lot and accept offer #${props.offer.id}`,
    `Create a matching lot and settle it instantly at ${formatEther(props.offer.amountWei)} ETH.`,
    'Create and accept',
  )
}

function actCreateLotAndStartAuction() {
  if (!canCreateLotFromOffer.value) return
  runPlan(
    sdk.value.offers.prepareCreateLotAndStartAuction({
      items: newLotWriteItems.value,
      offerId: props.offer.id,
      minAmountWei: props.offer.amountWei,
    }),
    `Create lot and start auction from offer #${props.offer.id}`,
    'Create a matching lot and start a 24-hour auction with this offer as the opening bid.',
    'Create and start',
  )
}

async function adjustAmount(): Promise<Hash> {
  const newAmountWei = parsedAmountWei.value
  if (!newAmountWei) throw new Error('Enter an offer amount greater than zero.')
  return execute(
    await sdk.value.offers.prepareAdjustAmount({
      offerId: props.offer.id,
      newAmountWei,
    }),
  )
}

async function acceptListed(): Promise<Hash> {
  const punkId = listedPunk.value
  const listingWei = expectedListingWei.value
  if (punkId === null) throw new Error('Enter a valid Punk id.')
  if (!listingWei) throw new Error('Enter the listing price you expect.')
  if (!listedPunkMatches.value) {
    throw new Error('That Punk does not match this offer.')
  }
  return execute(
    sdk.value.offers.prepareAccept({
      offerId: props.offer.id,
      punkId,
      expectedListingWei: listingWei,
    }),
  )
}

function runPlan(
  plan: ContractWritePlan,
  title: string,
  lead: string,
  action = 'Confirm',
) {
  runRequest(() => execute(plan), title, lead, action)
}

function runRequest(
  request: () => Promise<Hash>,
  title: string,
  lead: string,
  action = 'Confirm',
) {
  dialogText.value = {
    title: { confirm: title, waiting: title },
    lead: { confirm: lead },
    action: { confirm: action },
  }
  dialogRef.value?.initializeRequest(request)
}

function onComplete(receipt: TransactionReceipt) {
  emit('changed', receipt.transactionHash as Hash)
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

function parsePunkId(input: unknown): number | null {
  const id = Number(String(input ?? '').trim())
  return Number.isInteger(id) && id >= 0 && id <= 9999 ? id : null
}

function parseWeightPercent(input: unknown): number | null {
  const trimmed = String(input ?? '')
    .trim()
    .replace(/%$/, '')
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null
  const [whole = '0', fractional = ''] = trimmed.split('.')
  const weightBps =
    Number(whole) * 100 + Number(fractional.padEnd(2, '0'))
  return Number.isInteger(weightBps) && weightBps > 0 && weightBps <= 10_000
    ? weightBps
    : null
}

function formatWeightPercent(weightBps: number) {
  const percent = weightBps / 100
  return Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)
}

function fixedSlotPunkId(slot: OfferSlot) {
  if (!filterIsEmpty(slot.criteria) || slot.includeIds.length !== 1) {
    return null
  }
  return slot.includeIds[0] ?? null
}

function slotMatchesItem(slot: OfferSlot, item: LotItem) {
  return offerSlotMatchesPunk(slot, item, (criteriaSlot, punkId) => {
    try {
      return offline.search(offerSlotToQuery(criteriaSlot)).includes(punkId)
    } catch {
      return false
    }
  })
}

function slotLabel(slot: OfferSlot) {
  const fixedPunkId = fixedSlotPunkId(slot)
  if (fixedPunkId !== null) {
    return `Punk #${fixedPunkId}${
      slot.standard === TokenStandard.CryptoPunksV1 ? ' (V1)' : ''
    }`
  }
  return offerSlotTitle(slot, offline)
}

function sameAddress(a?: Address | string | null, b?: Address | string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}
</script>

<style scoped>
.actions-panel {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.block-title,
.block-note,
.hint,
.warn {
  margin: 0;
}

.block-note,
.connect-row,
.hint,
.warn {
  font-size: var(--font-sm);
}

.action-block {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.action-title {
  margin: 0;
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
}

.action-divider {
  height: 1px;
  background: var(--border-color, currentColor);
  opacity: 0.15;
}

.amount-field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.amount-field input {
  width: 100%;
}

.listed-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--size-2);
}

.slot-inputs {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.slot-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.5fr);
  align-items: end;
  gap: var(--size-2);
  padding: var(--size-2);
  border: var(--border);
  background: var(--bg);
}

.slot-input-row.without-weight {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.slot-info {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
}

.slot-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
}

.slot-weight-field input {
  text-align: right;
}

.field-note {
  font-size: var(--font-xs);
}

.button-row,
.connect-row {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.lot-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  margin: 0;
  padding: 0;
}

.lot-action {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  padding: var(--size-2);
  border: var(--border);
  background: var(--bg);
}

.lot-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--size-2);
  flex-wrap: wrap;
  font-size: var(--font-sm);
}

.lot-link {
  border: 0;
  font-weight: var(--font-weight-bold);
}

.warn {
  color: var(--accent-strong);
}

.actions-panel :deep(button .eth-amount) {
  margin-left: var(--size-1);
}

.actions-panel :deep(button .eth-amount .unit) {
  color: inherit;
}

@media (max-width: 540px) {
  .listed-fields,
  .slot-input-row {
    grid-template-columns: 1fr;
  }
}
</style>
