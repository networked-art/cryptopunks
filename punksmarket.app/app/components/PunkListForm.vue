<template>
  <EvmTransactionFlowDialog
    keep-open
    :request="list"
    :text="dialogText"
    @complete="onComplete"
  >
    <template #start="{ start }">
      <Button
        class="primary"
        :disabled="!address"
        @click="start"
      >
        {{ currentPriceWei ? 'Update listing' : 'List for sale' }}
      </Button>
    </template>

    <template #confirm>
      <label class="listing-amount">
        <span class="label">Listing price</span>
        <input
          v-model="priceEth"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          spellcheck="false"
          placeholder="0.5"
        />
      </label>
    </template>

    <template #error>
      <label class="listing-amount">
        <span class="label">Listing price</span>
        <input
          v-model="priceEth"
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
import { formatEther, type Hash } from 'viem'
import { useConnection } from '@wagmi/vue'
import { PUNKS_MARKET_ADDRESS } from '~/utils/addresses'

const props = defineProps<{
  punkId: number
  currentPriceWei?: bigint | null
}>()
const emit = defineEmits<{ listed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()

const { amount: priceEth, wei: priceWei } = useEthAmountInput()

const dialogText = computed(() => {
  const current = props.currentPriceWei
  const title = current ? 'Update listing' : 'List for sale'
  const lead = current
    ? `Your current listing is ${formatEther(current)} Ξ. Enter a new ETH price.`
    : 'Enter the price in ETH at which to list this punk.'
  return {
    title: { confirm: title },
    lead: { confirm: lead },
    action: { confirm: title },
  }
})

async function list(): Promise<Hash> {
  if (!priceWei.value) {
    throw new Error('Enter a price greater than zero.')
  }
  return execute(
    sdk.value.market.prepareList({
      punkId: props.punkId,
      priceWei: priceWei.value,
      onlySellTo: PUNKS_MARKET_ADDRESS,
    }),
  )
}

function onComplete(receipt: { transactionHash: Hash }) {
  priceEth.value = ''
  emit('listed', receipt.transactionHash)
}
</script>

<style scoped>
.listing-amount {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.listing-amount input {
  width: 100%;
}

.warn {
  font-size: 10px;
  color: #b8761c;
  margin-top: var(--size-2);
}
</style>
