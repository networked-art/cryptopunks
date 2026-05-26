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
      <label class="amount-field">
        <span class="label">Listing price</span>
        <input
          v-model="priceEth"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          spellcheck="false"
          placeholder="50.00"
        />
      </label>
    </template>

    <template #error>
      <label class="amount-field">
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
import { formatEther, parseEther, type Address, type Hash } from 'viem'
import { useConnection } from '@wagmi/vue'

const props = defineProps<{
  punkId: number
  currentPriceWei?: bigint | null
  viaVault?: Address | null
}>()
const emit = defineEmits<{ listed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()

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
  const current = props.currentPriceWei
  const title = current ? 'Update listing' : 'List for sale'
  const lead = current
    ? `Current listing: ${formatEther(current)} ETH. Enter a new ETH price.`
    : 'Enter the ETH price for the canonical CryptoPunks market.'
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
  const plan = props.viaVault
    ? sdk.value.vault.at(props.viaVault).prepareList({
        punkId: props.punkId,
        priceWei: priceWei.value,
      })
    : sdk.value.market.prepareList({
        punkId: props.punkId,
        priceWei: priceWei.value,
      })
  return execute(plan)
}

function onComplete(receipt: { transactionHash: Hash }) {
  priceEth.value = ''
  emit('listed', receipt.transactionHash)
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
