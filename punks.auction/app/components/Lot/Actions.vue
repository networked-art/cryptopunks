<template>
  <ClientOnly>
    <section class="actions-stack">
      <div class="action-block">
        <p class="block-note muted">
          Start a 24-hour auction with an opening bid of
          <EthAmount :wei="lot.reserveWei" />.
        </p>

        <p
          v-if="isPrivateLot && !canOpen"
          class="warn"
        >
          This lot is reserved for
          <NuxtLink :to="`/profile/${lot.onlySellTo}`">
            <Account :address="lot.onlySellTo" />
          </NuxtLink>
          .
        </p>
        <p
          v-else-if="!v1ActionsAllowed"
          class="hint muted"
        >
          Enable V1 rendering in settings to use V1 lots.
        </p>

        <div
          v-if="!address"
          class="connect-row"
        >
          <EvmConnectDialog class-name="primary">Connect</EvmConnectDialog>
          <span class="muted">Connect a wallet to open the auction.</span>
        </div>

        <Button
          v-else
          class="primary"
          :disabled="!canOpen"
          @click="actOpenAuction"
        >
          Open auction <EthAmount :wei="lot.reserveWei" />
        </Button>
      </div>

      <template v-if="matchingOffers.length">
        <div class="action-block">
          <p class="block-note muted">
            Pick a matching standing offer to settle instantly or seed an
            auction.
          </p>

          <p
            v-if="!instantEligible"
            class="hint muted"
          >
            This lot is too large for instant settlement; start an auction from
            the offer instead.
          </p>
          <p
            v-else-if="!v1ActionsAllowed"
            class="hint muted"
          >
            Enable V1 rendering in settings to use V1 lots.
          </p>

          <div
            v-if="!address"
            class="connect-row"
          >
            <EvmConnectDialog class-name="primary">Connect</EvmConnectDialog>
            <span class="muted">Connect a wallet to use the offer.</span>
          </div>

          <ul class="offer-list">
            <li
              v-for="(offer, index) in matchingOffers"
              :key="String(offer.id)"
              class="offer-item"
            >
              <OfferRow :offer="offer" />

              <div
                v-if="address"
                class="offer-actions"
              >
                <Button
                  :class="['small', { primary: index === 0 }]"
                  :disabled="!v1ActionsAllowed"
                  @click="actStartAuctionFromOffer(offer)"
                >
                  Start auction
                </Button>
                <Button
                  v-if="isSeller"
                  class="small"
                  :disabled="!instantEligible || !v1ActionsAllowed"
                  @click="actAcceptOffer(offer)"
                >
                  Accept <EthAmount :wei="offer.amountWei" />
                </Button>
              </div>
            </li>
          </ul>
        </div>
      </template>

      <template v-if="isSeller">
        <div class="action-block">
          <p class="block-note muted">
            Update the reserve, restrict the initial buyer, or cancel the lot.
          </p>

          <div class="button-row">
            <Button @click="openUpdateDialog">Update Lot</Button>
            <Button @click="openCancelDialog">Cancel Lot</Button>
          </div>
        </div>
      </template>

      <Dialog
        v-model:open="updateDialogOpen"
        title="Update Lot"
        class="lot-action-dialog"
        compat
        @closed="updateError = null"
      >
        <p class="block-note muted">
          Change the reserve or set an optional initial buyer for this lot.
        </p>

        <p
          v-if="updateError"
          class="error"
        >
          {{ updateError }}
        </p>

        <div class="manage-fields">
          <label class="amount-field">
            <span class="label">Reserve ETH</span>
            <EvmEthInput
              v-model="reserveEth"
              v-model:wei="parsedReserveWei"
            />
          </label>
        </div>

        <LotPrivateBuyerField
          v-model="onlySellTo"
          v-model:open="privateBuyerOpen"
        />

        <template #footer>
          <Button
            class="secondary"
            @click="updateDialogOpen = false"
          >
            Cancel
          </Button>
          <Button
            class="primary"
            :disabled="!canUpdateLot"
            @click="actUpdateLot"
          >
            Update Lot
          </Button>
        </template>
      </Dialog>

      <Dialog
        v-model:open="cancelDialogOpen"
        title="Cancel Lot"
        class="lot-action-dialog"
        compat
      >
        <p class="block-note muted">
          Cancel lot #{{ lot.id }} and release its Punk reservations.
        </p>

        <template #footer>
          <Button
            class="secondary"
            @click="cancelDialogOpen = false"
          >
            Keep Lot
          </Button>
          <Button
            class="primary"
            @click="actCancelLot"
          >
            Cancel Lot
          </Button>
        </template>
      </Dialog>

      <EvmTransactionFlowDialog
        ref="dialogRef"
        :text="dialogText"
        keep-open
        @complete="onComplete"
      />
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import { useConfig, useConnection } from '@wagmi/vue'
import {
  formatEther,
  isAddress,
  type Address,
  type Hash,
  type TransactionReceipt,
} from 'viem'
import type { ContractWritePlan } from '@networked-art/punks-sdk'
import {
  MAX_INSTANT_ITEMS,
  ZERO_ADDRESS,
  TokenStandard,
  type LotRecord,
  type OfferRecord,
} from '~/utils/auction'
import { resolveAddressInput } from '~/utils/addressInput'

