<template>
  <EvmTransactionFlowDialog
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
import { normalize } from 'viem/ens'
import { getPublicClient } from '@wagmi/core'
import { useConfig, useConnection } from '@wagmi/vue'

const props = defineProps<{ punkId: number }>()
const emit = defineEmits<{ transferred: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const config = useConfig()
const { address } = useConnection()

const to = ref('')

const dialogText = {
  title: { confirm: 'Transfer punk' },
  lead: { confirm: 'Enter the address or ENS name of the recipient.' },
  action: { confirm: 'Transfer' },
}

function transferError(message: string): Error & { shortMessage: string } {
  const error = new Error(message) as Error & { shortMessage: string }
  error.shortMessage = message
  return error
}

async function resolveRecipient(): Promise<Address> {
  const recipient = to.value.trim()
  if (isAddress(recipient)) return recipient as Address
  if (!recipient || !recipient.includes('.')) {
    throw transferError('Enter a valid recipient address or ENS name.')
  }

  const publicClient = getPublicClient(config, { chainId: 1 })
  if (!publicClient) {
    throw transferError('ENS resolution is unavailable.')
  }

  let name: string
  try {
    name = normalize(recipient)
  } catch {
    throw transferError('Enter a valid recipient address or ENS name.')
  }

  const resolved = await publicClient.getEnsAddress({ name })
  if (!resolved || !isAddress(resolved)) {
    throw transferError(`Could not resolve ${recipient}.`)
  }

  return resolved as Address
}

async function transfer(): Promise<Hash> {
  const to = await resolveRecipient()
  return execute(sdk.value.market.prepareTransfer({ punkId: props.punkId, to }))
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
