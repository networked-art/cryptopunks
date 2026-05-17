<template>
  <div class="bid-form">
    <h3 class="form-title">Place a collection bid</h3>

    <p
      v-if="!marketAddress"
      class="warn"
    >
      PunksMarket contract is not configured yet.
    </p>

    <label>
      <span class="label">Bid amount</span>
      <input
        v-model="bidEth"
        type="number"
        step="0.01"
        min="0"
        placeholder="0.5"
      />
    </label>

    <div class="actions">
      <button
        class="primary"
        :disabled="!address || !marketAddress || bidWei === null"
        @click="actPlace"
      >
        {{ address ? 'Place bid' : 'Connect wallet' }}
      </button>
    </div>

    <EvmTransactionFlowDialog
      ref="dialogRef"
      chain="mainnet"
      :text="dialogText"
      keep-open
      skip-confirmation
      @complete="emit('placed')"
    />
  </div>
</template>

<script setup lang="ts">
import { parseEther, type Hash } from 'viem'
import { writeContract } from '@wagmi/core'
import { useAccount, useConfig } from '@wagmi/vue'
import { punksMarketAbi } from '~/utils/punksMarketAbi'
import { usePunksMarketAddress } from '~/utils/addresses'

const emit = defineEmits<{ placed: [] }>()

const marketAddress = usePunksMarketAddress()
const config = useConfig()
const { address } = useAccount()

const bidEth = ref('')

const bidWei = computed(() => parseEthSafe(bidEth.value))

function parseEthSafe(input: string): bigint | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const wei = parseEther(trimmed as `${number}`)
    return wei >= 0n ? wei : null
  } catch {
    return null
  }
}

// Empty Punks.Filter — matches everything.
const EMPTY_FILTER = {
  requiredTraitMask: 0n,
  forbiddenTraitMask: 0n,
  anyOfTraitMask: 0n,
  requiredColorMask: 0n,
  forbiddenColorMask: 0n,
  anyOfColorMask: 0n,
  minPixelCount: 0,
  maxPixelCount: 0,
  minColorCount: 0,
  maxColorCount: 0,
}

type DialogRef = {
  initializeRequest: (request?: () => Promise<Hash>) => void
} | null
const dialogRef = ref<DialogRef>(null)
const dialogText = ref<{
  title?: Record<string, string>
  lead?: Record<string, string>
}>({})

async function actPlace() {
  if (!bidWei.value || !marketAddress.value) return

  dialogText.value = {
    title: { confirm: 'Place collection bid' },
    lead: { confirm: 'Place collection bid' },
  }

  dialogRef.value?.initializeRequest(async () => {
    return writeContract(config, {
      address: marketAddress.value!,
      abi: punksMarketAbi,
      functionName: 'placeBid',
      args: [bidWei.value!, 0n, EMPTY_FILTER, [], []],
      value: bidWei.value!,
    })
  })
}
</script>

<style scoped>
.bid-form {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-4);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
}

.form-title {
  margin: 0;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

label {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.warn {
  color: #b8761c;
  font-size: 12px;
  margin: 0;
}
</style>