const props = withDefaults(
  defineProps<{
    lot: LotRecord
    matchingOffers?: OfferRecord[]
  }>(),
  {
    matchingOffers: () => [],
  },
)
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const config = useConfig()
const { address } = useConnection()
const renderV1 = useV1Rendering()

const updateDialogOpen = ref(false)
const cancelDialogOpen = ref(false)
const reserveEth = ref('')
const parsedReserveWei = ref<bigint | null>(null)
const onlySellTo = ref('')
const privateBuyerOpen = ref(false)
const updateError = ref<string | null>(null)

const isPrivateLot = computed(
  () => !sameAddress(props.lot.onlySellTo, ZERO_ADDRESS),
)
const isSeller = computed(() => sameAddress(address.value, props.lot.seller))
const lotUsesV1 = computed(() =>
  props.lot.items.some((item) => item.standard === TokenStandard.CryptoPunksV1),
)
const v1ActionsAllowed = computed(() => renderV1.value || !lotUsesV1.value)
const canOpen = computed(() => {
  if (!address.value) return false
  if (!v1ActionsAllowed.value) return false
  return !isPrivateLot.value || sameAddress(props.lot.onlySellTo, address.value)
})
const instantEligible = computed(
  () => props.lot.items.length <= MAX_INSTANT_ITEMS,
)
const buyerInputSubmittable = computed(() => {
  const trimmed = onlySellTo.value.trim()
  return !trimmed || isAddress(trimmed) || trimmed.includes('.')
})
const canUpdateLot = computed(
  () => !!parsedReserveWei.value && buyerInputSubmittable.value,
)

