<template>
  <ClientOnly>
    <section class="block market-block">
      <h2 class="block-title eyebrow">Canonical market</h2>

      <p
        v-if="pending && !listing && !bid"
        class="block-note muted"
      >
        Loading market state...
      </p>

      <div
        v-else
        class="market-panel"
      >
        <dl class="state-grid">
          <div class="state-cell">
            <dt class="label">Listing</dt>
            <dd v-if="liveListing">
              <EthAmount :wei="liveListing.priceWei" />
              <span
                v-if="isPrivateListing"
                class="dim"
              >
                private
              </span>
            </dd>
            <dd
              v-else
              class="muted"
            >
              Not for sale
            </dd>
          </div>

          <div class="state-cell">
            <dt class="label">Top bid</dt>
            <dd v-if="activeBid">
              <EthAmount :wei="activeBid.valueWei" />
              <span class="dim"> by </span>
              <NuxtLink :to="`/profile/${activeBid.bidder}`">
                <Account :address="activeBid.bidder" />
              </NuxtLink>
            </dd>
            <dd
              v-else
              class="muted"
            >
              None
            </dd>
          </div>

          <div class="state-cell">
            <dt class="label">Balance</dt>
            <dd v-if="address && pendingWithdrawal > 0n">
              <EthAmount :wei="pendingWithdrawal" />
            </dd>
            <dd
              v-else
              class="muted"
            >
              None
            </dd>
          </div>
        </dl>

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
          <span class="muted">Connect a wallet to interact with this Punk.</span>
        </div>

        <div
          v-else
          class="actions"
        >
          <template v-if="isOwner">
            <div class="action-group">
              <PunkDetailMarketListForm
                :punk-id="punkId"
                :current-price-wei="liveListing?.priceWei ?? null"
                @listed="onChanged"
              />
              <Button
                v-if="liveListing"
                @click="actUnlist"
              >
                Cancel listing
              </Button>
            </div>

            <Button
              v-if="activeBid"
              class="primary"
              @click="actAcceptBid"
            >
              Accept bid <EthAmount :wei="activeBid.valueWei" />
            </Button>

            <PunkDetailMarketTransferForm
              :punk-id="punkId"
              @transferred="onChanged"
            />
          </template>

          <template v-else>
            <Button
              v-if="canBuy"
              class="primary"
              @click="actBuy"
            >
              Buy <EthAmount :wei="liveListing!.priceWei" />
            </Button>
            <p
              v-else-if="liveListing && isPrivateListing"
              class="warn"
            >
              This listing is reserved for
              <NuxtLink :to="`/profile/${liveListing.onlySellTo}`">
                <Account :address="liveListing.onlySellTo" />
              </NuxtLink>
              .
            </p>

            <div class="action-group">
              <PunkDetailMarketBidForm
                :punk-id="punkId"
                :current-bid="activeBid"
                :primary="!liveListing"
                @placed="onChanged"
              />
              <Button
                v-if="isHighBidder"
                @click="actWithdrawBid"
              >
                Withdraw bid
              </Button>
            </div>
          </template>

          <Button
            v-if="pendingWithdrawal > 0n"
            class="primary withdraw"
            @click="actWithdrawProceeds"
          >
            Withdraw <EthAmount :wei="pendingWithdrawal" />
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
  type PunkListing,
  type PunkMarketBid,
} from '@networked-art/punks-sdk'
import { useConnection } from '@wagmi/vue'
import type { Address, Hash, TransactionReceipt } from 'viem'
import { TokenStandard } from '~/utils/auction'

const props = defineProps<{
  punkId: number
}>()
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk, publicClient } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()
const {
  owner,
  pending: ownerPending,
  refresh: refreshOwner,
} = usePunkOwner(() => props.punkId, TokenStandard.CryptoPunks)

const listing = ref<PunkListing | null>(null)
const bid = ref<PunkMarketBid | null>(null)
const pendingWithdrawal = ref<bigint>(0n)
const marketPending = ref(false)
const error = ref<string | null>(null)
const pending = computed(() => ownerPending.value || marketPending.value)

const isOwner = computed(
  () => !!address.value && !!owner.value && sameAddress(owner.value, address.value),
)

const liveListing = computed(() => {
  const current = listing.value
  return current?.isForSale ? current : null
})

