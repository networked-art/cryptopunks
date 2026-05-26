<template>
  <ClientOnly>
    <section class="actions-panel">
      <h2 class="block-title eyebrow">Actions</h2>

      <div class="action-block">
        <h3 class="action-title">Open as auction</h3>
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
        <div
          class="action-divider"
          aria-hidden="true"
        />

        <div class="action-block">
          <h3 class="action-title">Accept an offer</h3>
          <p class="block-note muted">
            Pick a matching standing offer to settle instantly or seed an
            auction.
          </p>

          <ul class="offer-list">
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

              <div
                v-if="!address"
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
      </template>

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
  }>(),
  {
    matchingOffers: () => [],
  },
)
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()
const renderV1 = useV1Rendering()

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
</style>
