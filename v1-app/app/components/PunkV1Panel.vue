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
            <span
              v-if="isWrapped"
              class="tag wrap-tag"
              title="Wrapped — the V1 contract reports the wrapper as owner; this is the ERC-721 holder."
              >wrapped</span
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
          <div v-if="listing?.isForSale">
            <EthAmount :wei="listing.priceWei" />
            <div
              v-if="!isDirectedToPunksMarket"
              class="warn"
            >
              Not directed to PunksMarket — settlement uses raw V1.
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

      <div
        class="actions"
        v-if="address"
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
              :is-listed="!!listing?.isForSale"
              @listed="onListed"
            />
            <Button
              v-if="listing?.isForSale"
              @click="actUnlist"
            >
              Cancel listing
            </Button>
          </div>
          <Button
            v-if="canAcceptTopBid"
            class="primary"
            @click="actAcceptBid"
          >
            Accept bid · <EthAmount :wei="topBid!.bidWei" />
          </Button>
          <p
            v-else-if="topBid && !isDirectedToPunksMarket"
            class="warn"
          >
            Direct your listing to PunksMarket to accept this bid.
          </p>
          <PunkTransferForm
            :punk-id="punkId"
            @transferred="onTransferred"
          />
        </template>

        <template v-else>
          <Button
            v-if="listing?.isForSale"
            class="primary"
            :disabled="!canBuy"
            @click="actBuy"
          >
            Buy · <EthAmount :wei="listing.priceWei" />
          </Button>
          <p
            v-if="listing?.isForSale && !canBuy"
            class="warn"
          >
            Listing not directed to PunksMarket — refusing to buy via raw V1.
          </p>

          <div class="action-group">
            <input
              v-model="bidInput"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
              placeholder="ETH"
            />
            <Button
              class="primary"
              :disabled="!parsedBidWei"
              @click="actBid"
            >
              {{ ownActiveBid ? 'Update bid' : 'Place bid' }}
            </Button>
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
      </div>
    </template>

    <EvmTransactionFlowDialog
      ref="dialogRef"
      chain="mainnet"
      :text="dialogText"
      keep-open
      skip-confirmation
      @complete="onComplete"
    />
  </div>
</template>

<script setup lang="ts">
import {
  parseEther,
  type Address,
  type Hash,
  type TransactionReceipt,
} from 'viem'
import {
  emptyPunksFilter,
  type ContractWritePlan,
} from '@networked-art/punks-sdk'
import { useAccount } from '@wagmi/vue'
import { V1_WRAPPER_ADDRESS, PUNKS_MARKET_ADDRESS } from '~/utils/addresses'
import { v1WrapperAbi } from '~/utils/v1WrapperAbi'
import type { CollectionBid } from '~/composables/usePunksMarketBids'

const props = defineProps<{
  punkId: number
  matchingBids: CollectionBid[]
}>()
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useAccount()

const {
  owner,
  isWrapped,
  pending: ownerPending,
  refresh: refreshOwner,
} = usePunkOwner(() => props.punkId)
const listing = ref<{
  isForSale: boolean
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
const isDirectedToPunksMarket = computed(() => {
  if (!listing.value?.isForSale) return false
  return (
    listing.value.onlySellTo?.toLowerCase() ===
    PUNKS_MARKET_ADDRESS.toLowerCase()
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
const canAcceptTopBid = computed(
  () => !!topBid.value && isDirectedToPunksMarket.value,
)
const canBuy = computed(() => isDirectedToPunksMarket.value)

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
const dialogRef = ref<DialogRef>(null)
const dialogText = ref<{
  title?: Record<string, string>
  lead?: Record<string, string>
}>({})

function run(plan: ContractWritePlan) {
  dialogText.value = {
    title: { confirm: plan.description, waiting: plan.description },
    lead: { confirm: plan.description },
  }
  dialogRef.value?.initializeRequest(() => execute(plan))
}

function onComplete(receipt: TransactionReceipt) {
  refresh()
  refreshOwner()
  emit('changed', receipt.transactionHash as Hash)
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

const bidInput = ref('')

const parsedBidWei = computed(() => parseEthSafe(bidInput.value))

function parseEthSafe(input: unknown): bigint | null {
  const trimmed = String(input ?? '').trim()
  if (!trimmed) return null
  try {
    const wei = parseEther(trimmed)
    return wei > 0n ? wei : null
  } catch {
    return null
  }
}

// ─── Action handlers ──────────────────────────────────────────────────────────

function onListed(tx: Hash) {
  refresh()
  refreshOwner()
  emit('changed', tx)
}

function actUnlist() {
  run(sdk.value.market.prepareUnlist(props.punkId))
}

function actBuy() {
  if (!listing.value?.isForSale || !canBuy.value) return
  run(
    sdk.value.v1Market.prepareBuyPunk({
      punkId: props.punkId,
      expectedListingWei: listing.value.priceWei,
      recipient: address.value as Address,
    }),
  )
}

function actBid() {
  const newWei = parsedBidWei.value
  if (!newWei) return
  const existing = ownActiveBid.value
  if (!existing) {
    run(
      sdk.value.v1Market.preparePlaceBid({
        bidWei: newWei,
        criteria: emptyPunksFilter(),
        includeIds: [props.punkId],
      }),
    )
    return
  }
  if (newWei === existing.bidWei) return
  const increase = newWei > existing.bidWei
  const weiToAdjust = increase
    ? newWei - existing.bidWei
    : existing.bidWei - newWei
  run(
    sdk.value.v1Market.prepareAdjustBidPrice({
      bidId: existing.id,
      weiToAdjust,
      increase,
    }),
  )
}

function actWithdrawBid() {
  const existing = ownActiveBid.value
  if (!existing) return
  run(sdk.value.v1Market.prepareCancelBid(existing.id))
}

function actAcceptBid() {
  if (!canAcceptTopBid.value || !topBid.value || !listing.value) return
  run(
    sdk.value.v1Market.prepareAcceptBid({
      bidId: topBid.value.id,
      punkId: props.punkId,
      expectedListingWei: listing.value.priceWei,
    }),
  )
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
  run({
    description: `Unwrap CryptoPunk ${props.punkId}`,
    request: {
      address: V1_WRAPPER_ADDRESS,
      abi: v1WrapperAbi,
      functionName: 'unwrap',
      args: [BigInt(props.punkId)],
    },
  })
}
</script>

<style scoped>
.v1-panel {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: 1px solid var(--border);
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

.wrap-tag {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.warn {
  font-size: 10px;
  color: #b8761c;
  margin-top: 4px;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  border-top: 1px solid var(--border);
  padding-top: var(--size-3);
}

.action-group {
  display: flex;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.action-group input {
  flex: 1;
  min-width: 120px;
}

.withdraw {
  align-self: flex-start;
}
</style>