const activeBid = computed(() => {
  const current = bid.value
  return current?.hasBid && current.valueWei > 0n ? current : null
})

const isHighBidder = computed(
  () =>
    !!address.value &&
    !!activeBid.value &&
    sameAddress(activeBid.value.bidder, address.value),
)

const isPrivateListing = computed(() => {
  const current = liveListing.value
  return !!current && !sameAddress(current.onlySellTo, ZERO_ADDRESS)
})

const canBuy = computed(() => {
  const current = liveListing.value
  if (!address.value || !current || isOwner.value) return false
  return (
    sameAddress(current.onlySellTo, ZERO_ADDRESS) ||
    sameAddress(current.onlySellTo, address.value)
  )
})

let refreshToken = 0

async function refresh() {
  const token = ++refreshToken
  const c = publicClient.value
  if (!c || !Number.isInteger(props.punkId)) {
    listing.value = null
    bid.value = null
    pendingWithdrawal.value = 0n
    return
  }

  marketPending.value = true
  error.value = null
  try {
    const account = address.value
    const [nextListing, nextBid, nextWithdrawal] = await Promise.all([
      sdk.value.market.listing(props.punkId),
      sdk.value.market.bid(props.punkId),
      account
        ? sdk.value.market.pendingWithdrawal(account)
        : Promise.resolve(0n),
    ])
    if (token !== refreshToken) return
    listing.value = nextListing
    bid.value = nextBid
    pendingWithdrawal.value = nextWithdrawal
  } catch (e) {
    if (token !== refreshToken) return
    error.value = (e as Error).message
    listing.value = null
    bid.value = null
    pendingWithdrawal.value = 0n
  } finally {
    if (token === refreshToken) marketPending.value = false
  }
}

watch(
  [() => props.punkId, address, publicClient, sdk],
  () => void refresh(),
  { immediate: true },
)

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

function onChanged(tx: Hash) {
  refresh()
  refreshOwner()
  emit('changed', tx)
}

function onComplete(receipt: TransactionReceipt) {
  onChanged(receipt.transactionHash as Hash)
}

function actUnlist() {
  run(sdk.value.market.prepareUnlist(props.punkId))
}

function actBuy() {
  const current = liveListing.value
  if (!current || !canBuy.value) return
  run(
    sdk.value.market.prepareBuy({
      punkId: props.punkId,
      priceWei: current.priceWei,
    }),
  )
}

function actAcceptBid() {
  const current = activeBid.value
  if (!current || !isOwner.value) return
  run(
    sdk.value.market.prepareAcceptBid({
      punkId: props.punkId,
      minPriceWei: current.valueWei,
    }),
  )
}

function actWithdrawBid() {
  if (!isHighBidder.value) return
  run(sdk.value.market.prepareWithdrawBid(props.punkId))
}

function actWithdrawProceeds() {
  run(sdk.value.market.prepareWithdraw())
}

function sameAddress(a?: Address | string | null, b?: Address | string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}
</script>

<style scoped>
.block {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.block-title {
  margin: 0;
}

.block-note {
  margin: 0;
  font-size: var(--font-sm);
}

.market-panel {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.state-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--size-3);
}

.state-cell {
  min-width: 0;
}

.state-cell dd {
  margin: 0;
  min-width: 0;
  font-size: var(--font-sm);
}

.state-cell a {
  border: 0;
}

.label {
  margin-bottom: var(--size-1);
  text-transform: uppercase;
  font-size: var(--font-xs);
  letter-spacing: var(--letter-spacing-md);
  color: var(--text-dim);
}

.connect-row {
  display: flex;
  align-items: center;
  gap: var(--size-3);
  flex-wrap: wrap;
  font-size: var(--font-sm);
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
  padding-top: var(--size-3);
  border-top: var(--border);
}

.action-group {
  display: flex;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.withdraw {
  flex-basis: 100%;
}

.warn,
.error {
  margin: 0;
  font-size: var(--font-xs);
}

.warn {
  color: var(--accent-strong);
}

.warn a {
  border: 0;
}

.error {
  color: var(--accent);
}

.actions :deep(button .eth-amount) {
  margin-left: var(--size-1);
}

.actions :deep(button .eth-amount .unit) {
  color: inherit;
}

@media (max-width: 540px) {
  .state-grid {
    grid-template-columns: 1fr;
  }
}
</style>
