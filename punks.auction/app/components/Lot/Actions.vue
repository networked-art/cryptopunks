<template>
  <ClientOnly>
    <section class="actions-panel">
      <h2 class="block-title eyebrow">Actions</h2>

      <p
        v-if="preview"
        class="block-note muted"
      >
        Wallet actions appear for live lot records.
      </p>

      <div class="action-block">
        <h3 class="action-title">Manage lot</h3>
        <p class="block-note muted">
          The seller can update the reserve, restrict the initial buyer, or
          cancel the lot.
        </p>

        <template v-if="preview">
          <div class="button-row">
            <Button disabled>Update lot</Button>
            <Button disabled>Cancel lot</Button>
            <Button disabled>Clear stale lot</Button>
          </div>
        </template>

        <div
          v-else-if="!address"
          class="connect-row"
        >
          <EvmConnectDialog class-name="primary">Connect</EvmConnectDialog>
          <span class="muted">Connect a wallet to manage this lot.</span>
        </div>

        <template v-else>
          <div class="manage-fields">
            <label class="amount-field">
              <span class="label">Reserve ETH</span>
              <input
                v-model="reserveEth"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                spellcheck="false"
              />
            </label>
            <label class="amount-field">
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
            v-if="!isSeller"
            class="block-note muted"
          >
            Only the seller can update or cancel this lot.
          </p>

          <div class="button-row">
            <Button
              :disabled="!canManage || !parsedReserveWei || !parsedOnlySellTo"
              @click="actUpdateLot"
            >
              Update lot
            </Button>
            <Button
              :disabled="!canManage"
              @click="actCancelLot"
            >
              Cancel lot
            </Button>
            <Button @click="actClearStaleLot">Clear stale lot</Button>
          </div>
        </template>
      </div>

      <div
        class="action-divider"
        aria-hidden="true"
      />

      <div class="action-block">
        <h3 class="action-title">Open as auction</h3>
        <p class="block-note muted">
          Start a 24-hour auction with an opening bid of
          <EthAmount :wei="lot.reserveWei" />.
        </p>

        <p
          v-if="!preview && isPrivateLot && !canOpen"
          class="warn"
        >
          This lot is reserved for
          <NuxtLink :to="`/profile/${lot.onlySellTo}`">
            <Account :address="lot.onlySellTo" />
          </NuxtLink>
          .
        </p>
        <p
          v-else-if="!preview && !v1ActionsAllowed"
          class="hint muted"
        >
          Enable V1 rendering in settings to use V1 lots.
        </p>

        <Button
          v-if="preview"
          class="primary"
          disabled
        >
          Open auction <EthAmount :wei="lot.reserveWei" />
        </Button>

        <div
          v-else-if="!address"
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

      <div
        class="action-divider"
        aria-hidden="true"
      />

      <div class="action-block">
        <h3 class="action-title">Accept an offer</h3>
        <p class="block-note muted">
          Pick a matching standing offer to settle instantly or seed an auction.
        </p>

        <p
          v-if="!matchingOffers.length"
          class="block-note muted"
        >
          No active offers match this lot.
        </p>

        <ul
          v-else
          class="offer-list"
        >
          <li
            v-for="offer in matchingOffers"
            :key="String(offer.id)"
            class="offer-action"
          >
            <div class="offer-head">
              <NuxtLink
                class="offer-link"
                :to="`/purchase-offers/${offer.id}`"
              >
                Offer #{{ offer.id }}
              </NuxtLink>
              <EthAmount :wei="offer.amountWei" />
            </div>

            <p
              v-if="!instantEligible"
              class="hint muted"
            >
              This lot is too large for instant settlement; start an auction
              from the offer instead.
            </p>
            <p
              v-else-if="!v1ActionsAllowed"
              class="hint muted"
            >
              Enable V1 rendering in settings to use V1 lots.
            </p>
            <p
              v-else-if="!isSeller"
              class="hint muted"
            >
              Only the seller can instantly accept; any connected wallet can
              start the auction.
            </p>

            <template v-if="preview">
              <div class="button-row">
                <Button disabled>
                  Accept instantly <EthAmount :wei="offer.amountWei" />
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
                :disabled="!isSeller || !instantEligible || !v1ActionsAllowed"
                @click="actAcceptOffer(offer)"
              >
                Accept instantly <EthAmount :wei="offer.amountWei" />
              </Button>
              <Button
                :disabled="!v1ActionsAllowed"
                @click="actStartAuctionFromOffer(offer)"
              >
                Start auction
              </Button>
            </div>
          </li>
        </ul>
      </div>

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
import { useConnection } from '@wagmi/vue'
import {
  formatEther,
  isAddress,
  parseEther,
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

const props = withDefaults(
  defineProps<{
    lot: LotRecord
    matchingOffers?: OfferRecord[]
    preview?: boolean
  }>(),
  {
    matchingOffers: () => [],
    preview: false,
  },
)
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()
const renderV1 = useV1Rendering()

const reserveEth = ref('')
const onlySellTo = ref('')

watch(
  () => props.lot,
  (lot) => {
    reserveEth.value = formatEther(lot.reserveWei)
    onlySellTo.value = sameAddress(lot.onlySellTo, ZERO_ADDRESS)
      ? ''
      : lot.onlySellTo
  },
  { immediate: true },
)

const isPrivateLot = computed(
  () => !sameAddress(props.lot.onlySellTo, ZERO_ADDRESS),
)
const isSeller = computed(() => sameAddress(address.value, props.lot.seller))
const canManage = computed(() => !!address.value && isSeller.value)
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
const parsedReserveWei = computed(() => parsePositiveEth(reserveEth.value))
const parsedOnlySellTo = computed<Address | null>(() => {
  const trimmed = onlySellTo.value.trim()
  if (!trimmed) return ZERO_ADDRESS
  return isAddress(trimmed) ? (trimmed as Address) : null
})

type DialogRef = {
  initializeRequest: (request?: () => Promise<Hash>) => void
} | null
const dialogRef = ref<DialogRef>(null)
const dialogText = ref<{
  title?: Record<string, string>
  lead?: Record<string, string>
  action?: Record<string, string>
}>({})

function actUpdateLot() {
  const reserveWei = parsedReserveWei.value
  const buyer = parsedOnlySellTo.value
  if (!canManage.value || !reserveWei || !buyer) return
  runPlan(
    sdk.value.auctions.prepareUpdateLot({
      lotId: props.lot.id,
      reserveWei,
      onlySellTo: buyer,
    }),
    `Update lot #${props.lot.id}`,
    `Set this lot reserve to ${reserveEth.value.trim()} ETH.`,
    'Update',
  )
}

function actCancelLot() {
  if (!canManage.value) return
  runPlan(
    sdk.value.auctions.prepareCancelLot(props.lot.id),
    `Cancel lot #${props.lot.id}`,
    'Cancel this lot and release its Punk reservations.',
    'Cancel',
  )
}

function actClearStaleLot() {
  runPlan(
    sdk.value.auctions.prepareClearStaleLot(props.lot.id),
    `Clear stale lot #${props.lot.id}`,
    'Remove this lot if vault approval or custody is no longer valid.',
    'Clear stale lot',
  )
}

function actOpenAuction() {
  if (!canOpen.value) return
  runPlan(
    sdk.value.auctions.prepareOpenAuction({
      lotId: props.lot.id,
      reserveWei: props.lot.reserveWei,
      bidWei: props.lot.reserveWei,
    }),
    `Open lot #${props.lot.id}`,
    `Open this lot as a 24-hour auction with an opening bid of ${formatEther(props.lot.reserveWei)} ETH.`,
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
    `Settle lot #${props.lot.id} instantly at ${formatEther(offer.amountWei)} ETH.`,
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
    `Open lot #${props.lot.id} as a 24-hour auction with this offer as the opening bid.`,
    'Start auction',
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

.manage-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
  gap: var(--size-2);
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

.offer-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  margin: 0;
  padding: 0;
}

.offer-action {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  padding: var(--size-2);
  border: var(--border);
  background: var(--bg);
}

.offer-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--size-2);
  flex-wrap: wrap;
  font-size: var(--font-sm);
}

.offer-link {
  border: 0;
  font-weight: var(--font-weight-bold);
}

.actions-panel :deep(button .eth-amount) {
  margin-left: var(--size-1);
}

.actions-panel :deep(button .eth-amount .unit) {
  color: inherit;
}

@media (max-width: 540px) {
  .manage-fields {
    grid-template-columns: 1fr;
  }
}
</style>
