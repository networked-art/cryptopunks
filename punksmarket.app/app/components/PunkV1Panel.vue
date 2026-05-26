<template>
  <div class="v1-panel">
    <div
      v-if="!address"
      class="connect-row"
    >
      <EvmConnectDialog />
      <span class="muted">Connect a wallet to interact with this punk.</span>
    </div>

    <div
      v-if="pending"
      class="muted"
    >
      Reading onchain state…
    </div>

    <template v-else>
      <div class="state-grid">
        <div>
          <div class="label">Owner</div>
          <div
            v-if="owner"
            class="owner-row"
          >
            <NuxtLink :to="`/profile/${owner}`">
              <AccountBadge :address="owner" />
            </NuxtLink>
            <Tag
              v-if="isWrapped"
              small
              title="Wrapped — the V1 contract reports the wrapper as owner; this is the ERC-721 holder."
              >wrapped</Tag
            >
          </div>
          <span
            v-else
            class="muted"
            >—</span
          >
        </div>

        <div>
          <div class="label">Listing</div>
          <div v-if="liveListing">
            <EthAmount :wei="liveListing.priceWei" />
            <div
              v-if="!isDirectedToPunksMarket"
              class="warn"
            >
              Listing not directed to PunksMarket.sol.
            </div>
          </div>
          <span
            v-else
            class="muted"
            >Not for sale</span
          >
        </div>

        <div>
          <div class="label">Top bid</div>
          <div v-if="topBid">
            <EthAmount :wei="topBid.bidWei" />
            <span class="dim"> by </span>
            <NuxtLink :to="`/profile/${topBid.bidder}`">
              <AccountBadge :address="topBid.bidder" />
            </NuxtLink>
          </div>
          <span
            v-else
            class="muted"
            >None</span
          >
        </div>
      </div>

      <Actions
        v-if="address"
        class="left panel-actions"
      >
        <template v-if="isOwner && isWrapped">
          <p class="warn">
            This punk is wrapped — unwrap it to list, transfer, or accept bids
            via the Ç̭̮̾r͚y̜ͥ͌́ͥp̈t̟ͪ͐̚o̘P̸̌̀ụ͖̲̐͡n̬̱̻̗̆̕ͅk̡̯̤̰̭̎ͭs̸̢̼̋͟Market.
          </p>
          <Button
            class="primary"
            @click="actUnwrap"
          >
            Unwrap
          </Button>
        </template>

        <template v-else-if="isOwner">
          <div class="action-group">
            <PunkListForm
              :punk-id="punkId"
              :current-price-wei="liveListing?.priceWei ?? null"
              @listed="onListed"
            />
            <Button
              v-if="liveListing"
              @click="actUnlist"
            >
              Cancel listing
            </Button>
          </div>
          <Button
            v-if="topBid"
            class="primary"
            @click="actAcceptBid"
          >
            Accept Bid · <EthAmount :wei="topBid.bidWei" />
          </Button>
          <PunkTransferForm
            :punk-id="punkId"
            @transferred="onTransferred"
          />
          <Button @click="startWrap"> Wrap </Button>
        </template>

        <template v-else>
          <Button
            v-if="liveListing && canBuy"
            class="primary"
            @click="actBuy"
          >
            Buy · <EthAmount :wei="liveListing.priceWei" />
          </Button>
          <p
            v-if="liveListing && !canBuy"
            class="warn"
          >
            General listings shouldn't be made for safety reasons so in the
            spirit of education you can't process them through PunksMarket.sol.
            <NuxtLink to="/about">Learn more</NuxtLink>.
          </p>

          <Button
            v-if="canSettle"
            class="primary"
            @click="actSettle"
          >
            Settle
            <template v-if="isTopBidder"> · claim punk</template>
            <template v-else-if="topBid!.settlementWei > 0n">
              · earn <EthAmount :wei="topBid!.settlementWei" />
            </template>
          </Button>

          <div class="action-group">
            <PunkBidForm
              :punk-id="punkId"
              :existing-bid="ownActiveBid"
              @placed="onBidPlaced"
            />
            <Button
              v-if="ownActiveBid"
              @click="actWithdrawBid"
            >
              Withdraw bid
            </Button>
          </div>
        </template>

        <Button
          v-if="pendingWithdrawal && pendingWithdrawal > 0n"
          class="primary withdraw"
          @click="actWithdrawProceeds"
        >
          Withdraw <EthAmount :wei="pendingWithdrawal" />
        </Button>
      </Actions>
    </template>

    <EvmTransactionFlowDialog
      ref="dialogRef"
      :text="dialogText"
      keep-open
      skip-confirmation
      @complete="onComplete"
    />
    <EvmMultiTransactionFlowDialog
      ref="wrapDialogRef"
      title="Wrap Punk"
      :steps="wrapFlowSteps"
      :text="wrapDialogText"
      skip-confirmation
      @complete="onWrapComplete"
    />
    <EvmMultiTransactionFlowDialog
      ref="acceptBidDialogRef"
      title="Accept Bid"
      :steps="acceptBidFlowSteps"
      :text="acceptBidDialogText"
      skip-confirmation
      @complete="onAcceptBidComplete"
    />
  </div>
