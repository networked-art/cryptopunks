<template>
  <ClientOnly>
    <section class="actions-panel">
      <h2 class="block-title eyebrow">Action</h2>

      <div
        v-if="preview"
        class="action-stack"
      >
        <p class="block-note muted">
          Wallet actions appear for live auction records.
        </p>
      </div>

      <p
        v-else-if="isLive && isHighestBidder"
        class="block-note"
      >
        You are the highest bidder.
      </p>

      <div
        v-else-if="isLive"
        class="action-stack"
      >
        <label class="amount-field">
          <span class="label">Bid amount</span>
          <input
            v-model="bidEth"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            spellcheck="false"
            :placeholder="minimumBidEth"
          />
        </label>

        <div
          v-if="!address"
          class="connect-row"
        >
          <EvmConnectDialog class-name="primary">Connect</EvmConnectDialog>
          <span class="muted">Connect a wallet to bid.</span>
        </div>

        <EvmTransactionFlowDialog
          v-else
          keep-open
          :request="bid"
          :text="bidDialogText"
          @complete="onComplete"
        >
          <template #start="{ start }">
            <Button
              class="primary"
              @click="start"
            >
              Bid <EthAmount :wei="bidButtonWei" />
            </Button>
          </template>

          <template #confirm>
            <p class="confirm-note muted">
              Minimum bid:
              <EthAmount :wei="minimumBidWei" />
            </p>
          </template>

          <template #error>
            <p class="confirm-note muted">
              Minimum bid:
              <EthAmount :wei="minimumBidWei" />
            </p>
          </template>
        </EvmTransactionFlowDialog>
      </div>

      <EvmTransactionFlowDialog
        v-else-if="canSettle"
        keep-open
        skip-confirmation
        :request="settle"
        :text="settleDialogText"
        @complete="onComplete"
      >
        <template #start="{ start }">
          <Button
            class="primary"
            @click="start"
          >
            Settle auction
          </Button>
        </template>
      </EvmTransactionFlowDialog>

      <p
        v-else
        class="block-note muted"
      >
        This auction has been settled.
      </p>
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import { useNow } from '@vueuse/core'
import { useConnection } from '@wagmi/vue'
import { formatEther, parseEther, type Hash } from 'viem'
import {
  auctionStatus,
  type AuctionRecord,
  type AuctionStatus,
} from '~/utils/auction'

const props = withDefaults(
  defineProps<{
    auction: AuctionRecord
    minimumBidWei: bigint
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
const now = useNow({ interval: 1000 })

const status = computed<AuctionStatus>(() =>
  auctionStatus(props.auction, Math.floor(now.value.getTime() / 1000)),
)
const isLive = computed(() => status.value === 'live')
const canSettle = computed(() => status.value === 'ended')
const isHighestBidder = computed(() => {
  const bidder = props.auction.latestBidder
  const account = address.value
  if (!account || !bidder) return false
  return account.toLowerCase() === bidder.toLowerCase()
})

const minimumBidEth = computed(() => formatEther(props.minimumBidWei))
const bidEth = ref('')
const parsedBidWei = computed(() => parseEthSafe(bidEth.value))
const bidButtonWei = computed(() => parsedBidWei.value ?? props.minimumBidWei)

watch(
  () => props.minimumBidWei,
  (minimum) => {
    if (!bidEth.value) bidEth.value = formatEther(minimum)
  },
  { immediate: true },
)

const bidDialogText = computed(() => ({
  title: { confirm: `Bid on auction #${props.auction.id}` },
  lead: {
    confirm: `Current high bid: ${formatEther(
      props.auction.latestBidWei,
    )} ETH. Enter at least ${minimumBidEth.value} ETH.`,
  },
  action: { confirm: 'Bid' },
}))

const settleDialogText = computed(() => ({
  title: { confirm: `Settle auction #${props.auction.id}` },
  lead: { confirm: 'Settle this completed auction.' },
  action: { confirm: 'Settle' },
}))

async function bid(): Promise<Hash> {
  const amountWei = parsedBidWei.value
  if (!amountWei) throw new Error('Enter a bid amount greater than zero.')
  if (amountWei < props.minimumBidWei) {
    throw new Error(`Enter at least ${minimumBidEth.value} ETH.`)
  }
  return execute(
    sdk.value.auctions.prepareBid({
      auctionId: props.auction.id,
      amountWei,
    }),
  )
}

async function settle(): Promise<Hash> {
  return execute(sdk.value.auctions.prepareSettle(props.auction.id))
}

function onComplete(receipt: { transactionHash: Hash }) {
  emit('changed', receipt.transactionHash)
}

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
.confirm-note {
  margin: 0;
}

.block-note,
.confirm-note,
.connect-row {
  font-size: var(--font-sm);
}

.action-stack {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.amount-field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.amount-field input {
  width: 100%;
}

.connect-row {
  display: flex;
  align-items: center;
  gap: var(--size-3);
  flex-wrap: wrap;
}

.actions-panel :deep(button .eth-amount) {
  margin-left: var(--size-1);
}

.actions-panel :deep(button .eth-amount .unit) {
  color: inherit;
}
</style>
