<template>
  <div class="v1-panel">
    <div v-if="!address" class="connect-row">
      <EvmConnect />
      <span class="muted">Connect a wallet to interact with this punk.</span>
    </div>

    <div v-if="pending" class="muted">Reading onchain state…</div>

    <template v-else>
      <div class="state-grid">
        <div>
          <div class="label">Owner</div>
          <NuxtLink v-if="owner" :to="`/profile/${owner}`">
            <AccountBadge :address="owner" />
          </NuxtLink>
          <span v-else class="muted">—</span>
        </div>

        <div>
          <div class="label">Listing</div>
          <div v-if="listing?.isForSale">
            <EthAmount :wei="listing.priceWei" />
            <div v-if="!isDirectedToPunksMarket && punksMarketAddress" class="warn">
              Not directed to PunksMarket — settlement uses raw V1.
            </div>
          </div>
          <span v-else class="muted">Not for sale</span>
        </div>

        <div>
          <div class="label">Top bid</div>
          <div v-if="bid?.hasBid">
            <EthAmount :wei="bid.valueWei" />
            <span class="dim"> by </span>
            <NuxtLink :to="`/profile/${bid.bidder}`">
              <AccountBadge :address="bid.bidder" />
            </NuxtLink>
          </div>
          <span v-else class="muted">None</span>
        </div>
      </div>

      <div class="actions" v-if="address">
        <template v-if="isOwner">
          <div class="action-group">
            <input v-model="listingPriceInput" type="number" step="0.01" min="0" placeholder="ETH" />
            <button class="primary" :disabled="!parsedListingWei" @click="actList">
              {{ listing?.isForSale ? 'Update listing' : 'List for sale' }}
            </button>
            <button v-if="listing?.isForSale" @click="actUnlist">Cancel listing</button>
          </div>
          <button v-if="bid?.hasBid" class="primary" @click="actAcceptBid">
            Accept bid · <EthAmount :wei="bid.valueWei" />
          </button>
          <div class="action-group">
            <input v-model="transferTo" type="text" placeholder="0x…" />
            <button :disabled="!validTransferTarget" @click="actTransfer">Transfer</button>
          </div>
        </template>

        <template v-else>
          <button v-if="listing?.isForSale" class="primary" @click="actBuy">
            Buy · <EthAmount :wei="listing.priceWei" />
          </button>

          <div class="action-group">
            <input v-model="bidInput" type="number" step="0.01" min="0" placeholder="ETH" />
            <button class="primary" :disabled="!parsedBidWei" @click="actBid">
              {{ isOwnTopBid ? 'Update bid' : 'Place bid' }}
            </button>
            <button v-if="isOwnTopBid" @click="actWithdrawBid">Withdraw bid</button>
          </div>
        </template>

        <button v-if="pendingWithdrawal && pendingWithdrawal > 0n" class="primary withdraw" @click="actWithdrawProceeds">
          Withdraw <EthAmount :wei="pendingWithdrawal" />
        </button>
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
import { parseEther, isAddress, type Address, type Hash, type TransactionReceipt } from 'viem'
import type { ContractWritePlan } from '@networked-art/punks-sdk'
import { useAccount } from '@wagmi/vue'
import { usePunksMarketAddress } from '~/utils/addresses'

const props = defineProps<{ punkId: number }>()
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useAccount()
const punksMarketAddress = usePunksMarketAddress()

const owner = ref<Address | null>(null)
const listing = ref<{ isForSale: boolean; priceWei: bigint; onlySellTo: Address } | null>(null)
const bid = ref<{ hasBid: boolean; bidder: Address; valueWei: bigint } | null>(null)
const pendingWithdrawal = ref<bigint | null>(null)
const pending = ref(true)

const isOwner = computed(
  () => !!address.value && !!owner.value && owner.value.toLowerCase() === address.value.toLowerCase(),
)
const isOwnTopBid = computed(
  () =>
    !!address.value &&
    !!bid.value?.hasBid &&
    bid.value.bidder.toLowerCase() === address.value.toLowerCase(),
)
const isDirectedToPunksMarket = computed(() => {
  if (!listing.value?.isForSale) return false
  if (!punksMarketAddress.value) return false
  return listing.value.onlySellTo?.toLowerCase() === punksMarketAddress.value.toLowerCase()
})
const validTransferTarget = computed(() => isAddress(transferTo.value.trim()))

async function refresh() {
  pending.value = true
  try {
    const [o, l, b, w] = await Promise.all([
      sdk.value.market.ownerOf(props.punkId).catch(() => null),
      sdk.value.market.listing(props.punkId),
      sdk.value.market.bidFor(props.punkId),
      address.value
        ? sdk.value.market.pendingWithdrawal(address.value).catch(() => 0n)
        : Promise.resolve(0n),
    ])
    owner.value = o as Address | null
    listing.value = { isForSale: l.isForSale, priceWei: l.priceWei, onlySellTo: l.onlySellTo }
    bid.value = { hasBid: b.hasBid, bidder: b.bidder, valueWei: b.valueWei }
    pendingWithdrawal.value = w as bigint
  } finally {
    pending.value = false
  }
}

watchEffect(refresh)

// ─── Dialog wiring ────────────────────────────────────────────────────────────

type DialogRef = { initializeRequest: (request?: () => Promise<Hash>) => void } | null
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
  emit('changed', receipt.transactionHash as Hash)
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

const listingPriceInput = ref('')
const bidInput = ref('')
const transferTo = ref('')

const parsedListingWei = computed(() => parseEthSafe(listingPriceInput.value))
const parsedBidWei = computed(() => parseEthSafe(bidInput.value))

function parseEthSafe(input: string): bigint | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const wei = parseEther(trimmed as `${number}`)
    return wei > 0n ? wei : null
  } catch {
    return null
  }
}

// ─── Action handlers ──────────────────────────────────────────────────────────

function actList() {
  const priceWei = parsedListingWei.value
  if (!priceWei) return
  // Direct listings to PunksMarket when deployed — fixes the V1 payout bug for buyers.
  const onlySellTo = punksMarketAddress.value ?? undefined
  run(sdk.value.market.prepareList({ punkId: props.punkId, priceWei, onlySellTo }))
}

function actUnlist() {
  run(sdk.value.market.prepareUnlist(props.punkId))
}

function actBuy() {
  if (!listing.value?.isForSale) return
  run(sdk.value.market.prepareBuy({ punkId: props.punkId, priceWei: listing.value.priceWei }))
}

function actBid() {
  const amountWei = parsedBidWei.value
  if (!amountWei) return
  run(sdk.value.market.prepareEnterBid({ punkId: props.punkId, amountWei }))
}

function actWithdrawBid() {
  run(sdk.value.market.prepareWithdrawBid(props.punkId))
}

function actAcceptBid() {
  if (!bid.value?.hasBid) return
  run(sdk.value.market.prepareAcceptBid({ punkId: props.punkId, minPriceWei: bid.value.valueWei }))
}

function actTransfer() {
  if (!validTransferTarget.value) return
  run(sdk.value.market.prepareTransfer({ punkId: props.punkId, to: transferTo.value.trim() as Address }))
}

function actWithdrawProceeds() {
  run(sdk.value.market.prepareWithdraw())
}
</script>

<style scoped>
.v1-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
}

.connect-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: 12px;
}

.state-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
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
  margin-bottom: var(--space-1);
}

.warn {
  font-size: 10px;
  color: #f3a847;
  margin-top: 4px;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-top: 1px solid var(--border);
  padding-top: var(--space-3);
}

.action-group {
  display: flex;
  gap: var(--space-2);
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
