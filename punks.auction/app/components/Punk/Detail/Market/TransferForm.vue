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
          placeholder="0x... or name.eth"
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
          placeholder="0x... or name.eth"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
    </template>
  </EvmTransactionFlowDialog>
</template>

<script setup lang="ts">
import type { Hash } from 'viem'
import { useConfig, useConnection } from '@wagmi/vue'
import { resolveAddressInput } from '~/utils/addressInput'

const props = defineProps<{ punkId: number }>()
const emit = defineEmits<{ transferred: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const config = useConfig()
const { address } = useConnection()

const to = ref('')

const dialogText = {
  title: { confirm: 'Transfer Punk' },
  lead: { confirm: 'Enter the address or ENS name of the recipient.' },
  action: { confirm: 'Transfer' },
}

async function transfer(): Promise<Hash> {
  const recipient = await resolveAddressInput(config, to.value, {
    invalidMessage: 'Enter a valid recipient address or ENS name.',
  })
  return execute(
    sdk.value.market.prepareTransfer({
      punkId: props.punkId,
      to: recipient,
    }),
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

.transfer-to :deep(.evm-address-input) {
  min-width: 0;
}

.transfer-to :deep(.evm-address-input > small) {
  font-size: 10px;
  overflow-wrap: anywhere;
  word-break: break-all;
}
</style>
