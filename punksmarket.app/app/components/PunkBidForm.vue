<template>
  <EvmTransactionFlowDialog
    keep-open
    :request="bid"
    :text="dialogText"
    @complete="onComplete"
  >
    <template #start="{ start }">
      <Button
        class="primary"
        :disabled="!address"
        @click="start"
      >
        {{ existingBid ? 'Update bid' : 'Place bid' }}
      </Button>
    </template>

    <template #confirm>
      <label class="bid-amount">
        <span class="label">Bid amount</span>
        <EvmEthInput
          v-model="bidEth"
          v-model:wei="bidWei"
        />
      </label>
    </template>

    <template #error>
      <label class="bid-amount">
        <span class="label">Bid amount</span>
        <EvmEthInput
          v-model="bidEth"
          v-model:wei="bidWei"
        />
      </label>
    </template>
  </EvmTransactionFlowDialog>
</template>

<script setup lang="ts">
import { formatEther, type Hash } from 'viem'
import { emptyPunksFilter } from '@networked-art/punks-sdk'
import { useConnection } from '@wagmi/vue'
import type { CollectionBid } from '~/composables/usePunksMarketBids'

const props = defineProps<{
  punkId: number
  existingBid: CollectionBid | null
}>()
const emit = defineEmits<{ placed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()

const bidEth = ref('')
const bidWei = ref<bigint | null>(null)

const dialogText = computed(() => {
  const existing = props.existingBid
  const title = existing ? 'Update bid' : 'Place bid'
  const lead = existing
    ? `Your current bid is ${formatEther(existing.bidWei)} Ξ. Enter a new ETH amount.`
    : 'Enter the amount of ETH you want to bid for this punk.'
  return {
    title: { confirm: title },
    lead: { confirm: lead },
    action: { confirm: title },
  }
})

async function bid(): Promise<Hash> {
  const newWei = bidWei.value
  if (!newWei) {
    throw new Error('Enter a bid amount greater than zero.')
  }
  const existing = props.existingBid
  if (!existing) {
    return execute(
      sdk.value.v1Market.preparePlaceBid({
        bidWei: newWei,
        criteria: emptyPunksFilter(),
        includeIds: [props.punkId],
      }),
    )
  }
  if (newWei === existing.bidWei) {
    throw new Error('New bid matches the existing bid.')
  }
  const increase = newWei > existing.bidWei
  const weiToAdjust = increase
    ? newWei - existing.bidWei
    : existing.bidWei - newWei
  return execute(
    sdk.value.v1Market.prepareAdjustBidPrice({
      bidId: existing.id,
      weiToAdjust,
      increase,
    }),
  )
}

function onComplete(receipt: { transactionHash: Hash }) {
  bidEth.value = ''
  emit('placed', receipt.transactionHash)
}
</script>

<style scoped>
.bid-amount {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}
</style>