</template>

<script setup lang="ts">
import { type Address, type Hash, type TransactionReceipt } from 'viem'
import type { ContractWritePlan, PlanKind } from '@networked-art/punks-sdk'
import type {
  MultiTransactionFlowStep,
  MultiTransactionFlowText,
} from '~/types/transactionFlow'
import { useConnection } from '@wagmi/vue'
import { PUNKS_MARKET_ADDRESS } from '~/utils/addresses'
import type { CollectionBid } from '~/composables/usePunksMarketBids'

const props = defineProps<{
  punkId: number
  matchingBids: CollectionBid[]
}>()
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()

const {
  owner,
  isWrapped,
  pending: ownerPending,
  refresh: refreshOwner,
} = usePunkOwner(() => props.punkId)
const { markWrapped, markUnwrapped } = useWrappedPunks()
const listing = ref<{
  isForSale: boolean
  seller: Address
  priceWei: bigint
  onlySellTo: Address
} | null>(null)
const pendingWithdrawal = ref<bigint | null>(null)
const otherPending = ref(true)
const pending = computed(() => ownerPending.value || otherPending.value)

const isOwner = computed(
  () =>
    !!address.value &&
    !!owner.value &&
    owner.value.toLowerCase() === address.value.toLowerCase(),
)
const liveListing = computed(() => {
  const live = listing.value
  return live?.isForSale ? live : null
})
const isDirectedToPunksMarket = computed(() => {
  const listing = liveListing.value
  if (!listing) return false
  return (
    listing.onlySellTo?.toLowerCase() === PUNKS_MARKET_ADDRESS.toLowerCase()
  )
})

/// Top of the matching-bids book — the page already queries the indexer
/// `bids/matching/punk/:id` endpoint with `ORDER BY bid_wei DESC`.
const topBid = computed<CollectionBid | null>(
  () => props.matchingBids[0] ?? null,
)
/// User's own highest active matching bid (for Update / Withdraw).
const ownActiveBid = computed<CollectionBid | null>(() => {
  const me = address.value?.toLowerCase()
  if (!me) return null
  return props.matchingBids.find((b) => b.bidder.toLowerCase() === me) ?? null
})
const canSettle = computed(() => {
  const bid = topBid.value
  const listing = liveListing.value
  if (!bid || !listing || !isDirectedToPunksMarket.value) return false
  return bid.bidWei >= listing.priceWei
})
const isTopBidder = computed(
  () =>
    !!address.value &&
    !!topBid.value &&
    topBid.value.bidder.toLowerCase() === address.value.toLowerCase(),
)
const canBuy = computed(() => isDirectedToPunksMarket.value)
const wrapperAddress = computed(() => sdk.value.v1Wrapper.address)
const isListedForWrapping = computed(() => {
  const listing = liveListing.value
  const me = address.value
  if (!listing || !me) return false
  const onlySellTo = listing.onlySellTo.toLowerCase()
  return (
    listing.seller.toLowerCase() === me.toLowerCase() &&
    listing.priceWei === 0n &&
    onlySellTo === wrapperAddress.value.toLowerCase()
  )
})

async function refresh() {
  otherPending.value = true
  try {
    const [l, w] = await Promise.all([
      sdk.value.market.listing(props.punkId).catch(() => null),
      address.value
        ? sdk.value.market.pendingWithdrawal(address.value).catch(() => 0n)
        : Promise.resolve(0n),
    ])
    listing.value = l
      ? {
          isForSale: l.isForSale,
          seller: l.seller,
          priceWei: l.priceWei,
          onlySellTo: l.onlySellTo,
        }
      : null
    pendingWithdrawal.value = w as bigint
  } finally {
    otherPending.value = false
  }
}

