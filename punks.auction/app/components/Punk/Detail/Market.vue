<template>
  <ClientOnly>
    <section class="block market-block">
      <h2 class="block-title eyebrow">Marketplace Status</h2>

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
        </dl>

        <p
          v-if="error"
          class="error"
        >
          {{ error }}
        </p>

        <div class="actions">
          <template v-if="isOwner">
            <div class="action-group">
              <LazyPunkDetailMarketListForm
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

            <LazyPunkDetailMarketTransferForm
              :punk-id="punkId"
              @transferred="onChanged"
            />
          </template>

          <template v-else>
            <div
              v-if="!address"
              class="action-group min-50"
            >
              <EvmConnectDialog class-name="primary">Connect</EvmConnectDialog>
            </div>

            <div
              v-else
              class="action-group min-50"
            >
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
                <LazyPunkDetailMarketBidForm
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
            </div>

            <LazyPunkDetailMarketBrokerContact
              v-if="brokerEnabled"
              :punk-id="punkId"
            />
          </template>
        </div>
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
import { ZERO_ADDRESS, type ContractWritePlan } from '@networked-art/punks-sdk'
import { useConnection } from '@wagmi/vue'
import type { Address, Hash, TransactionReceipt } from 'viem'
import { isApiConfigured } from '~/utils/api'
import { transactionTitleForPlan } from '~/utils/transactionFlowText'

const props = defineProps<{
  punkId: number
}>()
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()
// Broker contact rides on the networked.art API; hide it unless that's wired up.
const brokerEnabled = isApiConfigured()
const detail = usePunkDetailDataContext()
const {
  owner: resolvedOwner,
  nativeOwner,
  isVaulted,
  ownerPending,
  reconcileOwner,
  reconcileMarket,
} = detail

const vaultAddress = computed<Address | null>(() =>
  isVaulted.value ? nativeOwner.value : null,
)

const { listing, bid, marketPending } = detail
const error = computed(() => detail.marketError.value)
const pending = computed(() => ownerPending.value || marketPending.value)

const isOwner = computed(
  () =>
    !!address.value &&
    !!resolvedOwner.value &&
    sameAddress(resolvedOwner.value, address.value),
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

type DialogRef = {
  initializeRequest: (request?: () => Promise<Hash>) => void
} | null
const dialogRef = ref<DialogRef>(null)
const dialogText = ref<{
  title?: Record<string, string>
  lead?: Record<string, string>
}>({})

function run(plan: ContractWritePlan) {
  const title = transactionTitleForPlan(plan)
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

function onChanged(tx: Hash) {
  void reconcileMarket()
  void reconcileOwner()
  emit('changed', tx)
}

function onComplete(receipt: TransactionReceipt) {
  onChanged(receipt.transactionHash as Hash)
}

async function actUnlist() {
  const [ownerOk, marketOk] = await Promise.all([
    reconcileOwner(),
    reconcileMarket(),
  ])
  if (!ownerOk || !marketOk) return
  if (!liveListing.value || !isOwner.value) return
  const plan = vaultAddress.value
    ? sdk.value.vault
        .at(vaultAddress.value)
        .prepareUnlist({ punkId: props.punkId })
    : sdk.value.market.prepareUnlist(props.punkId)
  run(plan)
}

async function actBuy() {
  if (!(await reconcileMarket())) return
  const current = liveListing.value
  if (!current || !canBuy.value) return
  run(
    sdk.value.market.prepareBuy({
      punkId: props.punkId,
      priceWei: current.priceWei,
    }),
  )
}

async function actAcceptBid() {
  const [ownerOk, marketOk] = await Promise.all([
    reconcileOwner(),
    reconcileMarket(),
  ])
  if (!ownerOk || !marketOk) return
  const current = activeBid.value
  if (!current || !isOwner.value) return
  const plan = vaultAddress.value
    ? sdk.value.vault.at(vaultAddress.value).prepareAcceptBid({
        punkId: props.punkId,
        minPriceWei: current.valueWei,
      })
    : sdk.value.market.prepareAcceptBid({
        punkId: props.punkId,
        minPriceWei: current.valueWei,
      })
  run(plan)
}

async function actWithdrawBid() {
  if (!(await reconcileMarket())) return
  if (!isHighBidder.value) return
  run(sdk.value.market.prepareWithdrawBid(props.punkId))
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
  color: var(--text-dim);
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

  &.min-50 {
    min-width: 50%;
    @media (max-width: 540px) {
      min-width: auto;
    }
  }
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
