<template>
  <EvmTransactionFlowDialog
    chain="mainnet"
    keep-open
    :request="adjust"
    :text="dialogText"
    @complete="onComplete"
  >
    <template #start="{ start }">
      <Button
        class="small"
        @click="onOpen(start)"
      >
        Adjust bid
      </Button>
    </template>

    <template #confirm>
      <label class="bid-amount">
        <span class="label">New bid amount</span>
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
      <label class="bid-amount">
        <span class="label">New bid amount</span>
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
import { formatEther, parseEther, type Hash } from 'viem'
import type { CollectionBid } from '~/composables/usePunksMarketBids'

const props = defineProps<{ bid: CollectionBid }>()
const emit = defineEmits<{ adjusted: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()

const bidEth = ref('')

const dialogText = computed(() => ({
  title: { confirm: 'Adjust bid', waiting: 'Adjusting bid' },
  lead: {
    confirm: `Your current bid is ${formatEther(props.bid.bidWei)} Ξ. Enter a new ETH amount.`,
  },
  action: { confirm: 'Adjust bid' },
}))

function onOpen(start: () => void) {
  bidEth.value = formatEther(props.bid.bidWei)
  start()
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

async function adjust(): Promise<Hash> {
  const newWei = parseEthSafe(bidEth.value)
  if (!newWei) {
    throw new Error('Enter a bid amount greater than zero.')
  }
  if (newWei === props.bid.bidWei) {
    throw new Error('New bid matches the existing bid.')
  }
  const increase = newWei > props.bid.bidWei
  const weiToAdjust = increase
    ? newWei - props.bid.bidWei
    : props.bid.bidWei - newWei
  return execute(
    sdk.value.v1Market.prepareAdjustBidPrice({
      bidId: props.bid.id,
      weiToAdjust,
      increase,
    }),
  )
}

function onComplete(receipt: { transactionHash: Hash }) {
  bidEth.value = ''
  emit('adjusted', receipt.transactionHash)
}
</script>

<style scoped>
.bid-amount {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.bid-amount input {
  width: 100%;
}
</style>