watchEffect(refresh)

// ─── Dialog wiring ────────────────────────────────────────────────────────────

type DialogRef = {
  initializeRequest: (request?: () => Promise<Hash>) => void
} | null
type MultiDialogRef = {
  start: () => void
} | null
const dialogRef = ref<DialogRef>(null)
const wrapDialogRef = ref<MultiDialogRef>(null)
const acceptBidDialogRef = ref<MultiDialogRef>(null)
const dialogText = ref<{
  title?: Record<string, string>
  lead?: Record<string, string>
}>({})
const wrapFlowSteps = ref<MultiTransactionFlowStep[]>([])
const acceptBidFlowSteps = ref<MultiTransactionFlowStep[]>([])
const wrapDialogText: MultiTransactionFlowText = {
  title: { complete: 'Wrap complete' },
  lead: { complete: 'Punk is now wrapped.' },
}
const acceptBidDialogText: MultiTransactionFlowText = {
  title: { complete: 'Bid accepted' },
  lead: { complete: 'The bid was settled.' },
}
let singleAction: 'unwrap' | null = null
type AcceptBidSnapshot = {
  bidId: bigint
  bidWei: bigint
  punkId: number
}

// Titles for the single-tx flows this panel triggers. Unknown kinds fall
// through to plan.description so the dialog never renders a blank title.
const SINGLE_PLAN_TITLES: Partial<Record<PlanKind, string>> = {
  'remove-listing': 'Remove Listing',
  'withdraw-canonical-balance': 'Withdraw Balance',
  'buy-punk-v1': 'Buy Punk',
  'cancel-v1-bid': 'Cancel Bid',
  'accept-v1-bid': 'Settle Bid',
  'unwrap-v1': 'Unwrap Punk',
}

function run(plan: ContractWritePlan, action: 'unwrap' | null = null) {
  singleAction = action
  const title = SINGLE_PLAN_TITLES[plan.kind] ?? plan.description
  dialogText.value = {
    title: { confirm: title, requesting: title, waiting: title },
    lead: {
      confirm: plan.description,
      requesting: plan.description,
      waiting: plan.description,
    },
  }
  dialogRef.value?.initializeRequest(() => execute(plan))
}

function onComplete(receipt: TransactionReceipt) {
  if (singleAction === 'unwrap') markUnwrapped([props.punkId])
  singleAction = null
  refresh()
  refreshOwner()
  emit('changed', receipt.transactionHash as Hash)
}

async function startWrap() {
  wrapFlowSteps.value = createWrapSteps()
  await nextTick()
  wrapDialogRef.value?.start()
}

function createWrapSteps(): MultiTransactionFlowStep[] {
  return [
    {
      id: 'list-to-wrapper',
      title: 'Prepare wrapper listing',
      lead: 'This replaces any current V1 listing with a zero-price listing directed only to the V1 wrapper.',
      action: 'Prepare',
      skip: () => isListedForWrapping.value,
      request: () =>
        execute(
          sdk.value.market.prepareList({
            punkId: props.punkId,
            priceWei: 0n,
            onlySellTo: sdk.value.v1Wrapper.address,
          }),
        ),
    },
    {
      id: 'wrap-punk',
      title: `Wrap Punk ${props.punkId}`,
      lead: 'Mint the ERC-721 wrapper token backed one-to-one by this V1 punk.',
      action: 'Wrap',
      request: () => execute(sdk.value.v1Wrapper.prepareWrap(props.punkId)),
    },
  ]
}

function onWrapComplete(receipts: TransactionReceipt[]) {
  markWrapped([props.punkId])
  refresh()
  refreshOwner()
  const receipt = receipts[receipts.length - 1]
  if (receipt) emit('changed', receipt.transactionHash as Hash)
}

async function startAcceptBid() {
  const bid = topBid.value
  if (!bid || !isOwner.value) return

  const snapshot = {
    bidId: bid.id,
    bidWei: bid.bidWei,
    punkId: props.punkId,
  }
  acceptBidFlowSteps.value = createAcceptBidSteps(snapshot)
  await nextTick()
  acceptBidDialogRef.value?.start()
}

