<template>
  <EvmTransactionFlowDialog
    chain="mainnet"
    keep-open
    :request="transfer"
    :text="dialogText"
    @complete="onComplete"
  >
    <template #start="{ start }">
      <Button
        :disabled="!address"
        @click="start"
      >
        Transfer
      </Button>
    </template>

    <template #confirm>
      <label class="transfer-to">
        <span class="label">Recipient</span>
        <EvmAddressInput
          v-model="to"
          placeholder="0x… or name.eth"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
    </template>

    <template #error>
      <label class="transfer-to">
        <span class="label">Recipient</span>
        <EvmAddressInput
          v-model="to"
          placeholder="0x… or name.eth"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
    </template>
  </EvmTransactionFlowDialog>
</template>

<script setup lang="ts">
import { isAddress, type Address, type Hash } from 'viem'
import { useAccount } from '@wagmi/vue'

const props = defineProps<{ punkId: number }>()
const emit = defineEmits<{ transferred: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useAccount()

const to = ref('')

/// `EvmAddressInput` keeps the raw input (address *or* ENS name) in `to`.
/// Resolve to a concrete address before submitting so `name.eth` works.
const trimmedInput = computed(() => to.value.trim())
const ensIdentifier = computed(() => {
  const v = trimmedInput.value
  if (!v) return undefined
  if (isAddress(v) || v.includes('.')) return v
  return undefined
})
const { data: ensData, pending: ensPending } = useEns(ensIdentifier)

const resolvedAddress = computed<Address | null>(() => {
  const v = trimmedInput.value
  if (isAddress(v)) return v as Address
  const resolved = ensData.value?.address
  return resolved && isAddress(resolved) ? (resolved as Address) : null
})

const dialogText = {
  title: { confirm: 'Transfer punk' },
  lead: { confirm: 'Enter the address or ENS name of the recipient.' },
  action: { confirm: 'Transfer' },
}

async function transfer(): Promise<Hash> {
  if (ensPending.value) {
    throw new Error('Still resolving ENS name — try again in a moment.')
  }
  const to = resolvedAddress.value
  if (!to) {
    throw new Error('Enter a valid recipient address or ENS name.')
  }
  return execute(
    sdk.value.market.prepareTransfer({ punkId: props.punkId, to }),
  )
}

function onComplete(receipt: { transactionHash: Hash }) {
  to.value = ''
  emit('transferred', receipt.transactionHash)
}
</script>

<style scoped>
.transfer-to {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
}

/* The resolved address/ENS that EvmAddressInput renders below the field
   is a 40-char hex string — left to default styles it pushes the modal
   wider than the viewport. Shrink it and let it wrap. */
.transfer-to :deep(.evm-address-input) {
  min-width: 0;
}

.transfer-to :deep(.evm-address-input > small) {
  font-size: 10px;
  overflow-wrap: anywhere;
  word-break: break-all;
}
</style>
