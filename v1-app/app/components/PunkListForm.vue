<template>
  <EvmTransactionFlowDialog
    chain="mainnet"
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
        {{ isListed ? 'Update listing' : 'List for sale' }}
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
      <p
        v-if="!punksMarketAddress"
        class="warn"
      >
        PunksMarket not configured — listing will use raw V1 and won't be
        directed to the market contract.
      </p>
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
import { parseEther, type Hash } from 'viem'
import { useAccount } from '@wagmi/vue'
import { usePunksMarketAddress } from '~/utils/addresses'

const props = defineProps<{
  punkId: number
  isListed?: boolean
}>()
const emit = defineEmits<{ listed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useAccount()
const punksMarketAddress = usePunksMarketAddress()

const priceEth = ref('')
const priceWei = computed(() => parseEthSafe(priceEth.value))

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
  const title = props.isListed ? 'Update listing' : 'List for sale'
  return {
    title: { confirm: title },
    lead: {
      confirm: 'Enter the price in ETH at which to list this punk.',
    },
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
      onlySellTo: punksMarketAddress.value ?? undefined,
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

.label {
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

.warn {
  font-size: 10px;
  color: #b8761c;
  margin-top: var(--size-2);
}
</style>