function createAcceptBidSteps(
  bid: AcceptBidSnapshot,
): MultiTransactionFlowStep[] {
  return [
    {
      id: `list-for-bid-${bid.punkId}-${bid.bidId.toString()}`,
      title: 'List at bid price',
      lead: 'List this punk to PunksMarket at the bid price.',
      action: 'List',
      skip: () => isListedForBid(bid),
      request: () =>
        execute(
          sdk.value.market.prepareList({
            punkId: bid.punkId,
            priceWei: bid.bidWei,
            onlySellTo: PUNKS_MARKET_ADDRESS,
          }),
        ),
    },
    {
      id: `accept-bid-${bid.punkId}-${bid.bidId.toString()}`,
      title: 'Accept bid',
      lead: 'Settle the bid and send the punk to the bidder.',
      action: 'Accept Bid',
      request: () =>
        execute(
          sdk.value.v1Market.prepareAcceptBid({
            bidId: bid.bidId,
            punkId: bid.punkId,
            expectedListingWei: bid.bidWei,
          }),
        ),
    },
  ]
}

function isListedForBid(bid: AcceptBidSnapshot) {
  const current = liveListing.value
  const currentOwner = owner.value
  if (!current || !currentOwner) return false

  return (
    current.seller.toLowerCase() === currentOwner.toLowerCase() &&
    current.priceWei === bid.bidWei &&
    current.onlySellTo?.toLowerCase() === PUNKS_MARKET_ADDRESS.toLowerCase()
  )
}

function onAcceptBidComplete(receipts: TransactionReceipt[]) {
  refresh()
  refreshOwner()
  const receipt = receipts[receipts.length - 1]
  if (receipt) emit('changed', receipt.transactionHash as Hash)
}

// ─── Action handlers ──────────────────────────────────────────────────────────

function onListed(tx: Hash) {
  refresh()
  refreshOwner()
  emit('changed', tx)
}

function onBidPlaced(tx: Hash) {
  refresh()
  refreshOwner()
  emit('changed', tx)
}

function actUnlist() {
  run(sdk.value.market.prepareUnlist(props.punkId))
}

function actBuy() {
  const listing = liveListing.value
  if (!listing || !canBuy.value) return
  run(
    sdk.value.v1Market.prepareBuyPunk({
      punkId: props.punkId,
      expectedListingWei: listing.priceWei,
      recipient: address.value as Address,
    }),
  )
}

function actWithdrawBid() {
  const existing = ownActiveBid.value
  if (!existing) return
  run(sdk.value.v1Market.prepareCancelBid(existing.id))
}

function actSettle() {
  if (!canSettle.value || !topBid.value || !listing.value) return
  run(
    sdk.value.v1Market.prepareAcceptBid({
      bidId: topBid.value.id,
      punkId: props.punkId,
      expectedListingWei: listing.value.priceWei,
    }),
  )
}

function actAcceptBid() {
  void startAcceptBid()
}

function onTransferred(tx: Hash) {
  refresh()
  refreshOwner()
  emit('changed', tx)
}

function actWithdrawProceeds() {
  run(sdk.value.market.prepareWithdraw())
}

function actUnwrap() {
  run(sdk.value.v1Wrapper.prepareUnwrap(props.punkId), 'unwrap')
}
</script>

<style scoped>
.v1-panel {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
}

.connect-row {
  display: flex;
  align-items: center;
  gap: var(--size-3);
  font-size: 12px;
}

.state-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--size-3);
}

@media (max-width: 540px) {
  .state-grid {
    grid-template-columns: 1fr;
  }
}

.label {
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  margin-bottom: var(--size-1);
}

.owner-row {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.warn {
  font-size: 10px;
  color: #b8761c;
  margin-top: 4px;

  a {
    color: var(--accent-strong);
  }
}

.panel-actions {
  border-top: var(--border);
  padding-top: var(--size-3);
}

.panel-actions :deep(.warn) {
  flex-basis: 100%;
  margin-top: 0;
}

.panel-actions :deep(.withdraw) {
  flex-basis: 100%;
}

.action-group {
  display: flex;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.panel-actions :deep(button .eth-amount .unit) {
  color: inherit;
}
</style>
