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
        <EvmEthInput
          v-model="priceEth"
          v-model:wei="priceWei"
          placeholder="50.00"
        />
      </label>
    </template>

    <template #error>
      <label class="amount-field">
        <span class="label">Listing price</span>
        <EvmEthInput
          v-model="priceEth"
          v-model:wei="priceWei"
          placeholder="0.5"
        />
      </label>
    </template>
  </EvmTransactionFlowDialog>
</template>

<script setup lang="ts">
import { formatEther, type Hash } from 'viem'
import { useConnection } from '@wagmi/vue'

const props = defineProps<{
  punkId: number
  currentPriceWei?: bigint | null
}>()
const emit = defineEmits<{ listed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()
const detail = usePunkDetailDataContext()

const priceEth = ref('')
const priceWei = ref<bigint | null>(null)

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
  const [ownerOk, marketOk] = await Promise.all([
    detail.reconcileOwner(),
    detail.reconcileMarket(),
  ])
  if (!ownerOk || !marketOk) {
    throw new Error('Current owner and market state could not be verified.')
  }
  const viaVault = detail.isVaulted.value ? detail.nativeOwner.value : null
  const plan = viaVault
    ? sdk.value.vault.at(viaVault).prepareList({
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
</style>
