<template>
  <EvmTransactionFlowDialog
    chain="mainnet"
    keep-open
    :request="bid"
    :text="dialogText"
    @complete="onComplete"
  >
    <template #start="{ start }">
      <Button
        :class="{ primary }"
        :disabled="!address"
        @click="start"
      >
        {{ actionLabel }}
      </Button>
    </template>

    <template #confirm>
      <label class="amount-field">
        <span class="label">Bid amount</span>
        <input
          v-model="bidEth"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          spellcheck="false"
          placeholder="0.5"
        />
      </label>
    </template>

    <template #error>
      <label class="amount-field">
        <span class="label">Bid amount</span>
        <input
          v-model="bidEth"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          spellcheck="false"
          placeholder="0.5"
        />
      </label>
    </template>
  </EvmTransactionFlowDialog>
</template>

<script setup lang="ts">
import { formatEther, parseEther, type Address, type Hash } from 'viem'
import { useConnection } from '@wagmi/vue'
import type { PunkMarketBid } from '@networked-art/punks-sdk'

const props = withDefaults(
  defineProps<{
    punkId: number
    currentBid: PunkMarketBid | null
    primary?: boolean
  }>(),
  { primary: true },
)
const emit = defineEmits<{ placed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()

const bidEth = ref('')
const bidWei = computed(() => parseEthSafe(bidEth.value))
const hasBid = computed(() => !!props.currentBid?.hasBid)
const isHighBidder = computed(
  () =>
    !!address.value &&
    !!props.currentBid?.hasBid &&
    sameAddress(props.currentBid.bidder, address.value),
)

const actionLabel = computed(() => {
  if (isHighBidder.value) return 'Increase bid'
  return hasBid.value ? 'Place higher bid' : 'Place bid'
})

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

const dialogText = computed(() => {
  const title = actionLabel.value
  const current = props.currentBid?.hasBid ? props.currentBid.valueWei : null
  const lead = current
    ? `Current high bid: ${formatEther(current)} ETH. Enter a higher ETH amount.`
    : 'Enter the ETH amount you want to bid for this Punk.'
  return {
    title: { confirm: title },
    lead: { confirm: lead },
    action: { confirm: title },
  }
})

async function bid(): Promise<Hash> {
  const amountWei = bidWei.value
  if (!amountWei) {
    throw new Error('Enter a bid amount greater than zero.')
  }
  const current = props.currentBid?.hasBid ? props.currentBid.valueWei : 0n
  if (amountWei <= current) {
    throw new Error('Enter a bid higher than the current high bid.')
  }
  return execute(
    sdk.value.market.prepareEnterBid({
      punkId: props.punkId,
      amountWei,
    }),
  )
}

function onComplete(receipt: { transactionHash: Hash }) {
  bidEth.value = ''
  emit('placed', receipt.transactionHash)
}

function sameAddress(a: Address, b: Address) {
  return a.toLowerCase() === b.toLowerCase()
}
</script>

<style scoped>
.amount-field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.amount-field input {
  width: 100%;
}
</style>