watch(
  () => props.lot,
  () => seedUpdateForm(),
  { immediate: true },
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

function actOpenAuction() {
  if (!canOpen.value) return
  const reserve = formatEther(props.lot.reserveWei)
  runPlan(
    sdk.value.auctions.prepareOpenAuction({
      lotId: props.lot.id,
      reserveWei: props.lot.reserveWei,
      bidWei: props.lot.reserveWei,
    }),
    `Open lot #${props.lot.id}`,
    `Starts a 24-hour auction and places your own opening bid of ${reserve} ETH (sent with this transaction and refunded if you are outbid). The auction settles to the highest bidder when the timer ends.`,
    'Open auction',
  )
}

function actAcceptOffer(offer: OfferRecord) {
  if (!isSeller.value || !instantEligible.value || !v1ActionsAllowed.value) {
    return
  }
  runPlan(
    sdk.value.offers.prepareAcceptFromLot({
      offerId: offer.id,
      lotId: props.lot.id,
      minAmountWei: props.lot.reserveWei,
    }),
    `Accept offer #${offer.id}`,
    `Settles lot #${props.lot.id} immediately: the Punks in this lot transfer to the offerer and ${formatEther(offer.amountWei)} ETH lands in your account. No auction runs.`,
    'Accept',
  )
}

function actStartAuctionFromOffer(offer: OfferRecord) {
  if (!v1ActionsAllowed.value) return
  runPlan(
    sdk.value.auctions.prepareStartAuctionFromOffer({
      offerId: offer.id,
      lotId: props.lot.id,
      minAmountWei: props.lot.reserveWei,
    }),
    `Start auction from offer #${offer.id}`,
    `Opens lot #${props.lot.id} as a 24-hour auction seeded with this ${formatEther(offer.amountWei)} ETH offer as the opening bid. The offerer is treated as the leading bidder and is refunded if outbid; the auction settles to the highest bidder when the timer ends.`,
    'Start auction',
  )
}

function openUpdateDialog() {
  seedUpdateForm()
  updateError.value = null
  updateDialogOpen.value = true
}

function openCancelDialog() {
  cancelDialogOpen.value = true
}

async function actUpdateLot() {
  const reserveWei = parsedReserveWei.value
  if (!reserveWei || !buyerInputSubmittable.value) return

  let buyer: Address
  try {
    buyer = await resolveOnlySellTo()
  } catch (e) {
    updateError.value = (e as Error).message
    return
  }

  updateDialogOpen.value = false
  const buyerLine =
    buyer === ZERO_ADDRESS
      ? 'Anyone can open the auction.'
      : `Only ${buyer} can open the auction.`
  runPlan(
    sdk.value.auctions.prepareUpdateLot({
      lotId: props.lot.id,
      reserveWei,
      onlySellTo: buyer,
    }),
    `Update Lot #${props.lot.id}`,
    `Sets the reserve to ${reserveEth.value.trim()} ETH. ${buyerLine} The lot's Punk reservations are unchanged.`,
    'Update Lot',
  )
}

function actCancelLot() {
  cancelDialogOpen.value = false
  runPlan(
    sdk.value.auctions.prepareCancelLot(props.lot.id),
    `Cancel Lot #${props.lot.id}`,
    `Withdraws lot #${props.lot.id} and releases its Punks back to your account. This cannot be undone — you would need to create a new lot to relist.`,
    'Cancel Lot',
  )
}

function runPlan(
  plan: ContractWritePlan,
  title: string,
  lead: string,
  action = 'Confirm',
) {
  dialogText.value = {
    title: { confirm: title, waiting: title },
    lead: { confirm: lead },
    action: { confirm: action },
  }
  dialogRef.value?.initializeRequest(() => execute(plan))
}

function onComplete(receipt: TransactionReceipt) {
  emit('changed', receipt.transactionHash as Hash)
}

function seedUpdateForm() {
  reserveEth.value = formatEther(props.lot.reserveWei)
  privateBuyerOpen.value = !sameAddress(props.lot.onlySellTo, ZERO_ADDRESS)
  onlySellTo.value = sameAddress(props.lot.onlySellTo, ZERO_ADDRESS)
    ? ''
    : props.lot.onlySellTo
}

async function resolveOnlySellTo(): Promise<Address> {
  const trimmed = onlySellTo.value.trim()
  if (!trimmed) return ZERO_ADDRESS
  return resolveAddressInput(config, trimmed, {
    invalidMessage: 'Enter a valid initial buyer address or ENS name.',
  })
}

function sameAddress(a?: Address | string | null, b?: Address | string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}
</script>

<style scoped>
.actions-stack {
  display: flex;
  flex-direction: column;
  gap: var(--size-6);
}

.block-note,
.error,
.hint,
.warn {
  margin: 0;
}

.block-note,
.connect-row,
.error,
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

.button-row,
.connect-row {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.warn {
  color: var(--accent-strong);
}

.warn a {
  border: 0;
}

.hint {
  font-size: var(--font-xs);
}

.error {
  color: var(--accent);
}

.manage-fields {
  display: grid;
  grid-template-columns: minmax(0, 240px);
  gap: var(--size-2);
}

.amount-field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.amount-field input {
  width: 100%;
}

.lot-action-dialog :deep(section) {
  gap: var(--size-3);
}

.offer-list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: white;
}

.offer-list > li + li {
  border-top: var(--border);
}

.offer-item {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  padding-right: var(--size-3);
}

.offer-item :deep(.offer-row) {
  flex: 1;
}

.offer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-2);
}

.offer-actions button {
  min-width: 6.4rem;
}

.actions-stack :deep(button .eth-amount) {
  margin-left: var(--size-1);
}

.actions-stack :deep(button .eth-amount .unit) {
  color: inherit;
}

@media (max-width: 540px) {
  .manage-fields {
    grid-template-columns: 1fr;
  }
}
</style>
